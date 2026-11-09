import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Cloud } from '../core/cloud-config';
import { Review, sanitizeReview } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { Settings } from '../core/settings';
import { SharedStore } from '../core/shared-store';
import { MAX_DECKS_PER_CARD } from '../core/study';
import { StudyStore } from '../core/study-store';
import { Confirm } from './confirm';
import { Toasts } from './toast';
import { ReviewEditor, SavedEvent } from './review-editor';
import { comMarkdown } from '../testing/writing-mode.spec';

/** A aba Flashcard do editor (PLANO-ESTUDOS.md, 6.5): virar flashcard, a frente, os baralhos, o mural, e o palco com a frente e o verso. */

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
  const stage = () => el.querySelector<HTMLElement>('app-flashcard-preview');
  /** O botão de um baralho do grupo, pelo nome. */
  const deckBtn = (name: string) => [...panel().querySelectorAll<HTMLButtonElement>('button.adesivo')].find((b) => b.textContent!.trim() === name)!;
  /** Os baralhos ligados. */
  const chips = () => [...panel().querySelectorAll('.adesivo.dentro .adesivo-nome')].map((e) => e.textContent!.trim());
  /** O interruptor "Mostrar no mural". */
  const onWall = () => panel().querySelector('[role=switch]')!.getAttribute('aria-checked');
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

  it('só nas anotações, e vazia: "Transformar em flashcard" faz da anotação um flashcard', async () => {
    fixture.componentInstance.open(undefined, undefined, undefined, undefined, 'jogos');
    await fixture.whenStable();
    expect(tab()).toBeNull();
    fixture.componentInstance.openNote('Sol (日)');
    // num grupo (sem grupo, a aba pede o grupo no lugar do "Transformar em flashcard")
    fixture.componentInstance['noteCategory'].set('Estudos');
    await fixture.whenStable();
    expect(tab()).not.toBeNull();
    tab()!.click();
    await fixture.whenStable();
    expect(panel().hidden).toBeFalse();
    expect(panel().textContent).toContain('ainda não é um flashcard');
    expect(panel().querySelector('.vazia .virar')!.textContent).toContain('Transformar em flashcard');
    expect(input('fc-titulo')).toBeNull();
    panel().querySelector<HTMLButtonElement>('.vazia .virar')!.click();
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
    panel().querySelector<HTMLButtonElement>('.vazia .virar')!.click();
    await fixture.whenStable();
    await type('fc-titulo', '日');
    await type('fc-subtitulo', 'sol, dia');
    // o último baralho usado já vem escolhido; o palco mostra a frente
    expect(chips()).toEqual(['Kanjis']);
    expect(stage()!.querySelector('app-study-card .titulo')!.textContent!.trim()).toBe('日');
    expect(onWall()).toBe('true');
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
    expect(onWall()).toBe('false');
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
    const all = () => [...panel().querySelectorAll('.adesivo-nome')].map((e) => e.textContent!.trim());
    expect(chips()).toEqual(['Kanjis']);
    expect(all()).not.toContain('Redes');
    // o grupo muda no editor: o baralho de antes some da lista, os do grupo novo aparecem, e a aba diz
    // que a carta fica guardada fora dele (e que ela fica no mural)
    fixture.componentInstance['noteCategory'].set('Computação');
    await fixture.whenStable();
    expect(chips()).toEqual([]);
    expect(all()).toContain('Redes');
    expect(panel().querySelector('.dorme')!.textContent).toContain('Fora de Kanjis, do grupo Estudos');
    expect(onWall()).toBe('true');
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
    const offers = () => [...panel().querySelectorAll<HTMLButtonElement>('.ofertas button')];
    // no mesmo grupo, nada a oferecer
    expect(offers()).toEqual([]);
    fixture.componentInstance['noteCategory'].set('Idiomas');
    await fixture.whenStable();
    // nada muda sozinho: a carta dorme no Kana de Estudos, e o de mesmo nome é oferecido
    expect(chips()).toEqual([]);
    expect(panel().querySelector('.dorme')!.textContent).toContain('Fora de Kana, do grupo Estudos');
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

  it('a anotação sem grupo não vira flashcard: a aba leva ao grupo, no lugar do Transformar', async () => {
    store.reviews.set([{ ...note('nlua', 'Lua'), category: undefined }]);
    study.addDeck('Kanjis', 'amarelo', null, undefined, 'Estudos');
    fixture.componentInstance.open(store.get('nlua')!);
    await fixture.whenStable();
    tab()!.click();
    await fixture.whenStable();
    expect(panel().querySelector('.vazia .virar')!.textContent).toContain('Escolher o grupo');
    expect(panel().querySelector('.vazia .sem-grupo')!.textContent).toContain('falta o grupo');
    // "Escolher o grupo" leva até ele, na aba Anotação
    panel().querySelector<HTMLButtonElement>('.vazia .virar')!.click();
    await fixture.whenStable();
    expect(el.querySelector('#editor-modo-escrever')!.getAttribute('aria-selected')).toBe('true');
    tab()!.click();
    await fixture.whenStable();
    // com o grupo escolhido, o Transformar volta, e o seletor mostra os baralhos dele
    fixture.componentInstance['noteCategory'].set('Estudos');
    await fixture.whenStable();
    panel().querySelector<HTMLButtonElement>('.vazia .virar')!.click();
    await fixture.whenStable();
    expect(chips()).toEqual(['Kanjis']);
    // o grupo some de novo: o seletor dá a frase, e salvar diz o que falta de verdade
    fixture.componentInstance['noteCategory'].set(null);
    await fixture.whenStable();
    expect(panel().querySelector('.adesivo, .mais')).toBeNull();
    expect(panel().querySelector('app-study-deck-picker .sem-grupo')!.textContent).toContain('Escolha um grupo');
    fixture.componentInstance['mode'].set('escrever');
    el.querySelector<HTMLButtonElement>('.pregar .btn-ink')!.click();
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r, 0));
    await fixture.whenStable();
    expect(panel().querySelector('.erro')!.textContent).toContain('Esta anotação não tem grupo');
  });

  it('virando flashcard sem baralho, não salva: a aba diz o que falta', async () => {
    store.reviews.set([note('nlua', 'Lua')]);
    fixture.componentInstance.open(store.get('nlua')!);
    await fixture.whenStable();
    tab()!.click();
    await fixture.whenStable();
    panel().querySelector<HTMLButtonElement>('.vazia .virar')!.click();
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

  it('"Deixar de ser flashcard de estudos" tira dos Estudos ao salvar; os ajustes dele abrem na aba', async () => {
    store.reviews.set([note('nsol', 'Sol')]);
    const deck = study.addDeck('Kanjis', 'amarelo');
    study.addCard('nsol', [deck], { title: '日' }, true);
    fixture.componentInstance.openAt(store.get('nsol')!, 'flashcard');
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

  it('o "Ver o progresso" (o menu do flashcard) abre a aba com o Progresso aberto e o foco nele; reaberto de outro jeito, recolhido', async () => {
    store.reviews.set([note('nsol', 'Sol')]);
    const deck = study.addDeck('Kanjis', 'amarelo');
    study.addCard('nsol', [deck], { title: '日' }, true);
    study.answer('nsol', true, deck);
    fixture.componentInstance.openAt(store.get('nsol')!, 'flashcard', 'progresso');
    await fixture.whenStable();
    // o foco chega depois do da aba (no tempo seguinte) e da volta das rolagens (no quadro seguinte)
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => requestAnimationFrame(r));
    await new Promise((r) => requestAnimationFrame(r));
    const box = panel().querySelector<HTMLDetailsElement>('details.progresso')!;
    expect(box.open).toBeTrue();
    expect(document.activeElement).toBe(box.querySelector('summary'));
    expect(box.querySelector('app-study-report')).not.toBeNull();
    el.querySelector<HTMLDialogElement>('dialog')!.close();
    await fixture.whenStable();
    fixture.componentInstance.openAt(store.get('nsol')!, 'flashcard');
    await fixture.whenStable();
    expect(panel().querySelector<HTMLDetailsElement>('details.progresso')!.open).toBeFalse();
  });

  it('"Deixar de ser flashcard de estudos" salvo avisa com Desfazer, e o evento diz para o aviso de salvar não cobri-lo', async () => {
    store.reviews.set([note('nsol', 'Sol')]);
    const deck = study.addDeck('Kanjis', 'amarelo', null, undefined, 'Estudos');
    study.addCard('nsol', [deck], { title: '日' }, true);
    const events: SavedEvent[] = [];
    fixture.componentInstance.saved.subscribe((e) => events.push(e));
    fixture.componentInstance.openAt(store.get('nsol')!, 'flashcard');
    await fixture.whenStable();
    panel().querySelector<HTMLButtonElement>('.pe .papel.perigo')!.click();
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r, 0));
    await fixture.whenStable();
    await save();
    const toasts = TestBed.inject(Toasts);
    expect(toasts.current()!.text).toContain('saiu dos Flashcards');
    expect(events[0].onlyPlace).toBeTrue();
    expect(events[0].acted).toBeTrue();
    toasts.current()!.action!.run();
    expect(study.cardOf().has('nsol')).toBeTrue();
    toasts.dismiss();
  });

  it('só o flashcard mudou: a anotação fica como está, sem hora nova', async () => {
    store.reviews.set([note('nsol', 'Sol')]);
    const deck = study.addDeck('Kanjis', 'amarelo', null, undefined, 'Estudos');
    study.addCard('nsol', [deck], { title: '日' }, true);
    const before = store.get('nsol')!;
    fixture.componentInstance.openAt(before, 'flashcard');
    await fixture.whenStable();
    await type('fc-subtitulo', 'nichi');
    await save();
    expect(study.cardOf().get('nsol')!.front.subtitle).toBe('nichi');
    expect(store.get('nsol')).toBe(before);
  });

  it('os baralhos do grupo ficam à vista: um toque liga, outro desliga, e nada muda de lugar', async () => {
    store.reviews.set([note('nsol', 'Sol')]);
    const kanji = study.addDeck('Kanjis', 'amarelo', null, undefined, 'Estudos');
    const quimica = study.addDeck('Química', 'azul', null, undefined, 'Estudos');
    const vazio = study.addDeck('Vazio', 'verde', null, undefined, 'Estudos');
    study.addCard('nsol', [kanji], {}, true);
    fixture.componentInstance.openAt(store.get('nsol')!, 'flashcard');
    await fixture.whenStable();
    const names = () => [...panel().querySelectorAll('.adesivo-nome')].map((e) => e.textContent!.trim());
    const order = names();
    expect(deckBtn('Kanjis').getAttribute('aria-pressed')).toBe('true');
    expect(deckBtn('Vazio').getAttribute('aria-pressed')).toBe('false');
    deckBtn('Vazio').click();
    await fixture.whenStable();
    deckBtn('Química').click();
    await fixture.whenStable();
    expect(names()).toEqual(order);
    expect(chips().length).toBe(3);
    deckBtn('Química').click();
    await fixture.whenStable();
    deckBtn('Química').click();
    await fixture.whenStable();
    await save();
    expect(study.cardOf().get('nsol')!.decks).toEqual([kanji, vazio, quimica]);
  });

  it('"Novo baralho" abre o campo, cria no grupo da anotação e já liga o baralho novo', async () => {
    store.reviews.set([note('nsol', 'Sol')]);
    study.addCard('nsol', [study.addDeck('Kanjis', 'amarelo', null, undefined, 'Estudos')], {}, true);
    fixture.componentInstance.openAt(store.get('nsol')!, 'flashcard');
    await fixture.whenStable();
    panel().querySelector<HTMLButtonElement>('.mais')!.click();
    await fixture.whenStable();
    const name = panel().querySelector<HTMLInputElement>('.campo-novo input')!;
    name.value = 'Verbos';
    panel().querySelector<HTMLButtonElement>('.novo .tinta')!.click();
    await fixture.whenStable();
    expect(chips()).toEqual(['Kanjis', 'Verbos']);
    expect(study.decks().find((d) => d.name === 'Verbos')!.group).toBe('Estudos');
  });

  it('no limite de baralhos, os que estão fora não ligam mais e o Novo baralho sai', async () => {
    store.reviews.set([note('nsol', 'Sol')]);
    const ids = Array.from({ length: MAX_DECKS_PER_CARD }, (_, i) => study.addDeck(`B${i}`, 'amarelo', null, undefined, 'Estudos'));
    study.addDeck('Fora', 'azul', null, undefined, 'Estudos');
    study.addCard('nsol', ids, {}, true);
    fixture.componentInstance.openAt(store.get('nsol')!, 'flashcard');
    await fixture.whenStable();
    expect(deckBtn('Fora').disabled).toBeTrue();
    expect(panel().querySelector('.mais')).toBeNull();
  });

  it('os baralhos de outro grupo em que ele dorme não contam para o limite', async () => {
    store.reviews.set([note('nsol', 'Sol')]);
    const old = Array.from({ length: MAX_DECKS_PER_CARD }, (_, i) => study.addDeck(`Antigo ${i}`, 'amarelo', null, undefined, 'Estudos'));
    study.addDeck('Novo', 'azul', null, undefined, 'Idiomas');
    study.addCard('nsol', old, {}, true);
    fixture.componentInstance.openAt(store.get('nsol')!, 'flashcard');
    await fixture.whenStable();
    fixture.componentInstance['noteCategory'].set('Idiomas');
    await fixture.whenStable();
    expect(deckBtn('Novo').disabled).toBeFalse();
    expect(panel().querySelector('.mais')).not.toBeNull();
  });

  it('o palco mostra o flashcard só nesta aba: a frente e o verso, com o que está no editor, sem salvar', async () => {
    store.reviews.set([{ ...note('nsol', 'Sol'), text: 'Texto salvo' }]);
    study.addCard('nsol', [study.addDeck('Kanjis', 'amarelo', null, undefined, 'Estudos')], { title: '日' }, true);
    fixture.componentInstance.open(store.get('nsol')!);
    await fixture.whenStable();
    expect(stage()).toBeNull();
    expect(el.querySelector('.palco')!.getAttribute('aria-label')).toBe('A ficha no mural');
    fixture.componentInstance['text'].set('Texto ainda sem salvar');
    tab()!.click();
    await fixture.whenStable();
    expect(el.querySelector('.palco')!.getAttribute('aria-label')).toBe('O flashcard: frente e verso');
    expect(getComputedStyle(el.querySelector('.previa-slot')!).display).toBe('none');
    expect([...stage()!.querySelectorAll('.rotulo-lado')].map((n) => n.textContent!.trim())).toEqual(['Frente', 'Verso']);
    expect(stage()!.querySelector('app-study-card .titulo')!.textContent!.trim()).toBe('日');
    expect(stage()!.querySelector('article .verso-texto')!.textContent).toContain('Texto ainda sem salvar');
    // o que se escreve na aba chega à frente e ao verso na hora
    await type('fc-titulo', '月');
    expect(stage()!.querySelector('app-study-card .titulo')!.textContent!.trim()).toBe('月');
    expect(stage()!.querySelector('article .verso-titulo')!.textContent).toContain('月');
    // nada do verso pega o toque nem o foco: os links levariam para fora do editor
    expect(stage()!.querySelector<HTMLElement>('article .verso-resposta')!.inert).toBeTrue();
    // saindo da aba, a ficha volta
    (el.querySelector('#editor-modo-escrever') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(stage()).toBeNull();
    expect(getComputedStyle(el.querySelector('.previa-slot')!).display).not.toBe('none');
  });

  it('o nome de cada lado leva a quem o edita: a frente, ao título; o verso, à aba Anotação', async () => {
    store.reviews.set([note('nsol', 'Sol')]);
    study.addCard('nsol', [study.addDeck('Kanjis', 'amarelo', null, undefined, 'Estudos')], {}, true);
    fixture.componentInstance.openAt(store.get('nsol')!, 'flashcard');
    await fixture.whenStable();
    const sides = () => [...stage()!.querySelectorAll<HTMLButtonElement>('button.rotulo-lado')];
    // o foco de quem abriu o editor chega depois de um quadro
    await new Promise((r) => requestAnimationFrame(r));
    await new Promise((r) => setTimeout(r, 0));
    sides()[0].click();
    await fixture.whenStable();
    expect(document.activeElement).toBe(input('fc-titulo'));
    sides()[1].click();
    await fixture.whenStable();
    expect(el.querySelector('#editor-modo-escrever')!.getAttribute('aria-selected')).toBe('true');
  });

  it('ainda não sendo flashcard, o palco mostra os dois lados apagados e sem levar a lugar nenhum', async () => {
    store.reviews.set([note('nsol', 'Sol')]);
    fixture.componentInstance.open(store.get('nsol')!);
    await fixture.whenStable();
    tab()!.click();
    await fixture.whenStable();
    expect(stage()!.querySelector('.par.ainda-nao')).not.toBeNull();
    expect(stage()!.querySelector('button.rotulo-lado')).toBeNull();
    expect(stage()!.querySelector('app-study-card .titulo')!.textContent!.trim()).toBe('Sol');
  });

  it('a anotação nova, ainda sem nome: os dois lados dizem "Sem nome", e o verso não fica com o título vazio', async () => {
    fixture.componentInstance.openNote('');
    fixture.componentInstance['noteCategory'].set('Estudos');
    await fixture.whenStable();
    tab()!.click();
    await fixture.whenStable();
    expect(stage()!.querySelector('app-study-card .titulo')!.textContent!.trim()).toBe('Sem nome');
    expect(stage()!.querySelector('article .verso-titulo')!.textContent!.trim()).toBe('Sem nome');
    expect(stage()!.querySelector('article .verso-vazio')!.textContent).toContain('não tem texto');
  });

  it('faltando o baralho, o nome dele já pede, antes do erro de salvar; sem nenhum no grupo, pede para criar', async () => {
    store.reviews.set([note('nsol', 'Sol')]);
    fixture.componentInstance.open(store.get('nsol')!);
    await fixture.whenStable();
    tab()!.click();
    await fixture.whenStable();
    panel().querySelector<HTMLButtonElement>('.vazia .virar')!.click();
    await fixture.whenStable();
    expect(panel().querySelector('.falta')!.textContent).toBe('crie um');
    const a = study.addDeck('Kanjis', 'amarelo', null, undefined, 'Estudos');
    study.addDeck('Verbos', 'rosa', null, undefined, 'Estudos');
    await fixture.whenStable();
    expect(panel().querySelector('.falta')!.textContent).toBe('escolha um');
    deckBtn('Kanjis').click();
    await fixture.whenStable();
    expect(panel().querySelector('.falta')).toBeNull();
    expect(a).toBeTruthy();
  });

  it('a linha do verso diz o que ele é e leva à aba Anotação', async () => {
    store.reviews.set([note('nsol', 'Sol')]);
    study.addCard('nsol', [study.addDeck('Kanjis', 'amarelo', null, undefined, 'Estudos')], {}, true);
    fixture.componentInstance.openAt(store.get('nsol')!, 'flashcard');
    await fixture.whenStable();
    expect(panel().querySelector('.verso-txt')!.textContent).toBe('A anotação inteira');
    panel().querySelector<HTMLButtonElement>('.linha-so .papel')!.click();
    await fixture.whenStable();
    expect(el.querySelector('#editor-modo-escrever')!.getAttribute('aria-selected')).toBe('true');
  });

  it('a imagem por link: o campo só abre pedido, recusa o que não é https e fecha ao valer', async () => {
    store.reviews.set([note('nsol', 'Sol')]);
    study.addCard('nsol', [study.addDeck('Kanjis', 'amarelo', null, undefined, 'Estudos')], {}, true);
    fixture.componentInstance.openAt(store.get('nsol')!, 'flashcard');
    await fixture.whenStable();
    const field = () => panel().querySelector<HTMLInputElement>('.link input');
    expect(field()).toBeNull();
    panel().querySelector<HTMLButtonElement>('.link-btn')!.click();
    await fixture.whenStable();
    field()!.value = 'http://errado.com/a.png';
    field()!.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    expect(panel().querySelector('.erro')!.textContent).toContain('https://');
    // o Esc fecha só o campo, sem o cancel do diálogo, e o erro do link recusado sai junto
    const esc = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    const open = field()!;
    open.dispatchEvent(esc);
    open.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    expect(esc.defaultPrevented).toBeTrue();
    expect(field()).toBeNull();
    expect(panel().querySelector('.erro')).toBeNull();
    expect(el.querySelector('dialog')!.open).toBeTrue();
    panel().querySelector<HTMLButtonElement>('.link-btn')!.click();
    await fixture.whenStable();
    field()!.value = 'https://certo.com/a.png';
    field()!.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    expect(field()).toBeNull();
    expect(panel().querySelector('.erro')).toBeNull();
    expect(panel().querySelector('.foto')!.textContent).toContain('Tirar imagem');
    await save();
    expect(study.cardOf().get('nsol')!.front.image).toBe('https://certo.com/a.png');
  });

  it('só o flashcard mudou e a privada entrou num baralho público: o aviso continua vindo', async () => {
    store.reviews.set([{ ...note('nsol', 'Sol'), private: true }]);
    const deck = study.addDeck('Kanjis', 'amarelo', null, undefined, 'Estudos');
    const pub = study.addDeck('Público', 'azul', null, undefined, 'Estudos');
    study.updateDeck(pub, { public: true });
    study.addCard('nsol', [deck], {}, true);
    const events: SavedEvent[] = [];
    fixture.componentInstance.saved.subscribe((e) => events.push(e));
    fixture.componentInstance.openAt(store.get('nsol')!, 'flashcard');
    await fixture.whenStable();
    deckBtn('Público').click();
    await fixture.whenStable();
    await save();
    expect(events[0].onlyPlace).toBeTrue();
    expect(events[0].privateInPublic).toBeTrue();
  });

  it('sem grupo, quem só lê é levado a Grupo e tags, e não à aba Anotação que não tem', async () => {
    store.reviews.set([{ ...note('nsol', 'Sol'), category: undefined } as Review]);
    spyOn(TestBed.inject(SharedStore), 'role').and.returnValue('leitor');
    fixture.componentInstance.openAt(store.get('nsol')!, 'flashcard');
    await fixture.whenStable();
    expect(panel().querySelector('.sem-grupo')!.textContent).toContain('em Grupo e tags, na leitura da anotação');
    expect(panel().querySelector('.sem-grupo')!.textContent).not.toContain('aba Anotação');
  });

  it('a nota só de leitura: o flashcard muda ao salvar, e a anotação não; o verso não leva a uma aba que não tem', async () => {
    store.reviews.set([note('nsol', 'Sol')]);
    const deck = study.addDeck('Kanjis', 'amarelo', null, undefined, 'Estudos');
    study.addCard('nsol', [deck], { title: '日' }, true);
    spyOn(TestBed.inject(SharedStore), 'role').and.returnValue('leitor');
    const before = store.get('nsol')!;
    fixture.componentInstance.openAt(before, 'flashcard');
    await fixture.whenStable();
    expect(tab()!.getAttribute('aria-selected')).toBe('true');
    expect(el.querySelector('#editor-modo-escrever')).toBeNull();
    expect([...stage()!.querySelectorAll('button.rotulo-lado')].map((b) => b.textContent!.trim())).toEqual(['Frente']);
    expect(panel().querySelector('.linha-so .papel')).toBeNull();
    await type('fc-subtitulo', 'nichi');
    await save();
    expect(study.cardOf().get('nsol')!.front.subtitle).toBe('nichi');
    expect(store.get('nsol')).toBe(before);
  });

  it('o progresso aparece recolhido depois da primeira resposta; "Recomeçar o progresso" pergunta e o flashcard volta a Desconhecido', async () => {
    store.reviews.set([note('nsol', 'Sol')]);
    const deck = study.addDeck('Kanjis', 'amarelo');
    study.addCard('nsol', [deck], { title: '日' }, true);
    fixture.componentInstance.openAt(store.get('nsol')!, 'flashcard');
    await fixture.whenStable();
    expect(panel().querySelector('app-study-report')).toBeNull();
    study.answer('nsol', true, deck);
    study.answer('nsol', false, deck);
    await fixture.whenStable();
    const report = panel().querySelector('app-study-report')!;
    expect(panel().querySelector('.progresso')!.hasAttribute('open')).toBeFalse();
    expect(panel().querySelector('.progresso .resumo')!.textContent).toBe('Novo · visto 2 vezes');
    expect(report.querySelector('.nivel')!.textContent).toContain('Novo');
    expect(report.querySelector('.contas')!.textContent!.replace(/\s+/g, ' ')).toContain('Visto 2 vezes · acertou 1 · errou 1');
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
    expect(toast.text).toBe('O progresso do flashcard recomeçou');
    toast.action!.run();
    expect(study.cardOf().get('nsol')!.stats.seen).toBe(2);
  });
});
