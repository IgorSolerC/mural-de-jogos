import { Db, SqlValue, Statement } from '../ports';
import { DAY_MS } from './quota';

/**
 * As anotações compartilhadas no mural público de cada um (migração 0019).
 *
 * A compartilhada pública vai no mural público de cada pessoa que está nela (a dos outros com o
 * `sharedBy`, de quem ela é), e quem monta esse mural é o site da pessoa. Quem é tirado (ou sai), a
 * anotação que vira privada e a apagada continuavam à vista de quem visita até o site dessa pessoa
 * abrir de novo, ou para sempre, se ela não voltasse.
 *
 * A nuvem não abre o mural público a cada visita (custa e deixa a página lenta). Quando acontece uma
 * dessas mudanças, ela marca quem foi afetado (`markStatements`), e a próxima entrega do mural de cada
 * um confere as compartilhadas (`withoutGone`), grava o mural conferido (se algo saiu) e desmarca: a
 * conferência acontece uma vez por mudança, não por visita. Um envio do site nos 7 dias seguintes marca
 * de novo, porque o site que ainda não soube da mudança pode mandar a cópia velha.
 */

/** Quanto tempo depois da mudança um envio novo volta a pedir a conferência. */
export const CHECK_WINDOW_MS = 7 * DAY_MS;
/** O máximo de anotações compartilhadas lidas numa conferência (500 por conta, dela e com ela). */
const MAX_RELATED = 1_000;

/** As pessoas afetadas por uma mudança: um SQL que dá os ids delas (`usuarios.id`). */
export interface Who {
  sql: string;
  params: SqlValue[];
}

/**
 * Marca para conferir o mural público de quem está em `who` e, com `noteId`, tira a anotação das
 * fichas à mostra dessas pessoas (as reações e os comentários dela param de aparecer para os outros
 * na hora, sem esperar a entrega). `guard`: só vale se esse SQL achar algo (a mudança entrou mesmo).
 */
export function markStatements(who: Who, now: Date, noteId?: string, guard?: Who): Statement[] {
  const until = new Date(now.getTime() + CHECK_WINDOW_MS).toISOString();
  const cond = guard ? ` AND EXISTS (${guard.sql})` : '';
  const condParams = guard ? guard.params : [];
  return [
    {
      sql: `UPDATE usuarios SET publico_conferir = 1, publico_conferir_ate = ? WHERE id IN (${who.sql})${cond}`,
      params: [until, ...who.params, ...condParams],
    },
    ...(noteId
      ? [
          {
            sql:
              'UPDATE usuarios SET fichas_publicas = (SELECT json_group_array(value) FROM json_each(usuarios.fichas_publicas) WHERE value <> ?) ' +
              `WHERE id IN (${who.sql}) AND fichas_publicas IS NOT NULL AND instr(fichas_publicas, ?) > 0${cond}`,
            params: [noteId, ...who.params, JSON.stringify(noteId), ...condParams],
          },
        ]
      : []),
  ];
}

/** As compartilhadas de `userId` (dele e com ele): as que ele pode mostrar e as que viraram privadas. */
export interface Related {
  /** Públicas, e ele está nelas (ou é o dono). */
  shown: ReadonlySet<string>;
  /** Privadas, e ele está nelas (ou é o dono). */
  hidden: ReadonlySet<string>;
}

export async function relatedNotes(db: Db, userId: string): Promise<Related> {
  // a anotação guardada é sempre JSON (domain/shared-note.ts), mas o json_valid poupa a consulta inteira
  // de uma linha estragada
  const priv = "CASE WHEN json_valid(n.dados) THEN json_extract(n.dados, '$.private') = 1 ELSE 0 END";
  const rows = await db.all<{ id: string; privada: number }>(
    `SELECT n.id, ${priv} AS privada FROM notas n WHERE n.dono_id = ? ` +
      `UNION ALL SELECT n.id, ${priv} AS privada FROM nota_membros m JOIN notas n ON n.id = m.nota_id WHERE m.usuario_id = ? LIMIT ?`,
    [userId, userId, MAX_RELATED],
  );
  const shown = new Set<string>();
  const hidden = new Set<string>();
  for (const r of rows) (r.privada ? hidden : shown).add(r.id);
  return { shown, hidden };
}

/** As listas do mural público com anotações (as do mural e as só no Kanban, que o link da ficha abre). */
const NOTE_LISTS = ['notas', 'soKanban'] as const;

/**
 * O texto do mural público sem as compartilhadas que a pessoa não pode mais mostrar, e os ids que
 * saíram; null se nada sai (o mural fica como está). Sai:
 * - a de outra pessoa (`sharedBy`) em que ela não está mais, que virou privada ou foi apagada;
 * - a dela (sem `sharedBy`) que virou privada (um gestor pode mudar quem vê sem o site dela abrir).
 * A anotação comum (que nunca foi compartilhada) fica.
 */
export function withoutGone(text: string, related: Related): { text: string; dropped: string[] } | null {
  // a visita comum não paga o JSON.parse: sem compartilhada de outra pessoa nem privada dela no texto,
  // não há o que tirar
  if (!text.includes('"sharedBy"') && ![...related.hidden].some((id) => text.includes(JSON.stringify(id)))) return null;
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch {
    return null;
  }
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return null;
  const out = { ...(doc as Record<string, unknown>) };
  const dropped: string[] = [];
  const gone = (n: unknown): boolean => {
    if (!n || typeof n !== 'object') return false;
    const r = n as Record<string, unknown>;
    const id = r['id'];
    if (typeof id !== 'string') return false;
    const foreign = r['sharedBy'] !== undefined && r['sharedBy'] !== null;
    return foreign ? !related.shown.has(id) : related.hidden.has(id);
  };
  for (const key of NOTE_LISTS) {
    const list = out[key];
    if (!Array.isArray(list)) continue;
    const kept = list.filter((n) => {
      if (!gone(n)) return true;
      dropped.push((n as { id: string }).id);
      return false;
    });
    if (kept.length !== list.length) out[key] = kept;
  }
  if (!dropped.length) return null;
  return { text: JSON.stringify(out), dropped: [...new Set(dropped)] };
}

export async function gunzipText(bytes: Uint8Array): Promise<string> {
  const stream = new Blob([bytes as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

export async function gzipText(text: string): Promise<Uint8Array> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
