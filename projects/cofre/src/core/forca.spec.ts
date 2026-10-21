import { avaliarSenha, BITS_MINIMOS, BITS_MINIMOS_MODO_SERVIDOR, estimarBits } from './forca';
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
});
