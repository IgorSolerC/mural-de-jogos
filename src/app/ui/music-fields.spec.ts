import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AlbumTrack, GameLookup } from '../core/game-lookup';
import { PickedGame } from '../core/review';
import { MusicFields } from './music-fields';

const preview = (n: number) => `https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview1/v4/aa/bb/cc/faixa${n}.plus.aac.p.m4a`;
const TRACKS: AlbumTrack[] = [
  { n: 1, name: 'Airbag', sample: preview(1) },
  { n: 2, name: 'Paranoid Android', sample: preview(2) },
];

const album = (extra: Partial<PickedGame> = {}): PickedGame => ({ name: 'OK Computer', coverUrl: null, source: 'itunes', sourceId: 'album/10', form: 'album', by: 'Radiohead', ...extra });
const manual = (extra: Partial<PickedGame> = {}): PickedGame => ({ name: 'Fita demo', coverUrl: null, source: 'manual', ...extra });

describe('os campos da ficha de música no editor', () => {
  let fixture: ComponentFixture<MusicFields>;
  let el: HTMLElement;
  let game: PickedGame;
  let choices: jasmine.Spy;

  /** Monta os campos como o editor: o item que eles devolvem volta para eles. */
  async function show(first: PickedGame, inputs: Record<string, unknown> = {}, tracks: AlbumTrack[] = TRACKS): Promise<void> {
    choices = jasmine.createSpy('sampleChoices').and.callFake(async (g: PickedGame) => (g.source === 'itunes' ? tracks : []));
    TestBed.configureTestingModule({
      imports: [MusicFields],
      providers: [provideZonelessChangeDetection(), { provide: GameLookup, useValue: { sampleChoices: choices } }],
    });
    fixture = TestBed.createComponent(MusicFields);
    game = first;
    fixture.componentRef.setInput('game', game);
    for (const [k, v] of Object.entries(inputs)) fixture.componentRef.setInput(k, v);
    fixture.componentInstance.gameChange.subscribe((g) => {
      game = g;
      fixture.componentRef.setInput('game', g);
    });
    await fixture.whenStable();
    await fixture.whenStable();
    el = fixture.nativeElement as HTMLElement;
  }

  const radio = (label: string) => Array.from(el.querySelectorAll<HTMLLabelElement>('label.opcao')).find((l) => l.textContent!.trim() === label)?.querySelector('input') ?? null;
  const pick = async (label: string) => {
    radio(label)!.click();
    await fixture.whenStable();
  };
  const type = async (selector: string, value: string) => {
    const input = el.querySelector<HTMLInputElement>(selector)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  };

  afterEach(() => fixture?.destroy());

  it('o álbum recém-escolhido na busca já sai tocando a primeira faixa, com o nome dela', async () => {
    await show(album(), { fresh: true });
    expect(game.sample).toBe(preview(1));
    expect(game.sampleTitle).toBe('Airbag');
    expect(radio('Trecho do catálogo')!.checked).toBeTrue();
    expect(Array.from(el.querySelectorAll('select option')).map((o) => o.textContent)).toEqual(['1. Airbag', '2. Paranoid Android']);
  });

  it('abrindo uma ficha que já existia sem som, ela continua sem som', async () => {
    await show(album());
    expect(game.sample).toBeUndefined();
    expect(radio('Nada')!.checked).toBeTrue();
    // mas o trecho do catálogo está à mão
    expect(radio('Trecho do catálogo')).not.toBeNull();
  });

  it('escolher outra faixa troca o trecho e o nome da faixa de destaque', async () => {
    await show(album(), { fresh: true });
    const select = el.querySelector<HTMLSelectElement>('select')!;
    select.value = preview(2);
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    expect(game).toEqual(jasmine.objectContaining({ sample: preview(2), sampleTitle: 'Paranoid Android' }));
  });

  it('"Nada" tira o som e a faixa de destaque; o trecho do catálogo volta com um toque', async () => {
    await show(album(), { fresh: true });
    await pick('Nada');
    expect(game.sample).toBeUndefined();
    expect(game.sampleTitle).toBeUndefined();
    await pick('Trecho do catálogo');
    expect(game.sample).toBe(preview(1));
  });

  it('a música solta do catálogo toca o trecho dela, sem escolha de faixa nem nome de destaque', async () => {
    const song = album({ name: 'Karma Police', sourceId: 'song/20', form: 'faixa', sample: preview(1) });
    await show(song, {}, [TRACKS[0]]);
    expect(radio('Trecho do catálogo')!.checked).toBeTrue();
    expect(el.querySelector('select')).toBeNull();
    await pick('Nada');
    await pick('Trecho do catálogo');
    expect(game.sample).toBe(preview(1));
    expect(game.sampleTitle).toBeUndefined();
  });

  it('um link meu: o que toca vai para a ficha; o que não toca fica só no campo, com o aviso', async () => {
    await show(album(), { fresh: true });
    await pick('Um link meu');
    expect(game.sample).toBeUndefined();
    await type('input.link', 'https://youtu.be/dQw4w9WgXcQ');
    expect(game.sample).toBe('https://youtu.be/dQw4w9WgXcQ');
    expect(game.sampleTitle).toBeUndefined();
    expect(fixture.componentInstance.problem()).toBeNull();
    await type('input.link', 'https://exemplo.com/pagina');
    expect(game.sample).toBeUndefined();
    expect(fixture.componentInstance.problem()).toContain('não é de um som');
    expect(el.querySelector('.field-error')?.textContent).toContain('não é de um som');
    expect(el.querySelector('input.link')!.getAttribute('aria-invalid')).toBe('true');
    // apagar o link desfaz o aviso: o som é opcional
    await type('input.link', '');
    expect(fixture.componentInstance.problem()).toBeNull();
  });

  it('a ficha com um link colado abre com ele no campo', async () => {
    await show(album({ sample: 'https://exemplo.com/musica.mp3' }));
    expect(radio('Um link meu')!.checked).toBeTrue();
    expect(el.querySelector<HTMLInputElement>('input.link')!.value).toBe('https://exemplo.com/musica.mp3');
  });

  it('o que foi escrito à mão escolhe se é álbum ou música, e não tem trecho do catálogo', async () => {
    await show(manual());
    expect(choices).not.toHaveBeenCalled();
    expect(radio('Trecho do catálogo')).toBeNull();
    expect(radio('Álbum')!.checked).toBeTrue();
    await pick('Música');
    expect(game.form).toBe('faixa');
  });

  it('o que veio do catálogo já diz o que é: sem a escolha de álbum ou música', async () => {
    await show(album());
    expect(radio('Álbum')).toBeNull();
    expect(radio('Música')).toBeNull();
  });

  it('o artista é escrito, sugerido pelos que o mural já tem, e arrumado ao sair do campo', async () => {
    await show(album(), { artist: 'Radiohead', artists: ['Radiohead', 'Legião Urbana'] });
    const input = el.querySelector<HTMLInputElement>('input[type="text"]')!;
    expect(input.value).toBe('Radiohead');
    expect(Array.from(el.querySelectorAll('datalist option')).map((o) => o.getAttribute('value'))).toEqual(['Radiohead', 'Legião Urbana']);
    expect(el.querySelector('.dica')!.textContent).toContain('aba de Radiohead');
    await type('input[type="text"]', '  The   Smile ');
    expect(el.querySelector('.dica')!.textContent).toContain('aba nova');
    input.dispatchEvent(new Event('blur'));
    await fixture.whenStable();
    expect(fixture.componentInstance.artist()).toBe('The Smile');
    await type('input[type="text"]', '');
    expect(fixture.componentInstance.artist()).toBeNull();
    expect(el.querySelector('.dica')!.textContent).toContain('Sem artista');
  });

  it('o editor abrindo de novo recomeça o campo do link, mesmo com o mesmo item', async () => {
    await show(manual());
    await pick('Um link meu');
    await type('input.link', 'https://exemplo.com/pagina');
    expect(fixture.componentInstance.problem()).not.toBeNull();
    fixture.componentRef.setInput('session', 1);
    await fixture.whenStable();
    expect(fixture.componentInstance.problem()).toBeNull();
    expect(radio('Nada')!.checked).toBeTrue();
  });

  it('sem o catálogo responder, o link colado continua valendo', async () => {
    choices = jasmine.createSpy('sampleChoices').and.rejectWith(new Error('fora do ar'));
    TestBed.configureTestingModule({
      imports: [MusicFields],
      providers: [provideZonelessChangeDetection(), { provide: GameLookup, useValue: { sampleChoices: choices } }],
    });
    fixture = TestBed.createComponent(MusicFields);
    fixture.componentRef.setInput('game', album());
    fixture.componentRef.setInput('fresh', true);
    await fixture.whenStable();
    await fixture.whenStable();
    el = fixture.nativeElement as HTMLElement;
    expect(radio('Trecho do catálogo')).toBeNull();
    expect(radio('Um link meu')).not.toBeNull();
    expect(el.querySelector('fieldset[aria-busy]')).toBeNull();
  });
});
