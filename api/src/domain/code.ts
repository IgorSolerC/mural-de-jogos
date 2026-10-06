/**
 * O código de usuário: 8 caracteres do alfabeto Crockford Base32 (números e letras sem I, L, O e U),
 * mostrado em dois grupos de 4 (`K7QF-M2XA`). Guardado sem o hífen.
 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Sorteia um código. 32 símbolos = 5 bits, então cada byte vira um símbolo sem viés (`& 31`). */
export function generateCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => ALPHABET[b & 31]).join('');
}

/**
 * O que a pessoa digitou, do jeito guardado: maiúsculas, sem espaço nem hífen, e as confusões comuns
 * corrigidas (O vira 0; I e L viram 1). Devolve null se não for um código possível.
 */
export function normalizeCode(input: string): string | null {
  const code = input
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
  return /^[0-9A-HJKMNP-TV-Z]{8}$/.test(code) ? code : null;
}

export function formatCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}
