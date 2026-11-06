import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Colleague } from '../core/colleague-store';
import { PublicStudy } from '../core/public-study';
import { Review, sanitizeReview } from '../core/review';
import { studyGroupId } from '../core/study';
import { setEverythingNear } from './near-screen';
import { VisitStudy } from './visit-study';

/** Os Estudos de outra pessoa na visita: só os baralhos públicos dela, para ver e copiar. */

const T = '2026-10-20T12:00:00.000Z';
const note = (id: string, name: string, category: string): Review =>
  sanitizeReview({ id, kind: 'anotacoes', category, game: { name, coverUrl: null, source: 'manual' }, scores: { final: 0 }, status: 'finalizado', completedAt: '2026-10-20', createdAt: T, updatedAt: T })!;
const srs = (due: string) => ({ state: 'revisao' as const, step: 0, s: 10, d: 5, due, last: T, reps: 3 });
const fresh = { state: 'nova' as const, step: 0, s: 0, d: 0, due: T, last: null as unknown as string, reps: 0 };
const stats = { seen: 3, right: 2, wrong: 1, marks: '101' };

function estudos(progress = true): PublicStudy {
  return {
    decks: [
      { id: 'dkanji', name: 'Kanji N5', icon: null, color: 'vermelho', newPerDay: 5, group: 'Japonês', order: 0, at: T, public: true },
      { id: 'dcap', name: 'Capitais', icon: null, color: 'verde', newPerDay: 5, group: 'Geografia', order: 1, at: T, public: true },
    ],
    cards: [
      { note: 'nsol1', decks: ['dkanji'], front: { title: '日' }, srs: srs('2099-01-01T07:00:00.000Z'), stats, added: T, at: T },
      { note: 'nlua1', decks: ['dkanji'], front: { title: '月' }, srs: fresh, stats, added: '2026-10-21T12:00:00.000Z', at: T },
      // a anotação que não veio (tirada na conferência da nuvem): a carta não aparece
      { note: 'nsumiu', decks: ['dkanji'], front: { title: '火' }, srs: fresh, stats, added: T, at: T },
      { note: 'nmar1', decks: ['dcap'], front: {}, srs: fresh, stats, added: T, at: T },
    ],
    progress,
  };
}

function marina(progress = true): Colleague {
  return {
    id: 'nuvem:K7QFM2XA',
    name: 'Marina',
    fileName: '',
    loadedAt: T,
    codigo: 'K7QF-M2XA',
    exportedAt: null,
    skipped: 0,
    ownerName: 'Marina',
    reviews: [note('nsol1', 'Sol', 'Japonês'), note('nlua1', 'Lua', 'Japonês')],
    // a da Geografia está só nos Estudos dela: veio à parte
    studyNotes: [note('nmar1', 'Capital da Mongólia?', 'Geografia')],
    estudos: estudos(progress),
  };
}

describe('Os Estudos de quem se visita (VisitStudy)', () => {
  beforeEach(() => {
    setEverythingNear(true);
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideRouter([])] });
  });
  afterEach(() => setEverythingNear(false));

  async function render(c: Colleague, group: string | null = null, deck: string | null = null) {
    const fixture = TestBed.createComponent(VisitStudy);
    fixture.componentRef.setInput('colleague', c);
    fixture.componentRef.setInput('groupId', group);
    fixture.componentRef.setInput('deckId', deck);
    for (let i = 0; i < 3; i++) {
      await new Promise((r) => setTimeout(r));
      fixture.detectChanges();
    }
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }
  const text = (e: Element | null) => e?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

  it('Tudo: as abas são os grupos com baralho público, e uma seção de pilhas por grupo', async () => {
    const { el } = await render(marina());
    expect([...el.querySelectorAll('.abas > li')].map(text)).toEqual(['Tudo', 'Japonês', 'Geografia']);
    expect([...el.querySelectorAll('.grupo-pilhas .tape-label')].map(text)).toEqual(['Japonês', 'Geografia']);
    // sem os montes de hoje: são da dona
    expect(el.querySelector('.papelzinho')).toBeNull();
    expect([...el.querySelectorAll('.pilha')].map((a) => a.getAttribute('aria-label'))).toEqual(['Kanji N5, 2 cartas', 'Capitais, 1 carta']);
  });

  it('o baralho: as cartas que têm anotação, a de cima a próxima, o progresso na frente e o Copiar', async () => {
    const { fixture, el } = await render(marina(), studyGroupId('Japonês'), 'dkanji');
    const cards = [...el.querySelectorAll('.carta-btn')].map((b) => b.getAttribute('aria-label'));
    // a estudada antes da nunca estudada (a ordem "Próxima revisão")
    expect(cards.length).toBe(2);
    expect(cards[0]).toContain('日, Dominada');
    expect(cards[1]).toBe('月, Desconhecida');
    expect(el.querySelector('select[aria-label="Nível"]')).not.toBeNull();
    let asked: { deck: { id: string }; cards: { note: string }[]; notes: Review[] } | null = null;
    fixture.componentInstance.copy.subscribe((e) => (asked = e));
    el.querySelector<HTMLButtonElement>('.copiar')!.click();
    expect(asked!.deck.id).toBe('dkanji');
    expect(asked!.cards.map((c) => c.note).sort()).toEqual(['nlua1', 'nsol1']);
    let opened: Review | null = null;
    fixture.componentInstance.opened.subscribe((e) => (opened = e.note));
    el.querySelector<HTMLButtonElement>('.carta-btn')!.click();
    expect(opened!.id).toBe('nsol1');
  });

  it('com o progresso escondido: sem nível nas cartas, sem filtro de nível, na ordem de entrada', async () => {
    const { el } = await render(marina(false), studyGroupId('Japonês'), 'dkanji');
    expect([...el.querySelectorAll('.carta-btn')].map((b) => b.getAttribute('aria-label'))).toEqual(['日', '月']);
    expect(el.querySelector('select[aria-label="Nível"]')).toBeNull();
    expect(text(el.querySelector('select[aria-label="Ordenar por"] option'))).toBe('Ordem de entrada');
  });

  it('a carta só nos Estudos dela aparece pela anotação que veio à parte', async () => {
    const { el } = await render(marina(), studyGroupId('Geografia'), 'dcap');
    expect([...el.querySelectorAll('.carta-btn')].map((b) => b.getAttribute('aria-label'))).toEqual(['Capital da Mongólia?, Desconhecida']);
  });

  it('um baralho que não está mais à mostra diz isso', async () => {
    const { el } = await render(marina(), studyGroupId('Japonês'), 'dsumiu');
    expect(text(el.querySelector('.nada'))).toContain('não está mais à mostra');
  });
});
