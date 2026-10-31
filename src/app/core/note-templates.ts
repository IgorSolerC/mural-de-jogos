import { cleanLabel, nameCollator, nameKey } from './text';

/**
 * Os templates do texto (o menu "Templates" da régua, ver ui/text-templates.ts): um trecho que a pessoa
 * escreve sempre, guardado com um nome, para pôr no cursor ou copiar. O texto é o markdown de sempre
 * (as marcas, as listas, os widgets), o mesmo que a anotação guarda.
 *
 * Moram nas configurações do mural de anotações (`NotesConfig.templates`, ver mural-config.ts), que vão
 * para os outros aparelhos pelo mural privado. Não importa nada além de text.ts: mural-config.ts é lido
 * pelos ajustes, e um import a mais aqui pode fechar um ciclo.
 */
export interface NoteTemplate {
  id: string;
  /** O nome que aparece no menu. */
  title: string;
  text: string;
}

/** Templates demais viram lixo guardado (e o menu deixa de ser um menu): no máximo estes. */
export const MAX_TEMPLATES = 50;
export const MAX_TEMPLATE_TITLE = 60;
/** Metade do texto de uma anotação: um template é um pedaço dela. */
export const MAX_TEMPLATE_TEXT = 10_000;

const ID = /^[a-z0-9]{1,24}$/;

/** Os templates guardados (ou vindos da nuvem): com id, nome e texto, sem repetir id, até o máximo. */
export function sanitizeTemplates(raw: unknown): NoteTemplate[] {
  if (!Array.isArray(raw)) return [];
  const out: NoteTemplate[] = [];
  for (const v of raw) {
    if (out.length >= MAX_TEMPLATES) break;
    if (!v || typeof v !== 'object') continue;
    const { id, title, text } = v as Record<string, unknown>;
    if (typeof id !== 'string' || !ID.test(id) || out.some((t) => t.id === id)) continue;
    const name = typeof title === 'string' ? cleanTitle(title) : '';
    const body = typeof text === 'string' ? text.replace(/\r\n?/g, '\n').slice(0, MAX_TEMPLATE_TEXT) : '';
    if (name && body.trim()) out.push({ id, title: name, text: body });
  }
  return out;
}

/** O nome limpo: uma linha só, sem espaços a mais (a caixa fica como a pessoa escreveu). */
export function cleanTitle(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, MAX_TEMPLATE_TITLE).trim();
}

/** Na ordem do menu: pelo nome, sem ligar para caixa e acento, com os números na ordem deles. */
export function sortedTemplates(list: readonly NoteTemplate[]): NoteTemplate[] {
  return [...list].sort((a, b) => nameCollator.compare(a.title, b.title) || a.id.localeCompare(b.id));
}

/** Outro template (que não `id`) já tem esse nome (sem ligar para caixa, acento e espaços). */
export function titleTaken(list: readonly NoteTemplate[], title: string, id: string | null): boolean {
  const key = nameKey(title);
  return !!key && list.some((t) => t.id !== id && nameKey(t.title) === key);
}

/** A lista com o template posto: no lugar do de mesmo id, ou no fim. */
export function withTemplate(list: readonly NoteTemplate[], t: NoteTemplate): NoteTemplate[] {
  return list.some((x) => x.id === t.id) ? list.map((x) => (x.id === t.id ? t : x)) : [...list, t];
}

/** Um id novo para um template (as letras e números que o `sanitizeTemplates` aceita). */
export function newTemplateId(): string {
  const raw = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID().replace(/-/g, '') : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return raw.slice(0, 16);
}

/** O nome sugerido a partir do texto (o placeholder do campo do nome): a primeira linha com letras, como rótulo. */
export function suggestedTitle(plain: string): string {
  const line = plain.split('\n').find((l) => /[\p{L}\p{N}]/u.test(l)) ?? '';
  return cleanLabel(line.replace(/^\s*(?:[-*+>•·]+|\d+[.)])\s+/, ''), 40);
}
