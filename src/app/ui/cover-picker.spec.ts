import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Cloud } from '../core/cloud-config';
import { deleteDatabase } from '../core/erase-save';
import { IMAGES_DB, ImageStore } from '../core/image-store';
import { localImageId } from '../core/images';
import { samplePng } from '../core/images.spec';
import { PickedGame } from '../core/review';
import { CoverPicker } from './cover-picker';

/** Um item sem catálogo: o seletor não sai procurando capas na rede. */
const GAME: PickedGame = { name: 'Meu jogo', coverUrl: null, source: 'manual' };

async function settle(fixture: ComponentFixture<unknown>, ok: () => boolean): Promise<void> {
  for (let i = 0; i < 300 && !ok(); i++) {
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
