import { Directive, ElementRef, OnDestroy, afterNextRender, inject } from '@angular/core';

/**
 * O papel do bloco de código, na leitura e no Visual (PLANO-CODIGO-COMPACTO.md): sem a linha do cabeçalho, a
 * linguagem (e, com o mouse, o Copiar; no Visual, a pílula e o Copiar do bloco do cursor) fica no canto direito da
 * primeira linha de código, por cima das letras. Quem rola nunca deixa a ponta da primeira linha presa embaixo do
 * canto: quando ela chega lá, ganha à direita a largura do canto (`--cod-reserva`, no papel), e rolando até o fim a
 * ponta aparece antes dele. A linha curta não paga nada: as outras linhas não passam a rolar antes.
 *
 * A barra de rolar também é desta peça: a de verdade sai do bloco (ela ocupava uma linha inteira da pauta), e no
 * lugar dela fica uma barra fina desenhada (`.codigo-rolo`, com o polegar), por cima do pé da última linha, que
 * aparece com o mouse em cima do bloco, com o foco dentro dele e enquanto rola (`data-rolando`, no toque e no
 * touchpad). Sem nada para rolar, ela não existe (`data-rola` no papel diz quando há). O polegar se arrasta (só ele
 * pega o mouse, e só à vista: o pé da última linha continua do texto, para clicar e selecionar). A roda com Shift, o
 * touchpad, as setas e o dedo rolam como sempre.
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
  /** O trilho da barra desenhada e o polegar dele. */
  bar: HTMLElement;
  thumb: HTMLElement;
  /** Tira o que a peça pôs (a barra e os ouvintes) quando ela sai. */
  undo: () => void;
  /** A primeira linha da última medida: as letras que mudam noutra linha não pedem outra. */
  line: string;
}

const papers = new Map<HTMLElement, Paper>();
const hostOf = new WeakMap<HTMLElement, HTMLElement>();
// um observador para todos (as fichas do mural podem ter muitos blocos)
let resizes: ResizeObserver | null = null;
const due = new Set<HTMLElement>();
// só a barra (as letras mudaram noutra linha: o canto não muda, a largura de rolar pode mudar)
const dueBar = new Set<HTMLElement>();
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
  // (as outras só mudam a largura de rolar: a barra)
  const mutations = new MutationObserver((records) => {
    const paper = papers.get(host);
    if (!paper) return;
    if (records.some((r) => r.type === 'attributes') || firstLine(scroller) !== paper.line) schedule(host);
    else schedule(host, true);
  });
  mutations.observe(host, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class', 'hidden', 'data-lingua'] });
  const { bar, thumb, undo } = makeBar(host, scroller);
  papers.set(host, { scroller, mutations, bar, thumb, undo, line: '\u0000' });
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
  p.undo();
  resizes?.unobserve(p.scroller);
  papers.delete(host);
  hostOf.delete(p.scroller);
  due.delete(host);
  dueBar.delete(host);
}

/** Mede de novo agora (os testes, e quem sabe que algo mudou sem mexer no papel). */
export function fitCodePaper(host: HTMLElement): void {
  const p = papers.get(host);
  if (p) fit(host, p);
}

function schedule(host: HTMLElement, barOnly = false): void {
  (barOnly ? dueBar : due).add(host);
  if (frame || typeof requestAnimationFrame === 'undefined') return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    const now = [...due];
    const bars = [...dueBar].filter((h) => !due.has(h));
    due.clear();
    dueBar.clear();
    for (const h of now) {
      const p = papers.get(h);
      if (p && h.isConnected) fit(h, p);
    }
    for (const h of bars) {
      const p = papers.get(h);
      if (p && h.isConnected) placeThumb(h, p);
    }
  });
}

function fit(host: HTMLElement, paper: Paper): void {
  const scroller = paper.scroller;
  paper.line = firstLine(scroller);
  const reserve = cornerWidth(host);
  const long = reserve > 0 && firstLineEnd(scroller) > scroller.clientWidth - reserve;
  const next = long ? `${Math.ceil(reserve)}px` : '';
  if (host.style.getPropertyValue('--cod-reserva') !== next) {
    if (next) host.style.setProperty('--cod-reserva', next);
    else host.style.removeProperty('--cod-reserva');
    if (long) keepCaret(scroller, reserve);
  }
  placeThumb(host, paper);
}

