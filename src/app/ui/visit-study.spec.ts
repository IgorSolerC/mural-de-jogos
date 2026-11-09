import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Colleague } from '../core/colleague-store';
import { PublicStudy } from '../core/public-study';
import { Review, sanitizeReview } from '../core/review';
import { studyGroupId } from '../core/study';
import { expectEtiquetaPadrao } from '../testing/etiqueta-acoes.spec';
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
    expect([...el.querySelectorAll('.pilha')].map((a) => a.getAttribute('aria-label'))).toEqual(['Kanji N5, 2 flashcards', 'Capitais, 1 flashcard']);
  });

  it('o baralho: as cartas que têm anotação, a de cima a próxima, o progresso na frente e o Copiar', async () => {
    const { fixture, el } = await render(marina(), studyGroupId('Japonês'), 'dkanji');
    const cards = [...el.querySelectorAll('.carta-btn')].map((b) => b.getAttribute('aria-label'));
    // a estudada antes da nunca estudada (a ordem "Próxima revisão")
    expect(cards.length).toBe(2);
    expect(cards[0]).toContain('日, Dominado');
    expect(cards[1]).toBe('月, Desconhecido');
    expect(el.querySelector('select[aria-label="Nível"]')).not.toBeNull();
    // o Copiar abre a folha com o baralho e só as cartas que têm anotação (a 火 não veio)
    el.querySelector<HTMLButtonElement>('.copiar')!.click();
    const asked = (fixture.componentInstance as unknown as { copying: () => { request: { deck: { id: string }; cards: { note: string }[] }; sample: { title: string } } }).copying();
    expect(asked.request.deck.id).toBe('dkanji');
    expect(asked.request.cards.map((c) => c.note).sort()).toEqual(['nlua1', 'nsol1']);
    expect(asked.sample.title).toBe('日');
  });

  it('com o progresso escondido: sem nível nas cartas, sem filtro de nível, na ordem de entrada', async () => {
    const { el } = await render(marina(false), studyGroupId('Japonês'), 'dkanji');
    expect([...el.querySelectorAll('.carta-btn')].map((b) => b.getAttribute('aria-label'))).toEqual(['日', '月']);
    expect(el.querySelector('select[aria-label="Nível"]')).toBeNull();
    expect(text(el.querySelector('select[aria-label="Ordenar por"] option'))).toBe('Ordem de entrada');
  });

  it('a carta só nos Estudos dela aparece pela anotação que veio à parte', async () => {
    const { el } = await render(marina(), studyGroupId('Geografia'), 'dcap');
    expect([...el.querySelectorAll('.carta-btn')].map((b) => b.getAttribute('aria-label'))).toEqual(['Capital da Mongólia?, Desconhecido']);
  });

  /**
   * A regra "Visita: as mesmas peças do dono" (CLAUDE.md): a parede do baralho é a dos seus Flashcards
   * (ui/study-card-wall.ts), com as cartas dela. Tudo o que não é editar funciona igual.
   */
  describe('a parede é a mesma dos seus Flashcards', () => {
    const settle = async (fixture: { detectChanges(): void }) => {
      for (let i = 0; i < 4; i++) {
        await new Promise((r) => setTimeout(r));
        fixture.detectChanges();
      }
    };
    /** A Marina com texto nas anotações: o verso tem o que mostrar, e um link para outra anotação dela. */
    function withText(): Colleague {
      const c = marina();
      return { ...c, reviews: c.reviews.map((r) => (r.id === 'nsol1' ? { ...r, text: 'Nichi. Ver também [[Lua]].' } : r)) };
    }
    const focusDialog = () => document.querySelector<HTMLDialogElement>('app-study-card-focus dialog');
    afterEach(() => {
      focusDialog()?.close();
      document.querySelectorAll('.menu-contexto:popover-open').forEach((m) => (m as HTMLElement).hidePopover());
    });

    it('é a peça compartilhada, sem cópia da parede na visita', async () => {
      const { el } = await render(marina(), studyGroupId('Japonês'), 'dkanji');
      expect(el.querySelector('app-study-card-wall')).not.toBeNull();
      expect(el.querySelectorAll('app-study-card-wall .carta-btn').length).toBe(el.querySelectorAll('.carta-btn').length);
    });

    it('tocar vira a carta ali mesmo, com a anotação dela no verso, sem abrir a leitura; tocar no verso volta', async () => {
      const { fixture, el } = await render(withText(), studyGroupId('Japonês'), 'dkanji');
      let opened = 0;
      fixture.componentInstance.opened.subscribe(() => opened++);
      const li = el.querySelector<HTMLElement>('.carta-li[data-carta="nsol1"]')!;
      li.querySelector<HTMLButtonElement>('.carta-btn')!.click();
      await settle(fixture);
      expect(opened).toBe(0);
      expect(li.classList).toContain('virada');
      const back = li.querySelector<HTMLElement>('.verso')!;
      expect(text(back.querySelector('.verso-titulo'))).toContain('日');
      expect(text(back.querySelector('app-rich-text'))).toContain('Nichi.');
      back.querySelector<HTMLElement>('.verso-titulo')!.click();
      await settle(fixture);
      expect(li.classList).not.toContain('virada');
      expect(opened).toBe(0);
    });

    it('o link do verso acha a anotação dela e abre na leitura da visita', async () => {
      const { fixture, el } = await render(withText(), studyGroupId('Japonês'), 'dkanji');
      const opened: string[] = [];
      fixture.componentInstance.opened.subscribe((e) => opened.push(e.note.id));
      const li = el.querySelector<HTMLElement>('.carta-li[data-carta="nsol1"]')!;
      li.querySelector<HTMLButtonElement>('.carta-btn')!.click();
      await settle(fixture);
      const link = [...li.querySelectorAll<HTMLElement>('.verso .elo[role="link"]')].find((a) => text(a) === 'Lua');
      expect(link).withContext('o [[Lua]] vira link, não colchetes').toBeDefined();
      expect(text(li.querySelector('.verso'))).not.toContain('[[');
      link!.click();
      await settle(fixture);
      expect(opened).toEqual(['nlua1']);
      // o toque no link é dele: a carta continua virada
      expect(li.classList).toContain('virada');
    });

    it('a etiqueta tem o maximizar e o ler, no padrão do mural, e não tem o editar', async () => {
      const { fixture, el } = await render(marina(), studyGroupId('Japonês'), 'dkanji');
      const acoes = el.querySelector<HTMLElement>('.carta-li .acoes')!;
      expect([...acoes.querySelectorAll('.mexer')].map((b) => b.getAttribute('aria-label'))).toEqual(['Maximizar 日', 'Ler a anotação de 日']);
      expectEtiquetaPadrao(acoes);
      let opened: Review | null = null;
      fixture.componentInstance.opened.subscribe((e) => (opened = e.note));
      acoes.querySelector<HTMLButtonElement>('.acao-ler')!.click();
      expect(opened!.id).toBe('nsol1');
    });

    it('maximizar abre a carta dela em foco, que vira', async () => {
      const { fixture, el } = await render(withText(), studyGroupId('Japonês'), 'dkanji');
      el.querySelector<HTMLButtonElement>('.carta-li .acao-maximizar')!.click();
      for (let n = 0; n < 60 && !focusDialog()?.open; n++) await settle(fixture);
      const dialog = focusDialog()!;
      expect(dialog.open).toBeTrue();
      expect(text(dialog.querySelector('.baralho'))).toContain('Kanji N5');
      dialog.querySelector<HTMLElement>('.mostrar')!.click();
      await settle(fixture);
      expect(dialog.querySelector('.giro')!.classList).toContain('virada');
      expect(text(dialog.querySelector('.verso app-rich-text'))).toContain('Nichi.');
    });

    it('o botão direito abre o mesmo menu do flashcard, sem o que é do dono', async () => {
      const { fixture, el } = await render(marina(), studyGroupId('Japonês'), 'dkanji');
      const li = el.querySelector<HTMLElement>('.carta-li[data-carta="nsol1"]')!;
      li.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 2, pointerType: 'mouse', clientX: 40, clientY: 40 }));
      li.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: 40, clientY: 40 }));
      await settle(fixture);
      const menu = el.querySelector<HTMLElement>('.menu-contexto:popover-open')!;
      expect([...menu.querySelectorAll('.escolha .nome')].map(text)).toEqual(['Virar o flashcard', 'Maximizar', 'Ler a anotação']);
      [...menu.querySelectorAll<HTMLElement>('.escolha')][0].click();
      await settle(fixture);
      expect(li.classList).toContain('virada');
    });
  });

  it('muitos grupos: os que não cabem vão para o "Mais", a mesma lista de feltro dos seus Flashcards', async () => {
    const c = marina();
    const many = Array.from({ length: 24 }, (_, i) => `Grupo comprido ${i + 1}`);
    const decks = many.map((g, i) => ({ ...c.estudos!.decks[0], id: `d${i}`, name: `Baralho ${i}`, group: g, order: i }));
    const fixture = TestBed.createComponent(VisitStudy);
    (fixture.nativeElement as HTMLElement).style.cssText = 'display:block;width:480px';
    fixture.componentRef.setInput('colleague', { ...c, estudos: { ...c.estudos!, decks } });
    for (let i = 0; i < 4; i++) {
      await new Promise((r) => setTimeout(r));
      fixture.detectChanges();
    }
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('app-study-group-tabs')).not.toBeNull();
    const standing = el.querySelectorAll('.abas:not(.medida) a.aba').length;
    expect(standing).toBeLessThan(25);
    const mais = el.querySelector<HTMLElement>('app-tab-more.aba-mais')!;
    expect(mais).withContext('o "Mais" com os que não cabem').not.toBeNull();
    mais.querySelector<HTMLButtonElement>('.gatilho')!.click();
    for (let i = 0; i < 2; i++) {
      await new Promise((r) => setTimeout(r));
      fixture.detectChanges();
    }
    const options = [...mais.querySelectorAll<HTMLButtonElement>('[role=option]')];
    expect(options.length).toBe(25 - standing);
    const go = spyOn(TestBed.inject(Router), 'navigateByUrl').and.resolveTo(true);
    options.at(-1)!.click();
    expect(go).toHaveBeenCalledWith(`/comparar/mural/estudos/${studyGroupId('Grupo comprido 24')}`);
  });

  it('o botão direito num baralho abre o menu dele, com o que quem visita faz: abrir e copiar', async () => {
    const { fixture, el } = await render(marina());
    const pile = el.querySelector<HTMLElement>('.pilha[data-baralho="dkanji"]')!;
    pile.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 2, pointerType: 'mouse', clientX: 40, clientY: 40 }));
    const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: 40, clientY: 40 });
    pile.dispatchEvent(e);
    for (let i = 0; i < 3; i++) {
      await new Promise((r) => setTimeout(r));
      fixture.detectChanges();
    }
    expect(e.defaultPrevented).toBeTrue();
    const menu = el.querySelector<HTMLElement>('.menu-contexto:popover-open')!;
    expect(text(menu.querySelector('.legenda'))).toContain('Kanji N5');
    expect([...menu.querySelectorAll('.escolha .nome')].map(text)).toEqual(['Abrir', 'Abrir em outra aba', 'Copiar baralho']);
    [...menu.querySelectorAll<HTMLElement>('.escolha')][2].click();
    const asked = (fixture.componentInstance as unknown as { copying: () => { request: { deck: { id: string } } } | null }).copying();
    expect(asked!.request.deck.id).toBe('dkanji');
    menu.hidePopover();
  });

  it('o baralho aberto sem flashcards à mostra não abre um menu vazio: fica o do navegador', async () => {
    // as anotações das cartas do Kanji N5 não vieram: o baralho fica sem nenhuma à mostra
    const sem = { ...marina(), reviews: [] };
    const { fixture, el } = await render(sem, studyGroupId('Japonês'), 'dkanji');
    const top = el.querySelector<HTMLElement>('.trilha[data-baralho="dkanji"]')!;
    top.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 2, pointerType: 'mouse', clientX: 40, clientY: 40 }));
    const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: 40, clientY: 40 });
    top.dispatchEvent(e);
    for (let i = 0; i < 3; i++) {
      await new Promise((r) => setTimeout(r));
      fixture.detectChanges();
    }
    expect(e.defaultPrevented).toBeFalse();
    expect(el.querySelector('.menu-contexto:popover-open')).toBeNull();
  });

  it('um baralho que não está mais à mostra diz isso', async () => {
    const { el } = await render(marina(), studyGroupId('Japonês'), 'dsumiu');
    expect(text(el.querySelector('.nada'))).toContain('não está mais à mostra');
  });
});
