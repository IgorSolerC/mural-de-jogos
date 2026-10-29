import { Context, Hono } from 'hono';
import { utcDayStart, write } from '../domain/quota';
import { formatCode, normalizeCode } from '../domain/code';
import { cleanCard, parseCard, parsePhoto } from '../domain/photo';
import { MURAL_RE, REF_RE, cleanTitle } from '../domain/review';
import { gunzipText, gzipText, relatedNotes, withoutGone } from '../domain/shared-public';
import { MAX_SHOWN_CHARS, parseShown } from '../domain/shown';
import { HttpError } from '../errors';
import { Deps, Statement } from '../ports';
import { sessionOf } from './http';
import { parsePublished, publishStatements } from '../domain/image';

/** Teto de cada mural compactado. O D1 aceita 2 MB por linha; o site recusa antes, em 1,8 MB. */
const MAX_MURAL_BYTES = 1_900_000;
/** Resenhas novas aceitas por envio e por dia, para notificar quem segue. */
const MAX_NEW_PER_PUSH = 10;
const MAX_NEW_PER_DAY = 30;
/** Intervalo mínimo entre duas gravações do mesmo mural. */
const MIN_INTERVAL_MS = 3_000;

interface NewReview {
  ref: string;
  titulo: string;
  mural: string;
}

/** Bytes de um BLOB, venha como vier do banco (o D1 e o SQLite devolvem tipos diferentes). */
export function toBytes(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (Array.isArray(value)) return Uint8Array.from(value as number[]);
  throw new Error('BLOB em formato desconhecido');
}

const isGzip = (b: Uint8Array) => b.length >= 18 && b[0] === 0x1f && b[1] === 0x8b;

/** A resposta com o mural compactado, como veio do banco. */
function gzipBody(c: Context, dados: unknown): Response {
  c.header('Content-Type', 'application/gzip');
  const bytes = toBytes(dados);
  return c.body(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, 200);
}

async function gzipPart(form: FormData, name: string): Promise<Uint8Array> {
  const part = form.get(name);
  if (!part || typeof part === 'string') throw new HttpError(400, 'mural-invalido', `Faltou a parte "${name}" do mural.`);
  if (part.size > MAX_MURAL_BYTES) {
    throw new HttpError(413, 'mural-grande-demais', 'O mural ficou grande demais para a nuvem (passa de 1,9 MB compactado).');
  }
  const bytes = new Uint8Array(await part.arrayBuffer());
  if (!isGzip(bytes)) throw new HttpError(400, 'mural-invalido', `A parte "${name}" não está compactada em gzip.`);
  return bytes;
}

function parseNew(raw: ReturnType<FormData['get']>): NewReview[] {
  if (raw === null) return [];
  if (typeof raw !== 'string' || raw.length > 20_000) throw new HttpError(400, 'mural-invalido', 'A lista de resenhas novas não serve.');
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new HttpError(400, 'mural-invalido', 'A lista de resenhas novas não serve.');
  }
  if (!Array.isArray(data)) throw new HttpError(400, 'mural-invalido', 'A lista de resenhas novas não serve.');
  const out: NewReview[] = [];
  const seen = new Set<string>();
  for (const item of data.slice(0, MAX_NEW_PER_PUSH)) {
    // um item que não é objeto (null, número, texto) só é ignorado
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const r = item as Record<string, unknown>;
    const ref = typeof r['ref'] === 'string' && REF_RE.test(r['ref']) ? r['ref'] : null;
    const titulo = cleanTitle(r['titulo']);
    const mural = typeof r['mural'] === 'string' && MURAL_RE.test(r['mural']) ? r['mural'] : null;
    if (!ref || !titulo || !mural || seen.has(ref)) continue;
    seen.add(ref);
    out.push({ ref, titulo, mural });
  }
  return out;
}

/**
 * O mural público de `userId` conferido (ver domain/shared-public.ts): sem as compartilhadas que a pessoa
 * não pode mais mostrar. Só roda com a marca `publico_conferir`; grava o conferido (a `versao` sobe, e
 * quem visita baixa de novo) e desmarca. Se a gravação não der (a cota do dia, outro envio no meio),
 * entrega o conferido assim mesmo, e a marca fica para a próxima.
 */
