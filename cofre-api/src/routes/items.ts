import { Context, Hono } from 'hono';
import { Bytes, base64url, blob, fromBase64url } from '../domain/bytes';
import { write } from '../domain/quota';
import { authenticate } from '../domain/session';
import { HttpError } from '../errors';
import { Deps, Statement } from '../ports';
import { readJson } from './http';

/**
 * Os itens do cofre e o manifesto (6.2, 6.3 e 16.5), com o cofre aberto.
 *
 * Toda gravação manda o item (ou só a mudança de lugar dele) **e** o manifesto novo, com o contador
 * que o aparelho viu. O lote é atômico, e cada parte só acontece se o manifesto gravado for o deste
 * pedido: se outro aparelho gravou antes, o contador não bate, nada muda, e a resposta é 409 com o
 * contador de agora (a página recarrega e reaplica). Comparar só o contador não bastaria: dois
 * aparelhos que partem do mesmo contador chegariam os dois a "contador + 1".
 *
 * O servidor não decifra nada. Ele confere só o que dá para conferir de fora: os tamanhos da versão 1
 * da cripto, as versões dos itens (cada gravação sobe 1) e os limites.
 *
 * A lixeira: apagar põe o item na lixeira (os dados continuam, cifrados), e dá para voltar. Depois de
 * 30 dias, a limpeza diária (parte 6) apaga os dados e deixa só uma lápide (o id e a versão), porque o
 * manifesto cifrado ainda lista o item e o servidor não pode mudá-lo; a página tira a lápide do
 * manifesto e chama `DELETE /api/cofre/lixeira/:id`, que a apaga de vez.
 */

const SEALED_OVERHEAD = 1 + 12 + 16;
const BLOCK = 512;
/** O maior item selado (9.3). */
export const ITEM_MAX = 16 * 1024;
/** Quantos itens um cofre pode ter, contando a lixeira (9.3). */
export const MAX_ITEMS = 2000;
const MANIFEST_MAX = 160 * 1024 + SEALED_OVERHEAD;
/** O corpo destas rotas: o item (até 16 kB) e o manifesto (que com 2.000 itens passa de 64 kB), em base64url. */
const BODY_MAX = 256 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

type Blob = Uint8Array | ArrayBuffer | number[];

const invalid = (message: string) => new HttpError(400, 'pedido-invalido', message);

function sealedField(value: unknown, what: string, max: number): Bytes {
  const bytes = typeof value === 'string' ? fromBase64url(value) : null;
  if (!bytes || bytes.length < SEALED_OVERHEAD + BLOCK || bytes.length > max || (bytes.length - SEALED_OVERHEAD) % BLOCK !== 0) {
    throw invalid(`${what}: formato ou tamanho errado.`);
  }
  return bytes;
}

function counterField(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw invalid('Faltou o contador que o aparelho viu.');
  return value as number;
}

function itemId(c: Context): string {
  const id = c.req.param('id') ?? '';
  if (!UUID.test(id)) throw new HttpError(404, 'item-nao-encontrado', 'Este item não existe.');
  return id;
}

/** O pedaço comum a toda gravação: o manifesto novo e o contador que o aparelho viu. */
function manifestPart(body: Record<string, unknown>): { manifest: Bytes; previous: number } {
  return { manifest: sealedField(body['manifesto'], 'manifesto', MANIFEST_MAX), previous: counterField(body['contadorAnterior']) };
}

/**
 * A gravação do manifesto: só se o contador ainda é o que o aparelho viu. As outras partes do lote têm
 * a condição `MANIFEST_IS`: o manifesto gravado agora é exatamente o deste pedido.
 */
function manifestStatement(userId: string, manifest: Bytes, previous: number, now: Date): Statement {
  return {
    sql: 'UPDATE cofre_contas SET manifesto = ?, contador = contador + 1, mudado_em = ? WHERE usuario_id = ? AND contador = ?',
    params: [manifest, now.toISOString(), userId, previous],
  };
}
const MANIFEST_IS = '(SELECT manifesto FROM cofre_contas WHERE usuario_id = ?) = ?';

