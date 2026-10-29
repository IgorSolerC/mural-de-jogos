import { Context, Hono } from 'hono';
import { HttpError } from '../errors';
import { brakeRoom, usedToday } from '../domain/brake';
import { ALL, IMAGE_ID, MAX_IMAGE_BYTES, checkImage, dropBytes, dropStatements, imageAccess, imagesDbOf, room, tooBig, usageOf } from '../domain/image';
import { assertWritable, write } from '../domain/quota';
import { authenticate } from '../domain/session';
import { CatalogBrake, Deps, Statement } from '../ports';
import { catalogBrake } from './catalog';
import { sessionOf } from './http';
import { toBytes } from './mural';

/**
 * As imagens coladas nas anotações (PLANO-IMAGENS.md, rodada 1):
 *
 * - `PUT /v1/imagens/:id`: o site manda os bytes já encolhidos, com o id que ele sorteou. Repetir o mesmo
 *   envio responde 200 (a conexão pode cair no meio); o id de outra conta é 409.
 * - `GET /v1/imagens/:id`: os bytes. A pública (mostrada no mural público por quem pode mostrar) sem
 *   login; a privada com a sessão do dono ou de quem está numa anotação compartilhada que a usa.
 *   Quem não pode ver recebe 404, igual à que não existe. `Imagem-Sua: 1` quando quem pede é o dono.
 * - `DELETE /v1/imagens/:id`: o dono apaga (os bytes antes, os dados depois).
 * - `GET /v1/eu/imagens`: quanto a conta usa, quanto falta, e a lista.
 *
 * Cada envio gasta 1 pedido ao Worker e umas 10 linhas gravadas (contadas na cota do dia, os bytes do
 * outro banco também: o limite do D1 é da conta); cada imagem vista, 1 pedido e 2 ou 3 linhas lidas.
 */

/** Quantas imagens um IP pede por minuto: quem abre um mural cheio num aparelho novo baixa de uma vez. */
export const IMAGE_GETS_PER_MINUTE = 300;
/** Um freio por instância (fora do `createApp`, que no Worker roda a cada pedido). */
const sharedBrake = catalogBrake(IMAGE_GETS_PER_MINUTE);

/** Linhas gravadas por envio: os dados e os 2 índices, as 2 contas, o freio e o índice dele, os bytes e o índice, a marca de pronta. */
const PUT_ROWS = 10;
/** Por imagem apagada: as 2 contas, os dados e os índices, os bytes e o índice. */
const DROP_ROWS = 7;

/** O freio de quem pede uma imagem; sem o IP (o Node atrás de outro proxy), sem freio. */
function braked(c: Context, deps: Deps, brake: CatalogBrake): boolean {
  const ip = c.req.header('CF-Connecting-IP');
  return !!ip && !brake.take(ip, deps.now().getTime());
}

function idOf(c: Context): string {
  const id = c.req.param('id') ?? '';
  if (!IMAGE_ID.test(id)) throw notFound();
  return id;
}

function notFound(): HttpError {
  return new HttpError(404, 'imagem-nao-encontrada', 'Essa imagem não existe, ou não é sua.');
}

interface ImageRow {
  id: string;
  dono_id: string;
  tipo: string;
  bytes: number;
  publica: number;
  pronta: number;
}

