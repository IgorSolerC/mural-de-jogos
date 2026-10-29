import { HttpError } from '../errors';
import { Db, Deps, SqlValue, Statement } from '../ports';
import { DAY_MS } from './quota';

/**
 * As imagens coladas nas anotações (PLANO-IMAGENS.md). O site encolhe a imagem no aparelho antes de
 * mandar; a nuvem não abre nem encolhe nada (10 ms de CPU no plano grátis), só confere pelos primeiros
 * bytes o tipo e o tamanho de verdade, e guarda. Os bytes vão para o banco `mural-imagens` (`imagesDb`),
 * os dados para `imagens` no banco de sempre, e a conta de quanto cada um usa para `imagens_uso`.
 */

/** O lado maior, em pixels: o site encolhe para isto, e a nuvem recusa o que passar. */
export const MAX_SIDE = 900;
/** O teto de cada imagem: uma de 900 px em WebP fica em 40–120 KB; o JPEG do Safari, um pouco mais. */
export const MAX_IMAGE_BYTES = 200 * 1024;
/** O id que o site sorteia: 16 bytes em base64url. */
export const IMAGE_ID = /^[A-Za-z0-9_-]{22}$/;
/** A conta da nuvem inteira em `imagens_uso`. */
export const ALL = '*';
/** A imagem que ficou no meio do envio (os dados sem os bytes) há mais que isto é conferida pela limpeza. */
export const HALF_SENT_MS = DAY_MS;

export type ImageType = 'image/webp' | 'image/jpeg' | 'image/png';

export interface ImageInfo {
  tipo: ImageType;
  largura: number;
  altura: number;
}

const u16be = (b: Uint8Array, i: number) => (b[i]! << 8) | b[i + 1]!;
const u16le = (b: Uint8Array, i: number) => b[i]! | (b[i + 1]! << 8);
const u24le = (b: Uint8Array, i: number) => b[i]! | (b[i + 1]! << 8) | (b[i + 2]! << 16);
const u32be = (b: Uint8Array, i: number) => ((b[i]! << 24) >>> 0) + (b[i + 1]! << 16) + (b[i + 2]! << 8) + b[i + 3]!;
const ascii = (b: Uint8Array, i: number, text: string) => [...text].every((ch, k) => b[i + k] === ch.charCodeAt(0));

/**
 * O tipo e o tamanho de uma imagem pelos primeiros bytes (WebP, JPEG ou PNG); null para o resto (SVG,
 * GIF, HEIC, qualquer outra coisa). Só lê o cabeçalho: não decodifica a imagem.
 */
export function imageInfo(b: Uint8Array): ImageInfo | null {
  if (b.length >= 24 && b[0] === 0x89 && ascii(b, 1, 'PNG\r\n\x1a\n') && ascii(b, 12, 'IHDR')) {
    return sized('image/png', u32be(b, 16), u32be(b, 20));
  }
  if (b.length >= 30 && ascii(b, 0, 'RIFF') && ascii(b, 8, 'WEBP')) {
    if (ascii(b, 12, 'VP8 ') && b[23] === 0x9d && b[24] === 0x01 && b[25] === 0x2a) return sized('image/webp', u16le(b, 26) & 0x3fff, u16le(b, 28) & 0x3fff);
    if (ascii(b, 12, 'VP8L') && b[20] === 0x2f) {
      return sized('image/webp', 1 + (((b[22]! & 0x3f) << 8) | b[21]!), 1 + (((b[24]! & 0x0f) << 10) | (b[23]! << 2) | ((b[22]! & 0xc0) >> 6)));
    }
    if (ascii(b, 12, 'VP8X')) return sized('image/webp', 1 + u24le(b, 24), 1 + u24le(b, 27));
    return null;
  }
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return null;
      const marker = b[i + 1]!;
      if (marker === 0xff) {
        i++; // enchimento entre os marcadores
        continue;
      }
      // SOF0–SOF15 (menos DHT, JPG e DAC): a altura e a largura
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return sized('image/jpeg', u16be(b, i + 7), u16be(b, i + 5));
      }
      // o começo dos dados sem um SOF antes: não é uma imagem que se mostre
      if (marker === 0xda || marker === 0xd9) return null;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        i += 2;
        continue;
      }
      i += 2 + u16be(b, i + 2);
    }
    return null;
  }
  return null;
}

function sized(tipo: ImageType, largura: number, altura: number): ImageInfo | null {
  return largura > 0 && altura > 0 ? { tipo, largura, altura } : null;
}

/** Os bytes que vieram, conferidos: o tipo, o teto e o lado maior. */
export function checkImage(bytes: Uint8Array): ImageInfo {
  if (bytes.length === 0) throw new HttpError(400, 'imagem-vazia', 'A imagem veio vazia.');
  if (bytes.length > MAX_IMAGE_BYTES) throw tooBig();
  const info = imageInfo(bytes);
  if (!info) throw new HttpError(415, 'imagem-tipo', 'Só imagens WebP, JPEG ou PNG.');
  if (Math.max(info.largura, info.altura) > MAX_SIDE) {
    throw new HttpError(413, 'imagem-grande', `A imagem passa de ${MAX_SIDE} px no lado maior.`);
  }
  return info;
}

