import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Cloud } from '../core/cloud-config';
import { Review, sanitizeReview } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { Settings } from '../core/settings';
import { StudyStore } from '../core/study-store';
import { Confirm } from './confirm';
import { Toasts } from './toast';
import { ReviewEditor, SavedEvent } from './review-editor';
import { comMarkdown } from '../testing/writing-mode.spec';

/** A aba Flashcard do editor (PLANO-ESTUDOS.md, 6.5): virar carta, a frente, os baralhos, o mural. */

const T0 = '2026-10-01T10:00:00.000Z';
const note = (id: string, name: string): Review => ({ ...sanitizeReview({ kind: 'anotacoes', category: 'Estudos', game: { name, coverUrl: null, source: 'manual' }, completedAt: '2026-10-01', createdAt: T0 })!, id });

describe('o editor: a aba Flashcard', () => {
  comMarkdown();
  let fixture: ComponentFixture<ReviewEditor>;
  let el: HTMLElement;
  let store: ReviewStore;
  let study: StudyStore;
  let settings: Settings;
  let asked: string[];

  beforeEach(async () => {
    localStorage.clear();
    asked = [];
    TestBed.configureTestingModule({
      imports: [ReviewEditor],
      providers: [
        provideZonelessChangeDetection(),
        {
          provide: Confirm,
          useValue: {
            ask: async () => true,
            askChecked: async (o: { title: string }) => {
              asked.push(o.title);
              return { ok: true, checked: false };
            },
          },
        },
      ],
    });
    TestBed.inject(Cloud).config.set({ api: 'https://api.teste', googleClientId: 'x.apps.googleusercontent.com' });
    store = TestBed.inject(ReviewStore);
    study = TestBed.inject(StudyStore);
    settings = TestBed.inject(Settings);
    settings.askNoCategory.set(false);
    settings.askNoTag.set(false);
    fixture = TestBed.createComponent(ReviewEditor);
    document.body.appendChild(fixture.nativeElement);
    el = fixture.nativeElement;
    await fixture.whenStable();
  });

  afterEach(() => {
    fixture.nativeElement.remove();
    localStorage.clear();
  });

  const tab = () => el.querySelector<HTMLButtonElement>('#editor-modo-flashcard');
  const panel = () => el.querySelector<HTMLElement>('.flashcard-modo')!;
  const input = (id: string) => el.querySelector<HTMLInputElement>(`#${id}`)!;
  const type = async (id: string, v: string) => {
    const i = input(id);
    i.value = v;
    i.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  };
  const save = async () => {
    const dialog = el.querySelector('dialog')!;
    const closed = new Promise((r) => dialog.addEventListener('close', r, { once: true }));
    el.querySelector<HTMLButtonElement>('.pregar .btn-ink')!.click();
    await closed;
    await fixture.whenStable();
  };

  it('só nas anotações, e vazia: "Criar a frente" faz da anotação uma carta', async () => {
    fixture.componentInstance.open(undefined, undefined, undefined, undefined, 'jogos');
    await fixture.whenStable();
    expect(tab()).toBeNull();
    fixture.componentInstance.openNote('Sol (日)');
    // num grupo (sem grupo, a aba pede o grupo no lugar do "Criar a frente")
    fixture.componentInstance['noteCategory'].set('Estudos');
    await fixture.whenStable();
    expect(tab()).not.toBeNull();
    tab()!.click();
    await fixture.whenStable();
    expect(panel().hidden).toBeFalse();
    expect(panel().textContent).toContain('Dê uma frente a esta anotação');
    expect(input('fc-titulo')).toBeNull();
    panel().querySelector<HTMLButtonElement>('.vazia .papel')!.click();
    await fixture.whenStable();
    expect(input('fc-titulo').placeholder).toBe('Sol (日)');
  });

  it('a anotação que já existia vira carta ao salvar, com a frente e o baralho, e continua no mural', async () => {
    store.reviews.set([note('nsol', 'Sol (日)')]);
    const deck = study.addDeck('Kanjis', 'amarelo');
    study.lastDeck.set(deck);
    fixture.componentInstance.open(store.get('nsol')!);
    await fixture.whenStable();
    tab()!.click();
    await fixture.whenStable();
    panel().querySelector<HTMLButtonElement>('.vazia .papel')!.click();
    await fixture.whenStable();
    await type('fc-titulo', '日');
    await type('fc-subtitulo', 'sol, dia');
    // o último baralho usado já vem escolhido; a carta viva mostra a frente
    expect(panel().querySelectorAll('.adesivo').length).toBe(1);
    expect(panel().querySelector('app-study-card .titulo')!.textContent!.trim()).toBe('日');
    expect(panel().querySelector('.mural-txt')!.textContent!.trim()).toBe('Aparece no mural também');
    await save();
    const card = study.cardOf().get('nsol')!;
    expect(card.front).toEqual({ title: '日', subtitle: 'sol, dia' });
    expect(card.decks).toEqual([deck]);
    // a que já estava no mural guarda "no mural" (nada some sem a pessoa mandar)
    expect(card.wall).toBeTrue();
  });

  it('a Nova carta de um baralho abre na aba, nasce no grupo dele, só nos Estudos, e não pergunta a tag', async () => {
    settings.askNoCategory.set(true);
    settings.askNoTag.set(true);
    const deck = study.addDeck('Verbos', 'rosa', null, undefined, 'Japonês');
    study.pending.set({ decks: [deck] });
    // como a página dos Estudos pede (ver StudyPage.newCard)
    fixture.componentInstance.openInCategory('Japonês');
    (fixture.componentInstance as unknown as { setNoteTitle(t: string): void }).setNoteTitle('Comer');
    await fixture.whenStable();
    expect(tab()!.getAttribute('aria-selected')).toBe('true');
    expect(panel().querySelector('.mural-txt')!.textContent!.trim()).toBe('Só nos Flashcards');
    await type('fc-titulo', '食べる');
    await save();
    expect(asked).toEqual([]);
    const saved = store.notes().find((n) => n.game.name === 'Comer')!;
    expect(saved.category).toBe('Japonês');
    const card = study.cardOf().get(saved.id)!;
    expect(card.decks).toEqual([deck]);
    expect('wall' in card).toBeFalse();
    expect(study.pending()).toBeNull();
  });

  it('só os baralhos do grupo da anotação; trocado o grupo no editor, salvar sem escolher deixa a carta dormindo nos de antes', async () => {
    store.reviews.set([note('nsol', 'Sol')]);
    const kanji = study.addDeck('Kanjis', 'amarelo', null, undefined, 'Estudos');
    const redes = study.addDeck('Redes', 'azul', null, undefined, 'Computação');
    study.addCard('nsol', [kanji], { title: '日' }, true);
    fixture.componentInstance.open(store.get('nsol')!);
    await fixture.whenStable();
    tab()!.click();
    await fixture.whenStable();
    const options = () => [...panel().querySelectorAll<HTMLOptionElement>('.mais option')].map((o) => o.textContent!.trim());
    const chips = () => [...panel().querySelectorAll('.adesivo-nome')].map((e) => e.textContent!.trim());
    expect(chips()).toEqual(['Kanjis']);
    expect(options()).not.toContain('Redes');
    // o grupo muda no editor: o baralho de antes some da lista, os do grupo novo aparecem, e a aba diz
    // que a carta fica guardada fora dele (e que ela fica no mural)
    fixture.componentInstance['noteCategory'].set('Computação');
    await fixture.whenStable();
    expect(chips()).toEqual([]);
    expect(options()).toContain('Redes');
    expect(panel().querySelector('.dorme')!.textContent).toContain('Fora de Kanjis enquanto a anotação não for de Estudos');
    expect(panel().querySelector('.mural-txt')!.textContent!.trim()).toBe('Aparece no mural também');
    const events: SavedEvent[] = [];
    fixture.componentInstance.saved.subscribe((e) => events.push(e));
    fixture.componentInstance['mode'].set('escrever');
    await save();
    // o aviso de salvar sabe de onde ela saiu (o Desfazer devolve o grupo)
    expect(events[0].slept).toEqual({ decks: ['Kanjis'], group: 'Estudos' });
    // a carta continua, com o progresso, guardada no baralho de antes, e não vale em nenhum
    expect(store.get('nsol')!.category).toBe('Computação');
    expect(study.state().cards.find((c) => c.note === 'nsol')!.decks).toEqual([kanji]);
    expect(study.cardOf().get('nsol')!.decks).toEqual([]);
    expect(redes).toBeTruthy();
  });

  it('a carta que já existia não muda de baralho sozinha: trocado o grupo, ela dorme e ganha o "Pôr no Kana de Idiomas"', async () => {
    store.reviews.set([note('nsol', 'Sol')]);
    const kana = study.addDeck('Kana', 'amarelo', null, undefined, 'Estudos');
    const twin = study.addDeck('kana', 'rosa', null, undefined, 'Idiomas');
    study.addDeck('Outro', 'azul', null, undefined, 'Idiomas');
    study.addCard('nsol', [kana], { title: '日' });
    study.answer('nsol', true, kana);
    fixture.componentInstance.open(store.get('nsol')!);
    await fixture.whenStable();
    tab()!.click();
    await fixture.whenStable();
    const chips = () => [...panel().querySelectorAll('.adesivo-nome')].map((e) => e.textContent!.trim());
    const offers = () => [...panel().querySelectorAll<HTMLButtonElement>('.ofertas button')];
    // no mesmo grupo, nada a oferecer
    expect(offers()).toEqual([]);
    fixture.componentInstance['noteCategory'].set('Idiomas');
    await fixture.whenStable();
    // nada muda sozinho: a carta dorme no Kana de Estudos, e o de mesmo nome é oferecido
    expect(chips()).toEqual([]);
    expect(panel().querySelector('.dorme')!.textContent).toContain('Fora de Kana enquanto a anotação não for de Estudos');
    expect(offers().map((b) => b.textContent!.trim())).toEqual(['Pôr no Kana de Idiomas']);
    offers()[0].click();
    await fixture.whenStable();
    expect(chips()).toEqual(['Kana']);
    expect(offers()).toEqual([]);
    fixture.componentInstance['mode'].set('escrever');
    await save();
    // foi para o gêmeo, com o progresso de antes
    const card = study.state().cards.find((c) => c.note === 'nsol')!;
    expect(card.decks).toEqual([twin]);
    expect(card.stats.seen).toBe(1);
  });

  it('sem o toque, a carta fica guardada no baralho de antes; reaberta já no grupo novo, a oferta continua', async () => {
    store.reviews.set([note('nsol', 'Sol')]);
    const kana = study.addDeck('Kana', 'amarelo', null, undefined, 'Estudos');
    study.addDeck('Kana', 'rosa', null, undefined, 'Idiomas');
    study.addCard('nsol', [kana]);
    fixture.componentInstance.open(store.get('nsol')!);
    await fixture.whenStable();
    tab()!.click();
    await fixture.whenStable();
    fixture.componentInstance['noteCategory'].set('Idiomas');
    await fixture.whenStable();
    fixture.componentInstance['mode'].set('escrever');
    await save();
    expect(study.state().cards.find((c) => c.note === 'nsol')!.decks).toEqual([kana]);
    expect(study.cardOf().get('nsol')!.decks).toEqual([]);
    // reaberta (a anotação já em Idiomas): a carta guardada e o mesmo botão
    fixture.componentInstance.open(store.get('nsol')!);
    await fixture.whenStable();
    tab()!.click();
    await fixture.whenStable();
    expect([...panel().querySelectorAll('.ofertas button')].map((b) => b.textContent!.trim())).toEqual(['Pôr no Kana de Idiomas']);
  });

  it('a Nova carta de um baralho num grupo trocado no editor vai para o de mesmo nome do grupo novo', async () => {
    const verbos = study.addDeck('Verbos', 'rosa', null, undefined, 'Japonês');
    const twin = study.addDeck('Verbos', 'azul', null, undefined, 'Inglês');
    study.pending.set({ decks: [verbos] });
    fixture.componentInstance.openInCategory('Japonês');
    (fixture.componentInstance as unknown as { setNoteTitle(t: string): void }).setNoteTitle('To eat');
    await fixture.whenStable();
    fixture.componentInstance['noteCategory'].set('Inglês');
    await fixture.whenStable();
    fixture.componentInstance['mode'].set('escrever');
    await save();
    const saved = store.notes().find((n) => n.game.name === 'To eat')!;
    expect(saved.category).toBe('Inglês');
    expect(study.cardOf().get(saved.id)!.decks).toEqual([twin]);
  });

  it('a anotação sem grupo não vira carta: a aba pede o grupo, no lugar do Criar a frente', async () => {
    store.reviews.set([{ ...note('nlua', 'Lua'), category: undefined }]);
    study.addDeck('Kanjis', 'amarelo', null, undefined, 'Estudos');
    fixture.componentInstance.open(store.get('nlua')!);
    await fixture.whenStable();
    tab()!.click();
    await fixture.whenStable();
    expect(panel().querySelector('.vazia .papel')).toBeNull();
    expect(panel().querySelector('.vazia .sem-grupo')!.textContent).toContain('Escolha um na aba Anotação');
    // com o grupo escolhido, o Criar a frente volta, e o seletor mostra os baralhos dele
    fixture.componentInstance['noteCategory'].set('Estudos');
    await fixture.whenStable();
    panel().querySelector<HTMLButtonElement>('.vazia .papel')!.click();
    await fixture.whenStable();
    expect(panel().querySelector('.adesivo-nome')!.textContent!.trim()).toBe('Kanjis');
    // o grupo some de novo: o seletor dá a frase, e salvar diz o que falta de verdade
    fixture.componentInstance['noteCategory'].set(null);
    await fixture.whenStable();
    expect(panel().querySelector('.mais')).toBeNull();
    expect(panel().querySelector('app-study-deck-picker .sem-grupo')!.textContent).toContain('Escolha um grupo');
    fixture.componentInstance['mode'].set('escrever');
    el.querySelector<HTMLButtonElement>('.pregar .btn-ink')!.click();
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r, 0));
    await fixture.whenStable();
    expect(panel().querySelector('.erro')!.textContent).toContain('Esta anotação não tem grupo');
  });

  it('virando carta sem baralho, não salva: a aba diz o que falta', async () => {
    store.reviews.set([note('nlua', 'Lua')]);
    fixture.componentInstance.open(store.get('nlua')!);
    await fixture.whenStable();
    tab()!.click();
    await fixture.whenStable();
    panel().querySelector<HTMLButtonElement>('.vazia .papel')!.click();
    await fixture.whenStable();
    fixture.componentInstance['mode'].set('escrever');
    el.querySelector<HTMLButtonElement>('.pregar .btn-ink')!.click();
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r, 0));
    await fixture.whenStable();
    expect(tab()!.getAttribute('aria-selected')).toBe('true');
    expect(panel().querySelector('.erro')!.textContent).toContain('Escolha um baralho');
    expect(study.cardOf().has('nlua')).toBeFalse();
  });

  it('"Deixar de ser carta" tira dos Estudos ao salvar; o "Editar a frente" abre na aba', async () => {
    store.reviews.set([note('nsol', 'Sol')]);
    const deck = study.addDeck('Kanjis', 'amarelo');
    study.addCard('nsol', [deck], { title: '日' }, true);
    study.openFront.set('nsol');
    fixture.componentInstance.open(store.get('nsol')!);
    await fixture.whenStable();
    expect(tab()!.getAttribute('aria-selected')).toBe('true');
    expect(input('fc-titulo').value).toBe('日');
    expect(tab()!.querySelector('.modo-marca')).not.toBeNull();
    panel().querySelector<HTMLButtonElement>('.pe .papel.perigo')!.click();
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r, 0));
    await fixture.whenStable();
    await save();
    expect(study.cardOf().has('nsol')).toBeFalse();
  });

  it('o boletim aparece depois da primeira resposta; "Recomeçar o progresso" pergunta e a carta volta a Desconhecida', async () => {
    store.reviews.set([note('nsol', 'Sol')]);
    const deck = study.addDeck('Kanjis', 'amarelo');
    study.addCard('nsol', [deck], { title: '日' }, true);
    study.openFront.set('nsol');
    fixture.componentInstance.open(store.get('nsol')!);
    await fixture.whenStable();
    expect(panel().querySelector('app-study-report')).toBeNull();
    study.answer('nsol', true, deck);
    study.answer('nsol', false, deck);
    await fixture.whenStable();
    const report = panel().querySelector('app-study-report')!;
    expect(report.querySelector('.nivel')!.textContent).toContain('Nova');
    expect(report.querySelector('.contas')!.textContent!.replace(/\s+/g, ' ')).toContain('Vista 2 vezes · acertou 1 · errou 1');
    expect(report.querySelector('.chance strong')!.textContent).toMatch(/^\d+%$/);
    expect(report.querySelectorAll('lucide-icon.marca').length).toBe(2);
    expect(report.querySelectorAll('lucide-icon.marca.errou').length).toBe(1);
    expect(report.querySelector('.marcas .sr-only')!.textContent).toContain('acertou, errou');
    panel().querySelector<HTMLButtonElement>('.recomecar')!.click();
    await new Promise((r) => setTimeout(r, 0));
    await fixture.whenStable();
    const card = study.cardOf().get('nsol')!;
    expect(card.srs.state).toBe('nova');
    expect(card.stats.seen).toBe(0);
    expect(panel().querySelector('app-study-report')).toBeNull();
    // o Desfazer traz as respostas de volta
    const toast = TestBed.inject(Toasts).current()!;
    expect(toast.text).toBe('O progresso da carta recomeçou');
    toast.action!.run();
    expect(study.cardOf().get('nsol')!.stats.seen).toBe(2);
  });
});
