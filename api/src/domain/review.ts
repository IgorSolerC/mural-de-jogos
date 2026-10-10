/** O id de uma resenha (o `ref` das atividades e das reações). */
export const REF_RE = /^[\w-]{4,64}$/;
/** O mural de uma resenha ('jogos', 'livros'…). */
export const MURAL_RE = /^[a-z]{2,20}$/;

/** O título da resenha no aviso: sem invisíveis, espaços juntos, até 120 caracteres ('' se não sobrar nada). */
export function cleanTitle(input: unknown): string {
  if (typeof input !== 'string') return '';
  return Array.from(input.replace(/[\p{Cc}\p{Cf}]/gu, '').replace(/\s+/g, ' ').trim()).slice(0, 120).join('').trim();
}