export function tooBig(): HttpError {
  return new HttpError(413, 'imagem-grande', `A imagem passa de ${MAX_IMAGE_BYTES / 1024} KB.`);
}

/** Sem o banco das imagens (o binding faltando), elas ficam indisponíveis; o resto da nuvem segue. */
export function imagesDbOf(deps: Deps): Db {
  if (!deps.imagesDb) throw new HttpError(503, 'imagens-indisponiveis', 'As imagens estão fora do ar agora. Elas continuam neste aparelho.');
  return deps.imagesDb;
}

export interface ImageUsage {
  imagens: number;
  bytes: number;
}

/** Quanto a conta (ou a nuvem inteira, `ALL`) guarda. */
export async function usageOf(db: Db, userId: string): Promise<ImageUsage> {
  const row = await db.first<{ imagens: number; bytes: number }>('SELECT imagens, bytes FROM imagens_uso WHERE usuario_id = ?', [userId]);
  return { imagens: row?.imagens ?? 0, bytes: row?.bytes ?? 0 };
}

/** O resumo para o site e para a checagem diária: o que usa, a cota e quanto falta. */
export function room(used: ImageUsage, quota: number): { imagens: number; bytes: number; cota: number; livre: number } {
  return { imagens: used.imagens, bytes: used.bytes, cota: quota, livre: Math.max(0, quota - used.bytes) };
}

/** Os ids de imagem do Murall num texto (`murall://imagem/ID`), sem repetir, até `max`. */
export function imageIdsIn(text: string, max = 1000): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/murall:\/\/imagem\/([A-Za-z0-9_-]{22})(?![A-Za-z0-9_-])/g)) {
    out.add(m[1]!);
    if (out.size >= max) break;
  }
  return [...out];
}

/** A pessoa está na anotação (é a dona, ou está entre as pessoas): o pedaço de SQL, com o id da pessoa em `?` duas vezes. */
const IN_NOTE = '(n.dono_id = ? OR EXISTS (SELECT 1 FROM nota_membros m WHERE m.nota_id = n.id AND m.usuario_id = ?))';

/**
 * A imagem e quem pode vê-la, conferido agora (rodada 4): `publica`, alguém a mostra no mural público e
 * pode mostrar (o dono, ou quem está numa compartilhada que a usa); `membro`, quem pede está numa
 * compartilhada que a usa (com `viewer` null, falso).
 */
export async function imageAccess(
  db: Db,
  id: string,
  viewer: string | null,
): Promise<{ dono_id: string; tipo: string; pronta: number; publica: number; membro: number } | null> {
  return db.first(
    'SELECT i.dono_id, i.tipo, i.pronta, ' +
      'EXISTS (SELECT 1 FROM imagem_publica p WHERE p.imagem_id = i.id AND (p.usuario_id = i.dono_id OR EXISTS (' +
      'SELECT 1 FROM nota_imagens ni JOIN notas n ON n.id = ni.nota_id WHERE ni.imagem_id = i.id AND ' +
      '(n.dono_id = p.usuario_id OR EXISTS (SELECT 1 FROM nota_membros m WHERE m.nota_id = n.id AND m.usuario_id = p.usuario_id))))) AS publica, ' +
      `EXISTS (SELECT 1 FROM nota_imagens ni JOIN notas n ON n.id = ni.nota_id WHERE ni.imagem_id = i.id AND ${IN_NOTE}) AS membro ` +
      'FROM imagens i WHERE i.id = ?',
    [viewer ?? '', viewer ?? '', id],
  );
}

/**
 * As imagens que a pessoa mostra no mural público passam a ser estas (a parte `imagens` do envio do
 * mural): sai o que não está na lista, entra o que falta. Só grava o que mudou. `guard`: a condição de
 * a gravação do mural ter valido (a marca dele). Quem pode mostrar é conferido na entrega.
 */
export function publishStatements(userId: string, ids: readonly string[], guard: { sql: string; params: SqlValue[] }): Statement[] {
  const list = JSON.stringify(ids);
  return [
    {
      sql: `DELETE FROM imagem_publica WHERE usuario_id = ? AND imagem_id NOT IN (SELECT value FROM json_each(?)) AND EXISTS (${guard.sql})`,
      params: [userId, list, ...guard.params],
    },
    {
      sql: `INSERT OR IGNORE INTO imagem_publica (imagem_id, usuario_id) SELECT value, ? FROM json_each(?) WHERE EXISTS (${guard.sql})`,
      params: [userId, list, ...guard.params],
    },
  ];
}

/** A parte `imagens` do envio do mural: `{ "publicas": [ids] }`; null se não veio ou não serve (nada muda). */
export function parsePublished(raw: unknown): string[] | null {
  if (typeof raw !== 'string' || raw.length > 40_000) return null;
  try {
    const data = JSON.parse(raw) as { publicas?: unknown } | null;
    const list = data?.publicas;
    if (!Array.isArray(list)) return null;
    return [...new Set(list.filter((x): x is string => typeof x === 'string' && IMAGE_ID.test(x)))].slice(0, 1000);
  } catch {
    return null;
  }
}

