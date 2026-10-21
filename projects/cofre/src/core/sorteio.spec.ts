import { ErroCofre } from './crypto';
import { PALAVRAS } from './palavras';
import { bitsDaFrase, conferirLista, sortearAte, sortearFrase, TAMANHO_DA_LISTA } from './sorteio';

/** Uma lista de mentira no formato certo: "aaa", "aab", … (7.776 palavras de 3 letras). */
function listaDeTeste(): string[] {
  const letras = 'abcdefghijklmnopqrstuvwxyz';
  const lista: string[] = [];
  for (let i = 0; lista.length < TAMANHO_DA_LISTA; i++) {
    lista.push(letras[Math.floor(i / 676) % 26] + letras[Math.floor(i / 26) % 26] + letras[i % 26] + (i >= 17576 ? 'x' : ''));
  }
  return lista;
}

describe('sorteio sem viés', () => {
  it('fica sempre no intervalo', () => {
    for (const n of [1, 2, 3, 7, 7776, 2 ** 31 + 1, 2 ** 32]) {
      for (let i = 0; i < 200; i++) {
        const x = sortearAte(n);
        expect(Number.isInteger(x) && x >= 0 && x < n).toBeTrue();
      }
    }
  });

  it('recusa intervalos impossíveis', () => {
    for (const n of [0, -1, 1.5, 2 ** 32 + 1, NaN]) expect(() => sortearAte(n)).toThrowError(RangeError);
  });

  it('rejeita a sobra: um aleatório acima do último múltiplo é sorteado de novo', () => {
    // 2³² = 3 × 1431655765 + 1: o maior aleatório (2³² − 1) é a sobra e não pode virar resultado
    const valores = [2 ** 32 - 1, 5];
    spyOn(crypto, 'getRandomValues').and.callFake(<T extends ArrayBufferView | null>(caixa: T): T => {
      (caixa as unknown as Uint32Array)[0] = valores.shift()!;
      return caixa;
    });
    expect(sortearAte(3)).toBe(2);
    expect(valores.length).toBe(0);
  });

  it('distribui por igual (qui-quadrado folgado em 6 casas)', () => {
    const casas = new Array(6).fill(0);
    const vezes = 60_000;
    for (let i = 0; i < vezes; i++) casas[sortearAte(6)]++;
    const esperado = vezes / 6;
    const qui = casas.reduce((s, c) => s + (c - esperado) ** 2 / esperado, 0);
    // com 5 graus de liberdade, passar de 25 acontece menos de 1 vez em 7.000
    expect(qui).toBeLessThan(25);
  });
});

describe('frase de palavras', () => {
  const lista = listaDeTeste();

  it('sorteia 6 palavras da lista, com hífens', () => {
    const frase = sortearFrase(lista);
    const palavras = frase.split('-');
    expect(palavras.length).toBe(6);
    for (const p of palavras) expect(lista).toContain(p);
  });

  it('não repete a frase', () => {
    const frases = new Set(Array.from({ length: 50 }, () => sortearFrase(lista)));
    expect(frases.size).toBe(50);
  });

  it('6 palavras de 7.776 dão mais de 77 bits', () => {
    expect(bitsDaFrase()).toBeGreaterThan(77);
    expect(bitsDaFrase()).toBeLessThan(78);
  });

  it('recusa lista curta, com repetida, com acento ou com hífen', () => {
    expect(() => conferirLista(lista)).not.toThrow();
    expect(() => conferirLista(lista.slice(1))).toThrowError(ErroCofre);
    expect(() => conferirLista([...lista.slice(1), lista[1]])).toThrowError(ErroCofre, /repetida/);
    expect(() => conferirLista([...lista.slice(1), 'pão'])).toThrowError(ErroCofre, /formato/);
    expect(() => conferirLista([...lista.slice(1), 'ame-o'])).toThrowError(ErroCofre, /formato/);
    expect(() => conferirLista([...lista.slice(1), 'Casa'])).toThrowError(ErroCofre, /formato/);
    expect(() => conferirLista([...lista.slice(1), 'paralelepipedo'])).toThrowError(ErroCofre, /formato/);
    expect(() => sortearFrase(lista.slice(1))).toThrowError(ErroCofre);
  });
});

describe('a lista do cofre', () => {
  it('passa na conferência: 7.776 palavras, de a a z, de 3 a 10 letras, sem repetidas', () => {
    expect(() => conferirLista(PALAVRAS)).not.toThrow();
  });

  it('está em ordem alfabética (o script a gera assim, e a ordem não muda o sorteio)', () => {
    expect([...PALAVRAS].sort()).toEqual([...PALAVRAS]);
  });

  it('a frase sugerida sai dela por padrão', () => {
    const palavras = sortearFrase().split('-');
    expect(palavras.length).toBe(6);
    for (const p of palavras) expect(PALAVRAS).toContain(p);
  });

  it('tem as palavras comuns que deviam estar, e não as que a revisão tirou', () => {
    for (const p of ['casa', 'gato', 'chave', 'abacaxi', 'janela', 'amigo', 'correr', 'azul']) expect(PALAVRAS).withContext(p).toContain(p);
    for (const p of ['facto', 'autocarro', 'adelaide', 'macaco', 'piranha']) expect(PALAVRAS).withContext(p).not.toContain(p);
  });
});
