import { Component, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideLocationMocks } from '@angular/common/testing';
import { provideRouter } from '@angular/router';
import { Mural } from '../core/mural';
import { NoteFolder } from '../core/folders';
import { NoteFolders } from '../core/note-folders';
import { Review, sanitizeReview } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { Settings } from '../core/settings';
import { ViewTransitions } from '../core/view-transitions';
import { WallView } from '../core/wall-view';
import { Toasts } from '../ui/toast';
import { WallToolbar } from '../ui/wall-toolbar';
import { WallAccess, WallBoard } from './wall-board';

/**
 * Organizar as pastas na parede do seu Murall (PLANO-PASTAS.md, rodada 3): arrastar uma anotação sobre uma
 * pasta guarda nela; sobre outra anotação, cria a pasta com as duas, com o nome escrito na própria pasta;
 * o botão direito na pasta abre o menu dela. Sem as mudanças de pasta (a visita), nada arrasta.
 */

const ACCESS: WallAccess = { landingId: null, picking: false, picked: new Map(), masked: false, secret: new Set(), reactCode: null, checkable: true, looks: {} };
const T0 = '2026-10-01T10:00:00.000Z';
const note = (id: string, title: string, category: string, folder?: string): Review => ({
  ...sanitizeReview({
    kind: 'anotacoes',
    game: { name: title, coverUrl: null, source: 'manual' },
    text: 'Texto.',
    category,
    stock: 'azul',
    completedAt: '2026-10-01',
    createdAt: T0,
    updatedAt: T0,
    ...(folder ? { folder } : {}),
  })!,
  id,
});
const f = (id: string, name: string): NoteFolder => ({ id, group: 'estudos', name, parent: null });

@Component({
  imports: [WallToolbar, WallBoard],
  template: `<app-wall-toolbar /><app-wall-board [access]="access" [folderActions]="actions ? folders : null" />`,
})
class OwnerHost {
  readonly access = ACCESS;
  readonly folders = TestBed.inject(NoteFolders);
  actions = true;
}

