import { Component, Type, provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Cloud } from '../core/cloud-config';
import { KanbanBoard, boardIdFor } from '../core/kanban';
import { KanbanStore } from '../core/kanban-store';
import { Mural } from '../core/mural';
import { Review, sanitizeReview } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { Settings } from '../core/settings';
import { WallView } from '../core/wall-view';
import { WallAccess, WallBoard } from '../pages/wall-board';
import { KanbanCardSheet } from './kanban-card-sheet';
import { KanbanProps } from './kanban-props';
import { MuralConfig } from './mural-config';
import { ReviewEditor } from './review-editor';
import { WallToolbar } from './wall-toolbar';

/**
 * Só no Kanban, nas telas: o interruptor "No mural" das coisas da anotação no quadro (a folha do
 * quadro e o editor), a linha da pasta do mural, o mural vazio de uma aba com tudo no Kanban, a
 * etiqueta das que aparecem pelo "Mostrar" e a escolha do grupo nas configurações.
 */

const T0 = '2026-10-20T10:00:00.000Z';
const TRAB = boardIdFor('trabalho');
const ACCESS: WallAccess = { landingId: null, picking: false, picked: new Map(), masked: false, secret: new Set(), reactCode: null, checkable: true, looks: {} };

const note = (id: string, category = 'Trabalho', extra: Record<string, unknown> = {}): Review => ({
  ...sanitizeReview({ kind: 'anotacoes', game: { name: `Nota ${id}`, coverUrl: null, source: 'manual' }, category, completedAt: '2026-10-01', createdAt: T0, updatedAt: T0, ...extra })!,
  id,
});

function board(cards: KanbanBoard['cards'] = []): KanbanBoard {
  return {
    id: TRAB,
    category: 'trabalho',
    at: T0,
    columns: [
      { id: 'afazer', name: 'A fazer', icon: 'circulo', color: 'cinza', finishes: false },
      { id: 'feito', name: 'Feito', icon: 'check', color: 'verde', finishes: true },
    ],
    cards,
  };
}

const card = (n: string) => ({ note: n, column: 'afazer', importance: null, at: T0 });

@Component({
  selector: 'app-teste-props',
  imports: [KanbanProps],
  template: `<app-kanban-props [board]="b" noteId="ntarefa1" [column]="'afazer'" [(wall)]="wall" />`,
})
class PropsHost {
  readonly b = board([card('ntarefa1')]);
  readonly wall = signal(true);
}

