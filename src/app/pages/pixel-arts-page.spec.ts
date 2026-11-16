import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { PixelPiece } from '../core/pixel-gallery';
import { PixelGallery } from '../core/pixel-gallery-store';
import { PIXEL_PREFS_KEY } from '../core/pixel-gallery-view';
import { Toasts } from '../ui/toast';
import { ReviewStore } from '../core/review-store';
import { Review } from '../core/review';
import { expectEtiquetaPadrao } from '../testing/etiqueta-acoes.spec';
import { PixelArtsPage } from './pixel-arts-page';

/** A galeria de pixel arts (PLANO-PIXEL-ARTS.md, rodada 2): a Mostra, a Grade, a busca, os filtros e a ficha. */

const at = (h: number) => new Date(Date.UTC(2026, 10, 16, h)).toISOString();
const piece = (id: string, title: string, extra: Partial<PixelPiece> = {}): PixelPiece => ({ id, title, art: ['2x2', '12/21'], createdAt: at(1), at: at(1), ...extra });

describe('a galeria de pixel arts', () => {
  let host: HTMLElement;
  let gallery: PixelGallery;
  let fixture: ComponentFixture<PixelArtsPage>;

  /** As trocas passam pela transição de vista, que muda no quadro seguinte: espera os quadros também. */
  async function settle(): Promise<void> {
    for (let i = 0; i < 4; i++) {
      await new Promise((r) => setTimeout(r, 0));
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      TestBed.tick();
    }
  }
  async function mount(): Promise<void> {
    fixture = TestBed.createComponent(PixelArtsPage);
    host = fixture.nativeElement;
    document.body.appendChild(host);
    await settle();
  }
  const shown = () => [...host.querySelectorAll<HTMLElement>('[data-ficha]')].map((x) => x.getAttribute('data-ficha'));
  const panel = () => [...host.querySelectorAll<HTMLElement>('.menu-contexto')].find((m) => m.querySelector('.escolha'))!;
  const nameOf = (b: Element) => (b.querySelector('.nome') ?? b.querySelector('.sr-only'))!.textContent!.trim();
  const labels = () => [...panel().querySelectorAll('.escolha')].map(nameOf);
  const option = (label: string) => [...panel().querySelectorAll<HTMLButtonElement>('.escolha')].find((b) => nameOf(b) === label)!;
  /** O botão direito; tenta de novo até o menu abrir (no máximo seis vezes: na suíte inteira a parede às vezes ainda assenta), como nas pastas da Wishlist. */
  async function rightClick(el: Element): Promise<void> {
    for (let i = 0; i < 6; i++) {
      el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 2, pointerType: 'mouse', clientX: 30, clientY: 30 }));
      el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: 30, clientY: 30 }));
      await settle();
      if (panel()) return;
    }
  }
  const button = (label: string) => [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => (b.getAttribute('aria-label') ?? b.textContent!.trim()) === label)!;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideRouter([])] });
    gallery = TestBed.inject(PixelGallery);
    gallery.state.set({
      pieces: [
        piece('pa', 'Gato', { createdAt: at(3), tags: ['bichos'], note: 'Feito no **ônibus**' }),
        piece('pb', 'Espada', { createdAt: at(5), art: ['2x2', '12/21', 'ponto-cruz'], tags: ['jogos'] }),
        piece('pc', '', { createdAt: at(1), art: ['3x3', '111/101/111', 'figurinha'] }),
      ],
      removed: {},
    });
  });

  afterEach(() => {
    host?.remove();
    for (const d of document.querySelectorAll('dialog[open]')) (d as HTMLDialogElement).close();
    localStorage.clear();
  });

  it('mostra todas na Mostra, as feitas há pouco primeiro, cada uma no jeito dela', async () => {
    await mount();
    expect(host.querySelectorAll('app-pixel-piece').length).toBe(3);
    // na Mostra as colunas embaralham a leitura: a ordem é a da lista, coluna a coluna
    expect(fixture.componentInstance['visible']().map((p: PixelPiece) => p.id)).toEqual(['pb', 'pa', 'pc']);
    expect(host.querySelector('[data-ficha="pa"] .milimetrado')).not.toBeNull();
    expect(host.querySelector('[data-ficha="pb"] .milimetrado')).toBeNull();
    expect(host.querySelector('[data-ficha="pc"] .nome')!.textContent!.trim()).toBe('Sem título');
  });

  it('a Grade mostra todas do mesmo tamanho, e a vista fica guardada no aparelho', async () => {
    await mount();
    button('Grade').click();
    await settle();
    expect(shown()).toEqual(['pb', 'pa', 'pc']);
    expect(host.querySelectorAll('app-pixel-tile').length).toBe(3);
    expect(JSON.parse(localStorage.getItem(PIXEL_PREFS_KEY)!).vista).toBe('grade');
  });

  it('a busca acha no título, nas tags e na descrição; o Jeito e as tags filtram', async () => {
    localStorage.setItem(PIXEL_PREFS_KEY, JSON.stringify({ vista: 'grade' }));
    await mount();
    const page = fixture.componentInstance;
    page['setQuery']('ônibus');
    await settle();
    expect(shown()).toEqual(['pa']);
    page['setQuery']('jogos');
    await settle();
    expect(shown()).toEqual(['pb']);
    page['setQuery']('');
    page['chooseLook']('figurinha');
    await settle();
    expect(shown()).toEqual(['pc']);
    page['chooseLook'](null);
    page['toggleTag']('bichos');
    await settle();
    expect(shown()).toEqual(['pa']);
    page['excludeTag']('bichos');
    await settle();
    expect(shown()).toEqual(['pb', 'pc']);
  });

  it('nada achado: o cartão das Anotações, com o Limpar', async () => {
    await mount();
    fixture.componentInstance['setQuery']('dragão');
    await settle();
    expect(host.querySelector('.no-results h2')!.textContent).toContain('Nada na galeria');
    button('Limpar a busca e os filtros').click();
    await settle();
    expect(host.querySelectorAll('app-pixel-piece').length).toBe(3);
  });

  it('sem nenhuma obra: o convite, e o botão abre a ficha nova', async () => {
    gallery.state.set({ pieces: [], removed: {} });
    await mount();
    expect(host.querySelector('.vazio h2')!.textContent).toContain('Nenhuma pixel art');
    button('Nova pixel art').click();
    await settle();
    expect(host.querySelector<HTMLDialogElement>('dialog.obra')!.open).toBeTrue();
    expect(host.querySelector('#obra-titulo')!.textContent).toContain('Nova pixel art');
  });

  it('o "Nova pixel art" do topo (e o N) abre a ficha; o pedido de antes de a página abrir não conta', async () => {
    gallery.ask();
    await mount();
    expect(host.querySelector<HTMLDialogElement>('dialog.obra')!.open).toBeFalse();
    gallery.ask();
    await settle();
    expect(host.querySelector<HTMLDialogElement>('dialog.obra')!.open).toBeTrue();
  });

  it('tocar numa obra abre a ficha dela; Salvar grava só o que mudou, com o Desfazer', async () => {
    await mount();
    host.querySelector<HTMLButtonElement>('[data-ficha="pa"] .hit')!.click();
    await settle();
    const dialog = host.querySelector<HTMLDialogElement>('dialog.obra')!;
    expect(dialog.open).toBeTrue();
    const name = dialog.querySelector<HTMLInputElement>('#obra-nome')!;
    expect(name.value).toBe('Gato');
    name.value = 'Gato preto';
    name.dispatchEvent(new Event('input'));
    await settle();
    // enquanto a ficha estava aberta, outro aparelho mudou as tags: o Salvar não desfaz isso
    gallery.update('pa', { tags: ['bichos', 'pretos'] });
    dialog.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await settle();
    expect(gallery.get('pa')).toEqual(jasmine.objectContaining({ title: 'Gato preto', tags: ['bichos', 'pretos'] }));
    const toast = TestBed.inject(Toasts).current()!;
    expect(toast.text).toContain('Gato preto');
    toast.action!.run();
    await settle();
    expect(gallery.get('pa')).toEqual(jasmine.objectContaining({ title: 'Gato', tags: ['bichos', 'pretos'] }));
  });

  it('a ficha não guarda uma obra sem desenho', async () => {
    gallery.state.set({ pieces: [], removed: {} });
    await mount();
    fixture.componentInstance['add']();
    await settle();
    // o ateliê abriu sozinho por cima: fecha sem desenhar
    host.querySelector<HTMLDialogElement>('app-pixel-studio dialog')?.close();
    await settle();
    const dialog = host.querySelector<HTMLDialogElement>('dialog.obra')!;
    dialog.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await settle();
    expect(gallery.count()).toBe(0);
    expect(dialog.open).toBeTrue();
    expect(dialog.querySelector('.falta-texto')).not.toBeNull();
  });

  it('apagar pela ficha tira a obra, com o Desfazer', async () => {
    await mount();
    host.querySelector<HTMLButtonElement>('[data-ficha="pb"] .hit')!.click();
    await settle();
    [...host.querySelectorAll<HTMLButtonElement>('dialog.obra button')].find((b) => b.textContent!.includes('Apagar'))!.click();
    await settle();
    expect(gallery.get('pb')).toBeUndefined();
    TestBed.inject(Toasts).current()!.action!.run();
    await settle();
    expect(gallery.get('pb')?.title).toBe('Espada');
  });

  it('Ateliê e Baixar seguem o padrão do Finalizar e do Fixar, na Mostra e na Grade', async () => {
    await mount();
    expectEtiquetaPadrao(host.querySelector('[data-ficha="pa"] app-pixel-actions .acoes')!);
    const names = [...host.querySelectorAll('[data-ficha="pa"] app-pixel-actions button')].map((b) => b.getAttribute('aria-label'));
    expect(names).toEqual(['Abrir Gato no ateliê', 'Baixar Gato em PNG']);
    button('Grade').click();
    await settle();
    expectEtiquetaPadrao(host.querySelector('[data-ficha="pa"] app-pixel-actions .acoes')!);
  });

  it('o botão direito numa obra: editar, o ateliê, o PNG, copiar como widget, duplicar e, sozinho no fim, apagar', async () => {
    await mount();
    await rightClick(host.querySelector('[data-ficha="pa"] .hit')!);
    expect(labels()).toEqual(['Editar', 'Abrir no ateliê', 'Baixar PNG', 'Copiar como widget', 'Duplicar', 'Mover para pasta…', 'Apagar']);
    option('Duplicar').click();
    await settle();
    const copy = gallery.pieces().find((p) => p.title === 'Gato (cópia)')!;
    expect(copy).toEqual(jasmine.objectContaining({ art: ['2x2', '12/21'], tags: ['bichos'], note: 'Feito no **ônibus**' }));
    expect(copy.id).not.toBe('pa');
    TestBed.inject(Toasts).current()!.action!.run();
    await settle();
    expect(gallery.get(copy.id)).toBeUndefined();
  });

  it('copiar como widget leva a linha {{pixel}} com o nome de legenda, para colar numa anotação', async () => {
    const written: string[] = [];
    spyOn(navigator.clipboard, 'writeText').and.callFake(async (t: string) => {
      written.push(t);
    });
    await mount();
    await rightClick(host.querySelector('[data-ficha="pb"] .hit')!);
    option('Copiar como widget').click();
    await settle();
    expect(written).toEqual(['{{pixel: 2x2 | 12/21 | ponto-cruz | Espada}}']);
  });

  it('o botão direito no vão da parede: uma obra nova', async () => {
    await mount();
    await rightClick(host.querySelector('.mostra')!);
    expect(labels()).toEqual(['Nova pixel art aqui', 'Nova pasta aqui']);
    option('Nova pixel art aqui').click();
    await settle();
    expect(host.querySelector<HTMLDialogElement>('dialog.obra')!.open).toBeTrue();
  });

  it('o Ateliê da etiqueta abre o desenho direto no ateliê; o que muda vai para a obra ao fechar, com o Desfazer', async () => {
    await mount();
    const page = fixture.componentInstance;
    page['atelie']('pa');
    await settle();
    expect(host.querySelector('app-pixel-studio')).not.toBeNull();
    page['drawn']({ pixels: '3/03', width: '2', height: '2', palette: 'classica', colors: '' });
    page['studioClosed']();
    await settle();
    expect(host.querySelector('app-pixel-studio')).toBeNull();
    expect(gallery.get('pa')!.art).toEqual(['2x2', '3/03']);
    TestBed.inject(Toasts).current()!.action!.run();
    await settle();
    expect(gallery.get('pa')!.art).toEqual(['2x2', '12/21']);
  });

  it('trazer das anotações: o convite da galeria vazia, a folha com as que ainda não estão, e as escolhidas viram obras', async () => {
    gallery.state.set({ pieces: [], removed: {} });
    TestBed.inject(ReviewStore).add({ id: 'npix', kind: 'anotacoes', game: { name: 'Rascunhos', coverUrl: null, source: 'manual' }, text: '{{pixel: 2x2 | 12/21 | Gato}}\n{{pixel: 1x1 | 4 | Ponto}}', createdAt: at(1), updatedAt: at(1) } as unknown as Review);
    await mount();
    button('Trazer das anotações (2)').click();
    await settle();
    const sheet = document.querySelector('app-pixel-import-sheet')!;
    expect([...sheet.querySelectorAll('.legenda')].map((e) => e.textContent!.trim())).toEqual(['Gato', 'Ponto']);
    sheet.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[1].click();
    await settle();
    [...sheet.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent!.includes('Trazer 1'))!.click();
    await settle();
    expect(gallery.pieces().map((p) => [p.title, p.art])).toEqual([['Gato', ['2x2', '12/21']]]);
    expect(TestBed.inject(Toasts).current()!.text).toBe('“Gato” veio das anotações');
  });
});
