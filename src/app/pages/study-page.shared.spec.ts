import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, RouterOutlet, provideRouter } from '@angular/router';
import { studyPath } from '../core/areas';
import { GroupStudies } from '../core/group-studies';
import { Review, sanitizeReview } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { GroupStudy, studyPart } from '../core/shared-study';
import { addCard, addDeck, emptyStudy, studyGroupId } from '../core/study';
import { StudyStore } from '../core/study-store';
import { Confirm } from '../ui/confirm';
import { FlashcardTab } from '../ui/flashcard-tab';
import { setEverythingNear } from '../ui/near-screen';
import { StudyPage } from './study-page';

/** Os Flashcards de um grupo compartilhado na tela (PLANO-FLASHCARDS-GRUPO.md, parte 2): quem só lê e quem edita. */

@Component({ selector: 'app-raiz', imports: [RouterOutlet], template: '<router-outlet />' })
class Raiz {}

const T0 = '2026-11-21T10:00:00.000Z';
const note = (id: string, title: string, category = 'Trabalho'): Review => ({ ...sanitizeReview({ kind: 'anotacoes', category, game: { name: title }, completedAt: '2026-11-21', createdAt: T0, updatedAt: T0 })!, id });
const GROUP = studyGroupId('Trabalho');
const DECK = 'dKana0001';

/** O grupo "Trabalho" com o baralho Kana da dona e a nota-sol dentro. */
function groupWith(extra: Partial<GroupStudy> = {}, withDeck = true): GroupStudy {
  const made = addDeck(emptyStudy(), 'Kana', 'amarelo', T0, null, DECK, 'Trabalho');
  const st = withDeck ? addCard(made.state, 'nsol', [DECK], { title: 'あ' }, T0) : emptyStudy();
  const base: GroupStudy = { id: 'gTrabalho001', name: 'Trabalho', part: null, write: true, manage: true };
  return { ...base, part: studyPart(st, base, new Set(), T0), ...extra };
}