describe('só no Kanban, nas telas', () => {
  let store: ReviewStore;
  let kanban: KanbanStore;
  let settings: Settings;
  const hosts: HTMLElement[] = [];

  async function mount<T>(type: Type<T>, setup?: (f: ComponentFixture<T>) => void): Promise<ComponentFixture<T>> {
    const f = TestBed.createComponent(type);
    setup?.(f);
    document.body.appendChild(f.nativeElement);
    hosts.push(f.nativeElement);
    await f.whenStable();
    return f;
  }

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideRouter([])] });
    store = TestBed.inject(ReviewStore);
    kanban = TestBed.inject(KanbanStore);
    settings = TestBed.inject(Settings);
    settings.askNoCategory.set(false);
    settings.askNoTag.set(false);
    TestBed.inject(Mural).kind.set('anotacoes');
    store.reviews.set([note('ntarefa1'), note('ntarefa2'), note('nprova01', 'Estudos')]);
    kanban.state.set({ boards: [board([card('ntarefa1'), card('ntarefa2')])], removed: {}, legacy: [] });
  });

  afterEach(() => {
    for (const h of hosts.splice(0)) {
      h.querySelectorAll('dialog').forEach((d) => d.open && d.close());
      h.remove();
    }
    localStorage.clear();
  });

  it('o interruptor "No mural" diz o que vale e muda a escolha', async () => {
    const f = await mount(PropsHost);
    const el: HTMLElement = f.nativeElement;
    const sw = el.querySelector<HTMLButtonElement>('.mural-linha [role="switch"]')!;
    expect(sw.getAttribute('aria-checked')).toBe('true');
    expect(el.querySelector('.mural-diz')!.textContent!.trim()).toBe('Aparece no mural também');
    sw.click();
    await f.whenStable();
    expect(f.componentInstance.wall()).toBeFalse();
    expect(sw.getAttribute('aria-checked')).toBe('false');
    expect(el.querySelector('.mural-diz')!.textContent!.trim()).toBe('Só no Kanban');
    // o nome da linha é o rótulo do interruptor
    expect(document.getElementById(sw.getAttribute('aria-labelledby')!)!.textContent!.trim()).toBe('No mural');
  });

  it('na folha da anotação no quadro, o interruptor vale na hora', async () => {
    const f = await mount(KanbanCardSheet, (x) => {
      x.componentRef.setInput('boardId', TRAB);
      x.componentRef.setInput('noteId', 'ntarefa1');
    });
    const sw = (f.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.mural-linha [role="switch"]')!;
    // o padrão: só no Kanban
    expect(sw.getAttribute('aria-checked')).toBe('false');
    sw.click();
    await f.whenStable();
    expect(kanban.boardOnly().has('ntarefa1')).toBeFalse();
    expect(kanban.get(TRAB)!.cards[0].wall).toBeTrue();
    sw.click();
    await f.whenStable();
    expect(kanban.boardOnly().has('ntarefa1')).toBeTrue();
    expect('wall' in kanban.get(TRAB)!.cards[0]).toBeFalse();
  });

  it('a ficha dos filtros conta as que estão só no Kanban, no "Mostrar também", e o interruptor as traz com a etiqueta', async () => {
    // a ntarefa2 escolheu o mural também: só a ntarefa1 fica só no Kanban
    kanban.setOnWall('ntarefa2', true);
    localStorage.setItem('meu-mural:filtros-abertos:v1', 'true');
    const bar = await mount(WallToolbar);
    const wall = await mount(WallBoard, (x) => x.componentRef.setInput('access', ACCESS));
    const el = bar.nativeElement as HTMLElement;
    const row = () => [...el.querySelectorAll<HTMLElement>('app-filter-card .chave')].find((c) => c.textContent!.includes('Só no Kanban'))!;
    const sw = () => row().querySelector<HTMLButtonElement>('[role="switch"]')!;
    expect(row().textContent!.replace(/\s+/g, ' ').trim()).toBe('Só no Kanban, 1');
    expect(sw().getAttribute('aria-checked')).toBe('false');
    // nada dele na linha de cima da pasta
    expect(el.querySelector('.pasta-linha')!.textContent).not.toContain('Kanban');
    expect((wall.nativeElement as HTMLElement).querySelector('[data-lugar="ntarefa1"]')).toBeNull();
    // o toque no nome também liga
    row().querySelector<HTMLElement>('.chave-nome')!.click();
    await bar.whenStable();
    await wall.whenStable();
    expect(sw().getAttribute('aria-checked')).toBe('true');
    expect(el.querySelector('app-filter-card .resumo')!.textContent).toContain('com as do Kanban');
    await new Promise((r) => setTimeout(r, 60));
    await wall.whenStable();
    const box = (wall.nativeElement as HTMLElement).querySelector('[data-lugar="ntarefa1"]');
    expect(box).not.toBeNull();
    // só ela leva a etiqueta (quando a ficha é montada)
    const labels = (wall.nativeElement as HTMLElement).querySelectorAll('.so-kanban');
    expect(labels.length).toBeLessThanOrEqual(1);
    if (labels.length) expect(labels[0].closest('[data-lugar]')!.getAttribute('data-lugar')).toBe('ntarefa1');
  });

  it('a aba com tudo no Kanban: o mural diz onde elas estão, com o quadro e o "Mostrar aqui"', async () => {
    TestBed.inject(WallView).setNoteTab('c:trabalho');
    const f = await mount(WallBoard, (x) => x.componentRef.setInput('access', ACCESS));
    const el: HTMLElement = f.nativeElement;
    expect(el.querySelector('h2')!.textContent!.trim()).toBe('Tudo no Kanban');
    expect(el.textContent).toContain('As 2 anotações de Trabalho estão só no Kanban.');
    expect(el.querySelector('a.btn-ink')!.getAttribute('href')).toBe(`/anotacoes/kanban/${TRAB}`);
    [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent!.includes('Mostrar aqui'))!.click();
    await f.whenStable();
    expect(TestBed.inject(WallView).visible().map((r) => r.id).sort()).toEqual(['ntarefa1', 'ntarefa2']);
  });

  it('nas configurações: "só no Kanban" vem ligado; o Quadro desliga para o grupo, e o grupo mostra a escolha', async () => {
    const f = await mount(MuralConfig, (x) => x.componentRef.setInput('board', TRAB));
    const el: HTMLElement = f.nativeElement;
    el.querySelector<HTMLButtonElement>('#config-aba-quadro')!.click();
    await f.whenStable();
    const sw = el.querySelector<HTMLButtonElement>('[aria-labelledby="config-t-so-kanban"]')!;
    expect(sw.getAttribute('aria-checked')).toBe('true');
    sw.click();
    await f.whenStable();
    expect(settings.notesConfig().categories['trabalho']).toEqual({ kanbanOnly: false });
    expect(kanban.boardOnly().size).toBe(0);
    el.querySelector<HTMLButtonElement>('#config-aba-categorias')!.click();
    await f.whenStable();
    const row = [...el.querySelectorAll<HTMLElement>('.cat')].find((c) => c.textContent!.includes('Trabalho'))!;
    expect(row.querySelector('.cat-resumo')!.textContent).toContain('Kanban no mural também');
    row.querySelector<HTMLButtonElement>('.cat-abre')!.click();
    await f.whenStable();
    const seg = [...row.querySelectorAll<HTMLLabelElement>('.segmento')].find((s) => s.textContent!.trim().startsWith('Só no Kanban'))!.querySelector('input')!;
    seg.click();
    await f.whenStable();
    expect(settings.notesConfig().categories['trabalho']).toBeUndefined();
    expect(kanban.boardOnly().size).toBe(2);
  });

  it('no editor, a etiqueta Kanban põe a anotação no mural também ao salvar', async () => {
    TestBed.inject(Cloud).config.set(null);
    const f = await mount(ReviewEditor);
    const el: HTMLElement = f.nativeElement;
    f.componentInstance.open(store.get('ntarefa1')!);
    await f.whenStable();
    el.querySelector<HTMLButtonElement>('.prop[data-prop="quadro"]')!.click();
    await f.whenStable();
    el.querySelector<HTMLButtonElement>('#editor-parte .mural-linha [role="switch"]')!.click();
    await f.whenStable();
    // nada vale antes de salvar
    expect(kanban.boardOnly().has('ntarefa1')).toBeTrue();
    const dialog = el.querySelector('dialog')!;
    const closed = new Promise((r) => dialog.addEventListener('close', r, { once: true }));
    el.querySelector<HTMLButtonElement>('.pregar .btn-ink')!.click();
    await closed;
    await f.whenStable();
    expect(kanban.boardOnly().has('ntarefa1')).toBeFalse();
  });

  it('no editor, a nova pedida de uma coluna leva a escolha pelo pedido (só quando difere do grupo)', async () => {
    const f = await mount(ReviewEditor);
    const el: HTMLElement = f.nativeElement;
    kanban.pending.set({ board: TRAB, column: 'afazer' });
    f.componentInstance.openInCategory('Trabalho');
    await f.whenStable();
    el.querySelector<HTMLButtonElement>('.prop[data-prop="quadro"]')!.click();
    await f.whenStable();
    el.querySelector<HTMLButtonElement>('#editor-parte .mural-linha [role="switch"]')!.click();
    await f.whenStable();
    const name = el.querySelector<HTMLTextAreaElement>('#editor-titulo-nota')!;
    name.value = 'Tarefa nova';
    name.dispatchEvent(new Event('input'));
    await f.whenStable();
    const dialog = el.querySelector('dialog')!;
    const closed = new Promise((r) => dialog.addEventListener('close', r, { once: true }));
    el.querySelector<HTMLButtonElement>('.pregar .btn-ink')!.click();
    await closed;
    expect(kanban.pending()).toEqual(jasmine.objectContaining({ board: TRAB, column: 'afazer', wall: true }));
  });
});
