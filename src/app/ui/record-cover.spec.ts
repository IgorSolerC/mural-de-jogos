import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PickedGame } from '../core/review';
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
});