/**
 * O cursor que já estava embaixo do canto quando a reserva chegou (no Visual, a tecla End logo depois do clique,
 * antes de os botões do bloco aparecerem) volta para a vista: o navegador só o mostra de novo na tecla seguinte.
 */
function keepCaret(scroller: HTMLElement, reserve: number): void {
  const sel = typeof getSelection === 'function' ? getSelection() : null;
  if (!sel?.rangeCount || !sel.isCollapsed || !scroller.contains(sel.focusNode)) return;
  const caret = sel.getRangeAt(0).getBoundingClientRect();
  if (!caret.height) return;
  const over = caret.right - (scroller.getBoundingClientRect().right - reserve);
  if (over > 0) scroller.scrollLeft += Math.ceil(over);
}

// ===== A barra fina =====

/** O polegar nunca fica menor que isto (dá para pegar). */
const MIN_THUMB = 24;
/** Quanto tempo a barra fica à vista depois de rolar sem o mouse em cima (no toque, no touchpad). */
const SHOWN_MS = 900;

/** Monta a barra desenhada no papel e os ouvintes dela; devolve o que desfaz tudo. */
function makeBar(host: HTMLElement, scroller: HTMLElement): { bar: HTMLElement; thumb: HTMLElement; undo: () => void } {
  const bar = document.createElement('span');
  bar.className = 'codigo-rolo';
  bar.setAttribute('aria-hidden', 'true');
  bar.contentEditable = 'false';
  const thumb = document.createElement('span');
  thumb.className = 'codigo-rolo-polegar';
  bar.append(thumb);
  host.append(bar);

  let shown: ReturnType<typeof setTimeout> | undefined;
  const onScroll = () => {
    // o polegar no quadro seguinte, uma vez só por quadro (a rolagem do touchpad manda muitos avisos)
    schedule(host, true);
    host.setAttribute('data-rolando', '');
    clearTimeout(shown);
    shown = setTimeout(() => host.removeAttribute('data-rolando'), SHOWN_MS);
  };
  scroller.addEventListener('scroll', onScroll, { passive: true });

  // arrastar o polegar: o quanto ele anda vira o quanto as letras andam, na mesma proporção
  let drag: { x: number; left: number; id: number } | null = null;
  const onDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    drag = { x: e.clientX, left: scroller.scrollLeft, id: e.pointerId };
    // (sem um ponteiro de verdade ativo, o navegador recusa a captura: o arrasto segue sem ela)
    try {
      thumb.setPointerCapture(e.pointerId);
    } catch {
      /* nada */
    }
    bar.classList.add('arrastando');
  };
  const onMove = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    const max = scroller.scrollWidth - scroller.clientWidth;
    const room = bar.clientWidth - thumb.offsetWidth;
    if (max <= 0 || room <= 0) return;
    scroller.scrollLeft = drag.left + ((e.clientX - drag.x) * max) / room;
  };
  const onUp = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    drag = null;
    bar.classList.remove('arrastando');
  };
  thumb.addEventListener('pointerdown', onDown);
  thumb.addEventListener('pointermove', onMove);
  thumb.addEventListener('pointerup', onUp);
  thumb.addEventListener('pointercancel', onUp);
  // (o clique não chega a quem está embaixo: no Visual, não põe o cursor no bloco)
  const stop = (e: Event) => e.stopPropagation();
  thumb.addEventListener('mousedown', stop);
  thumb.addEventListener('click', stop);

  const undo = () => {
    clearTimeout(shown);
    scroller.removeEventListener('scroll', onScroll);
    bar.remove();
    host.removeAttribute('data-rola');
    host.removeAttribute('data-rolando');
  };
  return { bar, thumb, undo };
}

/** O polegar do tamanho da parte à vista e no lugar da rolagem; sem nada para rolar, a barra some. */
function placeThumb(host: HTMLElement, paper: Paper): void {
  const { scroller, bar, thumb } = paper;
  const max = scroller.scrollWidth - scroller.clientWidth;
  if (max <= 1) {
    if (host.hasAttribute('data-rola')) host.removeAttribute('data-rola');
    return;
  }
  if (!host.hasAttribute('data-rola')) host.setAttribute('data-rola', '');
  const track = bar.clientWidth;
  const width = Math.min(track, Math.max(MIN_THUMB, (track * scroller.clientWidth) / scroller.scrollWidth));
  const left = (Math.min(max, Math.max(0, scroller.scrollLeft)) / max) * (track - width);
  thumb.style.width = `${width}px`;
  thumb.style.transform = `translateX(${left}px)`;
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
