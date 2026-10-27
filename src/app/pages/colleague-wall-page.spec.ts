import { Component, input, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Colleague, ColleagueStore, wallOf } from '../core/colleague-store';
import { Mural } from '../core/mural';
import { Profile } from '../core/profile';
import { Review, sanitizeReview } from '../core/review';
import { ReviewReader } from '../ui/review-reader';
import { WallToolbar } from '../ui/wall-toolbar';
import { ViewTransitions } from '../core/view-transitions';
import { CloudAccount } from '../core/cloud-account';
import { Follow } from '../core/follow';
import { FollowToasts } from '../ui/follow-toasts';
import { ColleagueWallPage } from './colleague-wall-page';
import { WallBoard } from './wall-board';

/**
 * O mural de outra pessoa: a ficha da dona com uma orelha por mural dela (a aberta é o mural de
 * agora), a foto, "O mural de Marina", a linha do perfil e o caminho para o perfil; e a parede dela
 * atrás do site (`wallOf`, usada pelo app).
 */

/** A leitura de mentira: a página só precisa que ela exista. */
@Component({ selector: 'app-review-reader', template: '', providers: [{ provide: ReviewReader, useExisting: StubReader }] })
class StubReader {
  open(): void {
    /* nada a abrir */
  }
}

@Component({ selector: 'app-wall-toolbar', template: '' })
class StubToolbar {}

@Component({ selector: 'app-wall-board', template: '' })
class StubBoard {
  readonly access = input<unknown>();
}

let n = 0;
function card(kind: string, extra: Record<string, unknown> = {}): Review {
  return sanitizeReview({
    id: `r${kind}${++n}`,
    kind,
    game: { name: `Ficha ${n}`, coverUrl: null, source: 'manual' },
    scores: { historia: 8, diversao: 8, jogabilidade: 8, visual: 8, envolvimento: 8, personagens: 8, escrita: 8 },
    status: 'finalizado',
    difficulty: 'nenhuma',
    verdict: null,
    completedAt: '2026-10-20',
    createdAt: '2026-10-20T12:00:00.000Z',
    updatedAt: '2026-10-20T12:00:00.000Z',
    ...extra,
  }) as Review;
}

const PROFILE = { emoji: '🌻', photo: 'amarelo', tagline: 'Jogos lentos e livros longos', page: 'lousa' } as Profile;

function marina(extra: Partial<Colleague> = {}): Colleague {
  return {
    id: 'nuvem:K7QFM2XA',
    name: 'Marina',
    fileName: '',
    loadedAt: '2026-10-20T12:00:00.000Z',
    codigo: 'K7QFM2XA',
    reviews: [card('jogos'), card('jogos'), card('livros'), card('anotacoes'), card('anotacoes', { doneAt: '2026-10-21T10:00:00.000Z' })],
    exportedAt: null,
    skipped: 0,
    ownerName: 'Marina',
    profile: PROFILE,
    ...extra,
  };
}

