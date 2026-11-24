import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ViewTransitions } from '../core/view-transitions';
import { provideZonelessChangeDetection } from '@angular/core';
import { Router, provideRouter } from '@angular/router';
import { inkOf } from '../core/pixel-art';
import { PixelFolders } from '../core/pixel-folders';
import { PixelPiece, pixelArtOf } from '../core/pixel-gallery';
import { PixelGallery } from '../core/pixel-gallery-store';
import { PIXEL_PREFS_KEY } from '../core/pixel-gallery-view';
import { Toasts } from '../ui/toast';
import { PixelArtsPage, droppedText } from './pixel-arts-page';

/** Soltar imagens do computador na galeria (PLANO-SOLTAR-IMAGENS.md, rodada 3). */

const at = (h: number) => new Date(Date.UTC(2026, 10, 24, h)).toISOString();
const piece = (id: string, title: string, extra: Partial<PixelPiece> = {}): PixelPiece => ({ id, title, art: ['2x2', '12/21'], createdAt: at(1), at: at(1), ...extra });

const COLORS: Record<string, string> = { k: '#14121e', r: '#e43b44', y: '#fee761' };
const HEART = ['.kk.kk.', 'krrkrrk', 'krryrrk', 'krrrrrk', '.krrrk.', '..krk..', '...k...'];

/** Um PNG de verdade: cada caractere um ponto de `k` × `k` pixels (o "." é o transparente). */
function png(rows: string[], name: string, k = 1): Promise<File> {
  const c = document.createElement('canvas');
  c.width = rows[0].length * k;
  c.height = rows.length * k;
  const g = c.getContext('2d')!;
  rows.forEach((r, y) =>
    [...r].forEach((ch, x) => {
      if (ch === '.') return;
      g.fillStyle = COLORS[ch];
      g.fillRect(x * k, y * k, k, k);
    }),
  );
  return new Promise((res) => c.toBlob((b) => res(new File([b!], name, { type: 'image/png' })), 'image/png'));
}

