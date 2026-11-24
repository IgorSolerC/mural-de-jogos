import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { deleteDatabase } from '../core/erase-save';
import { IMAGES_DB, ImageStore } from '../core/image-store';
import { DEFAULT_PALETTE } from '../core/pixel-art';
import { samplePng } from '../core/images.spec';
import { COVER_H, COVER_W, coverScale, pixelCoverPng } from '../core/pixel-cover';
import { PickedGame } from '../core/review';
import { AudioTrack } from './audio-track';
import { RecordCover } from './record-cover';

const PREVIEW = 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview1/v4/aa/bb/cc/trecho.plus.aac.p.m4a';
/** Uma capa que sempre abre (um ponto transparente): a de um endereço de mentira cairia no envelope pardo. */
const ART = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';

const album = (extra: Partial<PickedGame> = {}): PickedGame => ({ name: 'OK Computer', coverUrl: ART, source: 'itunes', sourceId: 'album/1', form: 'album', ...extra });

describe('a capa de vinil das fichas de música', () => {
  let fixture: ComponentFixture<RecordCover>;
  let el: HTMLElement;

  async function show(game: PickedGame, inputs: Record<string, unknown> = {}): Promise<void> {
    TestBed.configureTestingModule({ imports: [RecordCover], providers: [provideZonelessChangeDetection()] });
    fixture = TestBed.createComponent(RecordCover);
    fixture.componentRef.setInput('game', game);
    for (const [k, v] of Object.entries(inputs)) fixture.componentRef.setInput(k, v);
    await fixture.whenStable();
    el = fixture.nativeElement as HTMLElement;
  }

  /** O player chega num pedaço à parte do site (@defer): espera ele ser desenhado. */
  async function played(): Promise<void> {
    for (let i = 0; i < 40 && !el.querySelector('app-audio-track .vitrola'); i++) {
      await new Promise((r) => setTimeout(r, 10));
      await fixture.whenStable();
    }
  }

  afterEach(() => fixture?.destroy());

  it('desenha a capa do álbum e o disco saindo dela, sem montar o player', async () => {
    await show(album({ sample: PREVIEW }));
    expect(el.querySelector('.capa img')?.getAttribute('src')).toBe(ART);
    expect(el.querySelector('.disco .sulcos')).not.toBeNull();
    expect(el.querySelector('app-audio-track')).toBeNull();
    expect(el.querySelector('audio, iframe')).toBeNull();
  });

  it('sem capa, o envelope pardo leva o nome do disco', async () => {
    await show(album({ coverUrl: null }));
    expect(el.querySelector('.capa')!.classList).toContain('parda');
    expect(el.querySelector('.capa-nome')?.textContent).toBe('OK Computer');
    expect(el.querySelector('.capa img')).toBeNull();
  });

  it('a capa que não abre vira o envelope pardo', async () => {
    await show(album());
    el.querySelector('.capa img')!.dispatchEvent(new Event('error'));
    await fixture.whenStable();
    expect(el.querySelector('.capa')!.classList).toContain('parda');
  });

  it('o botão do disco só aparece com um som que toque', async () => {
    await show(album());
    expect(el.querySelector('.tocar-disco')).toBeNull();
    fixture.componentRef.setInput('game', album({ sample: 'https://exemplo.com/pagina' }));
    await fixture.whenStable();
    expect(el.querySelector('.tocar-disco')).toBeNull();
    fixture.componentRef.setInput('game', album({ sample: 'https://youtu.be/dQw4w9WgXcQ' }));
    await fixture.whenStable();
    expect(el.querySelector('.tocar-disco')).not.toBeNull();
  });

  it('o botão diz o que toca: a faixa de destaque e o disco', async () => {
    await show(album({ sample: PREVIEW, sampleTitle: 'Let Down' }));
    expect(el.querySelector('.tocar-disco')!.getAttribute('aria-label')).toBe('Tocar: Let Down, de OK Computer');
    fixture.componentRef.setInput('game', { ...album({ sample: PREVIEW }), name: 'Karma Police', form: 'faixa' });
    await fixture.whenStable();
    expect(el.querySelector('.tocar-disco')!.getAttribute('aria-label')).toBe('Tocar: Karma Police');
  });

  it('enfiado na capa (as fichas pequenas) ou em segredo, o disco não toca', async () => {
    await show(album({ sample: PREVIEW }), { tucked: true });
    expect(el.classList).toContain('enfiado');
    expect(el.querySelector('.tocar-disco')).toBeNull();
    fixture.componentRef.setInput('tucked', false);
    fixture.componentRef.setInput('still', true);
    await fixture.whenStable();
    expect(el.querySelector('.tocar-disco')).toBeNull();
  });

  it('tocar monta o player de verdade no lugar do desenho, com a capa do álbum e o som do link', async () => {
    await show(album({ sample: PREVIEW }));
    // o toque no disco não pode abrir a ficha que está por baixo
    let bubbled = false;
    el.addEventListener('click', () => (bubbled = true));
    el.querySelector<HTMLButtonElement>('.tocar-disco')!.click();
    await played();
    expect(bubbled).toBeFalse();
    const player = el.querySelector('app-audio-track')!;
    expect(player).not.toBeNull();
    expect(player.classList).toContain('solta');
    expect(player.querySelector('audio')?.getAttribute('src')).toBe(PREVIEW);
    expect(player.querySelector('.capa img')?.getAttribute('src')).toBe(ART);
    // só o vinil: sem a barra de arrastar (ela é da leitura)
    expect(player.querySelector('.barra')).toBeNull();
    expect(el.querySelectorAll('.vitrola').length).toBe(1);
  });

  it('na leitura, o player vem com a barra de arrastar', async () => {
    await show(album({ sample: PREVIEW }), { bar: true });
    el.querySelector<HTMLButtonElement>('.tocar-disco')!.click();
    await played();
    expect(el.querySelector('app-audio-track .barra')).not.toBeNull();
  });

  it('trocar o link volta ao disco parado (o som de antes não continua)', async () => {
    await show(album({ sample: PREVIEW }));
    el.querySelector<HTMLButtonElement>('.tocar-disco')!.click();
    await fixture.whenStable();
    expect(el.querySelector('app-audio-track')).not.toBeNull();
    fixture.componentRef.setInput('game', album({ sample: 'https://exemplo.com/outra.mp3' }));
    await fixture.whenStable();
    expect(el.querySelector('app-audio-track')).toBeNull();
    expect(el.querySelector('.tocar-disco')).not.toBeNull();
  });

  describe('a capa de pixel art e o aro (pedido do dono, 24/nov)', () => {
    beforeEach(() => deleteDatabase(IMAGES_DB));
    afterAll(() => deleteDatabase(IMAGES_DB));

    /** Uma pixel art de 16 × 16 toda pintada, guardada como capa (o PNG 4:5 com o desenho no meio). */
    async function storedPixelCover(): Promise<string> {
      const rows = Array.from({ length: 16 }, () => '1'.repeat(16));
      const png = (await pixelCoverPng({ w: 16, h: 16, rows, palette: DEFAULT_PALETTE, colors: {} }))!;
      TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
      const stored = await TestBed.inject(ImageStore).addPng(png.blob, png.width, png.height);
      TestBed.resetTestingModule();
      return `murall://imagem/${stored.id}`;
    }
    async function filled(root: () => Element | null): Promise<HTMLImageElement> {
      for (let i = 0; i < 100 && !root()?.querySelector('.capa img.pixel-cheia'); i++) {
        await new Promise((r) => setTimeout(r, 20));
        await fixture.whenStable();
      }
      return root()!.querySelector<HTMLImageElement>('.capa img.pixel-cheia')!;
    }

    it('o desenho enche a capa do disco, sem a moldura do transparente, e nítido', async () => {
      const cover = await storedPixelCover();
      await show(album({ coverUrl: cover }));
      const img = await filled(() => el);
      expect(img).withContext('a capa ampliada').not.toBeNull();
      // o desenho de 16 × 16 (560 px) cobre a capa: a imagem inteira fica maior, com o desenho no meio dela
      const side = 16 * coverScale(16, 16);
      expect(parseFloat(img.style.width)).toBeCloseTo((COVER_W / side) * 100, 3);
      expect(parseFloat(img.style.height)).toBeCloseTo((COVER_H / side) * 100, 3);
      const capa = el.querySelector('.capa')!.getBoundingClientRect();
      const r = img.getBoundingClientRect();
      const art = { left: r.left + ((COVER_W - side) / 2 / COVER_W) * r.width, top: r.top + ((COVER_H - side) / 2 / COVER_H) * r.height };
      expect(art.left).toBeCloseTo(capa.left, 0);
      expect(art.top).toBeCloseTo(capa.top, 0);
      expect(getComputedStyle(img).imageRendering).toBe('pixelated');
    });

    it('a foto (ou o link) do álbum fica como está, e a imagem guardada que não é pixel art também', async () => {
      await show(album());
      await new Promise((r) => setTimeout(r, 50));
      expect(el.querySelector('.capa img')!.classList).not.toContain('pixel-cheia');
      expect(el.querySelector<HTMLImageElement>('.capa img')!.style.width).toBe('');
      fixture.destroy();
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
      const photo = await TestBed.inject(ImageStore).addPng(await samplePng(600, 600), 600, 600);
      TestBed.resetTestingModule();
      await show(album({ coverUrl: `murall://imagem/${photo.id}` }));
      for (let i = 0; i < 50 && !el.querySelector<HTMLImageElement>('.capa img')?.complete; i++) await new Promise((r) => setTimeout(r, 20));
      await new Promise((r) => setTimeout(r, 50));
      await fixture.whenStable();
      const img = el.querySelector<HTMLImageElement>('.capa img')!;
      expect(img.getAttribute('src')).toMatch(/^blob:/);
      expect(img.classList).not.toContain('pixel-cheia');
      expect(img.style.opacity).toBe('');
    });

    it('tocando, a capa do player também enche', async () => {
      const cover = await storedPixelCover();
      await show(album({ coverUrl: cover, sample: PREVIEW }));
      el.querySelector<HTMLButtonElement>('.tocar-disco')!.click();
      await played();
      expect(await filled(() => el.querySelector('app-audio-track'))).not.toBeNull();
    });

    it('as capas do mural de músicas não têm o aro cinza; o widget Áudio continua com o dele', async () => {
      await show(album());
      expect(getComputedStyle(el.querySelector('.capa-gasta')!).backgroundImage).toBe('none');
      fixture.destroy();
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ imports: [AudioTrack], providers: [provideZonelessChangeDetection()] });
      const widget = TestBed.createComponent(AudioTrack);
      widget.componentRef.setInput('args', ['https://exemplo.com/som.mp3', 'vinil']);
      await widget.whenStable();
      const ring = (widget.nativeElement as HTMLElement).querySelector('.capa-gasta');
      expect(ring).withContext('o vinil do widget').not.toBeNull();
      expect(getComputedStyle(ring!).backgroundImage).toContain('radial-gradient');
      widget.destroy();
    });
  });
});
