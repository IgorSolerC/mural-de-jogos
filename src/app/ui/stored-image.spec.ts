import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ACCOUNT_KEY, SESSION_KEY } from '../core/cloud-account';
import { Cloud } from '../core/cloud-config';
import { deleteDatabase } from '../core/erase-save';
import { IMAGES_DB, ImageStore } from '../core/image-store';
import { localImageUrl } from '../core/images';
import { samplePng } from '../core/images.spec';
import { PickedGame } from '../core/review';
import { CoverSleeve } from './cover-sleeve';
import { MuralSrc } from './stored-image';

@Component({
  imports: [MuralSrc],
  template: `<img [muralSrc]="url()" alt="" (error)="errors = errors + 1" />`,
})
class Host {
  readonly url = signal<string | null>(null);
  errors = 0;
}

/** Sem nuvem: a guardada que não está aqui não tem de onde vir. */
const NO_CLOUD = { provide: Cloud, useValue: { ready: Promise.resolve(), config: () => null } };

async function settle(fixture: { whenStable(): Promise<unknown>; detectChanges(): void }, ok: () => boolean): Promise<void> {
  for (let i = 0; i < 100 && !ok(); i++) {
    await new Promise((r) => setTimeout(r, 10));
    fixture.detectChanges();
    await fixture.whenStable();
  }
}

describe('a imagem guardada pelo Murall num <img> (MuralSrc)', () => {
  beforeEach(() => deleteDatabase(IMAGES_DB));
  afterAll(() => deleteDatabase(IMAGES_DB));

  function make() {
    TestBed.configureTestingModule({ imports: [Host], providers: [provideZonelessChangeDetection(), NO_CLOUD] });
    const fixture = TestBed.createComponent(Host);
    const img = (fixture.nativeElement as HTMLElement).querySelector('img')!;
    // o endereço de mentira sai para a rede de verdade: só os eventos do teste contam
    img.addEventListener('error', (e) => e.isTrusted && e.stopImmediatePropagation(), true);
    return { fixture, img };
  }

  it('o link vai como está; sem nada, o <img> fica sem src', async () => {
    const { fixture, img } = make();
    await fixture.whenStable();
    expect(img.hasAttribute('src')).toBeFalse();
    fixture.componentInstance.url.set('https://x.test/capa.jpg');
    await fixture.whenStable();
    expect(img.getAttribute('src')).toBe('https://x.test/capa.jpg');
    expect(img.hasAttribute('data-esperando')).toBeFalse();
  });

  it('a guardada neste aparelho aparece pelo endereço blob: dela', async () => {
    const { fixture, img } = make();
    const image = await TestBed.inject(ImageStore).add(await samplePng(300, 200));
    fixture.componentInstance.url.set(localImageUrl(image.id));
    await settle(fixture, () => !!img.getAttribute('src'));
    expect(img.getAttribute('src')).toMatch(/^blob:/);
    expect(img.hasAttribute('data-esperando')).toBeFalse();
    expect(fixture.componentInstance.errors).toBe(0);
  });

  it('a que não está em lugar nenhum dispara o error do <img> (quem usa cai no "sem capa")', async () => {
    const { fixture, img } = make();
    fixture.componentInstance.url.set(localImageUrl('n'.repeat(22)));
    await settle(fixture, () => fixture.componentInstance.errors > 0);
    expect(fixture.componentInstance.errors).toBe(1);
    expect(img.hasAttribute('src')).toBeFalse();
  });

  it('na visita (sem conta), a capa guardada que não está aqui vem pelo endereço público da nuvem', async () => {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(ACCOUNT_KEY);
    TestBed.configureTestingModule({
      imports: [CoverSleeve],
      providers: [provideZonelessChangeDetection(), { provide: Cloud, useValue: { ready: Promise.resolve(), config: () => ({ api: 'https://api.teste', googleClientId: 'x' }) } }],
    });
    const fixture = TestBed.createComponent(CoverSleeve);
    const id = 'v'.repeat(22);
    fixture.componentRef.setInput('game', { name: 'Hades', coverUrl: localImageUrl(id), source: 'manual' });
    const el = fixture.nativeElement as HTMLElement;
    await settle(fixture, () => !!el.querySelector('img')?.getAttribute('src'));
    expect(el.querySelector('img')?.getAttribute('src')).toBe(`https://api.teste/v1/imagens/${id}`);
  });

  it('a capa da ficha guardada no aparelho aparece na capinha, e a que falta vira "sem capa"', async () => {
    TestBed.configureTestingModule({ imports: [CoverSleeve], providers: [provideZonelessChangeDetection(), NO_CLOUD] });
    const image = await TestBed.inject(ImageStore).add(await samplePng(300, 400));
    const fixture = TestBed.createComponent(CoverSleeve);
    const game: PickedGame = { name: 'Celeste', coverUrl: localImageUrl(image.id), source: 'manual' };
    fixture.componentRef.setInput('game', game);
    const el = fixture.nativeElement as HTMLElement;
    await settle(fixture, () => !!el.querySelector('img')?.getAttribute('src'));
    expect(el.querySelector('img')?.getAttribute('src')).toMatch(/^blob:/);

    fixture.componentRef.setInput('game', { ...game, coverUrl: localImageUrl('f'.repeat(22)) });
    await settle(fixture, () => !!el.querySelector('.blank'));
    expect(el.querySelector('img')).toBeNull();
    expect(el.querySelector('.note')?.textContent).toBe('sem capa');
  });
});
