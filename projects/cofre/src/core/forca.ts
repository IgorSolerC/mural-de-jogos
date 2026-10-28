/**
 * A força da senha mestra (seção 8.3, passo 3, do PLANO-COFRE.md). A frase sorteada pela página vale
 * os bits dela (6 palavras de 7.776: ~77,5). Uma senha escrita à mão passa por uma estimativa
 * pessimista, feita para errar para menos: quem ataca conhece a lista de palavras, os teclados, as
 * trocas de letra por número e as senhas mais comuns. O mínimo é ~70 bits; com algum aparelho no modo
 * servidor, o mesmo de uma frase sorteada (a senha passa a ser a única proteção contra quem tomar a
 * Cloudflare inteira, seção 5).
 *
 * A estimativa, pedaço por pedaço:
 * - uma palavra da lista do cofre (que é a de palavras comuns do português): ~11 bits, o de uma palavra
 *   escolhida por uma pessoa (uma sorteada valeria 12,9, mas a escolhida é mais previsível);
 * - um trecho de 3 ou mais letras fora da lista (uma palavra de outra língua, um nome): 2 bits por letra;
 * - uma palavra de 1 ou 2 letras sozinha entre separadores (eu, de, um): 5 bits;
 * - letras soltas: 4,7 bits cada; algarismos: 3,3; símbolos: 5; acentos não contam;
 * - maiúsculas: +1 bit por maiúscula, até o número de minúsculas (tudo em maiúsculas é uma escolha só: 1 bit);
 * - espaço, hífen, ponto ou sublinhado entre pedaços: 1 bit;
 * - repetição (aaa), sequência (abc, 321) e fileira do teclado (qwer, asdf): 1 bit por caractere depois do
 *   primeiro, também dentro de um trecho de letras fora da lista; o mesmo caractere muitas vezes seguidas
 *   (aaaaaaaa) vale como duas vezes e mais o log do tamanho;
 * - um ano (19xx, 20xx): 7 bits;
 * - letra trocada por número ou símbolo (s3nh4, @mor): lida como a letra quando forma uma palavra da
 *   lista, +1 bit por troca; fora de palavra, conta como número ou símbolo;
 * - uma palavra, um trecho de letras ou um número que já apareceu antes na senha: 2 bits;
 * - um pedaço repetido do começo ao fim (abcabcabc, aba-aba-aba): os bits do pedaço e mais quase nada;
 * - uma das senhas mais comuns: no máximo 10 bits.
 */
import { PALAVRAS } from './palavras';
import { bitsDaFrase, PALAVRAS_DA_FRASE } from './sorteio';

/** O mínimo para uma senha escrita à mão. */
export const BITS_MINIMOS = 70;
/** Com algum aparelho no modo servidor: o mesmo de uma frase sorteada de 6 palavras. */
export const BITS_MINIMOS_MODO_SERVIDOR = Math.ceil(bitsDaFrase());

export type Situacao = 'sorteada' | 'boa' | 'fraca';

export interface Avaliacao {
  /** Os bits estimados (para baixo). */
  readonly bits: number;
  readonly situacao: Situacao;
  /** O mínimo que valeu para esta conta. */
  readonly minimo: number;
}

const BITS_PALAVRA = 11;
const BITS_LETRA_EM_PALAVRA = 2;
const BITS_LETRA = Math.log2(26);
const BITS_ALGARISMO = Math.log2(10);
const BITS_SIMBOLO = 5;
const BITS_SEPARADOR = 1;
/** Uma palavra de 1 ou 2 letras fora da lista (eu, de, um), sozinha entre separadores. */
const BITS_PALAVRA_CURTA = 5;
const BITS_PREVISIVEL = 1;
const BITS_ANO = 7;
/** Um pedaço (palavra, trecho de letras, número) igual a um que já apareceu na senha. */
const BITS_REPETIDO = 2;
const SEPARADORES = new Set([' ', '-', '.', '_']);
const TROCAS: Record<string, string> = { '4': 'a', '@': 'a', '3': 'e', '1': 'i', '!': 'i', '0': 'o', '5': 's', $: 's', '7': 't' };
const FILEIRAS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm', '1234567890', 'abcdefghijklmnopqrstuvwxyz'].flatMap((f) => [f, [...f].reverse().join('')]);
/** As senhas que mais aparecem em vazamentos, no Brasil e fora (sem acento, minúsculas, só letras e números). */
const COMUNS = new Set([
  '123456', '123456789', '12345678', '1234567890', '12345', '1234567', '111111', '000000', '123123', '654321', '666666',
  'password', 'password1', 'senha', 'senha123', 'minhasenha', 'qwerty', 'qwerty123', 'abc123', 'admin', 'iloveyou',
  'teamo', 'brasil', 'flamengo', 'corinthians', 'palmeiras', 'saopaulo', 'gremio', 'vasco', 'cruzeiro', 'santos',
  'jesus', 'deusefiel', 'amor', 'familia', 'gabriel', 'felipe', 'lucas', 'mariana', 'princesa', 'estrela', 'futebol',
  'correcthorsebatterystaple', 'trustno1', 'letmein', 'welcome', 'monkey', 'dragon', 'sunshine', 'football',
]);