/**
 * As imagens que a anotação compartilhada usa passam a ser as do texto dela (e da versão em conflito):
 * sai o que não está, entra o que falta. `guard`: a condição de a gravação da anotação ter valido.
 */
export function noteImageStatements(noteId: string, texts: readonly string[], guard?: { sql: string; params: SqlValue[] }): Statement[] {
  const list = JSON.stringify([...new Set(texts.flatMap((t) => imageIdsIn(t, 200)))]);
  const when = guard ? ` AND EXISTS (${guard.sql})` : '';
  const extra = guard?.params ?? [];
  return [
    { sql: `DELETE FROM nota_imagens WHERE nota_id = ? AND imagem_id NOT IN (SELECT value FROM json_each(?))${when}`, params: [noteId, list, ...extra] },
    { sql: `INSERT OR IGNORE INTO nota_imagens (nota_id, imagem_id) SELECT ?, value FROM json_each(?) WHERE 1${when}`, params: [noteId, list, ...extra] },
  ];
}

/**
 * Tirar imagens (os dados e a conta delas). Os bytes saem antes, do outro banco (`dropBytes`), para nunca
 * sobrar byte sem dono. A conta só desce se a linha ainda existe (dois apagares ao mesmo tempo descontam
 * uma vez só): cada imagem desconta do dono e da nuvem antes de sair.
 */
export function dropStatements(images: readonly { id: string; dono_id: string; bytes: number }[]): Statement[] {
  return images.flatMap((img) => [
    {
      sql: 'UPDATE imagens_uso SET imagens = imagens - 1, bytes = bytes - ? WHERE usuario_id IN (?, ?) AND EXISTS (SELECT 1 FROM imagens WHERE id = ?)',
      params: [img.bytes, img.dono_id, ALL, img.id],
    },
    { sql: 'DELETE FROM imagens WHERE id = ?', params: [img.id] },
    // quem a mostrava e as anotações que a usavam
    { sql: 'DELETE FROM imagem_publica WHERE imagem_id = ?', params: [img.id] },
    { sql: 'DELETE FROM nota_imagens WHERE imagem_id = ?', params: [img.id] },
  ]);
}

/** Até 100 parâmetros por consulta no D1: os ids vão em lotes. */
const CHUNK = 90;

export function chunks<T>(list: readonly T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/** Tira os bytes destes ids do banco das imagens (sem ele, não há o que tirar). */
export async function dropBytes(deps: Deps, ids: readonly string[]): Promise<void> {
  if (!deps.imagesDb || ids.length === 0) return;
  await deps.imagesDb.batch(chunks(ids).map((part) => ({ sql: `DELETE FROM bytes WHERE id IN (${part.map(() => '?').join(', ')})`, params: [...part] })));
}

/**
 * A recontagem de `imagens_uso` a partir de `imagens` (a limpeza diária): se um lote falhou no meio ou
 * algo se perdeu, a conta volta a bater com o que está guardado. Lê uma linha por imagem; grava uma por
 * conta com imagens.
 */
export function recountStatements(): Statement[] {
  return [
    { sql: 'DELETE FROM imagens_uso' },
    { sql: 'INSERT INTO imagens_uso (usuario_id, imagens, bytes) SELECT dono_id, COUNT(*), SUM(bytes) FROM imagens GROUP BY dono_id' },
    { sql: 'INSERT INTO imagens_uso (usuario_id, imagens, bytes) SELECT ?, COUNT(*), COALESCE(SUM(bytes), 0) FROM imagens', params: [ALL] },
  ];
}

/**
 * As imagens que ficaram no meio do envio (os dados gravados, os bytes talvez não) há mais de um dia:
 * as que têm bytes ficam prontas; as outras saem (e a conta desce). Roda na limpeza diária, fora da cota.
 */
export async function finishHalfSent(deps: Deps, now: Date): Promise<void> {
  if (!deps.imagesDb) return;
  const stale = await deps.db.all<{ id: string; dono_id: string; bytes: number }>(
    'SELECT id, dono_id, bytes FROM imagens WHERE pronta = 0 AND criada_em < ? LIMIT 500',
    [new Date(now.getTime() - HALF_SENT_MS).toISOString()],
  );
  if (stale.length === 0) return;
  const there = new Set<string>();
  for (const part of chunks(stale.map((s) => s.id))) {
    const rows = await deps.imagesDb.all<{ id: string }>(`SELECT id FROM bytes WHERE id IN (${part.map(() => '?').join(', ')})`, part);
    for (const r of rows) there.add(r.id);
  }
  const ready = stale.filter((s) => there.has(s.id));
  await deps.db.batch([
    ...chunks(ready.map((s) => s.id)).map((part) => ({ sql: `UPDATE imagens SET pronta = 1 WHERE id IN (${part.map(() => '?').join(', ')})`, params: [...part] })),
    ...dropStatements(stale.filter((s) => !there.has(s.id))),
  ]);
}
