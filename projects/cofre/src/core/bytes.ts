/**
 * Bytes do cofre: juntar, comparar, apagar e passar para texto (base64url) e de volta.
 *
 * Tudo aqui é rígido de propósito: o que vem do servidor passa por `deBase64url`, que recusa
 * qualquer coisa fora do formato exato (padding, letras de fora, sobra de bits). Um dado aceito de
 * dois jeitos diferentes é uma porta para trocar uma coisa por outra sem ninguém ver.
 */

/** Bytes com um ArrayBuffer comum por baixo, o que o WebCrypto aceita. */
export type Bytes = Uint8Array<ArrayBuffer>;

const codificador = new TextEncoder();
const decodificador = new TextDecoder('utf-8', { fatal: true });

export function utf8(texto: string): Bytes {
  return codificador.encode(texto) as Bytes;
}

/** UTF-8 de volta para texto; um byte inválido é erro, nunca um "�" no lugar. */
export function deUtf8(bytes: Bytes): string {
  return decodificador.decode(bytes);
}

export function juntar(...partes: Uint8Array[]): Bytes {
  const total = partes.reduce((soma, p) => soma + p.length, 0);
  const saida = new Uint8Array(total);
  let pos = 0;
  for (const p of partes) {
    saida.set(p, pos);
    pos += p.length;
  }
  return saida;
}

/** Sobrescreve com zeros os bytes que tinham segredo. Aceita vários (e ignora os que faltam). */
export function zerar(...partes: (Uint8Array | null | undefined)[]): void {
  for (const p of partes) p?.fill(0);
}

export function aleatorios(n: number): Bytes {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}

const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const VALOR = new Map([...ALFABETO].map((c, i) => [c, i]));

/** Base64url sem padding (RFC 4648, seção 5). */
export function paraBase64url(bytes: Uint8Array): string {
  let s = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    s += ALFABETO[n >> 18] + ALFABETO[(n >> 12) & 63] + ALFABETO[(n >> 6) & 63] + ALFABETO[n & 63];
  }
  const resto = bytes.length - i;
  if (resto === 1) {
    const n = bytes[i] << 16;
    s += ALFABETO[n >> 18] + ALFABETO[(n >> 12) & 63];
  } else if (resto === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    s += ALFABETO[n >> 18] + ALFABETO[(n >> 12) & 63] + ALFABETO[(n >> 6) & 63];
  }
  return s;
}

/**
 * Base64url para bytes, só no formato canônico: sem padding, sem espaço, sem letra de fora, sem
 * comprimento impossível e sem bits sobrando no último caractere. Qualquer desvio devolve `null`.
 */
export function deBase64url(texto: string): Bytes | null {
  if (texto.length % 4 === 1) return null;
  const valores: number[] = [];
  for (const c of texto) {
    const v = VALOR.get(c);
    if (v === undefined) return null;
    valores.push(v);
  }
  const saida = new Uint8Array(Math.floor((texto.length * 3) / 4));
  let o = 0;
  let i = 0;
  for (; i + 3 < valores.length; i += 4) {
    const n = (valores[i] << 18) | (valores[i + 1] << 12) | (valores[i + 2] << 6) | valores[i + 3];
    saida[o++] = n >> 16;
    saida[o++] = (n >> 8) & 255;
    saida[o++] = n & 255;
  }
  const resto = valores.length - i;
  if (resto === 2) {
    if (valores[i + 1] & 15) return null;
    saida[o++] = (valores[i] << 2) | (valores[i + 1] >> 4);
  } else if (resto === 3) {
    if (valores[i + 2] & 3) return null;
    const n = (valores[i] << 18) | (valores[i + 1] << 12) | (valores[i + 2] << 6);
    saida[o++] = n >> 16;
    saida[o++] = (n >> 8) & 255;
  }
  return saida;
}

export function paraHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function deHex(texto: string): Bytes {
  if (texto.length % 2 || /[^0-9a-f]/.test(texto)) throw new Error('hex inválido');
  const saida = new Uint8Array(texto.length / 2);
  for (let i = 0; i < saida.length; i++) saida[i] = parseInt(texto.slice(i * 2, i * 2 + 2), 16);
  return saida;
}
