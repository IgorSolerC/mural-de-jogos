import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { WidgetSheet } from './widget-sheet';

describe('a folha do widget aberta pelo Quadro livre', () => {
  async function open(inBoard: boolean, swap = false): Promise<HTMLElement> {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(WidgetSheet);
    fixture.componentRef.setInput('start', { name: 'contador', values: { date: '2026-12-24', title: 'Natal', size: 'grande' } });
    fixture.componentRef.setInput('onCard', false);
    fixture.componentRef.setInput('swap', swap);
    fixture.componentRef.setInput('inBoard', inBoard);
    const host = fixture.nativeElement as HTMLElement;
    document.body.appendChild(host);
    await fixture.whenStable();
    return host;
  }
  afterEach(() => document.querySelectorAll('app-widget-sheet').forEach((e) => e.remove()));

  it('não mostra o Tamanho (o tamanho é o da peça, puxado pelas alças) e fala do quadro', async () => {
    const plain = await open(false);
    expect(plain.querySelector('.tamanhos')).not.toBeNull();
    plain.remove();
    TestBed.resetTestingModule();
    const board = await open(true, true);
    expect(board.querySelector('.tamanhos')).toBeNull();
    expect(board.textContent).not.toContain('Tamanho');
    expect(board.querySelector('.sub')?.textContent).toContain('Mexendo no widget do quadro');
  });
});
