import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { GameLookup } from '../core/game-lookup';
import { PickedGame, RatedKey, Review, Status } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { ReviewEditor } from './review-editor';

const preview = (n: number) => `https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview1/v4/aa/bb/cc/faixa${n}.plus.aac.p.m4a`;
const TRACKS = [
  { n: 1, name: 'Airbag', sample: preview(1) },
  { n: 2, name: 'Paranoid Android', sample: preview(2) },
];
const album = (extra: Partial<PickedGame> = {}): PickedGame => ({ name: 'OK Computer', coverUrl: null, source: 'itunes', sourceId: 'album/10', form: 'album', by: 'Radiohead', year: '1997', ...extra });

/** O que o teste mexe por dentro do editor, como a pessoa mexeria na tela. */
type Inside = {
  pick(game: PickedGame): void;
  status: { set(s: Status): void };
  setScore(k: RatedKey, v: number): void;
  save(e: Event): void;
  noteCategory: { (): string | null; set(v: string | null): void };
  game(): PickedGame | null;
  missingText(): string;
};

describe('o editor no mural de músicas', () => {
  let fixture: ComponentFixture<ReviewEditor>;
  let store: ReviewStore;
  let el: HTMLElement;
  let primary: jasmine.Spy;
  const inside = () => fixture.componentInstance as unknown as Inside;

  beforeEach(async () => {
    localStorage.clear();
    primary = jasmine.createSpy('primaryArtist').and.resolveTo(null);
    TestBed.configureTestingModule({
      imports: [ReviewEditor],
      providers: [
        provideZonelessChangeDetection(),
        { provide: GameLookup, useValue: { sampleChoices: async (g: PickedGame) => (g.source === 'itunes' ? TRACKS : []), primaryArtist: primary, sourceName: () => 'loja do iTunes', search: async () => [] } },
      ],
    });
    store = TestBed.inject(ReviewStore);
    fixture = TestBed.createComponent(ReviewEditor);
    el = fixture.nativeElement as HTMLElement;
    document.body.appendChild(el);
    await fixture.whenStable();
    fixture.componentInstance.open(undefined, undefined, undefined, undefined, 'musicas');
    await fixture.whenStable();
  });

  afterEach(() => {
    el.remove();
    localStorage.clear();
  });

  /** Os campos da música chegam num pedaço à parte (@defer), e o catálogo responde depois: espera os dois. */
  async function fields(): Promise<HTMLElement> {
    for (let i = 0; i < 60 && !el.querySelector('app-music-fields'); i++) {
      await new Promise((r) => setTimeout(r, 10));
      await fixture.whenStable();
    }
    await new Promise((r) => setTimeout(r, 10));
    await fixture.whenStable();
    return el.querySelector<HTMLElement>('app-music-fields')!;
  }

  function fill(): void {
    inside().status.set('platinado');
    inside().setScore('envolvimento', 10);
    inside().setScore('letra', 9);
    inside().setScore('vocal', 9);
    inside().setScore('instrumental', 10);
  }

  const saved = (): Review | undefined => store.reviews().find((r) => r.kind === 'musicas');

  it('pergunta pelo álbum ou pela música, e a prévia já é a ficha com o vinil', () => {
    expect(el.querySelector('app-game-search .pergunta')!.textContent).toBe('Qual álbum ou música?');
    expect(el.querySelector('.previa app-record-cover')).not.toBeNull();
    expect(el.querySelector('.previa .title')!.textContent).toBe('Álbum ou música');
  });

  it('escolher um álbum traz o artista para o campo e a primeira faixa para o vinil; salvar prega no mural de músicas', async () => {
    inside().pick(album());
    const f = await fields();
    expect(f.querySelector<HTMLInputElement>('input[type="text"]')!.value).toBe('Radiohead');
    expect(inside().game()).toEqual(jasmine.objectContaining({ sample: preview(1), sampleTitle: 'Airbag' }));
    expect(el.querySelector('.tj-ano')!.textContent).toBe('Álbum · Radiohead · 1997');
    // a orelha do artista e o botão de tocar já aparecem na prévia
    expect(el.querySelector('.previa .aba-cat')!.textContent!.trim()).toBe('Radiohead');
    expect(el.querySelector('.previa .tocar-disco')).not.toBeNull();
    fill();
    inside().save(new Event('submit'));
    await fixture.whenStable();
    expect(saved()).toEqual(jasmine.objectContaining({ kind: 'musicas', category: 'Radiohead', status: 'platinado' }));
    expect(saved()!.game).toEqual(jasmine.objectContaining({ name: 'OK Computer', form: 'album', sample: preview(1), sampleTitle: 'Airbag', by: 'Radiohead' }));
    expect(saved()!.scores).toEqual({ final: 9.6, envolvimento: 10, letra: 9, vocal: 9, instrumental: 10 });
  });

  it('o artista apagado no campo deixa a ficha sem artista', async () => {
    inside().pick(album());
    await fields();
    inside().noteCategory.set(null);
    fill();
    inside().save(new Event('submit'));
    await fixture.whenStable();
    expect(saved()!.category).toBeUndefined();
    expect(saved()!.game.by).toBe('Radiohead');
  });

  it('o crédito de vários nomes vai para a aba do artista principal, se a pessoa não mexeu no campo', async () => {
    primary.and.resolveTo('Daft Punk');
    inside().pick(album({ name: 'Get Lucky', sourceId: 'song/20', form: 'faixa', by: 'Daft Punk, Pharrell Williams & Nile Rodgers', sample: preview(1) }));
    await fields();
    expect(primary).toHaveBeenCalledTimes(1);
    expect(inside().noteCategory()).toBe('Daft Punk');
    // um nome só não pergunta nada ao catálogo
    primary.calls.reset();
    inside().pick(album());
    await fields();
    expect(primary).not.toHaveBeenCalled();
    expect(inside().noteCategory()).toBe('Radiohead');
  });

  it('um link que não toca não deixa pregar, e o editor diz o que falta', async () => {
    inside().pick({ name: 'Fita demo', coverUrl: null, source: 'manual' });
    const f = await fields();
    const link = Array.from(f.querySelectorAll<HTMLLabelElement>('label.opcao')).find((l) => l.textContent!.trim() === 'Um link meu')!;
    link.querySelector('input')!.click();
    await fixture.whenStable();
    const input = f.querySelector<HTMLInputElement>('input.link')!;
    input.value = 'https://exemplo.com/pagina';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    fill();
    inside().save(new Event('submit'));
    await fixture.whenStable();
    expect(saved()).toBeUndefined();
    expect(inside().missingText()).toContain('um link que toque no vinil');
    // com um link que toca, prega (e o que foi escrito à mão é um álbum, sem dizer outra coisa)
    input.value = 'https://youtu.be/dQw4w9WgXcQ';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    inside().save(new Event('submit'));
    await fixture.whenStable();
    expect(saved()!.game).toEqual(jasmine.objectContaining({ name: 'Fita demo', form: 'album', sample: 'https://youtu.be/dQw4w9WgXcQ' }));
  });

  it('editar uma ficha que já existia abre com o artista dela, e não troca o som sozinho', async () => {
    inside().pick(album());
    await fields();
    inside().noteCategory.set('Radiohead (UK)');
    fill();
    inside().save(new Event('submit'));
    await fixture.whenStable();
    const first = saved()!;
    // sem som, por escolha
    const { sample: _s, sampleTitle: _t, ...quiet } = first.game;
    store.update({ ...first, game: quiet });
    fixture.componentInstance.open(saved());
    await fixture.whenStable();
    await fields();
    expect(inside().noteCategory()).toBe('Radiohead (UK)');
    expect(inside().game()!.sample).toBeUndefined();
  });
});
