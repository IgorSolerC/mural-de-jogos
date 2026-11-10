import { Context, Hono } from 'hono';
import { write } from '../domain/quota';
import { HttpError } from '../errors';
import { Deps, Statement } from '../ports';
import { normalizeCode } from '../domain/code';
import { readBody, sessionOf } from './http';
import { toBytes } from './mural';

/**
 * O Quadro livre na nuvem (PLANO-QUADRO-LIVRE.md, seção 7): cada quadro é uma linha própria, compactada em gzip,
 * que o servidor guarda sem abrir. Mexer num quadro manda só ele.
 *
 * - `GET /v1/eu/quadros`: a lista, sem os dados (id, rev, tamanho, quando mudou, se foi apagado).
 * - `GET /v1/eu/quadros/:id`: o quadro compactado; `?rev=` igual ao de agora → 204.
 * - `PUT /v1/eu/quadros/:id`: grava se ninguém gravou antes (`Quadro-Rev-Base`, 0 = novo); senão, 409 com a
 *   `rev` de agora, e o site junta e manda de novo. `Quadro-Imagens`: as imagens que ele usa (a limpeza das
 *   soltas não as apaga).
 * - `DELETE /v1/eu/quadros/:id`: vira lápide (os outros aparelhos ficam sabendo), as imagens saem do índice.
 *
 * O site sabe que algum quadro mudou pelo `Quadros-Versao` do GET do mural (um contador por conta), sem pedido
 * a mais quando nada mudou.
 */

/** O teto de cada quadro compactado (uns 20 mil peças de texto curto; o de 2.000 peças fica bem abaixo). */
export const MAX_BOARD_BYTES = 256 * 1024;
/** Quantos quadros cabem numa conta (as lápides não contam). */
export const MAX_BOARDS = 200;
/** Tudo dos quadros de uma conta, compactado. */
export const MAX_BOARDS_BYTES_PER_USER = 5 * 1024 * 1024;
/** Intervalo mínimo entre duas gravações do mesmo quadro. */
const MIN_INTERVAL_MS = 2_000;
/** Quantas imagens um quadro diz usar (as de 2.000 peças). */
const MAX_IMAGES = 2_000;
/** Lápides com mais que isto saem na limpeza diária. */
export const TOMBSTONE_DAYS = 30;

const ID_RE = /^[A-Za-z0-9_-]{22}$/;
const isGzip = (b: Uint8Array) => b.length >= 18 && b[0] === 0x1f && b[1] === 0x8b;

function boardId(c: Context): string {
  const id = c.req.param('id') ?? '';
  if (!ID_RE.test(id)) throw new HttpError(400, 'quadro-invalido', 'Esse quadro não tem um id que sirva.');
  return id;
}

/** A versão de onde o envio partiu: só dígitos (um cabeçalho vazio não pode passar como "novo"). */
function baseOf(c: Context): number {
  const raw = c.req.header('Quadro-Rev-Base')?.trim() ?? '';
  const base = /^\d{1,16}$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isSafeInteger(base)) throw new HttpError(400, 'sem-rev', 'Faltou dizer em qual versão do quadro o envio se baseia.');
  return base;
}

/** As imagens do quadro, pelo cabeçalho (os ids separados por vírgula; o que não é id fica de fora). */
export function imagesOf(raw: string | undefined): string[] {
  if (!raw) return [];
  return [...new Set(raw.split(',').map((s) => s.trim()))].filter((s) => ID_RE.test(s)).slice(0, MAX_IMAGES);
}

function gzipBody(c: Context, dados: unknown): Response {
  c.header('Content-Type', 'application/gzip');
  const bytes = toBytes(dados);
  return c.body(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, 200);
}

interface Row {
  id: string;
  usuario_id: string;
  rev: number;
  bytes: number;
  atualizado_em: string;
  apagado_em: string | null;
}

/**
 * Os quadros públicos de outra pessoa, pelo código do mural (a visita, PLANO-QUADRO-LIVRE.md 4.8): a lista e cada
 * quadro, só os públicos e nunca as lápides. Como o mural público: com VER_MURAIS=logados, só quem entrou.
 */
