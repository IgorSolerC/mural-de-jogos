import { DestroyRef, Directive, ElementRef, effect, inject, input } from '@angular/core';
import { fold } from '../core/review';
import { foundSpans } from '../core/search-marks';

/** O nome do realce no CSS: `::highlight(busca)`, em styles.scss. */
export const SEARCH_HIGHLIGHT = 'busca';

/** As tags que não quebram o texto: o que está dentro delas continua a frase de fora ("Zel<b>da</b>"). */
const INLINE = new Set(['A', 'ABBR', 'B', 'BDI', 'BDO', 'CODE', 'DEL', 'EM', 'I', 'INS', 'KBD', 'MARK', 'S', 'SMALL', 'SPAN', 'STRONG', 'SUB', 'SUP', 'U']);
const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'NOSCRIPT']);
/** Onde moram as tags: a busca por "#tag" só realça ali, como só procura ali (ver matchesQuery). */
const TAGS = 'app-note-tag, .tag';
/** O spoiler ainda escondido (ver ui/rich-text.ts): o marca-texto pinta a letra e contaria o segredo. */
const HIDDEN = '.spoiler-texto[inert]';

/** Os realces de cada parede na tela; o CSS tem um só, com todos juntos. */
const live = new Map<object, Range[]>();

function repaint(): void {
  if (typeof CSS === 'undefined' || !('highlights' in CSS)) return;
  const all = [...live.values()].flat();
  if (!all.length) {
    CSS.highlights.delete(SEARCH_HIGHLIGHT);
    return;
  }
  const h = new Highlight();
  for (const r of all) h.add(r);
  CSS.highlights.set(SEARCH_HIGHLIGHT, h);
}

/** O bloco de um texto: o primeiro ancestral que quebra a linha (um componente conta como bloco). */
function blockOf(node: Node, host: Element): Element {
  let el = node.parentElement!;
  while (el !== host && INLINE.has(el.tagName) && el.parentElement) el = el.parentElement;
  return el;
}

/**
 * Pinta, com o marca-texto da busca, o que bate com ela nos textos de dentro: o nome, o texto, as
 * tags, a categoria. Não mexe no HTML (é a Highlight API do CSS: as fichas ficam como são) e segue
 * as fichas que entram e saem enquanto a busca está escrita. `realceEm` limita a alguns pedaços
 * (as fichas, e não a mensagem de "nada achado", que repete a busca).
 */
@Directive({ selector: '[appRealceBusca]' })
export class SearchHighlight {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  /** A busca como foi digitada. */
  readonly appRealceBusca = input<string>('');
  /** Só os textos dentro destes elementos (um seletor); vazio, todos. */
  readonly realceEm = input<string>('');

  private observer: MutationObserver | null = null;
  private frame = 0;

  constructor() {
    effect(() => {
      const needle = fold(this.appRealceBusca().trim());
      const scope = this.realceEm();
      this.watch(!!needle.replace(/^#/, ''));
      this.schedule(needle, scope);
    });
    inject(DestroyRef).onDestroy(() => {
      cancelAnimationFrame(this.frame);
      this.observer?.disconnect();
      live.delete(this);
      repaint();
    });
  }

  /** Com a busca escrita, olha as fichas que mudam (entram, saem, trocam de texto). */
  private watch(on: boolean): void {
    if (typeof MutationObserver === 'undefined') return;
    if (!on) {
      this.observer?.disconnect();
      this.observer = null;
      return;
    }
    if (this.observer) return;
    this.observer = new MutationObserver(() => this.schedule(fold(this.appRealceBusca().trim()), this.realceEm()));
    this.observer.observe(this.host, { childList: true, subtree: true, characterData: true });
  }

  /** Um quadro depois: as fichas da busca nova já estão na tela. */
  private schedule(needle: string, scope: string): void {
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => {
      live.set(this, rangesIn(this.host, needle, scope));
      repaint();
    });
  }
}

/** Os pedaços de texto dentro de `host` que batem com a busca (`needle` já dobrada; "#x" só nas tags). */
export function rangesIn(host: Element, needle: string, scope = ''): Range[] {
  const tagOnly = needle.startsWith('#');
  const word = tagOnly ? needle.slice(1) : needle;
  if (!word) return [];
  const where = [scope, tagOnly ? TAGS : ''].filter(Boolean);
  const walker = host.ownerDocument.createTreeWalker(host, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      const p = n.parentElement;
      if (!p || !n.nodeValue || SKIP.has(p.tagName) || p.closest('[contenteditable]')) return NodeFilter.FILTER_REJECT;
      for (const sel of where) {
        const at = p.closest(sel);
        if (!at || !host.contains(at)) return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const ranges: Range[] = [];
  // os textos seguidos do mesmo bloco são uma frase só (a busca acha "zelda" em "Zel<b>da</b>")
  let run: { node: Text; at: number }[] = [];
  let text = '';
  let block: Element | null = null;
  const flush = () => {
    for (const [s, e] of foundSpans(text, word)) {
      const range = host.ownerDocument.createRange();
      const start = locate(run, s, false);
      const end = locate(run, e, true);
      range.setStart(start.node, start.offset);
      range.setEnd(end.node, end.offset);
      ranges.push(range);
    }
    run = [];
    text = '';
  };
  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
    // o spoiler escondido não é realçado e corta a frase (a busca não emenda o antes com o depois dele)
    if (n.parentElement!.closest(HIDDEN)) {
      flush();
      block = null;
      continue;
    }
    const b = blockOf(n, host);
    if (b !== block) {
      flush();
      block = b;
    }
    run.push({ node: n, at: text.length });
    text += n.nodeValue!;
  }
  flush();
  return ranges;
}

/** O nó e a posição de um ponto da frase; o fim fica no nó de antes quando cai bem na emenda. */
function locate(run: { node: Text; at: number }[], i: number, end: boolean): { node: Text; offset: number } {
  for (let k = run.length - 1; k >= 0; k--) {
    const { node, at } = run[k];
    if (end ? i > at : i >= at) return { node, offset: i - at };
  }
  return { node: run[0].node, offset: 0 };
}
