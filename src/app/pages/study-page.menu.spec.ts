import { Component, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, RouterOutlet, provideRouter } from '@angular/router';
import { studyPath } from '../core/areas';
import { Desk } from '../core/desk';
import { Review, sanitizeReview } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { STUDY_SIZE_KEY, studyGroupId } from '../core/study';
import { StudyStore } from '../core/study-store';
import { Confirm } from '../ui/confirm';
import { setEverythingNear } from '../ui/near-screen';
import { Toasts } from '../ui/toast';
import { StudyPage } from './study-page';

/** O menu do botão direito nos Estudos: no baralho (a pilha e o nome no alto) e no flashcard da parede. */

@Component({ selector: 'app-raiz', imports: [RouterOutlet], template: '<router-outlet />' })
class Raiz {}

const T0 = '2026-10-10T10:00:00.000Z';
const note = (id: string, title: string): Review => ({ ...sanitizeReview({ kind: 'anotacoes', category: 'Estudos', game: { name: title }, completedAt: '2026-10-01', createdAt: T0, updatedAt: T0 })!, id });
const GROUP = studyGroupId('Estudos');

describe('menu do botão direito nos Estudos', () => {
  let host: HTMLElement;
  let study: StudyStore;
  let router: Router;
  let desk: Desk;
  let asked: string[];
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
  const panel = () => host.querySelector<HTMLElement>('app-study-page .menu-contexto')!;
  const isOpen = () => panel().matches(':popover-open');
  const labels = () => [...panel().querySelectorAll('.escolha .nome')].map((x) => x.textContent!.trim());
  const option = (label: string) => [...panel().querySelectorAll<HTMLButtonElement>('.escolha')].find((b) => b.querySelector('.nome')!.textContent!.trim() === label)!;
  async function rightClick(target: Element): Promise<MouseEvent> {
    target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 2, pointerType: 'mouse', clientX: 40, clientY: 40 }));
    const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: 40, clientY: 40 });
    target.dispatchEvent(e);
    await settle();
    return e;
  }

  beforeEach(() => {
    localStorage.clear();
    setEverythingNear(true);
    asked = [];
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([
          { path: 'anotacoes/estudos', component: StudyPage },
          { path: 'anotacoes/estudos/:grupo', component: StudyPage },
          { path: 'anotacoes/estudos/:grupo/:baralho', component: StudyPage },
        ]),
        {
          provide: Confirm,
          useValue: {
            ask: async (o: { title: string }) => {
              asked.push(o.title);
              return true;
            },
          },
        },
      ],
    });
    TestBed.inject(ReviewStore).reviews.set([note('nsol', 'Sol'), note('nlua', 'Lua'), note('nagua', 'Água')]);
    study = TestBed.inject(StudyStore);
    router = TestBed.inject(Router);
    desk = TestBed.inject(Desk);
    spyOn(desk, 'editReview');
    spyOn(desk, 'openReview');
    kanji = study.addDeck('Kanjis', 'amarelo', 'livro');
    quimica = study.addDeck('Química', 'verde');
    study.addCard('nsol', [kanji], { title: '日' });
    study.addCard('nlua', [kanji, quimica], { title: '月' });
    study.addCard('nagua', [quimica]);
    study.answer('nsol', true, kanji);
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

  it('a pilha de um baralho abre o menu dele no lugar do menu do navegador, com o nome no alto', async () => {
    await go(studyPath(GROUP));
    const e = await rightClick($(`.pilha[data-baralho="${kanji}"]`)!);
    expect(e.defaultPrevented).toBeTrue();
    expect(isOpen()).toBeTrue();
    expect(panel().querySelector('.legenda')!.textContent).toContain('Kanjis');
    expect(labels()).toEqual(['Abrir', 'Abrir em outra aba', 'Estudar', 'Treinar', 'Novo flashcard', 'Trazer anotações', 'Ajustes do baralho', 'Apagar o baralho']);
    expect(option('Apagar o baralho').classList).toContain('perigo');
    option('Abrir').click();
    await settle();
    expect(router.url).toBe(studyPath(GROUP, kanji));
  });

  it('Estudar traz na ponta quantos para hoje; Treinar, de fora, abre o baralho com o remendo do Treinar', async () => {
    await go(studyPath(GROUP));
    await rightClick($(`.pilha[data-baralho="${kanji}"]`)!);
    expect(option('Estudar').querySelector('.atalho')!.textContent!.replace(/\s+/g, ' ').trim()).toMatch(/^, \d+ para hoje$/);
    option('Treinar').click();
    for (let i = 0; i < 20 && router.url !== studyPath(GROUP, kanji); i++) await settle();
    await settle();
    expect(router.url).toBe(studyPath(GROUP, kanji));
    expect(host.querySelector('app-tab-more.treinar [popover]')!.matches(':popover-open')).toBeTrue();
  });

  it('os ajustes abrem a folha do baralho; abrir numa aba nova usa o endereço do link', async () => {
    await go(studyPath(GROUP));
    const open = spyOn(window, 'open');
    await rightClick($(`.pilha[data-baralho="${kanji}"]`)!);
    option('Abrir em outra aba').click();
    expect(open).toHaveBeenCalledWith(($(`.pilha[data-baralho="${kanji}"]`) as HTMLAnchorElement).href, '_blank', 'noopener');
    await rightClick($(`.pilha[data-baralho="${kanji}"]`)!);
    option('Ajustes do baralho').click();
    for (let i = 0; i < 60 && !document.querySelector<HTMLDialogElement>('dialog.baralho-ajustes')?.open; i++) await settle();
    expect(document.querySelector<HTMLDialogElement>('dialog.baralho-ajustes')?.open).toBeTrue();
  });

  it('Trazer anotações, de fora do baralho, abre nele com o seletor', async () => {
    await go(studyPath(GROUP));
    await rightClick($(`.pilha[data-baralho="${quimica}"]`)!);
    option('Trazer anotações').click();
    for (let i = 0; i < 20 && router.url !== studyPath(GROUP, quimica); i++) await settle();
    await settle();
    expect(router.url).toBe(studyPath(GROUP, quimica));
    expect(document.querySelector('app-card-picker dialog[open]')).not.toBeNull();
  });

  it('apagar o baralho pelo menu faz a mesma pergunta da folha, com o Desfazer; aberto nele, volta para o grupo', async () => {
    await go(studyPath(GROUP, quimica));
    await rightClick($('.trilha-nome')!);
    // no próprio baralho, sem o abrir
    expect(labels()[0]).toBe('Estudar');
    option('Apagar o baralho').click();
    for (let i = 0; i < 20 && study.deck(quimica); i++) await settle();
    expect(asked).toEqual(['Apagar o baralho Química?']);
    expect(study.deck(quimica)).toBeUndefined();
    await settle();
    expect(router.url).toBe(studyPath(GROUP));
    expect(TestBed.inject(Toasts).current()?.text).toBe('O baralho Química foi apagado');
  });

  it('o flashcard da parede: virar, maximizar, ler, editar, o progresso (só do já visto) e tirar do baralho', async () => {
    await go(studyPath(GROUP, kanji));
    const sol = $('.carta-li[data-carta="nsol"]')!;
    await rightClick(sol);
    expect(panel().querySelector('.legenda')!.textContent).toContain('日');
    expect(labels()).toEqual(['Virar o flashcard', 'Maximizar', 'Ler a anotação', 'Editar o flashcard', 'Ver o progresso', 'Tirar de Kanjis']);
    option('Virar o flashcard').click();
    await settle();
    expect(sol.classList).toContain('virada');
    await rightClick(sol);
    expect(labels()[0]).toBe('Virar de volta');
    option('Ver o progresso').click();
    expect(desk.editReview).toHaveBeenCalledWith('nsol', 'flashcard', 'progresso');
    // o nunca visto não tem progresso para ver
    await rightClick($('.carta-li[data-carta="nlua"]')!);
    expect(labels()).not.toContain('Ver o progresso');
    option('Ler a anotação').click();
    expect(desk.openReview).toHaveBeenCalledWith('nlua');
  });

  it('tirar de um baralho: a carta de dois baralhos fica no outro; a de um só sai dos Flashcards (perguntando, se já foi vista); o Desfazer devolve', async () => {
    await go(studyPath(GROUP, kanji));
    await rightClick($('.carta-li[data-carta="nlua"]')!);
    option('Tirar de Kanjis').click();
    await settle();
    expect(asked).toEqual([]);
    expect(study.cardOf().get('nlua')!.decks).toEqual([quimica]);
    expect(TestBed.inject(Toasts).current()?.text).toBe('“月” saiu de Kanjis');
    await rightClick($('.carta-li[data-carta="nsol"]')!);
    option('Tirar de Kanjis').click();
    for (let i = 0; i < 20 && study.cardOf().has('nsol'); i++) await settle();
    expect(asked).toEqual(['Tirar dos Flashcards?']);
    expect(study.cardOf().has('nsol')).toBeFalse();
    const toast = TestBed.inject(Toasts).current()!;
    expect(toast.text).toBe('“日” saiu dos Flashcards');
    toast.action!.run();
    expect(study.cardOf().get('nsol')!.decks).toEqual([kanji]);
    expect(study.cardOf().get('nsol')!.stats.seen).toBe(1);
  });

  it('o Esc do menu fecha só o menu: a carta pequena crescida continua virada', async () => {
    localStorage.setItem(STUDY_SIZE_KEY, 'pequenas');
    await go(studyPath(GROUP, kanji));
    const sol = $('.carta-li[data-carta="nsol"]')!;
    await rightClick(sol);
    option('Virar o flashcard').click();
    await settle();
    expect(sol.classList).toContain('virada');
    await rightClick(sol);
    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await settle();
    expect(isOpen()).toBeFalse();
    expect(sol.classList).toContain('virada');
  });

  it('a aba de um grupo: o menu do grupo, com estudar as de hoje e um baralho novo; os ajustes abrem os do mural no grupo', async () => {
    await go(studyPath(GROUP));
    const tab = $(`.abas-grupos .aba[data-grupo="${GROUP}"]`) as HTMLAnchorElement;
    const e = await rightClick(tab);
    expect(e.defaultPrevented).toBeTrue();
    expect(panel().querySelector('.legenda')!.textContent).toContain('Estudos');
    expect(labels()).toEqual(['Abrir em outra aba', 'Estudar', 'Treinar', 'Novo baralho', 'Ver no mural', 'Ver no Kanban', 'Ajustes do grupo', 'Esconder no Mais']);
    option('Ajustes do grupo').click();
    for (let i = 0; i < 40 && !document.querySelector('app-mural-config dialog[open]'); i++) await settle();
    const dialog = document.querySelector<HTMLDialogElement>('app-mural-config dialog')!;
    // as do mural (com Grupos), não as dos estudos
    expect(dialog.querySelector('#config-aba-categorias')!.getAttribute('aria-selected')).toBe('true');
    expect(dialog.querySelector('.cat-abre[aria-expanded="true"]')!.getAttribute('data-cat')).toBe('estudos');
    dialog.close();
    await settle();
  });

  it('Estudar, pelo menu da aba, abre a sessão do grupo', async () => {
    await go(studyPath(GROUP));
    await rightClick($(`.abas-grupos .aba[data-grupo="${GROUP}"]`)!);
    option('Estudar').click();
    for (let i = 0; i < 40 && !host.querySelector('app-study-session'); i++) await settle();
    expect(host.querySelector('app-study-session')).not.toBeNull();
  });

});
