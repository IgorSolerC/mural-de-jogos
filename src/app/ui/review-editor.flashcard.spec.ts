import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Cloud } from '../core/cloud-config';
import { Review, sanitizeReview } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { Settings } from '../core/settings';
import { StudyStore } from '../core/study-store';
import { Confirm } from './confirm';
import { Toasts } from './toast';
import { ReviewEditor } from './review-editor';
import { comMarkdown } from '../testing/writing-mode.spec';

/** A aba Flashcard do editor (PLANO-ESTUDOS.md, 6.5): virar carta, a frente, os baralhos, o mural. */

const T0 = '2026-10-01T10:00:00.000Z';
const note = (id: string, name: string): Review => ({ ...sanitizeReview({ kind: 'anotacoes', game: { name, coverUrl: null, source: 'manual' }, completedAt: '2026-10-01', createdAt: T0 })!, id });

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

  it('a Nova carta de um baralho abre na aba, nasce só nos Estudos e não pergunta grupo nem tag', async () => {
    settings.askNoCategory.set(true);
    settings.askNoTag.set(true);
    const deck = study.addDeck('Verbos', 'rosa');
    study.pending.set({ decks: [deck] });
    fixture.componentInstance.openNote('Comer');
    await fixture.whenStable();
    expect(tab()!.getAttribute('aria-selected')).toBe('true');
    expect(panel().querySelector('.mural-txt')!.textContent!.trim()).toBe('Só nos Estudos');
    await type('fc-titulo', '食べる');
    await save();
    expect(asked).toEqual([]);
    const id = store.notes().find((n) => n.game.name === 'Comer')!.id;
    const card = study.cardOf().get(id)!;
    expect(card.decks).toEqual([deck]);
    expect('wall' in card).toBeFalse();
    expect(study.pending()).toBeNull();
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
