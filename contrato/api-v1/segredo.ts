/**
 * O segredo de uma chave de API (PLANO-API.md, 5.1): `murall_` + 43 letras (32 bytes aleatórios em
 * base64url) + 6 de conferência. A conferência (o CRC32 do miolo em base 62) deixa a CLI e o site
 * recusarem um segredo copiado errado sem ir à rede; não protege nada (quem protege são os 32 bytes).
 * O prefixo fixo deixa um vazamento fácil de reconhecer.
 */

export const PREFIXO_DO_SEGREDO = 'murall_';
const MIOLO = 43;
const CONFERE = 6;
const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
export const SEGREDO_RE = /^murall_[A-Za-z0-9_-]{43}[0-9A-Za-z]{6}$/;

let tabela: Uint32Array | null = null;

/** O CRC32 (o do zip) de um texto ASCII. */
export function crc32(texto: string): number {
  if (!tabela) {
    tabela = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      tabela[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < texto.length; i++) crc = tabela[(crc ^ texto.charCodeAt(i)) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function conferencia(miolo: string): string {
  let n = crc32(miolo);
  let out = '';
  for (let i = 0; i < CONFERE; i++) {
    out = BASE62[n % 62] + out;
    n = Math.floor(n / 62);
  }
  return out;
}

/** O segredo inteiro a partir do miolo (43 letras de base64url). */
export function montarSegredo(miolo: string): string {
  return PREFIXO_DO_SEGREDO + miolo + conferencia(miolo);
}

/** Tem a forma de um segredo e a conferência bate? */
export function segredoConfere(segredo: string): boolean {
  if (!SEGREDO_RE.test(segredo)) return false;
  const miolo = segredo.slice(PREFIXO_DO_SEGREDO.length, PREFIXO_DO_SEGREDO.length + MIOLO);
  return segredo.slice(-CONFERE) === conferencia(miolo);
}
