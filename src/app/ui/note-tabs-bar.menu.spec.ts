import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { kanbanPath, studyPath } from '../core/areas';
import { Desk } from '../core/desk';
import { KanbanStore } from '../core/kanban-store';
import { Mural } from '../core/mural';
import { Review, sanitizeReview } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { Settings } from '../core/settings';
import { studyGroupId } from '../core/study';
import { StudyStore } from '../core/study-store';
import { WallState } from '../core/wall-view';
import { NoteTabsBar } from './note-tabs-bar';
import { Toasts } from './toast';

/** O menu do botão direito numa aba de grupo do mural de anotações (ui/note-tabs-bar.ts). */

const T0 = '2026-10-20T10:00:00.000Z';
const note = (id: string, category: string): Review => ({
  ...sanitizeReview({ kind: 'anotacoes', game: { name: `Nota ${id}`, coverUrl: null, source: 'manual' }, category, completedAt: '2026-10-01', createdAt: T0, updatedAt: T0 })!,
  id,
});

describe('menu do botão direito nas abas de grupo', () => {
  let fixture: ComponentFixture<NoteTabsBar>;
  let host: HTMLElement;

  const tab = (label: string) => [...host.querySelectorAll<HTMLElement>('.abas:not(.medida) .aba')].find((t) => t.textContent!.includes(label))!;
  const panel = () => host.querySelector<HTMLElement>('.menu-contexto')!;
  const labels = () => [...panel().querySelectorAll('.escolha .nome')].map((x) => x.textContent!.trim());
  const option = (label: string) => [...panel().querySelectorAll<HTMLButtonElement>('.escolha')].find((b) => b.querySelector('.nome')!.textContent!.trim() === label)!;
  async function settle(): Promise<void> {
    for (let i = 0; i < 3; i++) {
      await new Promise((r) => setTimeout(r, 0));
      TestBed.tick();
    }
  }
  async function rightClick(target: Element): Promise<MouseEvent> {
    target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 2, pointerType: 'mouse', clientX: 30, clientY: 30 }));
    const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: 30, clientY: 30 });
    target.dispatchEvent(e);
    await settle();
    return e;
  }

  beforeEach(async () => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideRouter([])] });
    TestBed.inject(Mural).kind.set('anotacoes');
    TestBed.inject(Settings).setNotesConfig({ hideEmpty: false });
    TestBed.inject(ReviewStore).reviews.set([note('ntrab001', 'Trabalho'), note('ntrab002', 'Trabalho'), note('nestu001', 'Estudos'), note('nsem0001', '')]);
    fixture = TestBed.createComponent(NoteTabsBar);
    host = fixture.nativeElement;
    document.body.appendChild(host);
    await settle();
  });

  afterEach(() => {
    host.remove();
    localStorage.clear();
  });

  it('abre no lugar do menu do navegador, com o nome do grupo no alto; os Flashcards só com baralho no grupo', async () => {
    const e = await rightClick(tab('Trabalho'));
    expect(e.defaultPrevented).toBeTrue();
    expect(panel().matches(':popover-open')).toBeTrue();
    expect(panel().querySelector('.legenda')!.textContent).toContain('Trabalho');
    expect(labels()).toEqual(['Nova anotação', 'Ver no Kanban', 'Ajustes do grupo', 'Esconder no Mais']);
    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await settle();
    TestBed.inject(StudyStore).addDeck('Kanji', 'amarelo', null, undefined, 'Estudos');
    await rightClick(tab('Estudos'));
    expect(labels()).toContain('Ver nos Flashcards');
  });

  it('no mural de quem se visita, os grupos não são seus: o menu do navegador', async () => {
    spyOn(TestBed.inject(WallState), 'owner').and.returnValue('Ana');
    const e = await rightClick(tab('Trabalho'));
    expect(e.defaultPrevented).toBeFalse();
    expect(panel().matches(':popover-open')).toBeFalse();
  });

  it('a aba "Sem grupo" fica com o menu do navegador', async () => {
    const e = await rightClick(tab('Sem grupo'));
    expect(e.defaultPrevented).toBeFalse();
  });

  it('nova anotação no grupo, o quadro no Kanban, os baralhos nos Flashcards e os ajustes', async () => {
    const desk = TestBed.inject(Desk);
    spyOn(desk, 'newNoteIn');
    const nav = spyOn(TestBed.inject(Router), 'navigateByUrl').and.resolveTo(true);
    let adjusted = '';
    fixture.componentInstance.adjust.subscribe((g) => (adjusted = g));
    await rightClick(tab('Trabalho'));
    option('Nova anotação').click();
    expect(desk.newNoteIn).toHaveBeenCalledWith('Trabalho');
    await rightClick(tab('Trabalho'));
    option('Ver no Kanban').click();
    expect(nav).toHaveBeenCalledWith(kanbanPath(TestBed.inject(KanbanStore).boardFor('Trabalho').id));
    TestBed.inject(StudyStore).addDeck('Kanji', 'amarelo', null, undefined, 'Estudos');
    await rightClick(tab('Estudos'));
    option('Ver nos Flashcards').click();
    expect(nav).toHaveBeenCalledWith(studyPath(studyGroupId('Estudos')));
    await rightClick(tab('Trabalho'));
    option('Ajustes do grupo').click();
    expect(adjusted).toBe('Trabalho');
  });

  it('esconder manda a aba para o Mais, como o olho das configurações, com o Desfazer', async () => {
    const view = TestBed.inject(WallState);
    await rightClick(tab('Trabalho'));
    option('Esconder no Mais').click();
    await settle();
    expect(view.hiddenTabs().has('c:trabalho')).toBeTrue();
    // a aba saiu da fileira: o foco vai para o "Mais", onde ela está agora
    expect(document.activeElement).toBe(host.querySelector('.abas:not(.medida) app-tab-more button'));
    const toast = TestBed.inject(Toasts).current()!;
    expect(toast.text).toBe('Trabalho foi para o Mais');
    toast.action!.run();
    await settle();
    expect(view.hiddenTabs().has('c:trabalho')).toBeFalse();
  });

  it('no mural de músicas, as abas dos artistas não têm menu', async () => {
    const song = (id: string, artist: string): Review => ({ ...note(id, artist), kind: 'musicas' });
    TestBed.inject(ReviewStore).reviews.update((list) => [...list, song('mrad0001', 'Radiohead'), song('mbjo0001', 'Björk')]);
    TestBed.inject(Mural).kind.set('musicas');
    await settle();
    const artist = tab('Radiohead');
    expect(artist).toBeDefined();
    expect((await rightClick(artist)).defaultPrevented).toBeFalse();
  });
});
