import { bitsGerados, gerarCaracteres, gerarFrase, TIPOS, type Tipo } from './gerador';
import { PALAVRAS } from './palavras';

describe('o gerador de senhas', () => {
  it('caracteres: o tamanho pedido, só dos tipos pedidos, com pelo menos um de cada', () => {
    const tipos: Tipo[] = ['minusculas', 'numeros', 'simbolos'];
    for (let i = 0; i < 200; i++) {
      const s = gerarCaracteres({ tamanho: 12, tipos });
      expect(s.length).toBe(12);
      const alfabeto = tipos.map((t) => TIPOS[t]).join('');
      expect([...s].every((c) => alfabeto.includes(c))).toBe(true);
      for (const t of tipos) expect([...s].some((c) => TIPOS[t].includes(c))).withContext(`${s} sem ${t}`).toBe(true);
    }
  });

  it('sem os caracteres que se confundem (l, I, O, 0, 1)', () => {
    const todos = Object.values(TIPOS).join('');
    for (const c of 'lIO01') expect(todos).not.toContain(c);
  });

  it('cada caractere com a mesma chance (qui-quadrado folgado)', () => {
    const alfabeto = TIPOS.numeros;
    const contagem = new Map<string, number>();
    const total = 16000;
    let s = '';
    while (s.length < total) s += gerarCaracteres({ tamanho: 64, tipos: ['numeros'] });
    for (const c of s.slice(0, total)) contagem.set(c, (contagem.get(c) ?? 0) + 1);
    const esperado = total / alfabeto.length;
    const qui = [...alfabeto].reduce((soma, c) => soma + ((contagem.get(c) ?? 0) - esperado) ** 2 / esperado, 0);
    // 7 graus de liberdade: 24,3 é p = 0,001; bem folgado para não falhar por acaso
    expect(qui).toBeLessThan(35);
  });

  it('recusa tamanho fora do intervalo e nenhum tipo', () => {
    expect(() => gerarCaracteres({ tamanho: 7, tipos: ['numeros'] })).toThrowError(RangeError);
    expect(() => gerarCaracteres({ tamanho: 65, tipos: ['numeros'] })).toThrowError(RangeError);
    expect(() => gerarCaracteres({ tamanho: 12, tipos: [] })).toThrowError(RangeError);
    // um tipo que não existe não vira "undefined" no alfabeto
    expect(() => gerarCaracteres({ tamanho: 12, tipos: ['numeros', 'emoji' as Tipo] })).toThrowError(RangeError);
    expect(() => gerarCaracteres({ tamanho: 12, tipos: ['toString' as Tipo] })).toThrowError(RangeError);
  });

  it('frase: palavras da lista do cofre, com hífens', () => {
    const f = gerarFrase(5).split('-');
    expect(f.length).toBe(5);
    for (const p of f) expect(PALAVRAS).toContain(p);
    expect(() => gerarFrase(3)).toThrowError(RangeError);
    expect(() => gerarFrase(11)).toThrowError(RangeError);
  });

  it('os bits: 6 palavras dão 77; 20 caracteres de todos os tipos (70 no alfabeto), 122', () => {
    expect(bitsGerados({ frase: 6 })).toBe(77);
    expect(bitsGerados({ tamanho: 20, tipos: ['minusculas', 'maiusculas', 'numeros', 'simbolos'] })).toBe(Math.floor(20 * Math.log2(70)));
  });
});
