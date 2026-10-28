/** O nome público: o mesmo limite do "Seu nome" do site (OWNER_NAME_MAX). */
export const NAME_MAX = 40;

/**
 * Limpa o nome: sem caracteres de controle ou invisíveis, espaços juntos, até 40 caracteres. Os
 * espaços (o tab e a quebra de linha também) viram um espaço antes de os invisíveis saírem: "Ana\tMaria"
 * fica "Ana Maria", não "AnaMaria". O mesmo no site (`cleanName` em core/cloud-account.ts).
 */
export function cleanName(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const name = Array.from(
    input
      .replace(/\s+/g, ' ')
      .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, '')
      .replace(/ {2,}/g, ' ')
      .trim(),
  )
    .slice(0, NAME_MAX)
    .join('')
    .trim();
  return name || null;
}