let dicionario: Set<string> | null = null;
let maiorPalavra = 0;
function palavras(): Set<string> {
  if (!dicionario) {
    dicionario = new Set(PALAVRAS);
    maiorPalavra = Math.max(...PALAVRAS.map((p) => p.length));
  }
  return dicionario;
}

const ehLetra = (c: string) => c >= 'a' && c <= 'z';
const ehAlgarismo = (c: string) => c >= '0' && c <= '9';

/** Este caractere repete o anterior, ou fecha três seguidos de uma sequência ou fileira do teclado (nos dois sentidos)? */
function previsivel(antes2: string | undefined, antes: string | undefined, c: string): boolean {
  if (antes === undefined) return false;
  if (antes === c) return true;
  return antes2 !== undefined && FILEIRAS.some((f) => f.includes(antes2 + antes + c));
}

/** O texto para a análise: minúsculo e sem acento (o acento muda pouco para quem ataca). */
function semAcento(texto: string): string {
  return texto.normalize('NFD').replace(/\p{M}/gu, '').normalize('NFC');
}

/** Os bits de um caractere fora de palavra, pela classe dele. */
function bitsDoCaractere(a: readonly string[], x: number): number {
  const c = a[x]!;
  if (previsivel(a[x - 2], a[x - 1], c)) return BITS_PREVISIVEL;
  return ehLetra(c) ? BITS_LETRA : ehAlgarismo(c) ? BITS_ALGARISMO : BITS_SIMBOLO;
}

/** Os bits de um texto já normalizado, sem olhar repetição do texto inteiro nem a lista das comuns. */
function bitsDoTexto(original: string): number {
  const dic = palavras();
  const comCaixa = [...semAcento(original)];
  const a = comCaixa.map((c) => c.toLowerCase());
  const n = a.length;
  // cada maiúscula: 1 bit (a pessoa podia tê-la posto em outro lugar), até o número de minúsculas: o que
  // conta é o desenho de onde elas estão, e tudo em maiúsculas é uma escolha só
  const maiusculas = comCaixa.filter((c, x) => c !== a[x]).length;
  const minusculas = comCaixa.filter((c) => c !== c.toUpperCase() && c === c.toLowerCase()).length;
  let bits = maiusculas ? Math.max(1, Math.min(maiusculas, minusculas)) : 0;
  const separa = (x: number) => x < 0 || x >= n || SEPARADORES.has(a[x]!);
  const pareceLetra = (c: string) => ehLetra(c) || c in TROCAS;
  // os pedaços que já apareceram: repetir um custa só a escolha de qual repetir
  const vistos = new Set<string>();
  const repetido = (pedaco: string): boolean => {
    if (vistos.has(pedaco)) return true;
    vistos.add(pedaco);
    return false;
  };

  let i = 0;
  while (i < n) {
    const c = a[i]!;
    if (SEPARADORES.has(c)) {
      bits += BITS_SEPARADOR;
      i++;
      continue;
    }
    // um trecho de letras (e de trocas como 3 e @, que podem ser letras disfarçadas)
    let fim = i;
    while (fim < n && pareceLetra(a[fim]!)) fim++;
    const trecho = a.slice(i, fim);
    if (fim > i && trecho.some(ehLetra)) {
      // as palavras da lista, mais longas primeiro, lendo cada troca como a letra dela (s3nh4 → senha)
      const lido = trecho.map((ch) => TROCAS[ch] ?? ch);
      const naPalavra = new Array<boolean>(trecho.length).fill(false);
      for (let k = 0; k < trecho.length; ) {
        let achou = 0;
        for (let t = Math.min(maiorPalavra, trecho.length - k); t >= 3; t--) {
          if (dic.has(lido.slice(k, k + t).join(''))) {
            achou = t;
            break;
          }
        }
        if (!achou) {
          k++;
          continue;
        }
        const deNovo = repetido(lido.slice(k, k + achou).join(''));
        bits += deNovo ? BITS_REPETIDO : BITS_PALAVRA;
        for (let x = k; x < k + achou; x++) {
          naPalavra[x] = true;
          if (!deNovo && lido[x] !== trecho[x]) bits += 1;
        }
        k += achou;
      }
      // o que sobrou: as letras seguidas são palavra de outra língua, nome ou palavra curta; o resto, pela classe
      for (let k = 0; k < trecho.length; ) {
        if (naPalavra[k]) {
          k++;
          continue;
        }
        let f = k;
        while (f < trecho.length && !naPalavra[f] && ehLetra(trecho[f]!)) f++;
        const letras = f - k;
        if (letras >= 3 && repetido(trecho.slice(k, f).join(''))) bits += BITS_REPETIDO;
        else if (letras >= 3) {
          // a letra que repete a anterior ou fecha uma sequência vale pouco, também aqui
          const comeco = i + k;
          for (let x = comeco; x < i + f; x++) {
            const antes = x > comeco ? a[x - 1] : undefined;
            const antes2 = x > comeco + 1 ? a[x - 2] : undefined;
            bits += previsivel(antes2, antes, a[x]!) ? BITS_PREVISIVEL : BITS_LETRA_EM_PALAVRA;
          }
        } else if (letras > 0 && separa(i + k - 1) && separa(i + f)) bits += BITS_PALAVRA_CURTA;
        else if (letras > 0) for (let x = k; x < f; x++) bits += bitsDoCaractere(a, i + x);
        else {
          bits += bitsDoCaractere(a, i + k);
          f = k + 1;
        }
        k = f;
      }
      i = fim;
      continue;
    }
    if (ehAlgarismo(c)) {
      let f = i;
      while (f < n && ehAlgarismo(a[f]!)) f++;
      const numero = a.slice(i, f).join('');
      if (numero.length >= 3 && repetido(numero)) bits += BITS_REPETIDO;
      else if (/^(19|20)\d\d$/.test(numero)) bits += BITS_ANO;
      else for (let x = i; x < f; x++) bits += bitsDoCaractere(a, x);
      i = f;
      continue;
    }
    bits += bitsDoCaractere(a, i);
    i++;
  }
  return bits;
}

