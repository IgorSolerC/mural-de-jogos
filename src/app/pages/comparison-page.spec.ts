import { Component, input, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Cloud } from '../core/cloud-config';
import { CloudAccount } from '../core/cloud-account';
import { CloudMurals, cloudColleagueId } from '../core/cloud-murals';
import { Colleague, ColleagueStore } from '../core/colleague-store';
import { Follow, People } from '../core/follow';
import { Mural } from '../core/mural';
import { PeopleOf, ProfilePeople } from '../core/profile-people';
import { Review, sanitizeReview } from '../core/review';
import { ViewTransitions } from '../core/view-transitions';
import { ReviewReader } from '../ui/review-reader';
import { ComparisonPage } from './comparison-page';
import { Caderno } from './comparison/caderno';

/**
 * Comparar murais: só com conta, sem backup de colega. No alto, a ficha da dupla (a da visita) com
 * todos os amigos para escolher, cada um com a foto do perfil, e o campo do código.
 */

@Component({ selector: 'app-review-reader', template: '', providers: [{ provide: ReviewReader, useExisting: StubReader }] })
class StubReader {
  open(): void {
    /* nada a abrir */
  }
}

@Component({ selector: 'app-caderno', template: '' })
class StubCaderno {
  readonly you = input<unknown>();
  readonly them = input<unknown>();
  readonly affinity = input<unknown>();
  readonly pairs = input<unknown>();
  readonly name = input<unknown>();
  readonly profile = input<unknown>();
  readonly hidden = input<unknown>();
}

let n = 0;
function card(kind: string, name: string): Review {
  return sanitizeReview({
    id: `r${++n}`,
    kind,
    game: { name, coverUrl: null, source: 'manual' },
    scores: { historia: 8, diversao: 8, jogabilidade: 8, visual: 8, envolvimento: 8, personagens: 8, escrita: 8 },
    status: 'finalizado',
    difficulty: 'nenhuma',
    verdict: null,
    completedAt: '2026-10-20',
    createdAt: '2026-10-20T12:00:00.000Z',
    updatedAt: '2026-10-20T12:00:00.000Z',
  }) as Review;
}

function person(code: string, name: string, reviews: Review[] = [card('jogos', 'Hades')]): Colleague {
  return {
    id: cloudColleagueId(code),
    name,
    fileName: `Código ${code}`,
    loadedAt: new Date().toISOString(),
    codigo: code,
    reviews,
    exportedAt: null,
    skipped: 0,
    ownerName: name,
    profile: null,
  };
}

const PEOPLE: People = {
  seguindo: [
    { codigo: 'K7QF-M2XA', nome: 'Marina', desde: '', silenciado: false, rev: 1, meSegue: true },
    { codigo: 'B2C3-D4E5', nome: 'Bruno', desde: '', silenciado: false, rev: 1, meSegue: false },
  ],
  seguidores: [
    { codigo: 'K7QF-M2XA', nome: 'Marina', desde: '', euSigo: true },
    { codigo: 'Z9Y8-X7W6', nome: 'Ana', desde: '', euSigo: false },
  ],
};

const CARDS: PeopleOf = {
  seguindo: 2,
  seguidores: 2,
  listasVisiveis: true,
  listas: {
    seguindo: [{ codigo: 'K7QF-M2XA', nome: 'Marina', cartao: { emoji: '🌻', cor: 'amarelo', fundo: null, linha: '', fichas: null, murais: null } }],
    seguidores: [{ codigo: 'Z9Y8-X7W6', nome: 'Ana', cartao: { emoji: '🐙', cor: 'azul', fundo: null, linha: '', fichas: null, murais: null } }],
  },
};