export function itemRoutes(app: Hono, deps: Deps): void {
  const vault = (c: Context) => authenticate(deps, c.req.header('Authorization'), ['cofre']);

  /** Grava o lote e responde: o contador novo, ou 409 com o de agora. */
  async function commit(c: Context, userId: string, previous: number, statements: Statement[], rows: number) {
    const [manifest] = await write(deps, statements, rows);
    if (manifest?.changes !== 1) {
      const now = await deps.db.first<{ contador: number }>('SELECT contador FROM cofre_contas WHERE usuario_id = ?', [userId]);
      return c.json({ erro: 'conflito', mensagem: 'Outro aparelho mudou o cofre. Recarregando.', contador: now?.contador ?? null }, 409);
    }
    return c.json({ contador: previous + 1 });
  }

  app.get('/api/cofre/itens', async (c) => {
    const s = await vault(c);
    const account = await deps.db.first<{ manifesto: Blob; contador: number }>('SELECT manifesto, contador FROM cofre_contas WHERE usuario_id = ?', [s.userId]);
    if (!account) throw new HttpError(404, 'sem-cofre', 'Esta conta ainda não tem cofre.');
    const items = await deps.db.all<{ id: string; versao: number; dados: Blob; mudado_em: string; na_lixeira_desde: string | null }>(
      'SELECT id, versao, dados, mudado_em, na_lixeira_desde FROM cofre_itens WHERE usuario_id = ? ORDER BY id',
      [s.userId],
    );
    return c.json({
      contador: account.contador,
      manifesto: base64url(blob(account.manifesto)),
      itens: items.map((i) => {
        const data = blob(i.dados);
        return {
          id: i.id,
          versao: i.versao,
          // a lápide: o item ficou mais de 30 dias na lixeira e os dados já foram apagados
          dados: data.length ? base64url(data) : null,
          mudadoEm: i.mudado_em,
          naLixeiraDesde: i.na_lixeira_desde,
        };
      }),
    });
  });

  // Criar (versão 1) ou mudar (a versão de agora + 1). Mudar um item que está na lixeira o tira de lá.
  app.put('/api/cofre/itens/:id', async (c) => {
    const s = await vault(c);
    const id = itemId(c);
    const body = await readJson(c, BODY_MAX);
    const data = sealedField(body['dados'], 'item', ITEM_MAX);
    const version = body['versao'];
    if (!Number.isSafeInteger(version) || (version as number) < 1) throw invalid('Versão do item inválida.');
    const { manifest, previous } = manifestPart(body);
    const current = await deps.db.first<{ versao: number }>('SELECT versao FROM cofre_itens WHERE usuario_id = ? AND id = ?', [s.userId, id]);
    if ((current ? current.versao + 1 : 1) !== version) {
      throw new HttpError(409, 'versao-do-item', current ? `O item está na versão ${current.versao}: grave a ${current.versao + 1}.` : 'Um item novo começa na versão 1.');
    }
    if (!current) {
      const count = await deps.db.first<{ n: number }>('SELECT COUNT(*) AS n FROM cofre_itens WHERE usuario_id = ?', [s.userId]);
      if ((count?.n ?? 0) >= MAX_ITEMS) throw new HttpError(409, 'cofre-cheio', `O cofre chegou ao limite de ${MAX_ITEMS} itens (contando a lixeira).`);
    }
    const now = deps.now();
    return commit(c, s.userId, previous, [
      manifestStatement(s.userId, manifest, previous, now),
      {
        sql:
          `INSERT INTO cofre_itens (usuario_id, id, versao, dados, mudado_em, na_lixeira_desde) SELECT ?, ?, ?, ?, ?, NULL WHERE ${MANIFEST_IS} ` +
          'ON CONFLICT (usuario_id, id) DO UPDATE SET versao = excluded.versao, dados = excluded.dados, mudado_em = excluded.mudado_em, na_lixeira_desde = NULL',
        params: [s.userId, id, version as number, data, now.toISOString(), s.userId, manifest],
      },
    ], 8);
  });

  // Apagar: para a lixeira (16.5). A versão não muda: o item continua o mesmo, só em outro lugar.
  app.delete('/api/cofre/itens/:id', async (c) => {
    const s = await vault(c);
    const id = itemId(c);
    const { manifest, previous } = manifestPart(await readJson(c, BODY_MAX));
    const item = await deps.db.first<{ na_lixeira_desde: string | null }>('SELECT na_lixeira_desde FROM cofre_itens WHERE usuario_id = ? AND id = ?', [s.userId, id]);
    if (!item) throw new HttpError(404, 'item-nao-encontrado', 'Este item não existe.');
    if (item.na_lixeira_desde) throw new HttpError(409, 'ja-na-lixeira', 'Este item já está na lixeira.');
    const now = deps.now();
    return commit(c, s.userId, previous, [
      manifestStatement(s.userId, manifest, previous, now),
      { sql: `UPDATE cofre_itens SET na_lixeira_desde = ? WHERE usuario_id = ? AND id = ? AND ${MANIFEST_IS}`, params: [now.toISOString(), s.userId, id, s.userId, manifest] },
    ], 6);
  });

  // Voltar da lixeira (enquanto os dados ainda existem).
  app.post('/api/cofre/itens/:id/restaurar', async (c) => {
    const s = await vault(c);
    const id = itemId(c);
    const { manifest, previous } = manifestPart(await readJson(c, BODY_MAX));
    const item = await deps.db.first<{ na_lixeira_desde: string | null; dados: Blob }>('SELECT na_lixeira_desde, dados FROM cofre_itens WHERE usuario_id = ? AND id = ?', [s.userId, id]);
    if (!item || !item.na_lixeira_desde) throw new HttpError(404, 'item-nao-encontrado', 'Este item não está na lixeira.');
    if (!blob(item.dados).length) throw new HttpError(410, 'item-apagado', 'Este item passou de 30 dias na lixeira e já foi apagado.');
    const now = deps.now();
    return commit(c, s.userId, previous, [
      manifestStatement(s.userId, manifest, previous, now),
      { sql: `UPDATE cofre_itens SET na_lixeira_desde = NULL WHERE usuario_id = ? AND id = ? AND ${MANIFEST_IS}`, params: [s.userId, id, s.userId, manifest] },
    ], 6);
  });

  // Apagar de vez um item da lixeira (ou a lápide de um que a limpeza já esvaziou).
  app.delete('/api/cofre/lixeira/:id', async (c) => {
    const s = await vault(c);
    const id = itemId(c);
    const { manifest, previous } = manifestPart(await readJson(c, BODY_MAX));
    const item = await deps.db.first<{ na_lixeira_desde: string | null }>('SELECT na_lixeira_desde FROM cofre_itens WHERE usuario_id = ? AND id = ?', [s.userId, id]);
    if (!item || !item.na_lixeira_desde) throw new HttpError(404, 'item-nao-encontrado', 'Este item não está na lixeira.');
    const now = deps.now();
    return commit(c, s.userId, previous, [
      manifestStatement(s.userId, manifest, previous, now),
      { sql: `DELETE FROM cofre_itens WHERE usuario_id = ? AND id = ? AND na_lixeira_desde IS NOT NULL AND ${MANIFEST_IS}`, params: [s.userId, id, s.userId, manifest] },
    ], 6);
  });
}
