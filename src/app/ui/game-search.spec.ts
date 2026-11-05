import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { GameLookup, LookupError } from '../core/game-lookup';
import { PickedGame } from '../core/review';
import { GameSearch } from './game-search';

const HADES: PickedGame = { name: 'Hades', coverUrl: null, source: 'wikipedia', sourceId: '9', year: '2020' };
const REFUSED = 'A chave da RAWG foi recusada. Confira em Ajustes.';

describe('GameSearch: o aviso da chave recusada', () => {
  let problem: string | null;
  let search: jasmine.Spy;
  let fixture: ComponentFixture<GameSearch>;

  const open = async () => {
    fixture = TestBed.createComponent(GameSearch);
    fixture.componentRef.setInput('kind', 'jogos');
    fixture.componentRef.setInput('initialQuery', 'hades');
    fixture.detectChanges();
    await new Promise((r) => setTimeout(r, 10));
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  };
  const notes = (el: HTMLElement) => [...el.querySelectorAll('li.note')].map((n) => n.textContent!.trim());
  const spoken = (el: HTMLElement) => el.querySelector('[aria-live]')!.textContent!.trim();

  beforeEach(() => {
    problem = null;
    search = jasmine.createSpy('search').and.resolveTo([HADES]);
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: GameLookup, useValue: { search, sourceName: () => 'RAWG', keyProblem: () => problem } },
      ],
    });
  });

  afterEach(() => fixture.destroy());

  it('sem problema na chave, a lista não ganha nota nenhuma', async () => {
    const el = await open();
    expect(el.querySelectorAll('[role=option]').length).toBe(2);
    expect(notes(el)).toEqual([]);
    expect(spoken(el)).toBe('1 jogo encontrado.');
  });

  it('com a chave recusada, os resultados aparecem com o aviso, também para o leitor de tela', async () => {
    problem = REFUSED;
    const el = await open();
    expect(el.querySelector('[role=option] .name')!.textContent).toContain('Hades');
    expect(notes(el)).toEqual([`${REFUSED} Por enquanto, a busca é na Wikipedia.`]);
    expect(spoken(el)).toBe(`1 jogo encontrado. ${REFUSED} Por enquanto, a busca é na Wikipedia.`);
  });

  it('com a chave recusada e nada encontrado, diz os dois', async () => {
    problem = REFUSED;
    search.and.resolveTo([]);
    const el = await open();
    expect(notes(el).length).toBe(2);
    expect(notes(el)[1]).toContain(REFUSED);
  });

  it('a Wikipedia também fora: fica só o erro, que já diz o que aconteceu', async () => {
    problem = REFUSED;
    search.and.rejectWith(new LookupError('Não consegui falar com o catálogo.', 'offline'));
    const el = await open();
    expect(notes(el)).toEqual(['Não consegui falar com o catálogo. Você ainda pode seguir sem capa.']);
  });
});