describe('Comparar murais (ComparisonPage)', () => {
  const settle = async () => {
    for (let i = 0; i < 3; i++) await new Promise((r) => setTimeout(r));
  };

  function create(opts: { signedIn?: boolean; saved?: Colleague[]; selected?: Colleague | null; people?: People | null } = {}) {
    const saved = signal(opts.saved ?? []);
    const selected = signal<Colleague | null>(opts.selected ?? null);
    const store = {
      colleagues: saved,
      selected,
      loading: signal(false),
      storageError: signal(null),
      ready: Promise.resolve(),
      select: jasmine.createSpy('select').and.callFake((id: string) => selected.set(saved().find((c) => c.id === id) ?? null)),
    };
    const murals = {
      open: jasmine.createSpy('open').and.callFake(async (code: string) => {
        const c = person(code, 'Bruno');
        saved.update((l) => [c, ...l]);
        return c;
      }),
      refresh: () => Promise.resolve(),
    };
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: ViewTransitions, useValue: { run: (change: () => void) => change() } },
        { provide: ColleagueStore, useValue: store },
        { provide: CloudMurals, useValue: murals },
        { provide: Cloud, useValue: { config: signal({}), ready: Promise.resolve() } },
        { provide: CloudAccount, useValue: { account: signal({ codigo: 'EU00-EU00', nome: 'Igor' }), signedIn: signal(opts.signedIn ?? true) } },
        { provide: Follow, useValue: { available: signal(opts.signedIn ?? true), people: signal(opts.people === undefined ? PEOPLE : opts.people) } },
        { provide: ProfilePeople, useValue: { load: () => Promise.resolve(), of: () => CARDS } },
      ],
    });
    TestBed.overrideComponent(ComparisonPage, {
      remove: { imports: [ReviewReader, Caderno] },
      add: { imports: [StubReader, StubCaderno] },
    });
    TestBed.inject(Mural).kind.set('jogos');
    const fixture = TestBed.createComponent(ComparisonPage);
    fixture.detectChanges();
    return { fixture, store, murals };
  }

  const names = (el: HTMLElement) => [...el.querySelectorAll('.pessoa-nome')].map((s) => s.textContent!.trim());

  it('sem conta: a folha de entrar, sem ficha, sem lista e sem arquivo de backup', async () => {
    const { fixture } = create({ signedIn: false, saved: [person('K7QF-M2XA', 'Marina')], selected: person('K7QF-M2XA', 'Marina') });
    await settle();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.folha-titulo')!.textContent).toContain('Compare o seu mural com o dos amigos');
    expect(el.querySelector('app-dupla')).toBeNull();
    expect(el.querySelector('app-caderno')).toBeNull();
    expect(el.querySelector('input[type=file]')).toBeNull();
  });

  it('todos os amigos, cada um uma vez e pelo nome, com a foto do perfil; nenhum lugar para backup', async () => {
    const { fixture } = create();
    await settle();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.titulo')!.textContent!.replace(/\s+/g, ' ').trim()).toBe('Comparar com quem?');
    expect(names(el)).toEqual(['Ana', 'Bruno', 'Marina']);
    const titles = [...el.querySelectorAll('.pessoa')].map((b) => b.getAttribute('title'));
    expect(titles).toEqual(['Ana · Segue você', 'Bruno · Você segue', 'Marina · Vocês se seguem']);
    expect(el.querySelectorAll('.pessoa .pf-emoji').length).toBe(2);
    expect(el.querySelector('input[type=file]')).toBeNull();
    expect(el.textContent).not.toContain('backup');
  });

  it('quem foi aberto pelo código e não é amigo vem depois dos amigos', async () => {
    const { fixture } = create({ saved: [person('Q1W2-E3R4', 'Carla')] });
    await settle();
    fixture.detectChanges();
    expect(names(fixture.nativeElement)).toEqual(['Ana', 'Bruno', 'Marina', 'Carla']);
  });

  it('tocar num amigo que não está guardado traz o mural da nuvem e já compara', async () => {
    const { fixture, murals, store } = create();
    await settle();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const bruno = [...el.querySelectorAll<HTMLButtonElement>('.pessoa')].find((b) => b.textContent!.includes('Bruno'))!;
    bruno.click();
    await settle();
    fixture.detectChanges();
    expect(murals.open).toHaveBeenCalledOnceWith('B2C3-D4E5');
    expect(store.select).toHaveBeenCalledWith(cloudColleagueId('B2C3-D4E5'));
    expect(el.querySelector('.titulo')!.textContent!.replace(/\s+/g, ' ').trim()).toBe('Você e Bruno');
  });

  it('um amigo sem mural na nuvem: o aviso diz de quem é, e o campo do código fica como estava', async () => {
    const { fixture, murals } = create();
    murals.open.and.rejectWith(new Error('Não achei mural com esse código. Confira as letras: são 8, entre letras e números.'));
    await settle();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    [...el.querySelectorAll<HTMLButtonElement>('.pessoa')].find((b) => b.textContent!.includes('Bruno'))!.click();
    await settle();
    fixture.detectChanges();
    expect(el.querySelector('[role=alert]')!.textContent!.trim()).toBe('Bruno ainda não tem um mural publicado.');
    expect(el.querySelector('#comparar-codigo')!.getAttribute('aria-invalid')).toBe('false');
    expect(el.querySelector('.titulo')!.textContent!.replace(/\s+/g, ' ').trim()).toBe('Comparar com quem?');
  });

  it('quem já está guardado aparece na hora, sem esperar a nuvem', async () => {
    const marina = person('K7QF-M2XA', 'Marina');
    const { fixture, murals, store } = create({ saved: [marina] });
    await settle();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    [...el.querySelectorAll<HTMLButtonElement>('.pessoa')].find((b) => b.textContent!.includes('Marina'))!.click();
    expect(store.select).toHaveBeenCalledWith(marina.id);
    expect(murals.open).not.toHaveBeenCalled();
  });

  it('pelo código: abre quem tem o código; um código que não existe avisa', async () => {
    const { fixture, murals } = create();
    await settle();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const field = el.querySelector<HTMLInputElement>('#comparar-codigo')!;
    field.value = 'xx';
    field.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    el.querySelector<HTMLFormElement>('form.codigo')!.dispatchEvent(new Event('submit'));
    await settle();
    fixture.detectChanges();
    expect(murals.open).not.toHaveBeenCalled();
    expect(el.querySelector('[role=alert]')!.textContent).toContain('Esse código não existe');

    field.value = 'b2c3 d4e5';
    field.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    el.querySelector<HTMLFormElement>('form.codigo')!.dispatchEvent(new Event('submit'));
    await settle();
    expect(murals.open).toHaveBeenCalledOnceWith('B2C3-D4E5');
  });

  it('com alguém escolhido: "Você e Marina", as orelhas com quanto há em comum e ela marcada na lista', async () => {
    const marina = person('K7QF-M2XA', 'Marina', [card('jogos', 'Hades'), card('livros', 'Duna')]);
    const { fixture } = create({ saved: [marina], selected: marina });
    await settle();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.titulo')!.textContent!.replace(/\s+/g, ' ').trim()).toBe('Você e Marina');
    expect([...el.querySelectorAll('.orelha')].map((b) => b.getAttribute('aria-label'))).toEqual(['Jogos, 0 em comum', 'Livros, 0 em comum']);
    expect(el.querySelector('.resumo')!.textContent).toContain('Nenhum jogo em comum');
    const pressed = [...el.querySelectorAll('.pessoa[aria-pressed=true] .pessoa-nome')].map((b) => b.textContent!.trim());
    expect(pressed).toEqual(['Marina']);
  });

  it('a lista de amigos ainda vindo: avisa, e o código já funciona', async () => {
    const { fixture } = create({ people: null });
    await settle();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.nada')!.textContent).toContain('Buscando seus amigos');
    expect(el.querySelector('#comparar-codigo')).not.toBeNull();
  });

  it('sem amigos: o caminho para seguir alguém', async () => {
    const { fixture } = create({ people: { seguindo: [], seguidores: [] } });
    await settle();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('.nada')!.textContent).toContain('Você ainda não segue ninguém');
  });
});