function publicBoardRoutes(app: Hono, deps: Deps): void {
  const owner = async (c: Context): Promise<string> => {
    if (deps.config.publicMurals === 'logados') await sessionOf(deps, c);
    const code = normalizeCode(c.req.param('codigo') ?? '');
    const row = code ? await deps.db.first<{ id: string }>('SELECT id FROM usuarios WHERE codigo = ?', [code]) : null;
    if (!row) throw new HttpError(404, 'mural-nao-encontrado', 'Não achei mural com esse código.');
    return row.id;
  };
  app.get('/v1/murais/:codigo/quadros', async (c) => {
    const userId = await owner(c);
    const rows = await deps.db.all<Row>('SELECT id, rev, bytes, atualizado_em FROM quadros WHERE usuario_id = ? AND publico = 1 AND apagado_em IS NULL ORDER BY atualizado_em DESC', [userId]);
    return c.json({ quadros: rows.map((r) => ({ id: r.id, rev: r.rev, atualizadoEm: r.atualizado_em })) });
  });
  app.get('/v1/murais/:codigo/quadros/:id', async (c) => {
    const userId = await owner(c);
    const id = boardId(c);
    const row = await deps.db.first<{ rev: number; dados: unknown }>('SELECT rev, dados FROM quadros WHERE id = ? AND usuario_id = ? AND publico = 1 AND apagado_em IS NULL', [id, userId]);
    if (!row?.dados) throw new HttpError(404, 'quadro-nao-encontrado', 'Esse quadro não é público.');
    c.header('Quadro-Rev', String(row.rev));
    if (c.req.query('rev') === String(row.rev)) return c.body(null, 204);
    return gzipBody(c, row.dados);
  });
}

/** O contador dos quadros da conta depois de uma gravação (o site anota e não pede a lista à toa). */
async function versionOf(deps: Deps, userId: string): Promise<number> {
  return (await deps.db.first<{ v: number }>('SELECT quadros_versao AS v FROM usuarios WHERE id = ?', [userId]))?.v ?? 0;
}

/**
 * O corpo do envio: o quadro compactado e as imagens que ele usa. Em partes (multipart: `quadro`, o gzip, e
 * `imagens`, a lista em JSON), porque a lista de um quadro grande não cabe num cabeçalho; o site de antes manda o
 * gzip puro com a lista no cabeçalho `Quadro-Imagens`.
 */
async function readBoardBody(c: Context): Promise<{ body: Uint8Array<ArrayBuffer>; images: string[] }> {
  const big = () => new HttpError(413, 'quadro-grande-demais', 'O quadro ficou grande demais para a nuvem (passa de 256 KB compactado).');
  const type = c.req.header('Content-Type') ?? '';
  if (!type.startsWith('multipart/form-data')) {
    const body = await readBody(c, MAX_BOARD_BYTES, big);
    if (!isGzip(body)) throw new HttpError(400, 'quadro-invalido', 'O quadro não veio compactado em gzip.');
    return { body, images: imagesOf(c.req.header('Quadro-Imagens')) };
  }
  const raw = await readBody(c, MAX_BOARD_BYTES + 64_000, big);
  let form: FormData;
  try {
    form = await new Response(raw, { headers: { 'Content-Type': type } }).formData();
  } catch {
    throw new HttpError(400, 'quadro-invalido', 'O envio do quadro veio quebrado.');
  }
  const part = form.get('quadro');
  if (!part || typeof part === 'string') throw new HttpError(400, 'quadro-invalido', 'Faltou a parte "quadro" do envio.');
  if (part.size > MAX_BOARD_BYTES) throw big();
  const body = new Uint8Array(await part.arrayBuffer());
  if (!isGzip(body)) throw new HttpError(400, 'quadro-invalido', 'O quadro não veio compactado em gzip.');
  let images: string[] = [];
  const list = form.get('imagens');
  if (typeof list === 'string' && list.length <= 60_000) {
    try {
      const parsed = JSON.parse(list) as unknown;
      if (Array.isArray(parsed)) images = imagesOf(parsed.filter((x) => typeof x === 'string').join(','));
    } catch {
      throw new HttpError(400, 'quadro-invalido', 'A lista das imagens do quadro não serve.');
    }
  }
  return { body, images };
}

