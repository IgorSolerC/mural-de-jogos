import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Review, sanitizeReview } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { StudyStore } from '../core/study-store';
import { SPEECH, UTTERANCE, Voz } from '../core/voz';
import { FakeSpeech, GOOGLE_JA, GOOGLE_PT, GOOGLE_UK_MALE, fakeUtterance } from '../testing/fala-falsa';
import { Confirm } from './confirm';
import { StudyDeckSheet } from './study-deck-sheet';
import { Toasts } from './toast';

/** A folha "Ajustes do baralho": a voz que lê o título do flashcard ao virar (`Deck.voice`), a pausa e o recomeçar. */

const T0 = '2026-11-20T10:00:00.000Z';
const note = (id: string, name: string): Review => ({ ...sanitizeReview({ kind: 'anotacoes', category: 'Japonês', game: { name }, completedAt: '2026-11-20', createdAt: T0 })!, id });

describe('a folha do baralho: ler o título ao virar', () => {
  let fixture: ComponentFixture<StudyDeckSheet>;
  let study: StudyStore;
  let fake: FakeSpeech;
  let deck: string;

  async function settle(): Promise<void> {
    for (let i = 0; i < 3; i++) {
      await new Promise((r) => setTimeout(r, 0));
      fixture.detectChanges();
      await fixture.whenStable();
    }
  }
  const el = () => fixture.nativeElement as HTMLElement;
  const text = (e: Element | null) => e?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const group = () => el().querySelector<HTMLElement>('[role="radiogroup"][aria-labelledby="ba-voz-t"]')!;
  const options = () => [...group().querySelectorAll<HTMLButtonElement>('[role="radio"]')];
  const pick = async (label: string) => {
    options().find((b) => text(b) === label)!.click();
    await settle();
  };
  const hint = () => text(el().querySelector('#ba-voz-dica'));

  beforeEach(async () => {
    localStorage.clear();
    fake = new FakeSpeech();
    fake.list = [GOOGLE_JA, GOOGLE_PT, GOOGLE_UK_MALE];
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), { provide: SPEECH, useValue: fake }, { provide: UTTERANCE, useValue: fakeUtterance }] });
    TestBed.inject(ReviewStore).reviews.set([note('nsol', 'Sol')]);
    study = TestBed.inject(StudyStore);
    deck = study.addDeck('Kanji', 'vermelho', null, undefined, 'Japonês');
    study.addCard('nsol', [deck], { title: '日' });
    fixture = TestBed.createComponent(StudyDeckSheet);
    fixture.componentRef.setInput('deckId', deck);
    document.body.appendChild(fixture.nativeElement);
    await settle();
  });

  afterEach(() => {
    el().querySelector('dialog')?.close();
    fixture.destroy();
    fixture.nativeElement.remove();
    localStorage.clear();
  });

  it('as quatro escolhas, com Sem voz marcado no baralho de antes', () => {
    expect(text(el().querySelector('#ba-voz-t'))).toBe('Ler o título ao virar');
    expect(options().map(text)).toEqual(['Sem voz', 'Português', 'Inglês', 'Japonês']);
    expect(options().map((b) => b.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false', 'false']);
    expect(hint()).toBe('Ao virar, o flashcard fica em silêncio.');
  });

  it('escolher uma língua guarda no baralho e diz o título da primeira carta nela, para ouvir na hora', async () => {
    await pick('Japonês');
    expect(study.deck(deck)!.voice).toBe('ja');
    expect(options().map((b) => b.getAttribute('aria-checked'))).toEqual(['false', 'false', 'false', 'true']);
    expect(fake.spoken.map((u) => [u.text, u.voice?.name])).toEqual([['日', GOOGLE_JA.name]]);
    expect(hint()).toBe('Ao virar, o título é lido em voz alta em japonês, na voz e na velocidade de ouvir a nota neste aparelho.');
    await pick('Inglês');
    expect(study.deck(deck)!.voice).toBe('en');
    expect(fake.spoken.at(-1)!.voice?.name).toBe(GOOGLE_UK_MALE.name);
  });

  it('a mesma de novo só repete a amostra: o baralho não muda', async () => {
    await pick('Português');
    const at = study.deck(deck)!.at;
    await new Promise((r) => setTimeout(r, 5));
    await pick('Português');
    expect(study.deck(deck)!.at).toBe(at);
    expect(fake.spoken.length).toBe(2);
  });

  it('Sem voz tira o campo e cala a amostra; no baralho público, a dica diz que quem visita também ouve', async () => {
    study.updateDeck(deck, { public: true });
    await pick('Japonês');
    expect(hint()).toContain('Quem visita também ouve.');
    await pick('Sem voz');
    expect('voice' in study.deck(deck)!).toBeFalse();
    expect(TestBed.inject(Voz).playing()).toBeFalse();
  });

  it('sem voz nessa língua neste navegador, a dica diz, e a amostra não fala com a voz errada', async () => {
    fake.setVoices([GOOGLE_PT]);
    await pick('Japonês');
    expect(study.deck(deck)!.voice).toBe('ja');
    expect(fake.spoken.length).toBe(0);
    expect(hint()).toBe('Ao virar, o título é lido em voz alta em japonês nos aparelhos com voz em japonês: este navegador não tem.');
  });

  it('fechar a folha cala a amostra', async () => {
    await pick('Japonês');
    expect(TestBed.inject(Voz).playing()).toBeTrue();
    fixture.destroy();
    expect(TestBed.inject(Voz).playing()).toBeFalse();
  });
});