export function imageRoutes(app: Hono, deps: Deps): void {
  const { config } = deps;
  const brake = deps.imageBrake ?? sharedBrake;

  app.put('/v1/imagens/:id', async (c) => {
    const s = await sessionOf(deps, c);
    assertWritable(deps);
    const imagesDb = imagesDbOf(deps);
    const id = idOf(c);
    // o tamanho antes de ler o corpo: um envio enorme não chega a ser lido
    if (Number(c.req.header('Content-Length') ?? 0) > MAX_IMAGE_BYTES) throw tooBig();
    const bytes = new Uint8Array(await c.req.arrayBuffer());
    const info = checkImage(bytes);

    const before = await deps.db.first<ImageRow>('SELECT id, dono_id, tipo, bytes, publica, pronta FROM imagens WHERE id = ?', [id]);
    if (before && before.dono_id !== s.userId) throw new HttpError(409, 'imagem-id-em-uso', 'Esse id de imagem já é de outra conta. Sorteie outro.');
    if (before && before.bytes !== bytes.length) throw new HttpError(409, 'imagem-diferente', 'Esse id já tem outra imagem.');
    const now = deps.now();
    const at = now.toISOString();

    if (!before) {
      // Os dados entram só se ainda cabem: a vaga do dia, a cota da conta e a da nuvem, conferidas dentro
      // do lote (dois envios ao mesmo tempo não passam juntos). As contas sobem só com a marca deste envio.
      const mark = `${at}:${crypto.randomUUID()}`;
      const ours = 'SELECT 1 FROM imagens WHERE id = ? AND gravacao = ?';
      const day = brakeRoom(s.userId, 'imagem', now, config.imagesPerDay);
      const statements: Statement[] = [
        {
          sql:
            'INSERT INTO imagens (id, dono_id, tipo, bytes, largura, altura, criada_em, gravacao) SELECT ?, ?, ?, ?, ?, ?, ?, ? ' +
            `WHERE NOT EXISTS (SELECT 1 FROM imagens WHERE id = ?) AND ${day.sql} ` +
            'AND COALESCE((SELECT bytes FROM imagens_uso WHERE usuario_id = ?), 0) + ? <= ? ' +
            'AND COALESCE((SELECT bytes FROM imagens_uso WHERE usuario_id = ?), 0) + ? <= ?',
          params: [
            id,
            s.userId,
            info.tipo,
            bytes.length,
            info.largura,
            info.altura,
            at,
            mark,
            id,
            ...day.params,
            s.userId,
            bytes.length,
            config.imagesUserBytes,
            ALL,
            bytes.length,
            config.imagesTotalBytes,
          ],
        },
        ...[s.userId, ALL].map(
          (who): Statement => ({
            sql:
              `INSERT INTO imagens_uso (usuario_id, imagens, bytes) SELECT ?, 1, ? WHERE EXISTS (${ours}) ` +
              'ON CONFLICT (usuario_id) DO UPDATE SET imagens = imagens_uso.imagens + 1, bytes = imagens_uso.bytes + excluded.bytes',
            params: [who, bytes.length, id, mark],
          }),
        ),
        { sql: `INSERT INTO freios (usuario_id, acao, criado_em) SELECT ?, 'imagem', ? WHERE EXISTS (${ours})`, params: [s.userId, at, id, mark] },
      ];
      // a estimativa já conta os bytes do outro banco: o limite de linhas gravadas do D1 é da conta toda
      const [inserted] = await write(deps, statements, PUT_ROWS);
      if (!inserted || inserted.changes === 0) throw await whyRefused(s.userId, id, bytes.length);
    } else if (before.pronta) {
      // o mesmo envio de novo (a resposta de antes se perdeu): nada a gravar
      return c.json({ id, tipo: before.tipo, bytes: before.bytes, largura: info.largura, altura: info.altura, uso: await userRoom(s.userId) }, 200);
    }

    // Os bytes, no outro banco. Se ele recusar (cheio, fora do ar), os dados saem e a conta desce: nada fica
    // contado sem estar guardado.
    try {
      await imagesDb.batch([{ sql: 'INSERT OR REPLACE INTO bytes (id, dados) VALUES (?, ?)', params: [id, bytes] }]);
    } catch (error) {
      deps.log?.(`imagens: o banco das imagens recusou ${bytes.length} bytes (${error instanceof Error ? error.message : 'erro'})`);
      await deps.db.batch(dropStatements([{ id, dono_id: s.userId, bytes: bytes.length }]));
      throw new HttpError(507, 'imagens-cheio', 'A nuvem não tem mais lugar para imagens agora. A imagem continua neste aparelho.');
    }
    // pronta: se esta marca não gravar (sem cota agora), a limpeza diária confere os bytes e marca
    try {
      await write(deps, [{ sql: 'UPDATE imagens SET pronta = 1 WHERE id = ?', params: [id] }], 1, { ignoreBudget: true });
    } catch (error) {
      if (!(error instanceof HttpError)) throw error;
    }
    return c.json({ id, tipo: info.tipo, bytes: bytes.length, largura: info.largura, altura: info.altura, uso: await userRoom(s.userId) }, before ? 200 : 201);
  });

  /** Por que os dados não entraram (o lote só diz que nada mudou). */
  async function whyRefused(userId: string, id: string, size: number): Promise<HttpError> {
    const other = await deps.db.first<{ dono_id: string }>('SELECT dono_id FROM imagens WHERE id = ?', [id]);
    // outro envio do mesmo id chegou primeiro: o site manda de novo e cai no 200
    if (other) return new HttpError(409, other.dono_id === userId ? 'imagem-enviando' : 'imagem-id-em-uso', 'Essa imagem já está sendo enviada.');
    if ((await usedToday(deps, userId, 'imagem', deps.now())) >= config.imagesPerDay) {
      return new HttpError(429, 'imagens-hoje', `Chegou ao limite de ${config.imagesPerDay} imagens por dia. As outras ficam neste aparelho e sobem amanhã.`);
    }
    const mine = await usageOf(deps.db, userId);
    if (mine.bytes + size > config.imagesUserBytes) {
      return new HttpError(403, 'cota-imagens', 'As suas imagens já ocupam todo o espaço da sua conta. Apague algumas em Ajustes para mandar outras.');
    }
    return new HttpError(507, 'imagens-cheio', 'A nuvem não tem mais lugar para imagens agora. A imagem continua neste aparelho.');
  }

  async function userRoom(userId: string) {
    return room(await usageOf(deps.db, userId), config.imagesUserBytes);
  }

  app.get('/v1/imagens/:id', async (c) => {
    if (braked(c, deps, brake)) {
      c.header('Retry-After', '60');
      throw new HttpError(429, 'imagens-devagar', 'Muitas imagens seguidas. As outras vêm daqui a pouco.');
    }
    const imagesDb = imagesDbOf(deps);
    const id = idOf(c);
    // quem pede (a sessão, se veio); sem sessão, vencida ou inválida: como quem visita (nunca 401: a
    // imagem não derruba a sessão do site)
    const header = c.req.header('Authorization');
    const viewer = header
      ? await authenticate(deps, header).then(
          (s) => s.userId,
          () => null,
        )
      : null;
    const row = await imageAccess(deps.db, id, viewer);
    if (!row || !row.pronta) throw notFound();
    const own = viewer !== null && viewer === row.dono_id;
    // a privada: o dono, ou quem está numa compartilhada que a usa; senão, 404 (não confirma que existe)
    if (!row.publica && !own && !row.membro) throw notFound();
    const stored = await imagesDb.first<{ dados: unknown }>('SELECT dados FROM bytes WHERE id = ?', [id]);
    if (!stored) throw notFound();
    const bytes = toBytes(stored.dados);
    c.header('Content-Type', row.tipo);
    // a pública pode voltar a ser privada: 7 dias no cache de quem visita; a privada não fica no cache do
    // navegador (o site guarda no IndexedDB, que a limpeza do Sair alcança)
    // a pública pedida sem sessão fica 7 dias no cache de quem visita (pode voltar a ser privada); com
    // sessão (o site guarda no IndexedDB, que a limpeza do Sair alcança), nada fica no cache do navegador
    c.header('Cache-Control', row.publica && viewer === null ? 'public, max-age=604800' : 'private, no-store');
    if (viewer !== null) c.header('Imagem-Sua', own ? '1' : '0');
    c.header('Content-Security-Policy', "default-src 'none'; sandbox");
    c.header('Cross-Origin-Resource-Policy', 'cross-origin');
    c.header('Content-Disposition', 'inline');
    return c.body(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, 200);
  });

  app.delete('/v1/imagens/:id', async (c) => {
    const s = await sessionOf(deps, c);
    assertWritable(deps);
    const id = idOf(c);
    const row = await deps.db.first<ImageRow>('SELECT id, dono_id, tipo, bytes, publica, pronta FROM imagens WHERE id = ?', [id]);
    if (!row || row.dono_id !== s.userId) throw notFound();
    imagesDbOf(deps);
    await dropBytes(deps, [id]);
    await write(deps, dropStatements([row]), DROP_ROWS, { ignoreBudget: true });
    return c.json({ uso: await userRoom(s.userId) });
  });

  app.get('/v1/eu/imagens', async (c) => {
    const s = await sessionOf(deps, c);
    const list = await deps.db.all<{ id: string; tipo: string; bytes: number; largura: number; altura: number; publica: number; pronta: number; criada_em: string }>(
      'SELECT id, tipo, bytes, largura, altura, publica, pronta, criada_em FROM imagens WHERE dono_id = ? ORDER BY criada_em DESC LIMIT 2000',
      [s.userId],
    );
    return c.json({
      disponivel: !!deps.imagesDb && config.imagesTotalBytes > 0,
      uso: await userRoom(s.userId),
      nuvem: room(await usageOf(deps.db, ALL), config.imagesTotalBytes),
      hoje: { enviadas: await usedToday(deps, s.userId, 'imagem', deps.now()), limite: config.imagesPerDay },
      imagens: list.map((r) => ({
        id: r.id,
        tipo: r.tipo,
        bytes: r.bytes,
        largura: r.largura,
        altura: r.altura,
        publica: !!r.publica,
        pronta: !!r.pronta,
        criadaEm: r.criada_em,
      })),
    });
  });
}
