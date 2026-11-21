import { Component, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, RouterOutlet, provideRouter } from '@angular/router';
import { studyPath } from '../core/areas';
import { addStudyDays, dayStart, studyDay } from '../core/fsrs';
import { Review, sanitizeReview } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { studyGroupId } from '../core/study';
import { StudyStore } from '../core/study-store';
import { Confirm } from '../ui/confirm';
import { setEverythingNear } from '../ui/near-screen';
import { Toasts } from '../ui/toast';
import { StudyPage } from './study-page';

/** O baralho pausado na página dos Flashcards: o topo, a pilha, a parede e o Retomar. */

@Component({ selector: 'app-raiz', imports: [RouterOutlet], template: '<router-outlet />' })
class Raiz {}

const T0 = '2026-10-10T10:00:00.000Z';
const note = (id: string, title: string): Review => ({ ...sanitizeReview({ kind: 'anotacoes', category: 'Estudos', game: { name: title }, completedAt: '2026-10-01', createdAt: T0, updatedAt: T0 })!, id });
const GROUP = studyGroupId('Estudos');
const DAY = 86_400_000;

describe('o baralho pausado na página dos Flashcards', () => {
  let host: HTMLElement;
  let study: StudyStore;
  let router: Router;
  let kanji: string;
  let quimica: string;

  async function settle(): Promise<void> {
    for (let i = 0; i < 4; i++) {
      await new Promise((r) => setTimeout(r, 0));
      TestBed.tick();
    }
  }
  async function go(url: string): Promise<void> {
    await router.navigateByUrl(url);
    await settle();
  }
  const $ = (sel: string) => host.querySelector<HTMLElement>(sel);
  const text = (el: Element | null) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

  /** A pausa de `days` dias atrás, com a carta do sol em revisão para 3 dias depois dela (respondida 5 dias antes). */
  function pausedAgo(days: number): void {
    const since = new Date(Date.now() - days * DAY);
    study.saved.update((st) => ({
      ...st,
      decks: st.decks.map((d) => (d.id === kanji ? { ...d, paused: since.toISOString(), at: since.toISOString() } : d)),
      cards: st.cards.map((c) =>
        c.note === 'nsol' ? { ...c, srs: { state: 'revisao', step: 0, s: 8, d: 5, due: dayStart(addStudyDays(studyDay(since), 3)).toISOString(), last: new Date(since.getTime() - 5 * DAY).toISOString(), reps: 3 } } : c,
      ),
    }));
  }

  beforeEach(() => {
    localStorage.clear();
    setEverythingNear(true);
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([
          { path: 'anotacoes/estudos', component: StudyPage },
          { path: 'anotacoes/estudos/:grupo', component: StudyPage },
          { path: 'anotacoes/estudos/:grupo/:baralho', component: StudyPage },
        ]),
        { provide: Confirm, useValue: { ask: async () => true } },
      ],
    });
    TestBed.inject(ReviewStore).reviews.set([note('nsol', 'Sol'), note('nlua', 'Lua'), note('nagua', 'Água')]);
    study = TestBed.inject(StudyStore);
    router = TestBed.inject(Router);
    kanji = study.addDeck('Kanjis', 'amarelo', 'livro');
    quimica = study.addDeck('Química', 'verde');
    study.addCard('nsol', [kanji], { title: '日' });
    study.addCard('nlua', [kanji], { title: '月' });
    study.addCard('nagua', [quimica]);
    const fixture = TestBed.createComponent(Raiz);
    host = fixture.nativeElement;
    document.body.appendChild(host);
  });
  afterEach(() => {
    document.querySelectorAll('dialog[open]').forEach((d) => (d as HTMLDialogElement).close());
    host.remove();
    localStorage.clear();
    setEverythingNear(false);
  });

  it('no topo do baralho pausado: "Pausado", desde quando, o Retomar no lugar do Estudar, e o Treinar continua', async () => {
    study.pauseDeck(kanji);
    await go(studyPath(GROUP, kanji));
    expect(text($('.hoje-n'))).toBe('Pausado');
    expect(text($('.hoje .em-dia'))).toBe('Desde hoje. Nada dele entra nos montes de hoje até você retomar.');
    expect($('.hoje .montes')).toBeNull();
    expect($('.hoje .estudar')).toBeNull();
    expect(text($('.hoje .retomar'))).toBe('Retomar');
    expect($('app-tab-more.treinar')).not.toBeNull();
    // a barra de cima não conta nada dele para hoje
    expect(study.decks().find((d) => d.id === kanji)!.paused).toBeDefined();
  });

  it('Retomar: o baralho volta, os montes voltam, e o aviso diz que cada flashcard volta como estava', async () => {
    study.pauseDeck(kanji);
    await go(studyPath(GROUP, kanji));
    const shown = spyOn(TestBed.inject(Toasts), 'show').and.callThrough();
    $('.hoje .retomar')!.click();
    await settle();
    expect(study.deck(kanji)!.paused).toBeUndefined();
    expect(shown.calls.mostRecent().args[0]).toBe('Kanjis voltou: cada flashcard volta a faltar o tempo que faltava quando você pausou');
    expect(text($('.hoje-n'))).toBe('2 para hoje');
    expect($('.hoje .estudar')).not.toBeNull();
    // o foco não cai no começo da página: vai para o Estudar, no lugar do Retomar
    expect(document.activeElement).toBe($('.hoje .estudar'));
  });

  it('a pilha do pausado diz "pausado" no papelzinho (e ao leitor de tela); as outras seguem com os montes', async () => {
    study.pauseDeck(kanji);
    await go(studyPath(GROUP));
    const pile = $(`.pilha[data-baralho="${kanji}"]`)!;
    expect(text(pile.querySelector('.papelzinho'))).toBe('pausado');
    expect(pile.getAttribute('aria-label')).toBe('Kanjis, 2 flashcards, pausado');
    const other = $(`.pilha[data-baralho="${quimica}"]`)!;
    expect(other.querySelectorAll('.papelzinho .pz[data-monte]').length).toBe(3);
    // Estudar o grupo: só a Química
    expect(text($('.hoje-n'))).toBe('1 para hoje');
  });

  it('o grupo e Tudo em dia dizem quais estão pausados, para não parecer que não sobrou nada', async () => {
    study.pauseDeck(kanji);
    study.pauseDeck(quimica);
    await go(studyPath(GROUP));
    expect(text($('.hoje .em-dia'))).toBe('Tudo em dia. 2 baralhos estão pausados.');
    study.resumeDeck(quimica);
    study.answer('nagua', true, quimica);
    study.answer('nagua', true, quimica);
    study.answer('nagua', true, quimica);
    await go(studyPath());
    expect(text($('.hoje .em-dia'))).toMatch(/^Tudo em dia\. A próxima revisão é .+\. Kanjis está pausado\.$/);
  });

  it('a parede do pausado mostra a volta de quando retomar: a que faltavam 3 dias continua faltando 3, a pausa inteira', async () => {
    pausedAgo(10);
    await go(studyPath(GROUP, kanji));
    expect(text($('.hoje .em-dia'))).toMatch(/^Desde \d+ de \w+\./);
    const sol = [...host.querySelectorAll<HTMLElement>('app-study-card-wall .carta-btn')].find((b) => b.getAttribute('aria-label')!.startsWith('日,'))!;
    expect(sol.getAttribute('aria-label')).toBe('日, Aprendendo · em 3 dias');
    // e retomado, a carta guardada passa a voltar em 3 dias
    $('.hoje .retomar')!.click();
    await settle();
    const card = study.cardOf().get('nsol')!;
    expect(studyDay(new Date(card.srs.due))).toBe(addStudyDays(studyDay(new Date()), 3));
  });
});