describe('a folha do baralho: estudar ou pausar', () => {
  let fixture: ComponentFixture<StudyDeckSheet>;
  let study: StudyStore;
  let deck: string;

  async function settle(): Promise<void> {
    for (let i = 0; i < 3; i++) {
      await new Promise((r) => setTimeout(r, 0));
      fixture.detectChanges();
      await fixture.whenStable();
    }
  }
  const el = () => fixture.nativeElement as HTMLElement;
  const text = (e: Element | null) => e?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const options = () => [...el().querySelectorAll<HTMLButtonElement>('[role="radiogroup"][aria-labelledby="ba-estudo-t"] [role="radio"]')];
  const pick = async (label: string) => {
    options().find((b) => text(b) === label)!.click();
    await settle();
  };
  const hint = () => text(el().querySelector('#ba-estudo-dica'));

  beforeEach(async () => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    TestBed.inject(ReviewStore).reviews.set([note('nsol', 'Sol')]);
    study = TestBed.inject(StudyStore);
    deck = study.addDeck('Kanji', 'vermelho', null, undefined, 'Japonês');
    study.addCard('nsol', [deck], { title: '日' });
    fixture = TestBed.createComponent(StudyDeckSheet);
    fixture.componentRef.setInput('deckId', deck);
    document.body.appendChild(fixture.nativeElement);
    await settle();
  });

  afterEach(() => {
    el().querySelector('dialog')?.close();
    fixture.destroy();
    fixture.nativeElement.remove();
    localStorage.clear();
  });

  it('logo depois do nome, as duas etiquetas, com Em estudo marcado, e a dica do que a pausa faz', () => {
    const titles = [...el().querySelectorAll('.grupo-titulo')].map(text);
    expect(titles.slice(0, 3)).toEqual(['Nome', 'Estudo', 'Quem vê']);
    expect(options().map(text)).toEqual(['Em estudo', 'Pausado']);
    expect(options().map((b) => b.getAttribute('aria-checked'))).toEqual(['true', 'false']);
    expect(hint()).toBe('Os flashcards dele entram nos montes de hoje. Pausado, nada dele chama para estudar.');
  });

  it('Pausado pausa na hora, e a dica diz desde quando e o que o retomar faz; Em estudo retoma', async () => {
    await pick('Pausado');
    expect(study.deck(deck)!.paused).toBeDefined();
    expect(options().map((b) => b.getAttribute('aria-checked'))).toEqual(['false', 'true']);
    expect(hint()).toBe('Pausado desde hoje: nada dele entra nos montes de hoje. Ao retomar, cada flashcard volta a faltar o tempo que faltava.');
    // a mesma de novo não muda a hora da pausa
    const since = study.deck(deck)!.paused;
    await pick('Pausado');
    expect(study.deck(deck)!.paused).toBe(since);
    await pick('Em estudo');
    expect('paused' in study.deck(deck)!).toBeFalse();
  });
});

