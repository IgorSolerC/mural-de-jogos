import { avaliarSenha, BITS_MINIMOS, BITS_MINIMOS_MODO_SERVIDOR, estimarBits, serveParaModoServidor } from './forca';
import { bitsDaFrase, sortearFrase } from './sorteio';

describe('a força da senha mestra', () => {
  it('os mínimos: ~70 bits, e com algum aparelho no modo servidor o de uma frase sorteada', () => {
    expect(BITS_MINIMOS).toBe(70);
    expect(BITS_MINIMOS_MODO_SERVIDOR).toBe(78);
    expect(BITS_MINIMOS_MODO_SERVIDOR).toBeGreaterThanOrEqual(bitsDaFrase());
  });

  it('só a frase que a página sorteou, igual, vale como sorteada', () => {
    const frase = sortearFrase();
    expect(avaliarSenha(frase, { sugerida: frase })).toEqual({ bits: 77, situacao: 'sorteada', minimo: 70 });
    expect(avaliarSenha(frase, { sugerida: frase, modoServidor: true }).situacao).toBe('sorteada');
    // a mesma frase sem ser a sorteada desta vez (alguém que escolheu as palavras): estimada como escolhida
    const escrita = avaliarSenha(frase);
    expect(escrita.situacao).not.toBe('sorteada');
    expect(escrita.bits).toBeLessThan(bitsDaFrase());
    expect(avaliarSenha(frase, { modoServidor: true }).situacao).toBe('fraca');
    expect(avaliarSenha(frase.toUpperCase(), { sugerida: frase }).situacao).not.toBe('sorteada');
  });

  it('a mesma senha com acento digitada de dois jeitos (NFC e NFD) tem a mesma avaliação', () => {
    const nfc = 'coração-pêssego-maçã-açaí-limão-cajá-pitanga'.normalize('NFC');
    const nfd = nfc.normalize('NFD');
    expect(nfd).not.toBe(nfc);
    expect(avaliarSenha(nfd, { sugerida: nfc }).situacao).toBe('sorteada');
    expect(estimarBits(nfd)).toBe(estimarBits(nfc));
  });

  it('as senhas comuns e as trocas de letra por número não passam', () => {
    for (const fraca of ['123456', 'senha123', 'S3nh4!2024', 'Flamengo2019!', 'correcthorsebatterystaple', 'Correct Horse Battery Staple', 'qwertyuiopasdfgh', 'aaaaaaaaaaaaaaaaaaaaaaaa', 'abcabcabcabcabcabc']) {
      expect(estimarBits(fraca)).withContext(fraca).toBeLessThan(40);
    }
    expect(estimarBits('')).toBe(0);
  });

  it('frases do dia a dia ficam abaixo do mínimo; com mais palavras, passam', () => {
    for (const frase of ['minha casa fica perto da praia', 'eu amo meu cachorro rex desde 2015', 'açúcar-maçã-limão-café-pão-feijão']) {
      expect(avaliarSenha(frase).situacao).withContext(frase).toBe('fraca');
    }
    expect(avaliarSenha('minha-casa-fica-perto-da-praia-azul').situacao).toBe('boa');
    expect(avaliarSenha('gato-azul-pedra-chuva-livro-mesa-porta').situacao).toBe('boa');
  });

  it('uma senha aleatória precisa de uns 16 caracteres variados', () => {
    expect(avaliarSenha('Xk9#mQ2$vL7!pR4@').situacao).toBe('boa');
    expect(avaliarSenha('Xk9#mQ2$vL7!pR').situacao).toBe('fraca');
    // letras seguidas fora da lista contam como palavra estrangeira: só minúsculas precisa ser bem mais longa
    expect(estimarBits('kqzvxwptjrmnbcdfghlw')).toBeLessThan(BITS_MINIMOS);
  });

  it('cada pedaço previsível conta pouco', () => {
    // a mesma base: um ano e uma sequência valem bem menos que quatro algarismos quaisquer
    const base = estimarBits('pedra-chuva-');
    expect(estimarBits('pedra-chuva-8351') - base).toBe(13);
    expect(estimarBits('pedra-chuva-2019') - base).toBe(7);
    expect(estimarBits('pedra-chuva-1234') - base).toBeLessThanOrEqual(9);
    // repetir a senha inteira quase não ajuda
    expect(estimarBits('pedra-chuva-pedra-chuva-')).toBeLessThan(estimarBits('pedra-chuva-') + 2);
    // trocar letras por números numa palavra da lista vale só 1 bit por troca
    expect(estimarBits('p3dr4')).toBeLessThanOrEqual(estimarBits('pedra') + 2);
    // e uma maiúscula, 1 bit
    expect(estimarBits('Pedra')).toBe(estimarBits('pedra') + 1);
  });

  it('repetir dentro da senha não engorda a conta (o mesmo pedaço, a mesma letra, tudo em maiúsculas)', () => {
    // a mesma letra muitas vezes e um número no fim: a régua dava 73 bits ("boa")
    expect(estimarBits('a'.repeat(35) + '1')).toBeLessThan(20);
    expect(estimarBits('a'.repeat(70) + '1')).toBeLessThan(20);
    // o alfabeto em ordem é uma sequência, não 26 letras quaisquer
    expect(estimarBits('abcdefghijklmnopqrstuvwxyz')).toBeLessThan(30);
    // a mesma palavra com separadores, sem o último: 71 e 83 bits antes
    expect(estimarBits('aba-aba-aba-aba-aba-aba')).toBeLessThan(20);
    expect(estimarBits('aba aba aba aba aba aba aba')).toBeLessThan(20);
    // tudo em maiúsculas é uma escolha só (dava 74 bits)
    expect(estimarBits('ABA-ABA-ABA-ABA-ABA')).toBeLessThan(20);
    expect(estimarBits('GATO-AZUL-PEDRA-CHUVA-LIVRO-MESA-PORTA')).toBe(estimarBits('gato-azul-pedra-chuva-livro-mesa-porta') + 1);
    // palavras e números que voltam no meio custam pouco
    expect(estimarBits('gato-azul-gato-azul-gato-azul-x')).toBeLessThan(estimarBits('gato-azul-pedra-chuva-livro-mesa-x'));
    expect(estimarBits('1987-1987-1987-x')).toBeLessThan(25);
    for (const fraca of ['a'.repeat(35) + '1', 'aba-aba-aba-aba-aba-aba', 'ABA-ABA-ABA-ABA-ABA', 'aba aba aba aba aba aba aba']) {
      expect(avaliarSenha(fraca).situacao).withContext(fraca).toBe('fraca');
      expect(serveParaModoServidor(fraca)).withContext(fraca).toBe(false);
    }
  });

  it('pôr um aparelho sem PRF depois: serve a frase no formato da sorteada, ou uma senha de 78 bits', () => {
    expect(serveParaModoServidor(sortearFrase())).toBe(true);
    // no formato, mas a mesma palavra seis vezes não é frase
    expect(serveParaModoServidor('aba-aba-aba-aba-aba-aba')).toBe(false);
    expect(serveParaModoServidor('gato-gato-gato-azul-azul-azul')).toBe(false);
    // uma palavra repetida acontece numa frase sorteada (1 em ~500): ainda serve
    expect(serveParaModoServidor('gato-gato-azul-pedra-chuva-livro')).toBe(true);
    expect(serveParaModoServidor('Xk9#mQ2$vL7!pR4@')).toBe(false);
    expect(serveParaModoServidor('Xk9#mQ2$vL7!pR4@Zt8%')).toBe(true);
    expect(serveParaModoServidor('gato-azul-pedra-chuva-livro')).toBe(false);
    expect(serveParaModoServidor('gato azul pedra chuva livro mesa')).toBe(false);
  });
});