/** A estimativa pessimista de uma senha escrita à mão, em bits (arredondada para baixo). */
export function estimarBits(senha: string): number {
  const texto = senha.normalize('NFC');
  if (!texto) return 0;
  // um pedaço repetido do começo ao fim (abcabc, senhasenha, aba-aba-aba, que não fecha no último
  // separador): conta o pedaço uma vez e quase nada pelas repetições
  let bits = Infinity;
  for (let p = 1; p <= texto.length / 2; p++) {
    const pedaco = texto.slice(0, p);
    if (pedaco.repeat(Math.ceil(texto.length / p)).slice(0, texto.length) === texto) {
      bits = bitsDoTexto(pedaco) + Math.log2(texto.length / p);
      break;
    }
  }
  if (bits === Infinity) {
    // o mesmo caractere muitas vezes seguidas (aaaaaaaa): conta como dois e mais o log do tamanho
    let extra = 0;
    const encurtado = texto.replace(/(.)\1{2,}/gsu, (seguidos: string, c: string) => {
      extra += Math.log2([...seguidos].length);
      return c + c;
    });
    bits = bitsDoTexto(encurtado) + extra;
  }
  const reduzida = texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[^a-z0-9]/g, '');
  if (COMUNS.has(reduzida) || COMUNS.has(reduzida.replace(/\d+$/, ''))) bits = Math.min(bits, 10);
  return Math.floor(bits);
}

/**
 * Avalia a senha mestra para a tela de criar. `sugerida` é a frase que a página sorteou: só ela, igual,
 * vale como sorteada. `modoServidor`: algum aparelho ficou sem PRF.
 */
export function avaliarSenha(senha: string, opcoes: { sugerida?: string | null; modoServidor?: boolean } = {}): Avaliacao {
  const minimo = opcoes.modoServidor ? BITS_MINIMOS_MODO_SERVIDOR : BITS_MINIMOS;
  const normalizada = senha.normalize('NFC');
  if (opcoes.sugerida && normalizada === opcoes.sugerida.normalize('NFC')) {
    return { bits: Math.floor(bitsDaFrase()), situacao: 'sorteada', minimo };
  }
  const bits = estimarBits(normalizada);
  return { bits, situacao: bits >= minimo ? 'boa' : 'fraca', minimo };
}

/**
 * Pôr um aparelho sem PRF depois de criado (Gerenciar): a senha de hoje precisa servir para o modo
 * servidor, mas não dá para saber se ela foi a frase sorteada. Serve com os bits de uma frase sorteada
 * estimados, ou no formato dela: 6 ou mais palavras da lista do cofre, com hífens, e pelo menos 5 delas
 * diferentes (uma frase sorteada repete uma palavra só em 1 de cada ~500 vezes; a mesma palavra seis vezes
 * não é frase nenhuma).
 */
export function serveParaModoServidor(senha: string): boolean {
  const normalizada = senha.normalize('NFC');
  const partes = normalizada.split('-');
  const dic = palavras();
  if (partes.length >= PALAVRAS_DA_FRASE && new Set(partes).size >= PALAVRAS_DA_FRASE - 1 && partes.every((p) => dic.has(p))) return true;
  return estimarBits(normalizada) >= BITS_MINIMOS_MODO_SERVIDOR;
}