describe('os Flashcards de um grupo compartilhado na tela', () => {
  let host: HTMLElement;
  let router: Router;
  const groups = signal<GroupStudy[]>([]);

  async function settle(): Promise<void> {
    for (let i = 0; i < 4; i++) {
      await new Promise((r) => setTimeout(r, 0));
      TestBed.tick();
    }
  }
  const $ = (sel: string) => host.querySelector<HTMLElement>(sel);
  const text = (el: Element | null) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const buttons = () => [...host.querySelectorAll<HTMLElement>('button')].map((b) => text(b));

  function setup(group: GroupStudy): void {
    groups.set([group]);
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
        // (a página cria o SharedGroupsStore, que se apresentaria à ponte por cima: a ponte inteira é de mentira)
        { provide: GroupStudies, useValue: { studies: groups, synced: () => true, update: () => false, attach: () => undefined, beforeLeave: () => undefined, leave: () => undefined } },
      ],
    });
    TestBed.inject(ReviewStore).reviews.set([note('nsol', 'Sol'), note('nlua', 'Lua')]);
    TestBed.inject(StudyStore);
    router = TestBed.inject(Router);
    host = TestBed.createComponent(Raiz).nativeElement;
    document.body.appendChild(host);
  }

  afterEach(() => {
    document.querySelectorAll('dialog[open]').forEach((d) => (d as HTMLDialogElement).close());
    host?.remove();
    localStorage.clear();
    setEverythingNear(false);
    TestBed.resetTestingModule();
  });

  it('quem só lê vê o baralho do grupo e estuda, sem Novo flashcard, Trazer anotações nem Novo baralho', async () => {
    setup(groupWith({ write: false, manage: false }));
    await router.navigateByUrl(studyPath(GROUP, DECK));
    await settle();
    expect(text($('h1'))).toContain('Kana');
    expect(buttons()).not.toContain('Novo flashcard');
    expect(buttons()).not.toContain('Trazer anotações');
    await router.navigateByUrl(studyPath(GROUP));
    await settle();
    expect(buttons()).not.toContain('Novo baralho');
  });

  it('quem só lê, no baralho seu de antes no grupo: também sem Novo flashcard (a aba Flashcard não faria nada)', async () => {
    setup(groupWith({ write: false, manage: false }));
    const study = TestBed.inject(StudyStore);
    const id = study.addDeck('Revisão', 'azul', null, undefined, 'Trabalho');
    await router.navigateByUrl(studyPath(GROUP, id));
    await settle();
    expect(text($('h1'))).toContain('Revisão');
    expect(buttons()).not.toContain('Novo flashcard');
    expect(buttons()).not.toContain('Trazer anotações');
  });

  it('quem só lê, num grupo sem baralho: o que falta, sem a cartolina de criar', async () => {
    setup(groupWith({ write: false, manage: false }, false));
    await router.navigateByUrl(studyPath(GROUP));
    await settle();
    expect(text($('#primeiro-titulo'))).toBe('Trabalho ainda não tem baralho');
    expect($('.primeiro-form')).toBeNull();
  });

  it('a folha do baralho de quem só lê: só o Estudo, e de quem é o baralho; sem o nome, a cor nem o Apagar', async () => {
    setup(groupWith({ write: false, manage: false }));
    await router.navigateByUrl(studyPath(GROUP, DECK));
    await settle();
    $('.ajustes-baralho')!.click();
    await settle();
    const sheet = host.querySelector('app-study-deck-sheet')!;
    expect(text(sheet.querySelector('.grupo-dica'))).toContain('Você só lê este grupo');
    expect(sheet.querySelector('#ba-estudo-t')).not.toBeNull();
    for (const id of ['#ba-nome-t', '#ba-quem-t', '#ba-cor-t', '#ba-icone-t']) expect(sheet.querySelector(id)).withContext(id).toBeNull();
    expect(text(sheet.querySelector('.foot'))).not.toContain('Apagar o baralho');
  });

  it('a folha de quem edita sem gerir: muda o nome, e quem vê fica travado, com o motivo', async () => {
    setup(groupWith({ write: true, manage: false }));
    await router.navigateByUrl(studyPath(GROUP, DECK));
    await settle();
    $('.ajustes-baralho')!.click();
    await settle();
    const sheet = host.querySelector('app-study-deck-sheet')!;
    expect(text(sheet.querySelector('.grupo-dica'))).toContain('o que você muda aqui muda para todos');
    expect(sheet.querySelector('#ba-nome-t')).not.toBeNull();
    const tags = [...sheet.querySelectorAll<HTMLButtonElement>('[aria-labelledby="ba-quem-t"] button')];
    expect(tags.length).toBe(2);
    expect(tags.every((b) => b.disabled)).toBeTrue();
    expect(text(sheet.querySelector('#ba-quem-dica'))).toBe('Só quem está em Trabalho vê este baralho. Só o dono e os gestores do grupo mudam quem vê.');
  });

  it('a aba Flashcard de quem só lê: o que o flashcard é e de onde, sem a frente nem os baralhos para mudar', async () => {
    setup(groupWith({ write: false, manage: false }));
    const fixture = TestBed.createComponent(FlashcardTab);
    fixture.componentRef.setInput('group', 'Trabalho');
    fixture.componentRef.setInput('readOnly', true);
    fixture.componentInstance.reset('nsol', false);
    await settle();
    const el: HTMLElement = fixture.nativeElement;
    expect(text(el.querySelector('.grupo-so-le'))).toBe('Este flashcard é do grupo Trabalho, em Kana. Você só lê este grupo: quem edita muda a frente e os baralhos. O progresso é só seu.');
    expect(el.querySelector('#fc-titulo')).toBeNull();
    expect(el.querySelector('app-study-deck-picker')).toBeNull();
    expect(text(el)).not.toContain('Deixar de ser flashcard');
    // e a outra, que ainda não é flashcard, não vira
    fixture.componentInstance.reset('nlua', false);
    await settle();
    expect(text(el)).toContain('Você só lê Trabalho');
    expect([...el.querySelectorAll('button')].map((b) => text(b))).not.toContain('Transformar em flashcard');
  });
});
