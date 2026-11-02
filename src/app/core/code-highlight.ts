import { signal } from '@angular/core';
import { codeLangOf } from './code-langs';

/**
 * As cores do bloco de código, por linguagem ("```js", ver core/code-langs.ts). Quem colore é o
 * highlight.js (BSD), num pedaço à parte (core/code-highlight-lib.ts), pedido só quando um bloco com uma
 * linguagem conhecida aparece: o site não carrega nada disso antes. Enquanto ele chega, o bloco fica na
 * tinta de sempre; quando chega, `codeHighlightReady` muda e quem desenha pede as cores de novo.
 *
 * As cores são classes nossas (`tk-…`), com as tintas da papelaria (ui/_formatado.scss), nunca um tema
 * pronto: cada nome do highlight.js cai numa das poucas tintas (ver `TOKEN_CLASS` no pedaço).
 */

/** Um pedaço colorido do texto do bloco: do índice `de` ao `ate` (sem ele), com a classe da tinta. */
export interface CodeRange {
  de: number;
  ate: number;
  c: string;
}

/** Um pedaço do texto com a classe dele ("" na tinta de sempre): o texto inteiro, em ordem. */
export interface CodeToken {
  t: string;
  c: string;
}

type Colorir = (text: string, id: string) => CodeRange[];

let colorir: Colorir | null = null;
let chegando: Promise<void> | null = null;
/** Quando o pedaço não veio pela última vez: só tenta de novo depois de um tempo (sem rede, não insiste a cada tela). */
let falhouEm = -Infinity;
const ESPERA_MS = 30_000;
const versao = signal(0);

/** Muda quando o colorir chega (quem desenha lê para pedir as cores de novo). */
export const codeHighlightReady = versao.asReadonly();

/** Pede o colorir (uma vez só); a promessa acaba quando ele chegou (ou não veio: sem cores, sem erro). */
export function loadCodeHighlight(): Promise<void> {
  if (!chegando && Date.now() - falhouEm < ESPERA_MS) return Promise.resolve();
  chegando ??= import('./code-highlight-lib')
    .then((m) => {
      colorir = m.colorir;
      versao.update((v) => v + 1);
    })
    .catch(() => {
      // sem rede (o pedaço não veio): o bloco fica na tinta de sempre; daqui a pouco tenta de novo
      falhouEm = Date.now();
      chegando = null;
    });
  return chegando;
}

/** Já chegou (os testes e o Visual, que redesenha quando chega). */
export function codeHighlightLoaded(): boolean {
  return colorir !== null;
}

// as últimas contas (o mesmo bloco é desenhado de novo a cada mudança da tela, e na ficha e na leitura)
const CACHE = new Map<string, CodeRange[]>();
const CACHE_MAX = 300;

/**
 * Os pedaços coloridos do texto do bloco na linguagem do que vem depois das crases (`info`). Null sem
 * linguagem conhecida (o "text" também) ou com o colorir ainda chegando (aí ele é pedido). Sem `guarda`, a
 * conta não fica na lista das últimas (o Visual guarda a dele por nó, ver ui/visual-editor/codigos.ts).
 */
export function codeRanges(text: string, info: string, guarda = true): CodeRange[] | null {
  const lang = codeLangOf(info);
  if (!lang || lang.id === 'plaintext' || !text) return null;
  if (!colorir) {
    void loadCodeHighlight();
    return null;
  }
  const key = lang.id + '\u0000' + text;
  let out = CACHE.get(key);
  if (!out) {
    try {
      out = colorir(text, lang.id);
    } catch {
      out = [];
    }
    if (!guarda) return out;
    if (CACHE.size >= CACHE_MAX) CACHE.delete(CACHE.keys().next().value!);
    CACHE.set(key, out);
  }
  return out;
}

/** O texto inteiro em pedaços, cada um com a classe dele ("" fora das cores), para quem desenha com o Angular. */
export function codeTokens(text: string, ranges: readonly CodeRange[] | null): CodeToken[] {
  if (!ranges?.length) return [{ t: text, c: '' }];
  const out: CodeToken[] = [];
  let at = 0;
  for (const r of ranges) {
    if (r.de > at) out.push({ t: text.slice(at, r.de), c: '' });
    out.push({ t: text.slice(r.de, r.ate), c: r.c });
    at = r.ate;
  }
  if (at < text.length) out.push({ t: text.slice(at), c: '' });
  return out;
}