describe('soltar imagens do computador na galeria de pixel arts', () => {
  let host: HTMLElement;
  let gallery: PixelGallery;
  let fixture: ComponentFixture<PixelArtsPage>;
  let bichos: string;

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
  /** O arrastar do navegador com os arquivos, até o ponto do elemento. */
  function drag(type: 'dragenter' | 'dragover' | 'drop', el: Element, files: File[]): DragEvent {
    const data = new DataTransfer();
    for (const f of files) data.items.add(f);
    const r = el.getBoundingClientRect();
    const e = new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: data, clientX: r.left + r.width / 2, clientY: r.top + Math.min(r.height / 2, 40) });
    el.dispatchEvent(e);
    return e;
  }
  /** Espera as imagens serem lidas (o createImageBitmap é de verdade). */
  async function until(ok: () => boolean): Promise<void> {
    for (let i = 0; i < 60 && !ok(); i++) await settle();
  }
  const toast = () => TestBed.inject(Toasts).current();

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(PIXEL_PREFS_KEY, JSON.stringify({ vista: 'grade' }));
    // a troca direta, sem a View Transition de verdade (como nas specs da parede): uma transição ainda no meio quando a página
    // de um teste sai e a do outro começa derruba o Chrome sem tela
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideRouter([]), { provide: ViewTransitions, useValue: { run: (change: () => void) => change() } }] });
    gallery = TestBed.inject(PixelGallery);
    gallery.state.set({ pieces: [piece('pa', 'Gato')], removed: {} });
    bichos = TestBed.inject(PixelFolders).create(null, 'Bichos')!.id;
  });

  afterEach(async () => {
    host?.remove();
    TestBed.inject(Toasts).dismiss();
    await TestBed.inject(Router).navigate([], { queryParams: {} });
    localStorage.clear();
  });

  it('o aviso diz quantas chegaram, onde, e o que ficou de fora', () => {
    expect(droppedText([{ title: 'Mario' }], null, { others: 0, broken: 0, big: 0 })).toBe('“Mario” chegou à galeria.');
    expect(droppedText([{ title: '' }, { title: 'b' }], 'Bichos', { others: 1, broken: 0, big: 2, blank: 0, full: 0 })).toBe('2 pixel arts chegaram em Bichos (1 não é imagem, 2 são grandes demais).');
    expect(droppedText([], null, { others: 0, broken: 1, big: 0, blank: 1, full: 3 })).toBe('Nenhuma imagem virou pixel art (1 não abriu, 1 é toda transparente, 3 não couberam: a galeria encheu).');
  });

  it('arrastando imagens por cima, a parede acende e a etiqueta diz para onde vão; soltar traz com o nome do arquivo e as cores dela', async () => {
    await mount();
    const wall = host.querySelector('.grade')!;
    const file = await png(HEART, 'Coração vermelho.png');
    expect(drag('dragover', wall, [file]).defaultPrevented).toBeTrue();
    expect(wall.hasAttribute('data-alvo')).toBeTrue();
    expect(host.querySelector('.arrasto-dica')!.textContent).toBe('Trazer a imagem para a galeria');
    drag('drop', wall, [file]);
    expect(wall.hasAttribute('data-alvo')).toBeFalse();
    expect(host.querySelector('.arrasto-dica')).toBeNull();
    await until(() => gallery.count() === 2);
    const made = gallery.pieces().find((p) => p.title === 'Coração vermelho')!;
    const art = pixelArtOf(made);
    expect([art.w, art.h, art.palette]).toEqual([7, 7, 'propria']);
    expect(inkOf(art.palette, art.colors).slice(1, 4)).toEqual(['#14121e', '#e43b44', '#fee761']);
    expect(made.folder).toBeUndefined();
    expect(toast()?.text).toBe('“Coração vermelho” chegou à galeria.');
    // o Desfazer tira o que chegou
    toast()!.action!.run();
    await settle();
    expect(gallery.count()).toBe(1);
  });

  it('soltar numa pasta guarda nela, e a parede vai até ela', async () => {
    await mount();
    const card = host.querySelector(`app-folder-card[data-pasta="${bichos}"]`)!;
    const files = [await png(HEART, 'um.png'), await png(['rr', 'ry'], 'dois.png')];
    drag('dragover', card, files);
    expect(card.hasAttribute('data-alvo')).toBeTrue();
    expect(host.querySelector('.arrasto-dica')!.textContent).toBe('Trazer 2 imagens para Bichos');
    drag('drop', card, files);
    await until(() => gallery.count() === 3);
    expect(gallery.pieces().filter((p) => p.folder === bichos).map((p) => p.title).sort()).toEqual(['dois', 'um']);
    await settle();
    expect(toast()?.text).toBe('2 pixel arts chegaram em Bichos.');
    expect(host.querySelector('app-folder-path')?.textContent).toContain('Bichos');
  });

  /** A folha das grandes, aberta. */
  const sheet = () => document.querySelector<HTMLDialogElement>('app-pixel-drop-sheet dialog[open]');
  const cards = () => [...sheet()!.querySelectorAll<HTMLLabelElement>('.trazer-cartao')];

  it('a maior que 64 pergunta se é pixel art ampliada, com o palpite já escolhido; Trazer volta ao tamanho de verdade, com as pequenas junto', async () => {
    await mount();
    drag('drop', host.querySelector('.grade')!, [await png(HEART, 'grande.png', 12), await png(['rr', 'ry'], 'pequena.png')]);
    await until(() => !!sheet());
    // as pequenas esperam a resposta
    expect(gallery.count()).toBe(1);
    expect(sheet()!.querySelector('h2')!.textContent).toContain('É uma pixel art ampliada?');
    expect(sheet()!.querySelector('.sub')!.textContent).toContain('mais 1 pequena vem junto');
    expect(sheet()!.querySelector('.solta-tam')!.textContent).toContain('84 × 84 pixels');
    expect(cards()[0].classList).toContain('on');
    expect(cards()[0].textContent).toContain('o site achou');
    expect(cards()[0].querySelector('.passo-n')!.textContent).toBe('12 × 12');
    expect(cards()[0].querySelector('.trazer-desc')!.textContent).toContain('vira 7 × 7 pontos');
    expect(cards()[1].querySelector('.trazer-desc')!.textContent).toContain('vira 84 × 84 pontos');
    [...sheet()!.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent!.includes('Trazer 2'))!.click();
    await settle();
    expect(gallery.count()).toBe(3);
    const art = pixelArtOf(gallery.pieces().find((p) => p.title === 'grande')!);
    expect([art.w, art.h]).toEqual([7, 7]);
    expect(toast()?.text).toBe('2 pixel arts chegaram à galeria.');
  });

  it('"Só as pequenas" traz as pequenas e deixa as grandes de fora; as prévias saem na mesma medida (a diferença se vê)', async () => {
    await mount();
    drag('drop', host.querySelector('.grade')!, [await png(HEART, 'grande.png', 12), await png(['rr', 'ry'], 'pequena.png')]);
    await until(() => !!sheet());
    const thumbs = [...sheet()!.querySelectorAll<HTMLElement>('app-pixel-thumb')].map((t) => t.getBoundingClientRect().width);
    // a de 7 × 7 bem menor que a de 84 × 84 (que enche a caixa)
    expect(thumbs[1]).toBeCloseTo(72, 0);
    expect(thumbs[0]).toBeLessThan(30);
    // o passo fica fora do rótulo do rádio
    expect(sheet()!.querySelector('label .passo-btn')).toBeNull();
    [...sheet()!.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent!.includes('Só a pequena'))!.click();
    await settle();
    expect(gallery.pieces().map((p) => p.title)).toContain('pequena');
    expect(gallery.pieces().map((p) => p.title)).not.toContain('grande');
  });

  it('a barra da galeria tem o Trazer (sem arrastar), para a pasta aberta', async () => {
    await mount();
    const input = host.querySelector<HTMLInputElement>('input[type="file"]')!;
    const clicked = spyOn(input, 'click');
    host.querySelector<HTMLButtonElement>('.pasta button[aria-label="Trazer imagens do computador"]')!.click();
    expect(clicked).toHaveBeenCalled();
  });

  it('"Do tamanho dela" deixa cada pixel um ponto; o passo à mão muda o tamanho; Cancelar não traz nenhuma', async () => {
    await mount();
    drag('drop', host.querySelector('.grade')!, [await png(HEART, 'grande.png', 12)]);
    await until(() => !!sheet());
    // o + muda o passo (e escolhe a ampliada)
    const more = cards()[0].querySelectorAll<HTMLButtonElement>('.passo-btn')[1];
    more.click();
    await settle();
    expect(cards()[0].querySelector('.passo-n')!.textContent).toBe('13 × 13');
    expect(cards()[0].querySelector('.trazer-desc')!.textContent).toContain('vira 7 × 7 pontos');
    cards()[1].querySelector('input')!.click();
    await settle();
    expect(cards()[1].classList).toContain('on');
    [...sheet()!.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent!.includes('Trazer 1'))!.click();
    await settle();
    const art = pixelArtOf(gallery.pieces().find((p) => p.title === 'grande')!);
    expect([art.w, art.h]).toEqual([84, 84]);
    // de novo, e Cancelar
    drag('drop', host.querySelector('.grade')!, [await png(HEART, 'outra.png', 12)]);
    await until(() => !!sheet());
    [...sheet()!.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent!.trim() === 'Cancelar')!.click();
    await settle();
    expect(sheet()).toBeNull();
    expect(gallery.pieces().some((p) => p.title === 'outra')).toBeFalse();
  });

  it('com uma folha aberta por cima, soltar não traz nada, e o navegador não abre o arquivo no lugar do site', async () => {
    await mount();
    const dialog = document.createElement('dialog');
    host.append(dialog);
    dialog.show();
    const wall = host.querySelector('.grade')!;
    const file = await png(HEART, 'nao.png');
    expect(drag('dragover', wall, [file]).defaultPrevented).toBeTrue();
    expect(wall.hasAttribute('data-alvo')).toBeFalse();
    expect(drag('drop', wall, [file]).defaultPrevented).toBeTrue();
    await settle();
    dialog.remove();
    expect(gallery.count()).toBe(1);
  });

  it('a pasta que saiu enquanto as imagens eram lidas: elas vão para a raiz (nunca para uma pasta que não existe)', async () => {
    await mount();
    const card = host.querySelector(`app-folder-card[data-pasta="${bichos}"]`)!;
    drag('drop', card, [await png(HEART, 'orfa.png')]);
    TestBed.inject(PixelFolders).dissolve(bichos);
    await until(() => gallery.count() === 2);
    expect(gallery.pieces().find((p) => p.title === 'orfa')!.folder).toBeUndefined();
  });

  it('a foto grande (sem palpite) espera a resposta já encolhida, e a folha diz o tamanho de como veio', async () => {
    await mount();
    const c = document.createElement('canvas');
    c.width = 1500;
    c.height = 1000;
    const g = c.getContext('2d')!;
    const grad = g.createLinearGradient(0, 0, 1500, 1000);
    grad.addColorStop(0, '#2a6fdb');
    grad.addColorStop(1, '#d1495b');
    g.fillStyle = grad;
    g.fillRect(0, 0, 1500, 1000);
    const photo = await new Promise<File>((res) => c.toBlob((b) => res(new File([b!], 'foto.png', { type: 'image/png' })), 'image/png'));
    drag('drop', host.querySelector('.grade')!, [photo]);
    await until(() => !!sheet());
    expect(sheet()!.querySelector('.solta-tam')!.textContent).toContain('1500 × 1000 pixels');
    expect(cards()[1].classList).toContain('on');
    expect(cards()[1].querySelector('.trazer-desc')!.textContent).toContain('vira 256 × 171 pontos');
    // a guardada para a resposta tem no máximo 1024 de lado
    const page = fixture.componentInstance as unknown as { dropAsk: () => { big: { img: { w: number; h: number } }[] } };
    expect(Math.max(page.dropAsk().big[0].img.w, page.dropAsk().big[0].img.h)).toBe(1024);
    [...sheet()!.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent!.includes('Trazer 1'))!.click();
    await settle();
    const art = pixelArtOf(gallery.pieces().find((p) => p.title === 'foto')!);
    expect([art.w, art.h]).toEqual([256, 171]);
  });

  it('a etiqueta conta só as imagens do arrasto', async () => {
    await mount();
    const wall = host.querySelector('.grade')!;
    drag('dragover', wall, [await png(HEART, 'a.png'), new File(['x'], 'b.txt', { type: 'text/plain' })]);
    expect(host.querySelector('.arrasto-dica')!.textContent).toBe('Trazer a imagem para a galeria');
  });

  it('o que não é imagem fica de fora, com o aviso', async () => {
    await mount();
    drag('drop', host.querySelector('.grade')!, [new File(['oi'], 'nota.txt', { type: 'text/plain' })]);
    await settle();
    expect(gallery.count()).toBe(1);
    expect(toast()?.text).toContain('não é uma imagem');
  });

  it('o texto arrastado (não arquivo) não acende nada', async () => {
    await mount();
    const wall = host.querySelector('.grade')!;
    const data = new DataTransfer();
    data.setData('text/plain', 'oi');
    const r = wall.getBoundingClientRect();
    const e = new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: data, clientX: r.left + 10, clientY: r.top + 10 });
    wall.dispatchEvent(e);
    expect(e.defaultPrevented).toBeFalse();
    expect(wall.hasAttribute('data-alvo')).toBeFalse();
  });

  it('sem arrastar: o seletor de arquivos traz para a pasta aberta (o menu do vão e o cartaz vazio o abrem)', async () => {
    gallery.state.set({ pieces: [], removed: {} });
    TestBed.inject(PixelFolders).dissolve(bichos);
    await mount();
    const input = host.querySelector<HTMLInputElement>('input[type="file"]')!;
    const clicked = spyOn(input, 'click');
    const button = [...host.querySelectorAll<HTMLButtonElement>('.vazio button')].find((b) => b.textContent!.includes('Trazer do computador'))!;
    button.click();
    expect(clicked).toHaveBeenCalled();
    const data = new DataTransfer();
    data.items.add(await png(HEART, 'escolhida.png'));
    input.files = data.files;
    input.dispatchEvent(new Event('change'));
    await until(() => gallery.count() === 1);
    expect(gallery.pieces()[0].title).toBe('escolhida');
    expect(input.value).toBe('');
  });
});
