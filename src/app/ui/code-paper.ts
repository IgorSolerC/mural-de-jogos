import { Directive, ElementRef, OnDestroy, afterNextRender, inject } from '@angular/core';

/**
 * O papel do bloco de código, na leitura e no Visual (PLANO-CODIGO-COMPACTO.md): sem a linha do cabeçalho, a
 * linguagem (e, com o mouse, o Copiar; no Visual, a pílula e o Copiar do bloco do cursor) fica no canto direito da
 * primeira linha de código, por cima das letras. Quem rola nunca deixa a ponta da primeira linha presa embaixo do
 * canto: quando ela chega lá, ganha à direita a largura do canto (`--cod-reserva`, no papel), e rolando até o fim a
 * ponta aparece antes dele. A linha curta não paga nada: as outras linhas não passam a rolar antes.
 *
 * As peças do canto são os filhos diretos do papel com `data-canto` (as que estão na página: o que está escondido
 * com `display: none` não conta). `host` é o papel (a `.codigo-peca` da leitura, o `<pre>` do Visual) e `scroller`
 * quem rola as letras (o `<pre>` da leitura, o `<code>` do Visual), com a beirada direita na do papel.
 */

/** O vão entre a ponta da primeira linha e o canto. */
const VAO = 8;

interface Paper {
  scroller: HTMLElement;
  mutations: MutationObserver;
  /** A primeira linha da última medida: as letras que mudam noutra linha não pedem outra. */
  line: string;
}

const papers = new Map<HTMLElement, Paper>();
const hostOf = new WeakMap<HTMLElement, HTMLElement>();
// um observador para todos (as fichas do mural podem ter muitos blocos)
let resizes: ResizeObserver | null = null;
const due = new Set<HTMLElement>();
let frame = 0;
let fontsWatched = false;
let focusWatched = false;

/** Passa a cuidar do papel `host`, cujas letras rolam em `scroller`. */
export function watchCodePaper(host: HTMLElement, scroller: HTMLElement): void {
  if (papers.has(host)) return;
  // quem não rola (a ficha do mural, que corta na beirada) não tem o que reservar
  // (o Visual chama antes de pôr o bloco na página: sem estilo ainda, ele rola, como em toda escrita)
  if (scroller.isConnected && !/auto|scroll/.test(getComputedStyle(scroller).overflowX)) return;
  // a linguagem e o bloco do cursor no Visual (a classe) mudam o canto; as letras, só se mexerem na primeira linha
  const mutations = new MutationObserver((records) => {
    const paper = papers.get(host);
    if (!paper) return;
    if (records.some((r) => r.type === 'attributes') || firstLine(scroller) !== paper.line) schedule(host);
  });
  mutations.observe(host, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class', 'hidden', 'data-lingua'] });
  papers.set(host, { scroller, mutations, line: '\u0000' });
  hostOf.set(scroller, host);
  if (typeof ResizeObserver !== 'undefined') {
    resizes ??= new ResizeObserver((entries) => {
      for (const e of entries) {
        const h = hostOf.get(e.target as HTMLElement);
        if (h) schedule(h);
      }
    });
    resizes.observe(scroller);
  }
  // no Visual, os botões do bloco do cursor aparecem e somem com o foco na folha, sem mexer no papel
  if (!focusWatched && typeof document !== 'undefined') {
    focusWatched = true;
    const refocus = () => papers.forEach((p, h) => h.classList.contains('vis-codigo-ativo') && schedule(h));
    document.addEventListener('focusin', refocus);
    document.addEventListener('focusout', refocus);
  }
  // a Cascadia chega depois (só quando há código na tela): com ela, a primeira linha muda de largura
  if (!fontsWatched && typeof document !== 'undefined' && document.fonts) {
    fontsWatched = true;
    document.fonts.addEventListener('loadingdone', () => papers.forEach((_, h) => schedule(h)));
  }
  schedule(host);
}

/** Para de cuidar (o papel saiu da página). */
export function unwatchCodePaper(host: HTMLElement): void {
  const p = papers.get(host);
  if (!p) return;
  p.mutations.disconnect();
  resizes?.unobserve(p.scroller);
  papers.delete(host);
  hostOf.delete(p.scroller);
  due.delete(host);
}

/** Mede de novo agora (os testes, e quem sabe que algo mudou sem mexer no papel). */
export function fitCodePaper(host: HTMLElement): void {
  const p = papers.get(host);
  if (p) fit(host, p);
}

function schedule(host: HTMLElement): void {
  due.add(host);
  if (frame || typeof requestAnimationFrame === 'undefined') return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    const now = [...due];
    due.clear();
    for (const h of now) {
      const p = papers.get(h);
      if (p && h.isConnected) fit(h, p);
    }
  });
}

function fit(host: HTMLElement, paper: Paper): void {
  const scroller = paper.scroller;
  paper.line = firstLine(scroller);
  const reserve = cornerWidth(host);
  const long = reserve > 0 && firstLineEnd(scroller) > scroller.clientWidth - reserve;
  const next = long ? `${Math.ceil(reserve)}px` : '';
  if (host.style.getPropertyValue('--cod-reserva') === next) return;
  if (next) host.style.setProperty('--cod-reserva', next);
  else host.style.removeProperty('--cod-reserva');
}

/** As letras da primeira linha (sem medir nada). */
function firstLine(scroller: HTMLElement): string {
  const t = scroller.textContent ?? '';
  const i = t.indexOf('\n');
  return i < 0 ? t : t.slice(0, i);
}

/** Da beirada direita do papel até a peça do canto que vai mais para a esquerda, com o vão; 0 sem nenhuma. */
export function cornerWidth(host: HTMLElement): number {
  const right = host.getBoundingClientRect().right;
  let left = Infinity;
  for (const el of Array.from(host.children) as HTMLElement[]) {
    if (!el.hasAttribute('data-canto') || el.hidden) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    left = Math.min(left, r.left);
  }
  return left === Infinity ? 0 : right - left + VAO;
}

/**
 * Onde a primeira linha termina, contada da beirada esquerda de quem rola (com o recuo de dentro dele), sem a
 * rolagem: o quanto ela precisa de largura para aparecer inteira.
 */
export function firstLineEnd(scroller: HTMLElement): number {
  const walker = document.createTreeWalker(scroller, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  range.setStart(scroller, 0);
  let found = false;
  let last: Text | null = null;
  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
    last = n;
    const i = n.data.indexOf('\n');
    if (i >= 0) {
      range.setEnd(n, i);
      found = true;
      break;
    }
  }
  if (!found) {
    if (!last) return 0;
    range.setEnd(last, last.data.length);
  }
  const r = range.getBoundingClientRect();
  if (r.width === 0) return 0;
  return r.right - scroller.getBoundingClientRect().left + scroller.scrollLeft;
}

/** A peça da leitura: o papel é o elemento, e quem rola é o `<pre>` de dentro. */
@Directive({ selector: '[appCodePaper]' })
export class CodePaper implements OnDestroy {
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  constructor() {
    afterNextRender(() => {
      const pre = this.el.querySelector<HTMLElement>(':scope > pre');
      if (pre) watchCodePaper(this.el, pre);
    });
  }

  ngOnDestroy(): void {
    unwatchCodePaper(this.el);
  }
}
