/** Um pedaço da senha do mesmo tipo de caractere, para pintar números e símbolos de outra cor. */
export interface Trecho {
  readonly tipo: 'letra' | 'numero' | 'simbolo';
  readonly texto: string;
}

/** A senha em trechos de letras, números e símbolos (como nos gerenciadores de senha), para ler sem confundir. */
export function emTrechos(senha: string): Trecho[] {
  const tipo = (c: string): Trecho['tipo'] => (/\p{N}/u.test(c) ? 'numero' : /\p{L}/u.test(c) ? 'letra' : 'simbolo');
  return [...senha].reduce<Trecho[]>((trechos, c) => {
    const t = tipo(c);
    const ultimo = trechos[trechos.length - 1];
    return ultimo?.tipo === t ? [...trechos.slice(0, -1), { tipo: t, texto: ultimo.texto + c }] : [...trechos, { tipo: t, texto: c }];
  }, []);
}