describe('a folha do baralho: recomeçar o progresso', () => {
  let fixture: ComponentFixture<StudyDeckSheet>;
  let study: StudyStore;
  let deck: string;
  let other: string;
  let asked: { title?: string; text: string }[];
  let answer: boolean;

  async function settle(): Promise<void> {
    for (let i = 0; i < 3; i++) {
      await new Promise((r) => setTimeout(r, 0));
      fixture.detectChanges();
      await fixture.whenStable();
    }
  }
  const el = () => fixture.nativeElement as HTMLElement;
  const text = (e: Element | null) => e?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const button = () => el().querySelector<HTMLButtonElement>('.recomecar-baralho')!;

  beforeEach(async () => {
    localStorage.clear();
    asked = [];
    answer = true;
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        {
          provide: Confirm,
          useValue: {
            ask: async (o: { title?: string; text: string }) => {
              asked.push(o);
              return answer;
            },
          },
        },
      ],
    });
    TestBed.inject(ReviewStore).reviews.set([note('nsol', 'Sol'), note('nlua', 'Lua'), note('nfogo', 'Fogo')]);
    study = TestBed.inject(StudyStore);
    deck = study.addDeck('Kanji', 'vermelho', null, undefined, 'Japonês');
    other = study.addDeck('Kana', 'azul', null, undefined, 'Japonês');
    study.addCard('nsol', [deck], { title: '日' });
    study.addCard('nlua', [deck, other], { title: '月' });
    study.addCard('nfogo', [deck], { title: '火' });
    fixture = TestBed.createComponent(StudyDeckSheet);
    fixture.componentRef.setInput('deckId', deck);
    document.body.appendChild(fixture.nativeElement);
    await settle();
  });

  afterEach(() => {
    el().querySelector('dialog')?.close();
    fixture.destroy();
    fixture.nativeElement.remove();
    localStorage.clear();
  });

  it('sem nada estudado, o botão fica apagado e a dica diz por quê', () => {
    expect(text(button())).toBe('Recomeçar o progresso');
    expect(button().disabled).toBeTrue();
    expect(text(el().querySelector('#ba-recomecar-dica'))).toBe('Nenhum flashcard dele foi estudado ainda: não há progresso a recomeçar.');
  });

  it('pergunta antes, com quantos e o que está noutro baralho; Recomeçar deixa todos novos, com o Desfazer no aviso', async () => {
    study.answer('nsol', true, deck);
    study.answer('nlua', false, deck);
    await settle();
    expect(button().disabled).toBeFalse();
    expect(el().querySelector('#ba-recomecar-dica')).toBeNull();
    const lua = study.cardOf().get('nlua')!.srs;
    const toasts = TestBed.inject(Toasts);
    const shown = spyOn(toasts, 'show').and.callThrough();
    button().click();
    await settle();
    expect(asked).toEqual([
      jasmine.objectContaining({
        title: 'Recomeçar o progresso de Kanji?',
        text: 'Os 2 flashcards estudados dele voltam a ser Desconhecidos: as respostas saem, e eles entram de novo como novos, 5 por dia. 1 deles também está em outro baralho, e recomeça lá também.',
      }),
    ]);
    expect(['nsol', 'nlua'].map((n) => study.cardOf().get(n)!.srs.state)).toEqual(['nova', 'nova']);
    expect(study.cardOf().get('nlua')!.stats.seen).toBe(0);
    const [msg, action] = shown.calls.mostRecent().args as [string, { label: string; run: () => void }];
    expect(msg).toBe('O progresso de Kanji recomeçou: 2 flashcards voltaram a ser novos');
    expect(action.label).toBe('Desfazer');
    action.run();
    expect(study.cardOf().get('nsol')!.stats.seen).toBe(1);
    expect(study.cardOf().get('nlua')!.srs).toEqual(lua);
  });

  it('Deixar não muda nada', async () => {
    study.answer('nsol', true, deck);
    await settle();
    answer = false;
    button().click();
    await settle();
    expect(asked.length).toBe(1);
    expect(asked[0].text).toBe('O flashcard estudado dele volta a ser Desconhecido: as respostas saem, e ele entra de novo como novo, 5 por dia.');
    expect(study.cardOf().get('nsol')!.srs.state).toBe('aprendendo');
  });
});
