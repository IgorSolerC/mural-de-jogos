import { HttpError } from '../errors';
import { REF_RE, cleanTitle } from './review';

/**
 * As anotações compartilhadas (migração 0011). O dono é sempre o dono; cada pessoa a mais entra com um
 * papel:
 * - gestor: faz tudo com a anotação (o texto, quem vê, quem mais entra), menos mexer no dono ou
 *   apagar a anotação para todos;
 * - editor: escreve como se a anotação fosse dele, sem mudar o que é da estrutura (as pessoas e quem vê);
 * - leitor: só lê.
 *
 * O grupo, o assunto e as tags não são da anotação: cada pessoa organiza o próprio mural (o site guarda
 * os dela no mural privado). O que chega com eles (um site de antes) é guardado sem eles.
 *
 * O servidor guarda a anotação aberta (`dados`, o JSON da ficha como o site grava) e só confere a vez
 * (`rev`) e o papel. Juntar duas edições é com o site (ver `src/app/core/merge3.ts`).
 */
export type Role = 'gestor' | 'editor' | 'leitor';
export const ROLES: readonly Role[] = ['gestor', 'editor', 'leitor'];
/** O papel de quem pede, contando o dono. */
export type Access = 'dono' | Role;

export const isRole = (v: unknown): v is Role => typeof v === 'string' && (ROLES as readonly string[]).includes(v);

/** Escrevem no texto: o dono, os gestores e os editores (e só eles escolhem num conflito). */
export const canWrite = (a: Access | null): boolean => a === 'dono' || a === 'gestor' || a === 'editor';
/** Mexem na estrutura (as pessoas e quem vê): o dono e os gestores. */
export const canManage = (a: Access | null): boolean => a === 'dono' || a === 'gestor';

/** Quantas pessoas (além do dono) uma anotação aceita. */
export const MAX_MEMBERS = 30;
/** Quantas anotações compartilhadas (dele ou com ele) uma conta tem, no máximo. */
export const MAX_NOTES_PER_USER = 500;
/** O tamanho da anotação guardada (JSON), em caracteres. O D1 aceita 2 MB por linha, e o conflito guarda mais duas. */
export const MAX_NOTE_CHARS = 450_000;
/** O maior pedido aceito numa gravação: a anotação e, num conflito, a outra versão. */
export const MAX_NOTE_BODY_CHARS = 2 * MAX_NOTE_CHARS + 4_096;

/**
 * O que não vai na anotação guardada: o que é de cada pessoa (ver o topo do arquivo) e o `sharedBy`,
 * que só o mural público de cada um põe (de quem é a anotação). Guardado, ele viraria um "de outra
 * pessoa" falso no mural público do dono, mandado por qualquer um que escreve.
 */
const PERSONAL = ['category', 'subject', 'tags', 'noteRank', 'sharedBy'] as const;

/**
 * A anotação que veio do site, pronta para guardar (JSON), sem o que é de cada pessoa (`PERSONAL`).
 * Tem de ser um objeto com o id dela e do mural de anotações; o resto o servidor não abre (quem desenha
 * e confere é o site).
 */
export function noteData(raw: unknown, id: string): string {
  const bad = () => new HttpError(400, 'nota-invalida', 'Essa anotação veio quebrada.');
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw bad();
  const r = raw as Record<string, unknown>;
  if (r['id'] !== id || r['kind'] !== 'anotacoes') throw bad();
  const game = r['game'] as Record<string, unknown> | undefined;
  if (!game || typeof game !== 'object' || typeof game['name'] !== 'string') throw bad();
  const own = Object.fromEntries(Object.entries(r).filter(([k]) => !(PERSONAL as readonly string[]).includes(k)));
  const text = JSON.stringify(own);
  if (text.length > MAX_NOTE_CHARS) {
    throw new HttpError(413, 'nota-grande-demais', 'Essa anotação ficou grande demais para compartilhar (passa de 450 mil caracteres).');
  }
  return text;
}

/** O id de uma anotação (o mesmo das fichas). */
export function noteId(raw: unknown): string {
  if (typeof raw !== 'string' || !REF_RE.test(raw)) throw new HttpError(400, 'nota-invalida', 'Essa anotação não existe.');
  return raw;
}

/**
 * O que é da estrutura na anotação guardada: quem vê (privada, pública sem aviso, e desde quando ela
 * está publicada, que a põe de novo no Feed de quem segue). Um editor não muda isso. O grupo, o assunto
 * e as tags de uma anotação gravada antes deles serem de cada pessoa não contam.
 */
export function structureOf(stored: string): string {
  let r: Record<string, unknown> = {};
  try {
    const data = JSON.parse(stored) as unknown;
    if (data && typeof data === 'object') r = data as Record<string, unknown>;
  } catch {
    /* sem estrutura */
  }
  return JSON.stringify({
    private: r['private'] === true,
    quiet: r['quiet'] === true,
    publishedAt: isoOrNull(r['publishedAt']),
  });
}

/** A anotação guardada é privada (só quem está nela vê)? */
export function isPrivateNote(stored: string): boolean {
  return (JSON.parse(structureOf(stored)) as { private: boolean }).private;
}

/** A data como o site a guarda (ISO; a que não é data o site joga fora), para comparar do mesmo jeito. */
function isoOrNull(v: unknown): string | null {
  const t = typeof v === 'string' ? Date.parse(v) : NaN;
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

/** O título da anotação guardada, para o aviso. */
export function titleOf(stored: string): string {
  try {
    const data = JSON.parse(stored) as { game?: { name?: unknown } };
    return cleanTitle(data?.game?.name) || 'Anotação';
  } catch {
    return 'Anotação';
  }
}
