import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Cloud } from '../core/cloud-config';
import { deleteDatabase } from '../core/erase-save';
import { IMAGES_DB, ImageStore } from '../core/image-store';
import { localImageId } from '../core/images';
import { samplePng } from '../core/images.spec';
import { PickedGame } from '../core/review';
import { CoverPicker } from './cover-picker';
import { PIXEL_GALLERY_KEY } from '../core/pixel-gallery-store';

/** Um item sem catálogo: o seletor não sai procurando capas na rede. */
const GAME: PickedGame = { name: 'Meu jogo', coverUrl: null, source: 'manual' };

async function settle(fixture: ComponentFixture<unknown>, ok: () => boolean, max = 300): Promise<void> {
  for (let i = 0; i < max && !ok(); i++) {
    await new Promise((r) => setTimeout(r, 10));
    fixture.detectChanges();
    await fixture.whenStable();
  }
}

function filesOf(...files: File[]): DataTransfer {
  const dt = new DataTransfer();
  for (const f of files) dt.items.add(f);
  return dt;
}

describe('a capa do aparelho no seletor de capa', () => {
  let timeout: number;
  beforeEach(() => {
    // encolher a imagem leva tempo no navegador dos testes
    timeout = jasmine.DEFAULT_TIMEOUT_INTERVAL;
    jasmine.DEFAULT_TIMEOUT_INTERVAL = 20_000;
    return deleteDatabase(IMAGES_DB);
  });
  afterEach(() => (jasmine.DEFAULT_TIMEOUT_INTERVAL = timeout));
  afterAll(() => deleteDatabase(IMAGES_DB));

  async function make() {
    TestBed.configureTestingModule({
      imports: [CoverPicker],
      providers: [provideZonelessChangeDetection(), { provide: Cloud, useValue: { ready: Promise.resolve(), config: () => null } }],
    });
    const fixture = TestBed.createComponent(CoverPicker);
    fixture.componentRef.setInput('game', GAME);
    fixture.componentRef.setInput('kind', 'jogos');
    const changed: PickedGame[] = [];
    fixture.componentInstance.changed.subscribe((g) => changed.push(g));
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement as HTMLElement, changed };
  }

  it('Escolher do aparelho guarda a imagem e ela entra na frente, escolhida, com o crédito "Do aparelho"', async () => {
    const { fixture, el, changed } = await make();
    const input = el.querySelector<HTMLInputElement>('input[type="file"]')!;
    expect(el.querySelector('.aparelho-btn')?.textContent?.trim()).toBe('Escolher do aparelho');
    input.files = filesOf(new File([await samplePng(600, 800)], 'capa.png', { type: 'image/png' })).files;
    input.dispatchEvent(new Event('change'));
    await settle(fixture, () => changed.length > 0);
    const id = localImageId(changed[0].coverUrl ?? '');
    expect(id).not.toBeNull();
    // o item continua o mesmo (a fonte do catálogo não muda), só a capa
    expect(changed[0].name).toBe('Meu jogo');
    expect(await TestBed.inject(ImageStore).get(id!)).not.toBeNull();
    const first = el.querySelector('.grade .capa')!;
    expect(first.classList).toContain('on');
    expect(first.querySelector('.de')?.textContent).toBe('Do aparelho');
  });

  it('Ctrl+V com uma imagem copiada vira a capa; colada num campo de texto, não', async () => {
    const { fixture, changed } = await make();
    const png = new File([await samplePng(500, 500)], 'print.png', { type: 'image/png' });

    // o colar num campo de texto de fora (o título, a descrição) é desse campo
    const field = document.createElement('input');
    document.body.append(field);
    try {
      field.dispatchEvent(new ClipboardEvent('paste', { clipboardData: filesOf(png), bubbles: true, cancelable: true }));
      await new Promise((r) => setTimeout(r, 300));
      expect(changed.length).toBe(0);
    } finally {
      field.remove();
    }

    const paste = new ClipboardEvent('paste', { clipboardData: filesOf(png), bubbles: true, cancelable: true });
    document.body.dispatchEvent(paste);
    expect(paste.defaultPrevented).toBeTrue();
    await settle(fixture, () => changed.length > 0);
    expect(localImageId(changed[0].coverUrl ?? '')).not.toBeNull();
  });

  it('soltar uma imagem em cima das capas vira a capa; soltar outra coisa diz o que aconteceu', async () => {
    const { fixture, el, changed } = await make();
    const over = new DragEvent('dragover', { dataTransfer: filesOf(new File(['x'], 'a.txt', { type: 'text/plain' })), bubbles: true, cancelable: true });
    el.querySelector('.grade')!.dispatchEvent(over);
    fixture.detectChanges();
    expect(over.defaultPrevented).toBeTrue();
    expect(el.classList).toContain('soltando');

    el.dispatchEvent(new DragEvent('drop', { dataTransfer: filesOf(new File(['x'], 'a.txt', { type: 'text/plain' })), bubbles: true, cancelable: true }));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(el.classList).not.toContain('soltando');
    expect(el.querySelector('.aviso')?.textContent).toContain('não é uma imagem');

    const png = new File([await samplePng(400, 300)], 'capa.png', { type: 'image/png' });
    el.dispatchEvent(new DragEvent('drop', { dataTransfer: filesOf(png), bubbles: true, cancelable: true }));
    await settle(fixture, () => changed.length > 0);
    expect(localImageId(changed[0].coverUrl ?? '')).not.toBeNull();
    expect(el.querySelector('.aviso')).toBeNull();
  });

  it('duas imagens seguidas: vale a última, mesmo que a primeira termine de guardar depois', async () => {
    const { fixture, changed } = await make();
    const big = new File([await samplePng(1800, 1800)], 'grande.png', { type: 'image/png' });
    const small = new File([await samplePng(200, 200)], 'pequena.png', { type: 'image/png' });
    document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: filesOf(big), bubbles: true, cancelable: true }));
    document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: filesOf(small), bubbles: true, cancelable: true }));
    // as duas guardadas (a grande pode terminar depois da pequena)
    const store = TestBed.inject(ImageStore);
    await settle(fixture, () => store.count() === 2 && !(fixture.nativeElement as HTMLElement).querySelector('.guardando'));
    expect(changed.length).toBe(1);
    const last = await store.get(localImageId(changed.at(-1)!.coverUrl ?? '')!);
    expect(last?.largura).toBe(200);
  });

  it('o arquivo que não abre como imagem fica no aviso, e a capa não muda', async () => {
    const { fixture, el, changed } = await make();
    const input = el.querySelector<HTMLInputElement>('input[type="file"]')!;
    input.files = filesOf(new File(['não sou foto'], 'quebrada.png', { type: 'image/png' })).files;
    input.dispatchEvent(new Event('change'));
    await settle(fixture, () => !!el.querySelector('.aviso'));
    expect(el.querySelector('.aviso')?.textContent).toContain('não abre aqui');
    expect(changed.length).toBe(0);
  });
});

