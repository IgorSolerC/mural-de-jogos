import { Context, Hono } from 'hono';
import { utcDayStart, write } from '../domain/quota';
import { formatCode, normalizeCode } from '../domain/code';
import { MURAL_RE, REF_RE, cleanTitle } from '../domain/review';
import { HttpError } from '../errors';
import { Deps, Statement } from '../ports';
import { sessionOf } from './http';

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

/** O mural de outra pessoa, pelo código: só o público (resenhas e nome). */
function publicRoutes(app: Hono, deps: Deps): void {
  app.get('/v1/murais/:codigo', async (c) => {
    if (deps.config.publicMurals === 'logados') await sessionOf(deps, c);
    const code = normalizeCode(c.req.param('codigo'));
    const notFound = () =>
      new HttpError(404, 'mural-nao-encontrado', 'Não achei mural com esse código. Confira as letras: são 8, entre letras e números.');
    if (!code) throw notFound();
    const head = await deps.db.first<{ usuario_id: string; rev: number }>(
      'SELECT p.usuario_id, p.rev FROM usuarios u JOIN murais_publicos p ON p.usuario_id = u.id WHERE u.codigo = ?',
      [code],
    );
    if (!head) throw notFound();
    c.header('Mural-Rev', String(head.rev));
    c.header('Mural-Codigo', formatCode(code));
    if (c.req.query('rev') === String(head.rev)) return c.body(null, 204);
    // a rev de novo, junto com os dados: um envio entre as duas leituras não pode sair com a rev de antes
    const row = await deps.db.first<{ rev: number; dados: unknown }>('SELECT rev, dados FROM murais_publicos WHERE usuario_id = ?', [
      head.usuario_id,
    ]);
    if (!row) throw notFound();
    c.header('Mural-Rev', String(row.rev));
    return gzipBody(c, row.dados);
  });
}

/** O mural da própria conta: GET (baixar) e PUT (enviar). */
export function muralRoutes(app: Hono, deps: Deps): void {
  publicRoutes(app, deps);

  app.get('/v1/eu/mural', async (c) => {
    const s = await sessionOf(deps, c);
    const head = await deps.db.first<{ rev: number }>('SELECT rev FROM murais WHERE usuario_id = ?', [s.userId]);
    if (!head) throw new HttpError(404, 'sem-mural', 'Ainda não há mural na nuvem.');
    c.header('Mural-Rev', String(head.rev));
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
    if (length > 2 * MAX_MURAL_BYTES + 64_000) {
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
          'INSERT INTO murais_publicos (usuario_id, rev, dados, bytes, atualizado_em) ' +
          'SELECT usuario_id, rev, ?, ?, ? FROM murais WHERE usuario_id = ? AND gravacao = ? ' +
          'ON CONFLICT (usuario_id) DO UPDATE SET rev = excluded.rev, dados = excluded.dados, bytes = excluded.bytes, atualizado_em = excluded.atualizado_em',
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
        sql: `UPDATE usuarios SET ultima_gravacao_em = ? WHERE id = ? AND EXISTS (${ours})`,
        params: [at, s.userId, s.userId, mark],
      },
    ];
    const [result] = await write(deps, statements, 6 + 4 * fresh.length);
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