async function checkedPublic(deps: Deps, userId: string, row: { versao: number; dados: unknown }): Promise<{ versao: number; dados: Uint8Array; changed: boolean }> {
  const bytes = toBytes(row.dados);
  let result: { text: string; dropped: string[] } | null = null;
  try {
    result = withoutGone(await gunzipText(bytes), await relatedNotes(deps.db, userId));
  } catch (error) {
    // um mural que não abre (gzip estragado) não tem o que tirar: desmarca, para não tentar a cada visita
    deps.log?.(`mural-publico conferir falhou: ${error instanceof Error ? error.message : String(error)}`);
  }
  // desmarca só se o mural ainda é o conferido (um envio no meio pede outra conferência)
  const done = (versao: number): Statement => ({
    sql: 'UPDATE usuarios SET publico_conferir = 0 WHERE id = ? AND (SELECT versao FROM murais_publicos WHERE usuario_id = ?) = ?',
    params: [userId, userId, versao],
  });
  if (!result) {
    await write(deps, [done(row.versao)], 1).catch(() => undefined);
    return { versao: row.versao, dados: bytes, changed: false };
  }
  const dados = await gzipText(result.text);
  try {
    const [saved] = await write(
      deps,
      [{ sql: 'UPDATE murais_publicos SET dados = ?, bytes = ?, versao = versao + 1 WHERE usuario_id = ? AND versao = ?', params: [dados, dados.length, userId, row.versao] }],
      1,
    );
    if (!saved || saved.changes === 0) return { versao: row.versao, dados, changed: true };
  } catch {
    // a cota do dia, a nuvem só para leitura: entrega o conferido sem gravar
    return { versao: row.versao, dados, changed: true };
  }
  // depois de gravado (e só então): desmarca, e as que saíram saem também das fichas à mostra (as
  // reações e os comentários delas)
  await write(
    deps,
    [
      done(row.versao + 1),
      {
        sql:
          'UPDATE usuarios SET fichas_publicas = (SELECT json_group_array(value) FROM json_each(usuarios.fichas_publicas) ' +
          'WHERE value NOT IN (SELECT value FROM json_each(?))) WHERE id = ? AND fichas_publicas IS NOT NULL ' +
          'AND (SELECT versao FROM murais_publicos WHERE usuario_id = ?) = ?',
        params: [JSON.stringify(result.dropped), userId, userId, row.versao + 1],
      },
    ],
    2,
  ).catch(() => undefined);
  return { versao: row.versao + 1, dados, changed: true };
}

/** O mural de outra pessoa, pelo código: só o público (resenhas e nome). */
function publicRoutes(app: Hono, deps: Deps): void {
  app.get('/v1/murais/:codigo', async (c) => {
    if (deps.config.publicMurals === 'logados') await sessionOf(deps, c);
    const code = normalizeCode(c.req.param('codigo'));
    const notFound = () =>
      new HttpError(404, 'mural-nao-encontrado', 'Não achei mural com esse código. Confira as letras: são 8, entre letras e números.');
    if (!code) throw notFound();
    const head = await deps.db.first<{ usuario_id: string; versao: number; conferir: number }>(
      'SELECT p.usuario_id, p.versao, u.publico_conferir AS conferir FROM usuarios u JOIN murais_publicos p ON p.usuario_id = u.id WHERE u.codigo = ?',
      [code],
    );
    if (!head) throw notFound();
    c.header('Mural-Codigo', formatCode(code));
    // a versão de novo, junto com os dados: um envio entre as duas leituras não pode sair com a de antes
    const read = () => deps.db.first<{ versao: number; dados: unknown }>('SELECT versao, dados FROM murais_publicos WHERE usuario_id = ?', [head.usuario_id]);
    if (head.conferir) {
      const row = await read();
      if (!row) throw notFound();
      const checked = await checkedPublic(deps, head.usuario_id, row);
      c.header('Mural-Rev', String(checked.versao));
      // o conferido que não foi gravado vai inteiro: quem tem a versão de antes guardou a cópia velha
      if (!checked.changed && c.req.query('rev') === String(checked.versao)) return c.body(null, 204);
      return gzipBody(c, checked.dados);
    }
    c.header('Mural-Rev', String(head.versao));
    if (c.req.query('rev') === String(head.versao)) return c.body(null, 204);
    const row = await read();
    if (!row) throw notFound();
    c.header('Mural-Rev', String(row.versao));
    return gzipBody(c, row.dados);
  });
}

