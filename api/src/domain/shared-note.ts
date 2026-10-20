import { HttpError } from '../errors';
import { REF_RE, cleanTitle } from './review';

/**
 * As anotações compartilhadas (migração 0011). O dono é sempre o dono; cada pessoa a mais entra com um
 * papel:
 * - gestor: faz tudo com a anotação (o texto, as tags, a categoria, quem vê, quem mais entra), menos
 *   mexer no dono ou apagar a anotação para todos;
 * - editor: escreve como se a anotação fosse dele, sem mudar o que é da estrutura (as pessoas, a
 *   categoria, as tags e quem vê);
 * - leitor: só lê.
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
/** Mexem na estrutura (as pessoas, a categoria, as tags, quem vê): o dono e os gestores. */
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
 * A anotação que veio do site, pronta para guardar (JSON). Tem de ser um objeto com o id dela e do
 * mural de anotações; o resto o servidor não abre (quem desenha e confere é o site).
 */
export function noteData(raw: unknown, id: string): string {
  const bad = () => new HttpError(400, 'nota-invalida', 'Essa anotação veio quebrada.');
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw bad();
  const r = raw as Record<string, unknown>;
  if (r['id'] !== id || r['kind'] !== 'anotacoes') throw bad();
  const game = r['game'] as Record<string, unknown> | undefined;
  if (!game || typeof game !== 'object' || typeof game['name'] !== 'string') throw bad();
  const text = JSON.stringify(raw);
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
 * O que é da estrutura na anotação guardada: a categoria, o assunto, as tags (a ordem não importa) e quem vê.
 * Um editor não muda nada disso.
 */
export function structureOf(stored: string): string {
  let r: Record<string, unknown> = {};
  try {
    const data = JSON.parse(stored) as unknown;
    if (data && typeof data === 'object') r = data as Record<string, unknown>;
  } catch {
    /* sem estrutura */
  }
  const tags = Array.isArray(r['tags']) ? r['tags'].filter((t): t is string => typeof t === 'string').sort() : [];
  return JSON.stringify({
    category: typeof r['category'] === 'string' ? r['category'] : '',
    // o assunto só entra quando existe: a estrutura guardada antes dele continua igual
    ...(typeof r['subject'] === 'string' && r['subject'] ? { subject: r['subject'] } : {}),
    tags,
    private: r['private'] === true,
    quiet: r['quiet'] === true,
  });
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