describe('arrastar para organizar as pastas', () => {
  let el: HTMLElement;
  let store: ReviewStore;
  let folders: NoteFolders;

  const settle = async (n = 4) => {
    for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 16));
  };
  async function card(id: string): Promise<HTMLElement> {
    for (let i = 0; i < 150; i++) {
      const c = el.querySelector<HTMLElement>(`.lugar[data-lugar="${id}"] app-review-card:not([data-veu])`);
      if (c) return c;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error(`a ficha ${id} não apareceu`);
  }
  const middle = (e: Element) => {
    e.scrollIntoView({ block: 'center' });
    const r = e.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + Math.min(r.height / 2, 40) };
  };
  const pe = (type: string, x: number, y: number) =>
    new PointerEvent(type, { clientX: x, clientY: y, pointerType: 'mouse', pointerId: 1, isPrimary: true, button: 0, bubbles: true, cancelable: true });

  /** Arrasta com o mouse de `from` até `to` (o alvo é medido já no lugar, depois de a parede rolar até ele). */
  async function dragTo(from: Element, to: () => Element): Promise<string | null> {
    const a = middle(from);
    from.querySelector('.hit')?.dispatchEvent(pe('pointerdown', a.x, a.y)) ?? from.dispatchEvent(pe('pointerdown', a.x, a.y));
    window.dispatchEvent(pe('pointermove', a.x + 12, a.y + 4));
    const b = middle(to());
    window.dispatchEvent(pe('pointermove', b.x, b.y));
    const tip = el.querySelector('.arrasto-dica:not([hidden])')?.textContent ?? null;
    window.dispatchEvent(pe('pointerup', b.x, b.y));
    await settle();
    return tip;
  }

  async function mount(actions = true): Promise<void> {
    localStorage.clear();
    localStorage.setItem('mural-de-jogos:vista:v1', JSON.stringify({ noteTab: 'c:estudos' }));
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        provideLocationMocks(),
        { provide: ViewTransitions, useValue: { run: (change: () => void) => change() } },
      ],
    });
    TestBed.inject(Mural).kind.set('anotacoes');
    store = TestBed.inject(ReviewStore);
    folders = TestBed.inject(NoteFolders);
    TestBed.inject(Settings).setNotesConfig({ folders: [f('phist000001', 'História'), f('pprog000001', 'Programação')] });
    store.reviews.set([note('nd000001', 'Revolução', 'Estudos'), note('nd000002', 'Era Vargas', 'Estudos'), note('nd000003', 'Guerra Fria', 'Estudos', 'phist000001'), note('nd000004', 'Daily', 'Trabalho')]);
    const fixture = TestBed.createComponent(OwnerHost);
    fixture.componentInstance.actions = actions;
    el = fixture.nativeElement as HTMLElement;
    document.body.appendChild(el);
    await fixture.whenStable();
    TestBed.inject(WallView).setNoteTab('c:estudos');
    await settle();
  }

  afterEach(() => {
    el?.remove();
    document.querySelectorAll('.menu-contexto').forEach((m) => (m as HTMLElement).hidePopover?.());
    localStorage.clear();
  });

  const folderCard = (id: string) => el.querySelector<HTMLElement>(`app-folder-card[data-pasta="${id}"]`)!;

  it('uma anotação sobre uma pasta: a etiqueta diz onde, ela guarda, e o bilhete tem o Desfazer', async () => {
    await mount();
    const tip = await dragTo(await card('nd000001'), () => folderCard('phist000001'));
    expect(tip).toBe('Guardar em História');
    expect(folders.of(store.get('nd000001')!)).toBe('phist000001');
    const toast = TestBed.inject(Toasts).current()!;
    expect(toast.text).toBe('Revolução guardada em História.');
    toast.action!.run();
    expect(folders.of(store.get('nd000001')!)).toBeNull();
  });

  it('arrastar uma das marcadas leva todas para a pasta, com o maço do Kanban (PLANO-SELECAO.md, 2)', async () => {
    await mount();
    const ctrl = (id: string) => {
      const hit = el.querySelector<HTMLElement>(`.lugar[data-lugar="${id}"] .hit`)!;
      hit.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, ctrlKey: true, button: 0 }));
      hit.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true, button: 0 }));
    };
    await card('nd000001');
    await card('nd000002');
    ctrl('nd000001');
    ctrl('nd000002');
    await settle();
    // o aperto numa marcada não desmarca: é o começo de arrastar todas
    const from = await card('nd000002');
    const a = middle(from);
    from.parentElement!.querySelector('.hit')!.dispatchEvent(pe('pointerdown', a.x, a.y));
    window.dispatchEvent(pe('pointermove', a.x + 12, a.y + 4));
    expect(el.querySelector('.arrasto-fantasma .pilha .pilha-n')?.textContent).toBe('2');
    expect(el.querySelectorAll('.arrasto-fantasma .pilha > app-review-card').length).toBe(2);
    const b = middle(folderCard('phist000001'));
    window.dispatchEvent(pe('pointermove', b.x, b.y));
    window.dispatchEvent(pe('pointerup', b.x, b.y));
    await settle();
    expect(folders.of(store.get('nd000001')!)).toBe('phist000001');
    expect(folders.of(store.get('nd000002')!)).toBe('phist000001');
    expect(TestBed.inject(Toasts).current()!.text).toBe('2 anotações guardadas em História.');
  });

  it('uma anotação sobre outra: a pasta nova com as duas, e o nome se escreve na própria pasta', async () => {
    await mount();
    const tip = await dragTo(await card('nd000001'), () => el.querySelector('.lugar[data-lugar="nd000002"] app-review-card')!);
    expect(tip).toBe('Nova pasta com as duas');
    const made = folders.tree().kids('estudos', null).find((x) => x.name === 'Nova pasta')!;
    expect(folders.of(store.get('nd000002')!)).toBe(made.id);
    const input = el.querySelector<HTMLInputElement>(`app-folder-card[data-pasta="${made.id}"] input.nome-campo`)!;
    expect(document.activeElement).toBe(input);
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, 'Nova pasta'.length]);
    input.value = 'Brasil';
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await settle();
    expect(folders.nameOf(made.id)).toBe('Brasil');
    expect(el.querySelector('input.nome-campo')).toBeNull();
    expect(document.activeElement).toBe(folderCard(made.id).querySelector('button'));
  });

  it('o nome de uma irmã avisa, e o Enter junta as duas pastas', async () => {
    await mount();
    await dragTo(await card('nd000001'), () => el.querySelector('.lugar[data-lugar="nd000002"] app-review-card')!);
    const input = el.querySelector<HTMLInputElement>('input.nome-campo')!;
    input.value = 'história';
    input.dispatchEvent(new Event('input'));
    await settle();
    expect(el.querySelector('.aviso')!.textContent).toContain('Já existe História aqui');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await settle();
    expect(folders.of(store.get('nd000001')!)).toBe('phist000001');
    expect(folders.tree().kids('estudos', null).map((x) => x.name)).toEqual(['História', 'Programação']);
  });

  it('uma pasta sobre outra entra nela', async () => {
    await mount();
    const tip = await dragTo(folderCard('phist000001'), () => folderCard('pprog000001'));
    expect(tip).toBe('Guardar em Programação');
    expect(folders.tree().parentOf('phist000001')).toBe('pprog000001');
  });

  it('o botão direito na pasta abre o menu dela', async () => {
    await mount();
    const button = folderCard('phist000001').querySelector('button')!;
    const at = middle(button);
    button.dispatchEvent(new MouseEvent('contextmenu', { clientX: at.x, clientY: at.y, bubbles: true, cancelable: true }));
    await settle();
    const items = Array.from(el.querySelectorAll('.menu-contexto:popover-open .escolha .nome')).map((n) => n.textContent!.trim());
    expect(items).toEqual(['Abrir', 'Nova anotação aqui', 'Nova pasta dentro', 'Renomear', 'Mover para…', 'Desfazer a pasta']);
  });

  it('"Mover para pasta…" no menu da anotação abre a folha com a árvore, e escolher move', async () => {
    await mount();
    const c = await card('nd000001');
    const at = middle(c);
    c.querySelector('.hit')!.dispatchEvent(new MouseEvent('contextmenu', { clientX: at.x, clientY: at.y, bubbles: true, cancelable: true }));
    await settle();
    const item = Array.from(el.querySelectorAll<HTMLButtonElement>('.menu-contexto:popover-open .escolha')).find((b) => b.textContent!.includes('Mover para pasta'))!;
    item.click();
    await settle();
    const sheet = el.querySelector('app-folder-move-sheet')!;
    expect(sheet.querySelector('h2')!.textContent).toBe('Mover Revolução');
    Array.from(sheet.querySelectorAll<HTMLButtonElement>('[role="radio"]')).find((b) => b.textContent!.includes('Programação'))!.click();
    await settle();
    expect(folders.of(store.get('nd000001')!)).toBe('pprog000001');
    expect(TestBed.inject(Toasts).current()!.text).toBe('Revolução guardada em Programação.');
    expect(el.querySelector('app-folder-move-sheet')).toBeNull();
  });

  it('sem as mudanças de pasta (a visita), nada arrasta e a pasta não tem menu', async () => {
    await mount(false);
    const tip = await dragTo(await card('nd000001'), () => folderCard('phist000001'));
    expect(tip).toBeNull();
    expect(folders.of(store.get('nd000001')!)).toBeNull();
    const button = folderCard('phist000001').querySelector('button')!;
    const ctx = new MouseEvent('contextmenu', { clientX: 5, clientY: 5, bubbles: true, cancelable: true });
    button.dispatchEvent(ctx);
    expect(ctx.defaultPrevented).toBeFalse();
  });
});