/** O mural da própria conta: GET (baixar) e PUT (enviar). */
export function muralRoutes(app: Hono, deps: Deps): void {
  publicRoutes(app, deps);

  app.get('/v1/eu/mural', async (c) => {
    const s = await sessionOf(deps, c);
    const head = await deps.db.first<{ rev: number; pendentes: number; aprovar: number }>(
      'SELECT rev, ' +
        "(SELECT COUNT(*) FROM api_pedidos WHERE usuario_id = murais.usuario_id AND estado = 'pendente' AND expira_em > ?) AS pendentes, " +
        "(SELECT COUNT(*) FROM api_pedidos WHERE usuario_id = murais.usuario_id AND estado = 'aguardando-aprovacao' AND expira_em > ?) AS aprovar " +
        'FROM murais WHERE usuario_id = ?',
      [deps.now().toISOString(), deps.now().toISOString(), s.userId],
    );
    if (!head) throw new HttpError(404, 'sem-mural', 'Ainda não há mural na nuvem.');
    c.header('Mural-Rev', String(head.rev));
    // os pedidos da API das AIs esperando (PLANO-API.md, 3.2): o site aplica sem precisar perguntar
    if (head.pendentes) c.header('Mural-Pedidos', String(head.pendentes));
    if (head.aprovar) c.header('Mural-Pedidos-Aprovar', String(head.aprovar));
    if (c.req.query('rev') === String(head.rev)) return c.body(null, 204);
    const row = await deps.db.first<{ rev: number; dados: unknown }>('SELECT rev, dados FROM murais WHERE usuario_id = ?', [s.userId]);
    if (!row) throw new HttpError(404, 'sem-mural', 'Ainda não há mural na nuvem.');
    c.header('Mural-Rev', String(row.rev));
    return gzipBody(c, row.dados);
  });

  app.put('/v1/eu/mural', async (c: Context) => {
    const s = await sessionOf(deps, c);
    // só dígitos: um cabeçalho vazio (Number('') é 0) não pode passar como "primeiro envio"
    const rawBase = c.req.header('Mural-Rev-Base')?.trim() ?? '';
    const base = /^\d{1,16}$/.test(rawBase) ? Number(rawBase) : NaN;
    if (!Number.isSafeInteger(base)) throw new HttpError(400, 'sem-rev', 'Faltou dizer em qual versão do mural o envio se baseia.');
    const length = Number(c.req.header('Content-Length') ?? 0);
    if (length > 2 * MAX_MURAL_BYTES + MAX_SHOWN_CHARS + 64_000) {
      throw new HttpError(413, 'mural-grande-demais', 'O mural ficou grande demais para a nuvem.');
    }
    let form: FormData;
    try {
      form = await c.req.raw.formData();
    } catch {
      throw new HttpError(400, 'mural-invalido', 'O envio do mural veio quebrado.');
    }
    const privateDoc = await gzipPart(form, 'privado');
    const publicDoc = await gzipPart(form, 'publico');
    const candidates = parseNew(form.get('novas'));
    // o cartão da pessoa nas listas de Seguindo e Seguidores (a foto vem dentro dele; os sites de antes
    // mandavam só a foto): opcionais, e o que não serve só não muda o de antes
    const card = parseCard(form.get('cartao'));
    const cardData = card ? cleanCard(JSON.parse(card)) : null;
    const photo = cardData ? JSON.stringify({ emoji: cardData.emoji, cor: cardData.cor }) : parsePhoto(form.get('foto'));
    // as fichas à mostra (ver domain/shown.ts): sem a parte, fica a lista de antes
    const shown = parseShown(form.get('fichas'));
    // as imagens do mural público (PLANO-IMAGENS.md, rodada 4): sem a parte, fica a lista de antes; só
    // o que mudou é gravado (e contado na cota do dia), então a lista de agora é lida antes
    const published = parsePublished(form.get('imagens'));
    let publishChanges = 0;
    if (published) {
      const before = new Set((await deps.db.all<{ imagem_id: string }>('SELECT imagem_id FROM imagem_publica WHERE usuario_id = ?', [s.userId])).map((r) => r.imagem_id));
      const next = new Set(published);
      publishChanges = [...next].filter((x) => !before.has(x)).length + [...before].filter((x) => !next.has(x)).length;
    }

    const now = deps.now();
    const at = now.toISOString();
    const user = await deps.db.first<{ ultima_gravacao_em: string | null }>('SELECT ultima_gravacao_em FROM usuarios WHERE id = ?', [s.userId]);
    if (user?.ultima_gravacao_em && now.getTime() - Date.parse(user.ultima_gravacao_em) < MIN_INTERVAL_MS) {
      throw new HttpError(429, 'devagar', 'Muitos envios seguidos. O próximo vai daqui a pouco.');
    }

    // resenhas novas: só as que ainda não viraram atividade, até o limite do dia
    let fresh: NewReview[] = [];
    if (candidates.length) {
      const known = await deps.db.all<{ ref: string }>(
        `SELECT ref FROM atividades WHERE tipo = 'resenha' AND autor_id = ? AND ref IN (${candidates.map(() => '?').join(', ')})`,
        [s.userId, ...candidates.map((n) => n.ref)],
      );
      const today = await deps.db.first<{ n: number }>(
        "SELECT COUNT(*) AS n FROM atividades WHERE tipo = 'resenha' AND autor_id = ? AND criado_em >= ?",
        [s.userId, utcDayStart(now)],
      );
      const room = Math.max(0, MAX_NEW_PER_DAY - (today?.n ?? 0));
      const knownRefs = new Set(known.map((k) => k.ref));
      fresh = candidates.filter((n) => !knownRefs.has(n.ref)).slice(0, room);
    }

    // Tudo num lote só: o privado grava se ninguém gravou antes (rev = base); o resto só entra se a
    // gravação que valeu foi esta (a marca `gravacao`).
    const mark = `${at}:${crypto.randomUUID()}`;
    const ours = 'SELECT 1 FROM murais WHERE usuario_id = ? AND gravacao = ?';
    const privateWrite: Statement =
      base === 0
        ? {
            sql:
              'INSERT INTO murais (usuario_id, rev, dados, bytes, atualizado_em, gravacao) SELECT ?, 1, ?, ?, ?, ? ' +
              'WHERE NOT EXISTS (SELECT 1 FROM murais WHERE usuario_id = ?)',
            params: [s.userId, privateDoc, privateDoc.length, at, mark, s.userId],
          }
        : {
            sql: 'UPDATE murais SET rev = rev + 1, dados = ?, bytes = ?, atualizado_em = ?, gravacao = ? WHERE usuario_id = ? AND rev = ?',
            params: [privateDoc, privateDoc.length, at, mark, s.userId, base],
          };
    const statements: Statement[] = [
      privateWrite,
      {
        sql:
          // a `versao` (o que quem visita guarda) sobe a cada envio, e a conferência também a sobe
          'INSERT INTO murais_publicos (usuario_id, rev, versao, dados, bytes, atualizado_em) ' +
          'SELECT usuario_id, rev, rev, ?, ?, ? FROM murais WHERE usuario_id = ? AND gravacao = ? ' +
          'ON CONFLICT (usuario_id) DO UPDATE SET rev = excluded.rev, versao = murais_publicos.versao + 1, dados = excluded.dados, ' +
          'bytes = excluded.bytes, atualizado_em = excluded.atualizado_em',
        params: [publicDoc, publicDoc.length, at, s.userId, mark],
      },
      ...fresh.map(
        (n): Statement => ({
          sql:
            "INSERT OR IGNORE INTO atividades (tipo, autor_id, ref, resumo, criado_em) SELECT 'resenha', ?, ?, ?, ? " +
            `WHERE EXISTS (${ours})`,
          params: [s.userId, n.ref, JSON.stringify({ titulo: n.titulo, mural: n.mural }), at, s.userId, mark],
        }),
      ),
      {
        sql:
          'UPDATE usuarios SET ultima_gravacao_em = ?, foto = COALESCE(?, foto), cartao = COALESCE(?, cartao), ' +
          // logo depois de uma compartilhada sair (domain/shared-public.ts), o site que ainda não soube
          // pode mandar a cópia velha: a próxima entrega confere de novo
          'fichas_publicas = COALESCE(?, fichas_publicas), ' +
          'publico_conferir = CASE WHEN publico_conferir_ate > ? THEN 1 ELSE publico_conferir END ' +
          `WHERE id = ? AND EXISTS (${ours})`,
        params: [at, photo, card, shown, at, s.userId, s.userId, mark],
      },
      ...(published && publishChanges ? publishStatements(s.userId, published, { sql: ours, params: [s.userId, mark] }) : []),
    ];
    // as imagens mostradas: a linha e o índice de cada uma que entrou ou saiu
    const [result] = await write(deps, statements, 6 + 4 * fresh.length + 2 * publishChanges);
    if (!result || result.changes === 0) {
      const current = await deps.db.first<{ rev: number }>('SELECT rev FROM murais WHERE usuario_id = ?', [s.userId]);
      return c.json(
        { erro: 'conflito', mensagem: 'Outro aparelho gravou antes. Juntando e tentando de novo.', rev: current?.rev ?? 0 },
        409,
      );
    }
    return c.json({ rev: base + 1, novas: fresh.length });
  });
}