export function boardRoutes(app: Hono, deps: Deps): void {
  publicBoardRoutes(app, deps);

  app.get('/v1/eu/quadros', async (c) => {
    const s = await sessionOf(deps, c);
    const user = await deps.db.first<{ quadros_versao: number }>('SELECT quadros_versao FROM usuarios WHERE id = ?', [s.userId]);
    c.header('Quadros-Versao', String(user?.quadros_versao ?? 0));
    const rows = await deps.db.all<Row>('SELECT id, rev, bytes, atualizado_em, apagado_em FROM quadros WHERE usuario_id = ? ORDER BY atualizado_em DESC', [s.userId]);
    return c.json({
      quadros: rows.map((r) => ({ id: r.id, rev: r.rev, bytes: r.bytes, atualizadoEm: r.atualizado_em, ...(r.apagado_em ? { apagado: r.apagado_em } : {}) })),
    });
  });

  app.get('/v1/eu/quadros/:id', async (c) => {
    const s = await sessionOf(deps, c);
    const id = boardId(c);
    const head = await deps.db.first<Row>('SELECT id, usuario_id, rev, apagado_em FROM quadros WHERE id = ? AND usuario_id = ?', [id, s.userId]);
    if (!head) throw new HttpError(404, 'quadro-nao-encontrado', 'Esse quadro não está na nuvem.');
    c.header('Quadro-Rev', String(head.rev));
    if (head.apagado_em) return c.json({ erro: 'quadro-apagado', mensagem: 'Esse quadro foi apagado em outro aparelho.', rev: head.rev, apagado: head.apagado_em }, 410);
    if (c.req.query('rev') === String(head.rev)) return c.body(null, 204);
    const row = await deps.db.first<{ rev: number; dados: unknown }>('SELECT rev, dados FROM quadros WHERE id = ? AND usuario_id = ?', [id, s.userId]);
    if (!row?.dados) throw new HttpError(404, 'quadro-nao-encontrado', 'Esse quadro não está na nuvem.');
    c.header('Quadro-Rev', String(row.rev));
    return gzipBody(c, row.dados);
  });

  app.put('/v1/eu/quadros/:id', async (c) => {
    const s = await sessionOf(deps, c);
    const id = boardId(c);
    const base = baseOf(c);
    const { body, images } = await readBoardBody(c);
    // público: quem visita o mural vê (rodada 6); sem o cabeçalho (um site de antes), fica como estava
    const pub = c.req.header('Quadro-Publico');
    const publico = pub === '1' ? 1 : pub === '0' ? 0 : null;
    const now = deps.now();
    const at = now.toISOString();

    const here = await deps.db.first<Row>('SELECT id, usuario_id, rev, bytes, atualizado_em, apagado_em FROM quadros WHERE id = ?', [id]);
    // o id é sorteado pelo site (128 bits): o de outra conta é um acaso que não acontece, ou alguém tentando
    if (here && here.usuario_id !== s.userId) throw new HttpError(409, 'quadro-de-outro', 'Esse id de quadro já está em uso.');
    if (here && here.rev !== base) {
      return c.json({ erro: 'conflito', mensagem: 'Outro aparelho gravou antes. Juntando e tentando de novo.', rev: here.rev, ...(here.apagado_em ? { apagado: here.apagado_em } : {}) }, 409);
    }
    if (!here && base !== 0) {
      return c.json({ erro: 'conflito', mensagem: 'Esse quadro não está mais na nuvem.', rev: 0 }, 409);
    }
    if (here && !here.apagado_em && now.getTime() - Date.parse(here.atualizado_em) < MIN_INTERVAL_MS) {
      throw new HttpError(429, 'devagar', 'Muitos envios seguidos do mesmo quadro. O próximo vai daqui a pouco.');
    }
    // os tetos: quantos quadros, quanto a conta guarda e quanto a nuvem inteira guarda
    const mine = await deps.db.first<{ n: number; bytes: number }>(
      'SELECT COUNT(*) AS n, COALESCE(SUM(bytes), 0) AS bytes FROM quadros WHERE usuario_id = ? AND apagado_em IS NULL AND id <> ?',
      [s.userId, id],
    );
    if ((mine?.n ?? 0) >= MAX_BOARDS) throw new HttpError(413, 'quadros-demais', `Cabem ${MAX_BOARDS} quadros na nuvem. Apague um para guardar outro.`);
    if ((mine?.bytes ?? 0) + body.length > MAX_BOARDS_BYTES_PER_USER) {
      throw new HttpError(413, 'quadros-cheios', 'Os seus quadros chegaram a 5 MB na nuvem. Tire peças ou apague um quadro.');
    }
    const all = await deps.db.first<{ bytes: number }>('SELECT COALESCE(SUM(bytes), 0) AS bytes FROM quadros WHERE id <> ?', [id]);
    if ((all?.bytes ?? 0) + body.length > deps.config.boardsTotalBytes) {
      throw new HttpError(507, 'nuvem-cheia', 'A nuvem dos quadros está cheia. O quadro continua neste aparelho.');
    }

    // as imagens: só o que mudou é gravado (e contado na cota)
    const before = new Set((await deps.db.all<{ imagem_id: string }>('SELECT imagem_id FROM quadro_imagens WHERE quadro_id = ?', [id])).map((r) => r.imagem_id));
    const next = new Set(images);
    const changes = [...next].filter((x) => !before.has(x)).length + [...before].filter((x) => !next.has(x)).length;

    const mark = `${at}:${crypto.randomUUID()}`;
    const ours = 'SELECT 1 FROM quadros WHERE id = ? AND gravacao = ?';
    const list = JSON.stringify(images);
    const statements: Statement[] = [
      here
        ? {
            sql:
              'UPDATE quadros SET rev = rev + 1, dados = ?, bytes = ?, atualizado_em = ?, apagado_em = NULL, gravacao = ?, publico = COALESCE(?, publico) ' +
              'WHERE id = ? AND usuario_id = ? AND rev = ?',
            params: [body, body.length, at, mark, publico, id, s.userId, base],
          }
        : {
            sql:
              'INSERT INTO quadros (id, usuario_id, rev, dados, bytes, atualizado_em, gravacao, publico) SELECT ?, ?, 1, ?, ?, ?, ?, ? ' +
              'WHERE NOT EXISTS (SELECT 1 FROM quadros WHERE id = ?)',
            params: [id, s.userId, body, body.length, at, mark, publico ?? 0, id],
          },
      { sql: `UPDATE usuarios SET quadros_versao = quadros_versao + 1 WHERE id = ? AND EXISTS (${ours})`, params: [s.userId, id, mark] },
      ...(changes
        ? [
            { sql: `DELETE FROM quadro_imagens WHERE quadro_id = ? AND imagem_id NOT IN (SELECT value FROM json_each(?)) AND EXISTS (${ours})`, params: [id, list, id, mark] },
            { sql: `INSERT OR IGNORE INTO quadro_imagens (quadro_id, imagem_id) SELECT ?, value FROM json_each(?) WHERE EXISTS (${ours})`, params: [id, list, id, mark] },
            // a imagem que estava solta e entrou no quadro deixa de estar
            {
              sql: `UPDATE imagens SET solta_desde = NULL WHERE dono_id = ? AND solta_desde IS NOT NULL AND id IN (SELECT value FROM json_each(?)) AND EXISTS (${ours})`,
              params: [s.userId, list, id, mark],
            },
          ]
        : []),
    ];
    const [result] = await write(deps, statements, 3 + 2 * changes);
    if (!result || result.changes === 0) {
      const current = await deps.db.first<{ rev: number }>('SELECT rev FROM quadros WHERE id = ?', [id]);
      return c.json({ erro: 'conflito', mensagem: 'Outro aparelho gravou antes. Juntando e tentando de novo.', rev: current?.rev ?? 0 }, 409);
    }
    return c.json({ rev: here ? base + 1 : 1, versao: await versionOf(deps, s.userId) });
  });

  app.delete('/v1/eu/quadros/:id', async (c) => {
    const s = await sessionOf(deps, c);
    const id = boardId(c);
    const here = await deps.db.first<Row>('SELECT id, usuario_id, rev, apagado_em FROM quadros WHERE id = ? AND usuario_id = ?', [id, s.userId]);
    // nunca subiu (ou já saiu): nada a fazer
    if (!here) return c.json({ rev: 0 });
    if (here.apagado_em) return c.json({ rev: here.rev, apagado: here.apagado_em });
    // outro aparelho mexeu depois da versão que este viu: a mexida vence a apagada (D10), e o site traz o de lá
    const rawBase = c.req.header('Quadro-Rev-Base')?.trim();
    if (rawBase !== undefined && /^\d{1,16}$/.test(rawBase) && Number(rawBase) !== here.rev) {
      return c.json({ erro: 'conflito', mensagem: 'Outro aparelho mexeu neste quadro depois. Ele fica.', rev: here.rev }, 409);
    }
    const at = deps.now().toISOString();
    const n = await deps.db.first<{ n: number }>('SELECT COUNT(*) AS n FROM quadro_imagens WHERE quadro_id = ?', [id]);
    const mark = `${at}:${crypto.randomUUID()}`;
    const [result] = await write(
      deps,
      [
        {
          sql: 'UPDATE quadros SET rev = rev + 1, dados = NULL, bytes = 0, atualizado_em = ?, apagado_em = ?, publico = 0, gravacao = ? WHERE id = ? AND usuario_id = ? AND apagado_em IS NULL',
          params: [at, at, mark, id, s.userId],
        },
        { sql: 'DELETE FROM quadro_imagens WHERE quadro_id = ? AND EXISTS (SELECT 1 FROM quadros WHERE id = ? AND gravacao = ?)', params: [id, id, mark] },
        { sql: 'UPDATE usuarios SET quadros_versao = quadros_versao + 1 WHERE id = ? AND EXISTS (SELECT 1 FROM quadros WHERE id = ? AND gravacao = ?)', params: [s.userId, id, mark] },
      ],
      3 + (n?.n ?? 0),
    );
    return c.json({ rev: result?.changes ? here.rev + 1 : here.rev, apagado: at, versao: await versionOf(deps, s.userId) });
  });
}
