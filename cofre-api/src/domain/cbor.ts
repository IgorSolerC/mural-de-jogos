/**
 * Um leitor de CBOR (RFC 8949) mínimo e rígido: só o que a WebAuthn usa no registro (o
 * `attestationObject` e a chave pública em COSE). Inteiros, bytes, texto, listas, mapas, `true`,
 * `false` e `null`, todos com tamanho definido. Qualquer outra coisa é erro, e não um "melhor
 * esforço": um leitor tolerante é por onde passa um dado montado para confundir.
 *
 * Limites: profundidade 4, 64 itens por lista ou mapa, inteiros até 2^53, texto em UTF-8 válido,
 * chaves de mapa repetidas recusadas.
 */

export type CborValue = number | Uint8Array | string | boolean | null | CborValue[] | Map<CborValue, CborValue>;

export class CborError extends Error {
  constructor(message: string) {
    super(`CBOR: ${message}`);
    this.name = 'CborError';
  }
}

const MAX_DEPTH = 4;
const MAX_ITEMS = 64;
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

/**
 * Lê um item a partir de `offset` e diz onde ele acabou (a chave pública vem no meio dos dados do
 * autenticador, com mais coisa depois). Para ler um documento inteiro, use `decodeCborAll`.
 */
export function decodeCbor(bytes: Uint8Array, offset = 0): { value: CborValue; end: number } {
  let pos = offset;

  const need = (n: number) => {
    if (n < 0 || pos + n > bytes.length) throw new CborError('acabou antes da hora');
  };
  const readUint = (n: number): number => {
    need(n);
    let v = 0;
    for (let i = 0; i < n; i++) v = v * 256 + bytes[pos + i]!;
    pos += n;
    return v;
  };

  /** O argumento do cabeçalho: o valor (inteiros) ou o tamanho (o resto). Sempre na forma mais curta. */
  const argument = (info: number): number => {
    if (info < 24) return info;
    const sizes: Record<number, number> = { 24: 1, 25: 2, 26: 4, 27: 8 };
    const size = sizes[info];
    if (size === undefined) throw new CborError('tamanho indefinido ou reservado');
    const v = readUint(size);
    if (!Number.isSafeInteger(v)) throw new CborError('número grande demais');
    const min = size === 1 ? 24 : size === 2 ? 256 : size === 4 ? 65_536 : 4_294_967_296;
    if (v < min) throw new CborError('número fora da forma mais curta');
    return v;
  };

  const item = (depth: number): CborValue => {
    if (depth > MAX_DEPTH) throw new CborError('fundo demais');
    need(1);
    const head = bytes[pos++]!;
    const major = head >> 5;
    const info = head & 31;
    switch (major) {
      case 0:
        return argument(info);
      case 1:
        return -1 - argument(info);
      case 2: {
        const n = argument(info);
        need(n);
        const out = bytes.slice(pos, pos + n);
        pos += n;
        return out;
      }
      case 3: {
        const n = argument(info);
        need(n);
        let text: string;
        try {
          text = decoder.decode(bytes.subarray(pos, pos + n));
        } catch {
          throw new CborError('texto que não é UTF-8');
        }
        pos += n;
        return text;
      }
      case 4: {
        const n = argument(info);
        if (n > MAX_ITEMS) throw new CborError('lista grande demais');
        const list: CborValue[] = [];
        for (let i = 0; i < n; i++) list.push(item(depth + 1));
        return list;
      }
      case 5: {
        const n = argument(info);
        if (n > MAX_ITEMS) throw new CborError('mapa grande demais');
        const map = new Map<CborValue, CborValue>();
        for (let i = 0; i < n; i++) {
          const key = item(depth + 1);
          if (typeof key !== 'number' && typeof key !== 'string') throw new CborError('chave de mapa que não é número nem texto');
          if (map.has(key)) throw new CborError('chave de mapa repetida');
          map.set(key, item(depth + 1));
        }
        return map;
      }
      case 7:
        if (info === 20) return false;
        if (info === 21) return true;
        if (info === 22) return null;
        throw new CborError('valor simples ou número com vírgula não aceito');
      default:
        throw new CborError('etiqueta (tag) não aceita');
    }
  };

  const value = item(0);
  return { value, end: pos };
}

/** Lê um documento CBOR que tem de ser exatamente um item, sem sobrar byte. */
export function decodeCborAll(bytes: Uint8Array): CborValue {
  const { value, end } = decodeCbor(bytes);
  if (end !== bytes.length) throw new CborError('sobraram bytes depois do fim');
  return value;
}
