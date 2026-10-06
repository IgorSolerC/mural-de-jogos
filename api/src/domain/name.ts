/** O nome público: o mesmo limite do "Seu nome" do site (OWNER_NAME_MAX). */
export const NAME_MAX = 40;

/** Limpa o nome: sem caracteres de controle ou invisíveis, espaços juntos, até 40 caracteres. */
export function cleanName(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const name = Array.from(
    input
      .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, '')
      .replace(/\s+/g, ' ')
      .trim(),
  )
    .slice(0, NAME_MAX)
    .join('')
    .trim();
  return name || null;
}
