import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Review, sanitizeReview } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { StudyStore } from '../core/study-store';
import { SPEECH, UTTERANCE, Voz } from '../core/voz';
import { FakeSpeech, GOOGLE_JA, GOOGLE_PT, GOOGLE_UK_MALE, fakeUtterance } from '../testing/fala-falsa';
import { StudyDeckSheet } from './study-deck-sheet';

/** A folha "Ajustes do baralho": a voz que lê o título do flashcard ao virar (`Deck.voice`). */

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
