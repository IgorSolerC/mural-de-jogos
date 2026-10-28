import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SEARCH_HIGHLIGHT, SearchHighlight, rangesIn } from './search-highlight';

function html(markup: string): HTMLElement {
  const el = document.createElement('div');
  el.innerHTML = markup;
  document.body.appendChild(el);
  return el;
}

describe('rangesIn', () => {
  let host: HTMLElement;
  afterEach(() => host?.remove());

  it('acha a busca nos textos, cada vez um pedaço', () => {
    host = html('<p>Zelda</p><p>A lenda de <b>Zel</b>da</p>');
    expect(rangesIn(host, 'zelda').map((r) => r.toString())).toEqual(['Zelda', 'Zelda']);
  });

  it('não emenda blocos diferentes ("Zel" num, "da" no outro)', () => {
    host = html('<p>Zel</p><p>da</p>');
    expect(rangesIn(host, 'zelda')).toEqual([]);
  });

  it('com `realceEm`, só dentro das fichas', () => {
    host = html('<p class="aviso">Nada fala de zelda</p><div class="fichas"><h3>Zelda</h3></div>');
    expect(rangesIn(host, 'zelda', '.fichas').map((r) => r.commonAncestorContainer.parentElement!.tagName)).toEqual(['H3']);
  });

  it('"#tag" só realça nas tags', () => {
    host = html('<p>trabalho</p><app-note-tag><span class="txt">trabalho</span></app-note-tag>');
    const found = rangesIn(host, '#trab');
    expect(found.length).toBe(1);
    expect(found[0].startContainer.parentElement!.closest('app-note-tag')).not.toBeNull();
    expect(rangesIn(host, '#')).toEqual([]);
  });

  it('não realça o que está sendo editado', () => {
    host = html('<div contenteditable="true">zelda</div>');
    expect(rangesIn(host, 'zelda')).toEqual([]);
  });

  it('não realça o spoiler escondido (o marca-texto pintava a letra e contava o segredo), nem emenda por cima dele', () => {
    host = html(
      '<p>o fim: <span class="spoiler"><span class="spoiler-texto" inert>zelda <b>morre</b></span></span> e zel<span class="spoiler"><span class="spoiler-texto" inert>x</span></span>da</p>',
    );
    expect(rangesIn(host, 'morre')).toEqual([]);
    expect(rangesIn(host, 'zelda')).toEqual([]);
    // revelado (sem o inert), aparece como o resto
    host.querySelector('.spoiler-texto')!.removeAttribute('inert');
    expect(rangesIn(host, 'morre').map((r) => r.toString())).toEqual(['morre']);
  });
});

@Component({
  imports: [SearchHighlight],
  template: `<div [appRealceBusca]="q()">
    @for (n of names(); track n) {
      <p>{{ n }}</p>
    }
  </div>`,
})
class Host {
  readonly q = signal('');
  readonly names = signal(['Zelda', 'Mario']);
}

describe('SearchHighlight', () => {
  const supported = typeof CSS !== 'undefined' && 'highlights' in CSS;
  const frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r)));
  const marked = () => [...((CSS.highlights.get(SEARCH_HIGHLIGHT) as Highlight | undefined) ?? [])].map((r) => r.toString());

  it('pinta o que a busca acha, segue as fichas que entram e apaga ao limpar', async () => {
    if (!supported) return pending('sem a Highlight API do CSS neste navegador');
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    await frame();
    expect(marked()).toEqual([]);

    fixture.componentInstance.q.set('ZEL');
    fixture.detectChanges();
    await frame();
    expect(marked()).toEqual(['Zel']);

    fixture.componentInstance.names.set(['Zelda', 'Mario', 'Zelda II']);
    fixture.detectChanges();
    await frame();
    expect(marked()).toEqual(['Zel', 'Zel']);

    fixture.componentInstance.q.set('');
    fixture.detectChanges();
    await frame();
    expect(CSS.highlights.has(SEARCH_HIGHLIGHT)).toBeFalse();

    fixture.componentInstance.q.set('mario');
    fixture.detectChanges();
    await frame();
    fixture.destroy();
    expect(CSS.highlights.has(SEARCH_HIGHLIGHT)).toBeFalse();
  });
});