describe('a pixel art da galeria como capa', () => {
  const at = '2026-11-16T10:00:00.000Z';
  const pieces = [
    { id: 'gato', title: 'Gato preto', art: ['2x2', '12/21'], createdAt: at, at, tags: ['bichos'] },
    { id: 'sol', title: 'Sol', art: ['3x3', '010/111/010'], createdAt: at, at: '2026-11-16T11:00:00.000Z' },
  ];
  let timeout: number;
  beforeEach(() => {
    timeout = jasmine.DEFAULT_TIMEOUT_INTERVAL;
    jasmine.DEFAULT_TIMEOUT_INTERVAL = 20_000;
    return deleteDatabase(IMAGES_DB);
  });
  afterEach(() => {
    jasmine.DEFAULT_TIMEOUT_INTERVAL = timeout;
    localStorage.removeItem(PIXEL_GALLERY_KEY);
  });
  afterAll(() => deleteDatabase(IMAGES_DB));

  async function make(list: unknown[], game: PickedGame = GAME) {
    localStorage.setItem(PIXEL_GALLERY_KEY, JSON.stringify({ pieces: list, removed: {} }));
    TestBed.configureTestingModule({
      imports: [CoverPicker],
      providers: [provideZonelessChangeDetection(), { provide: Cloud, useValue: { ready: Promise.resolve(), config: () => null } }],
    });
    const fixture = TestBed.createComponent(CoverPicker);
    fixture.componentRef.setInput('game', game);
    fixture.componentRef.setInput('kind', 'jogos');
    const changed: PickedGame[] = [];
    fixture.componentInstance.changed.subscribe((g) => changed.push(g));
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement as HTMLElement, changed };
  }

  it('o Pixel art abre a tira com todas (a mexida por último primeiro), a busca acha pelo nome e pela tag', async () => {
    const { fixture, el } = await make(pieces);
    el.querySelector<HTMLButtonElement>('.pixel-btn')!.click();
    await fixture.whenStable();
    const names = () => Array.from(el.querySelectorAll('.obra-nome'), (n) => n.textContent);
    expect(names()).toEqual(['Sol', 'Gato preto']);
    const search = el.querySelector<HTMLInputElement>('.galeria input[type="search"]')!;
    search.value = 'bich';
    search.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(names()).toEqual(['Gato preto']);
    search.value = 'dragão';
    search.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(names()).toEqual([]);
    expect(el.querySelector('.galeria .dica-capa')?.textContent).toContain('dragão');
  });

  it('tocar numa obra a imprime em PNG e ela vira a capa, com o crédito "Pixel art"; a tira fecha', async () => {
    const { fixture, el, changed } = await make(pieces);
    el.querySelector<HTMLButtonElement>('.pixel-btn')!.click();
    await fixture.whenStable();
    el.querySelector<HTMLButtonElement>('.obra')!.click();
    await settle(fixture, () => changed.length > 0);
    const id = localImageId(changed[0].coverUrl ?? '');
    const stored = await TestBed.inject(ImageStore).get(id!);
    expect(stored?.tipo).toBe('image/png');
    expect([stored?.largura, stored?.altura]).toEqual([720, 900]);
    await settle(fixture, () => !el.querySelector('.galeria'));
    expect(el.querySelector('.galeria')).toBeNull();
    expect(el.querySelector('.capa.on .de')?.textContent).toBe('Pixel art');
  });

  it('a capa de pixel art que já estava diz "Pixel art" ao abrir de novo; a foto do aparelho, "Do aparelho"', async () => {
    const store = (await make([])).fixture.debugElement.injector.get(ImageStore);
    const png = await store.addPng(await samplePng(72, 90), 72, 90);
    const photo = await store.add(await samplePng(300, 300));
    TestBed.resetTestingModule();
    const pixel = await make([], { ...GAME, coverUrl: `murall://imagem/${png.id}` });
    await settle(pixel.fixture, () => pixel.el.querySelector('.capa.on .de')?.textContent === 'Pixel art');
    expect(pixel.el.querySelector('.capa.on .de')?.textContent).toBe('Pixel art');
    TestBed.resetTestingModule();
    const own = await make([], { ...GAME, coverUrl: `murall://imagem/${photo.id}` });
    await settle(own.fixture, () => false, 20);
    expect(own.el.querySelector('.capa.on .de')?.textContent).toBe('Do aparelho');
  });

  it('com a galeria vazia, a tira diz isso', async () => {
    const { fixture, el } = await make([]);
    el.querySelector<HTMLButtonElement>('.pixel-btn')!.click();
    await fixture.whenStable();
    expect(el.querySelector('.galeria input')).toBeNull();
    expect(el.querySelector('.galeria .dica-capa')?.textContent).toContain('ainda está vazia');
  });
});