describe('O mural de outra pessoa (ColleagueWallPage)', () => {
  const settle = async () => {
    for (let i = 0; i < 3; i++) await new Promise((r) => setTimeout(r));
  };

  function create(c: Colleague | null, extra: unknown[] = []) {
    TestBed.configureTestingModule({
      providers: [
        ...(extra as never[]),
        provideZonelessChangeDetection(),
        provideRouter([]),
        // a troca de mural sem a transição: na hora
        { provide: ViewTransitions, useValue: { run: (change: () => void) => change() } },
        {
          provide: ColleagueStore,
          useValue: { colleagues: signal(c ? [c] : []), selected: signal(c), loading: signal(false), ready: Promise.resolve() },
        },
      ],
    });
    TestBed.overrideComponent(ColleagueWallPage, {
      remove: { imports: [ReviewReader, WallToolbar, WallBoard] },
      add: { imports: [StubReader, StubToolbar, StubBoard] },
    });
    TestBed.inject(Mural).kind.set('jogos');
    const fixture = TestBed.createComponent(ColleagueWallPage);
    fixture.detectChanges();
    return fixture;
  }

  const ears = (el: HTMLElement) => [...el.querySelectorAll<HTMLButtonElement>('.orelha')];
  const earText = (b: HTMLButtonElement) => b.getAttribute('aria-label');

  it('uma orelha por mural com fichas, na ordem de sempre, e a do mural de agora aberta', async () => {
    const fixture = create(marina());
    await settle();
    const el = fixture.nativeElement as HTMLElement;
    // a anotação finalizada não está no mural: conta só uma
    expect(ears(el).map(earText)).toEqual(['Jogos, 2', 'Livros, 1', 'Anotações, 1']);
    expect(ears(el).map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false']);
    expect(el.querySelector('.trilho')!.getAttribute('aria-label')).toBe('Murais de Marina');
  });

  it('tocar numa orelha troca o mural; a aberta não faz nada', async () => {
    const fixture = create(marina());
    await settle();
    const el = fixture.nativeElement as HTMLElement;
    const mural = TestBed.inject(Mural);
    ears(el)[0].click();
    expect(mural.kind()).toBe('jogos');
    ears(el)[1].click();
    await settle();
    expect(mural.kind()).toBe('livros');
    fixture.detectChanges();
    expect(ears(el).find((b) => b.getAttribute('aria-pressed') === 'true')!.textContent).toContain('Livros');
  });

  it('o mural aberto fica entre as orelhas mesmo vazio, com o aviso de procurar nos outros', async () => {
    const fixture = create(marina());
    TestBed.inject(Mural).kind.set('filmes');
    await settle();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(ears(el).map(earText)).toEqual(['Jogos, 2', 'Livros, 1', 'Filmes, 0', 'Anotações, 1']);
    expect(el.querySelector('.vazio')!.textContent).toContain('Toque numa das orelhas da ficha acima');
  });

  it('a ficha da dona: o título com o nome, a linha do perfil, o resumo e o caminho para o perfil', async () => {
    const fixture = create(marina());
    await settle();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('h1')!.textContent!.replace(/\s+/g, ' ').trim()).toBe('O mural de Marina');
    // um caminho só para o perfil: o nome não é link, o "Ver o perfil" é
    expect(el.querySelector('a.nome')).toBeNull();
    expect(el.querySelector('.perfil')!.getAttribute('href')).toBe('/perfil/K7QFM2XA');
    expect(el.querySelector('.linha')!.textContent).toBe('Jogos lentos e livros longos');
    expect(el.querySelector('.resumo')!.textContent).toContain('2 jogos');
    expect(el.querySelector('app-person-photo')!.textContent).toContain('🌻');
    expect(el.querySelector('.perfil')!.textContent).toContain('Ver o perfil');
    // sem trapézio nenhum na página
    expect(el.querySelector('.plate')).toBeNull();
  });

  it('com conta: Seguir ao lado do perfil; enquanto pede, "Começando a seguir…"; seguindo, a fita amarela', async () => {
    const following = signal<boolean | null>(false);
    let release!: () => void;
    const toasts = {
      start: jasmine.createSpy('start').and.callFake(() => new Promise<void>((r) => (release = () => (following.set(true), r())))),
      stop: jasmine.createSpy('stop'),
    };
    const fixture = create(marina(), [
      // o resto do Follow (a lista, os avisos) fica vazio
      {
        provide: Follow,
        useValue: new Proxy({ available: signal(true), isFollowing: () => following() } as Record<string | symbol, unknown>, {
          get: (t, k) => (k in t ? t[k] : () => []),
        }),
      },
      { provide: CloudAccount, useValue: { account: signal({ codigo: 'OUTRO123' }) } },
      { provide: FollowToasts, useValue: toasts },
    ]);
    await settle();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const seguir = el.querySelector<HTMLButtonElement>('.acoes .seguir')!;
    expect(el.querySelector('.acoes .perfil')).not.toBeNull();
    expect(seguir.textContent!.trim()).toBe('Seguir');
    expect(seguir.getAttribute('aria-pressed')).toBe('false');
    seguir.click();
    fixture.detectChanges();
    expect(toasts.start).toHaveBeenCalledWith('K7QFM2XA', 'Marina');
    expect(seguir.textContent!.trim()).toBe('Começando a seguir…');
    release();
    await settle();
    fixture.detectChanges();
    expect(seguir.textContent!.trim()).toBe('Seguindo');
    expect(seguir.classList).toContain('seguindo');
  });

  it('um backup, sem código nem perfil: a inicial na foto, sem linha e sem o perfil', async () => {
    const fixture = create(marina({ id: 'b1', codigo: undefined, profile: null }));
    await settle();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('app-person-photo')!.textContent!.trim()).toBe('M');
    expect(el.querySelector('.linha')).toBeNull();
    expect(el.querySelector('.perfil')).toBeNull();
    expect(el.querySelector('a.nome')).toBeNull();
    expect(el.querySelector('h1')!.textContent!.replace(/\s+/g, ' ').trim()).toBe('O mural de Marina');
  });

  it('sem ninguém aberto: o caminho para o Comparar', async () => {
    const fixture = create(null);
    await settle();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.dona')).toBeNull();
    expect(el.querySelector('.vazio h2')!.textContent).toContain('Nenhum mural aberto');
  });
});

describe('a parede de quem se visita (wallOf)', () => {
  it('é a do perfil da pessoa', () => {
    expect(wallOf(marina())).toBe('lousa');
  });

  it('sem perfil (um backup) ou sem ninguém, o eucatex do site, nunca a sua', () => {
    expect(wallOf(marina({ profile: null }))).toBe('eucatex');
    expect(wallOf(null)).toBe('eucatex');
  });
});
