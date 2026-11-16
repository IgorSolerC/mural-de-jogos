import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { Wish } from '../core/review';
import { expectEtiquetaPadrao } from '../testing/etiqueta-acoes.spec';
import { WishActions } from './wish-actions';
import { WishNote } from './wish-note';
import { ContextMenu } from './context-menu';
import { ICON } from './icons';

/** A etiqueta de hover do desejo e a folha da descrição (PLANO-WISHLIST.md, D4 e D5). */

const wish = (relevance?: Wish['relevance']): Wish => ({
  id: 'w1',
  kind: 'jogos',
  game: { name: 'Hades', coverUrl: null, source: 'manual' },
  ...(relevance ? { relevance } : {}),
  createdAt: '2026-11-13T10:00:00.000Z',
  updatedAt: '2026-11-13T10:00:00.000Z',
});

describe('a etiqueta e a descrição do desejo', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] }));

  function mountActions(w: Wish, editable = true) {
    const f = TestBed.createComponent(WishActions);
    f.componentRef.setInput('wish', w);
    f.componentRef.setInput('editable', editable);
    document.body.appendChild(f.nativeElement);
    f.detectChanges();
    return f;
  }

  it('Editar e Vontade seguem o padrão do Finalizar e do Fixar', () => {
    const f = mountActions(wish());
    expectEtiquetaPadrao(f.nativeElement.querySelector('.acoes'));
    const names = [...f.nativeElement.querySelectorAll('button')].map((b: Element) => b.getAttribute('aria-label'));
    expect(names).toEqual(['Editar Hades', 'Quanta vontade de Hades: Comum. Mudar']);
    f.nativeElement.remove();
  });

  it('o Vontade anuncia e mostra a vontade de agora: vermelho no MUST, azul no LATER', () => {
    const must = mountActions(wish('must'));
    const btn = must.nativeElement.querySelector('.vontade') as HTMLElement;
    expect(btn.getAttribute('aria-label')).toBe('Quanta vontade de Hades: MUST PLAY. Mudar');
    expect(getComputedStyle(btn).color).toBe('rgb(255, 143, 128)');
    must.nativeElement.remove();
    const later = mountActions(wish('later'));
    expect(getComputedStyle(later.nativeElement.querySelector('.vontade')).color).toBe('rgb(140, 200, 255)');
    later.nativeElement.remove();
  });

  it('o clique no Vontade entrega o botão (o menu abre embaixo dele); sem o Editar quando não dá', () => {
    const f = mountActions(wish(), false);
    let got: HTMLElement | null = null;
    f.componentInstance.vontade.subscribe((v) => (got = v.el));
    const btn = f.nativeElement.querySelector('.vontade') as HTMLButtonElement;
    btn.click();
    expect(got as unknown).toBe(btn);
    expect(f.nativeElement.querySelector('.editar')).toBeNull();
    f.nativeElement.remove();
  });

  it('a descrição: a folha do caderno, só para os olhos, com o id que o toque cita', () => {
    const f = TestBed.createComponent(WishNote);
    f.componentRef.setInput('wishId', 'w1');
    f.componentRef.setInput('text', 'Indicação do Rafa');
    document.body.appendChild(f.nativeElement);
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.getAttribute('aria-hidden')).toBe('true');
    expect(el.querySelector('#descricao-w1')!.textContent).toContain('Descrição: Indicação do Rafa');
    expect(getComputedStyle(el.querySelector('.folha')!).backgroundImage).toContain('repeating-linear-gradient');
    f.componentRef.setInput('open', true);
    f.detectChanges();
    expect(el.classList).toContain('aberta');
    el.remove();
  });

  it('a descrição formatada só monta quando a mão (ou o teclado) chega no card; antes, o texto sem marcas', async () => {
    const card = document.createElement('div');
    document.body.appendChild(card);
    const f = TestBed.createComponent(WishNote);
    f.componentRef.setInput('wishId', 'w1');
    f.componentRef.setInput('text', 'Com a **Bia**');
    card.appendChild(f.nativeElement);
    f.detectChanges();
    await f.whenStable();
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('app-rich-text')).toBeNull();
    expect(el.querySelector('#descricao-w1')!.textContent).toContain('Com a Bia');
    // a descrição longa: o leitor de tela ouve o começo
    f.componentRef.setInput('text', 'palavra '.repeat(100));
    f.detectChanges();
    expect(el.querySelector('#descricao-w1')!.textContent!.length).toBeLessThan(230);
    expect(el.querySelector('#descricao-w1')!.textContent).toContain('(continua no Editar)');
    f.componentRef.setInput('text', 'Com a **Bia**');
    f.detectChanges();
    expect(el.textContent).not.toContain('**');
    card.dispatchEvent(new PointerEvent('pointerenter'));
    f.detectChanges();
    expect(el.querySelector('app-rich-text .negrito')!.textContent).toBe('Bia');
    card.remove();
  });

  it('o menu do site mostra a descrição embaixo do nome só quando o dedo o abriu', () => {
    const f = TestBed.createComponent(ContextMenu);
    f.componentRef.setInput('caption', 'Hades');
    f.componentRef.setInput('note', 'Jogar com a Bia');
    f.componentRef.setInput('sections', [[{ id: 'a', label: 'Começar a resenha', icon: ICON.pronto, run: () => undefined }]]);
    document.body.appendChild(f.nativeElement);
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    f.componentInstance.show({ key: 'x', x: 10, y: 10, back: null, by: 'mouse' });
    f.detectChanges();
    expect(el.querySelector('.lembrete')).toBeNull();
    f.componentInstance.close(false);
    f.componentInstance.show({ key: 'y', x: 10, y: 10, back: null, by: 'toque' });
    f.detectChanges();
    expect(el.querySelector('.lembrete')!.textContent).toContain('Jogar com a Bia');
    f.componentInstance.close(false);
    el.remove();
  });
});
