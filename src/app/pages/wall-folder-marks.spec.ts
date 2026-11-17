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
import { SelectionTray } from '../ui/selection-tray';
import { Toasts } from '../ui/toast';
import { WallToolbar } from '../ui/wall-toolbar';
import { WallAccess, WallBoard } from './wall-board';

/**
 * Marcar pastas junto com as anotações (PLANO-MARCAR-PASTAS.md, rodada 1), no seu mural: Ctrl/Shift+clique e o toque
 * marcando marcam a pasta com o tracejado e o número das fichas, dois toques abrem, o Ctrl+C leva o que está dentro.
 */

const ACCESS: WallAccess = { landingId: null, picking: false, picked: new Map(), masked: false, secret: new Set(), reactCode: null, checkable: true, looks: {} };
const T0 = '2026-10-01T10:00:00.000Z';
const note = (id: string, title: string, category: string, folder?: string, text = 'Texto.'): Review => ({
  ...sanitizeReview({
    kind: 'anotacoes',
    game: { name: title, coverUrl: null, source: 'manual' },
    text,
    category,
    stock: 'azul',
    completedAt: '2026-10-01',
    createdAt: T0,
    updatedAt: T0,
    ...(folder ? { folder } : {}),
  })!,
  id,
});
const f = (id: string, name: string, parent: string | null = null): NoteFolder => ({ id, group: 'estudos', name, parent });

@Component({
  imports: [WallToolbar, WallBoard],
  template: `<app-wall-toolbar /><app-wall-board [access]="access" [folderActions]="actions ? folders : null" (opened)="opened.push($event)" />`,
})
class OwnerHost {
  readonly access = ACCESS;
  readonly folders = TestBed.inject(NoteFolders);
  readonly opened: string[] = [];
  actions = true;
}

describe('marcar pastas junto com as anotações (no seu mural)', () => {
  let el: HTMLElement;
  let host: OwnerHost;
  let copied: string[];
  let board: WallBoard;

  const settle = async (n = 4) => {
    for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 16));
  };
  async function card(id: string): Promise<HTMLElement> {
    for (let i = 0; i < 150; i++) {
      const c = el.querySelector<HTMLElement>(`.lugar[data-lugar="${id}"] .hit`);
      if (c) return c;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error(`a ficha ${id} não apareceu`);
  }
  const folderCard = (id: string) => el.querySelector<HTMLElement>(`app-folder-card[data-pasta="${id}"]`)!;
  const folderButton = (id: string) => folderCard(id).querySelector<HTMLElement>('button')!;
  const tap = (target: HTMLElement, o: { ctrl?: boolean; shift?: boolean; detail?: number } = {}) => {
    target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, ctrlKey: !!o.ctrl, shiftKey: !!o.shift, button: 0 }));
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: !!o.ctrl, shiftKey: !!o.shift, button: 0, detail: o.detail ?? 1 }));
  };
  const marked = () =>
    Array.from(el.querySelectorAll<HTMLElement>('[data-marcada]'), (e) => `${e.getAttribute('data-pasta') ?? e.getAttribute('data-lugar')}#${e.style.getPropertyValue('--marca-n')}`);

  async function mount(actions = true): Promise<void> {
    localStorage.clear();
    localStorage.setItem('mural-de-jogos:vista:v1', JSON.stringify({ noteTab: 'c:estudos' }));
    copied = [];
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        provideLocationMocks(),
        { provide: ViewTransitions, useValue: { run: (change: () => void) => change() } },
      ],
    });
    spyOn(navigator.clipboard, 'writeText').and.callFake(async (t: string) => void copied.push(t));
    TestBed.inject(Mural).kind.set('anotacoes');
    const store = TestBed.inject(ReviewStore);
    TestBed.inject(Settings).setNotesConfig({
      folders: [f('phist000001', 'História'), f('pmodr000001', 'Moderna', 'phist000001'), f('pprog000001', 'Programação'), f('pvazi000001', 'Vazia')],
    });
    store.reviews.set([
      note('nm000001', 'Revolução', 'Estudos', undefined, 'Solta.'),
      note('nm000002', 'Guerra Fria', 'Estudos', 'phist000001', 'Na pasta.'),
      note('nm000003', 'Era Vargas', 'Estudos', 'pmodr000001', 'Mais fundo.'),
      note('nm000004', 'Daily', 'Trabalho'),
    ]);
    const fixture = TestBed.createComponent(OwnerHost);
    host = fixture.componentInstance;
    host.actions = actions;
    el = fixture.nativeElement as HTMLElement;
    document.body.appendChild(el);
    await fixture.whenStable();
    board = fixture.debugElement.query((d) => d.componentInstance instanceof WallBoard).componentInstance as WallBoard;
    TestBed.inject(WallView).setNoteTab('c:estudos');
    await settle();
  }

  afterEach(() => {
    el?.remove();
    document.querySelectorAll('.menu-contexto').forEach((m) => (m as HTMLElement).hidePopover?.());
    localStorage.clear();
  });

  it('Ctrl+clique numa pasta marca, sem abrir, com o número na mesma ordem das fichas; de novo, desmarca', async () => {
    await mount();
    tap(await card('nm000001'), { ctrl: true });
    tap(folderButton('pprog000001'), { ctrl: true });
    await settle(2);
    expect(TestBed.inject(WallView).openFolder()).toBeNull();
    expect(marked()).toEqual(['pprog000001#2', 'nm000001#1']);
    expect(board.selection.ids()).toEqual(['nm000001']);
    expect(board.selection.folders()).toEqual(['pprog000001']);
    expect(board.selection.count()).toBe(2);
    tap(folderButton('pprog000001'), { ctrl: true });
    await settle(2);
    expect(marked()).toEqual(['nm000001#1']);
  });

  it('Shift+clique marca o intervalo na ordem da tela, as pastas antes das fichas', async () => {
    await mount();
    tap(folderButton('phist000001'), { ctrl: true });
    tap(await card('nm000001'), { shift: true });
    await settle(2);
    expect(board.selection.folders()).toEqual(['phist000001', 'pprog000001', 'pvazi000001']);
    expect(board.selection.ids()).toEqual(['nm000001']);
  });

  it('marcando, um toque na pasta marca; dois toques abrem ela e a marca fica como estava', async () => {
    await mount();
    tap(await card('nm000001'), { ctrl: true });
    tap(folderButton('pprog000001'));
    await settle(2);
    expect(board.selection.folders()).toEqual(['pprog000001']);
    // os dois toques: o primeiro marca, o segundo (detail 2) volta a marca e abre
    tap(folderButton('phist000001'));
    tap(folderButton('phist000001'), { detail: 2 });
    await settle();
    expect(TestBed.inject(WallView).openFolder()).toBe('phist000001');
    expect(board.selection.folders()).toEqual(['pprog000001']);
    expect(board.selection.marking()).toBeTrue();
  });

  it('dois toques na única marcada abrem ela e a deixam marcada (o primeiro não a perde)', async () => {
    await mount();
    tap(folderButton('pprog000001'), { ctrl: true });
    tap(folderButton('pprog000001'));
    tap(folderButton('pprog000001'), { detail: 2 });
    await settle();
    expect(TestBed.inject(WallView).openFolder()).toBe('pprog000001');
    expect(board.selection.folders()).toEqual(['pprog000001']);
  });

  it('Ctrl+C copia as marcadas e tudo o que está dentro das pastas marcadas, sem repetir', async () => {
    await mount();
    tap(folderButton('phist000001'), { ctrl: true });
    tap(await card('nm000001'), { ctrl: true });
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', ctrlKey: true, bubbles: true, cancelable: true }));
    await settle(2);
    // a pasta primeiro (foi a primeira marcada): a de dentro dela e a da Moderna, de dentro da de dentro
    expect(copied).toEqual(['1.\nTÍTULO: Guerra Fria\nDESCRIÇÃO: Na pasta.\n\n2.\nTÍTULO: Era Vargas\nDESCRIÇÃO: Mais fundo.\n\n3.\nTÍTULO: Revolução\nDESCRIÇÃO: Solta.']);
    expect(TestBed.inject(Toasts).current()?.text).toBe('Copiei o texto das 3 anotações (2 de dentro da pasta).');
  });

  it('só uma pasta vazia marcada: o Ctrl+C diz que não há o que copiar', async () => {
    await mount();
    tap(folderButton('pvazi000001'), { ctrl: true });
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', ctrlKey: true, bubbles: true, cancelable: true }));
    await settle(2);
    expect(copied).toEqual([]);
    expect(TestBed.inject(Toasts).current()?.text).toBe('A pasta marcada está vazia: não há o que copiar.');
  });

  it('a pasta desfeita sai das marcas, e a ordem das outras não pula um número', async () => {
    await mount();
    tap(folderButton('pvazi000001'), { ctrl: true });
    tap(await card('nm000001'), { ctrl: true });
    TestBed.inject(NoteFolders).dissolve('pvazi000001');
    await settle();
    expect(board.selection.folders()).toEqual([]);
    expect(marked()).toEqual(['nm000001#1']);
  });

  it('o menu da pasta tem Marcar e Desmarcar', async () => {
    await mount();
    const open = async () => {
      const b = folderButton('pprog000001');
      const r = b.getBoundingClientRect();
      b.dispatchEvent(new MouseEvent('contextmenu', { clientX: r.left + 10, clientY: r.top + 10, bubbles: true, cancelable: true }));
      await settle();
      return Array.from(el.querySelectorAll<HTMLButtonElement>('.menu-contexto:popover-open .escolha'));
    };
    (await open()).find((b) => b.textContent!.includes('Marcar'))!.click();
    await settle();
    expect(board.selection.folders()).toEqual(['pprog000001']);
    expect(board.selection.marking()).toBeTrue();
    const again = await open();
    expect(again.some((b) => b.textContent!.includes('Desmarcar'))).toBeTrue();
  });

  // ===== Mover juntas (rodada 2) =====

  const middle = (e: Element) => {
    e.scrollIntoView({ block: 'center' });
    const r = e.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + Math.min(r.height / 2, 40) };
  };
  const pe = (type: string, x: number, y: number) =>
    new PointerEvent(type, { clientX: x, clientY: y, pointerType: 'mouse', pointerId: 1, isPrimary: true, button: 0, bubbles: true, cancelable: true });
  async function dragTo(from: Element, to: () => Element): Promise<string | null> {
    const a = middle(from);
    from.dispatchEvent(pe('pointerdown', a.x, a.y));
    window.dispatchEvent(pe('pointermove', a.x + 12, a.y + 4));
    const b = middle(to());
    window.dispatchEvent(pe('pointermove', b.x, b.y));
    const tip = el.querySelector('.arrasto-dica:not([hidden])')?.textContent ?? null;
    const pile = el.querySelector('.arrasto-fantasma .pilha-n')?.textContent ?? null;
    window.dispatchEvent(pe('pointerup', b.x, b.y));
    await settle();
    return tip && `${tip}${pile ? ` [${pile}]` : ''}`;
  }

  it('arrastar uma pasta marcada leva as outras marcadas: o maço conta tudo, e um Desfazer volta tudo', async () => {
    await mount();
    const folders = TestBed.inject(NoteFolders);
    const store = TestBed.inject(ReviewStore);
    tap(folderButton('pvazi000001'), { ctrl: true });
    tap(await card('nm000001'), { ctrl: true });
    await settle(2);
    const tip = await dragTo(folderButton('pvazi000001'), () => folderButton('pprog000001'));
    expect(tip).toBe('Guardar em Programação [2]');
    expect(folders.tree().parentOf('pvazi000001')).toBe('pprog000001');
    expect(folders.of(store.get('nm000001')!)).toBe('pprog000001');
    expect(board.selection.count()).toBe(0);
    const toast = TestBed.inject(Toasts).current()!;
    expect(toast.text).toBe('1 pasta e 1 anotação guardadas em Programação.');
    toast.action!.run();
    expect(folders.tree().parentOf('pvazi000001')).toBeNull();
    expect(folders.of(store.get('nm000001')!)).toBeNull();
  });

  it('arrastar a anotação marcada leva as pastas marcadas; nenhuma pasta vai para dentro de uma que vai', async () => {
    await mount();
    tap(folderButton('phist000001'), { ctrl: true });
    tap(await card('nm000001'), { ctrl: true });
    await settle(2);
    // a pasta que vai não é alvo
    expect(await dragTo(await card('nm000001'), () => folderButton('phist000001'))).toBeNull();
    expect(await dragTo(await card('nm000001'), () => folderButton('pvazi000001'))).toBe('Guardar em Vazia [2]');
    const folders = TestBed.inject(NoteFolders);
    expect(folders.tree().parentOf('phist000001')).toBe('pvazi000001');
  });

  it('soltar sobre outra anotação cria a pasta nova com as anotações e as pastas dentro', async () => {
    await mount();
    const store = TestBed.inject(ReviewStore);
    store.add({ ...note('nm000005', 'Outra solta', 'Estudos'), id: 'nm000005' });
    await settle();
    tap(folderButton('pvazi000001'), { ctrl: true });
    tap(await card('nm000001'), { ctrl: true });
    await settle(2);
    const other = await card('nm000005');
    const tip = await dragTo(await card('nm000001'), () => other);
    expect(tip).toContain('Nova pasta com 2 anotações e 1 pasta');
    const folders = TestBed.inject(NoteFolders);
    const made = folders.of(store.get('nm000001')!)!;
    expect(made).not.toBeNull();
    expect(folders.of(store.get('nm000005')!)).toBe(made);
    expect(folders.tree().parentOf('pvazi000001')).toBe(made);
    expect(TestBed.inject(Toasts).current()!.text).toBe('Nova pasta com 1 pasta e 2 anotações.');
    TestBed.inject(Toasts).current()!.action!.run();
    expect(folders.tree().parentOf('pvazi000001')).toBeNull();
    expect(folders.tree().live(made)).toBeUndefined();
  });

  it('"Mover para pasta" da tira leva as pastas e as anotações; as marcadas não se escolhem', async () => {
    await mount();
    tap(folderButton('pvazi000001'), { ctrl: true });
    tap(folderButton('phist000001'), { ctrl: true });
    tap(await card('nm000001'), { ctrl: true });
    await settle(2);
    board.moveMarked();
    await settle();
    const sheet = el.querySelector('app-folder-move-sheet')!;
    expect(sheet.querySelector('h2')!.textContent).toBe('Mover 2 pastas e 1 anotação');
    const options = Array.from(sheet.querySelectorAll<HTMLButtonElement>('[role="radio"]'));
    const named = (n: string) => options.find((b) => b.textContent!.includes(n))!;
    expect(named('História').disabled).toBeTrue();
    named('Programação').click();
    await settle();
    const folders = TestBed.inject(NoteFolders);
    expect(folders.tree().parentOf('phist000001')).toBe('pprog000001');
    expect(folders.tree().parentOf('pvazi000001')).toBe('pprog000001');
    expect(TestBed.inject(Toasts).current()!.text).toBe('2 pastas e 1 anotação guardadas em Programação.');
  });

  it('a marcada de outro grupo fica, e o bilhete diz', async () => {
    await mount();
    const view = TestBed.inject(WallView);
    tap(folderButton('pvazi000001'), { ctrl: true });
    view.setNoteTab('c:trabalho');
    await settle();
    tap(await card('nm000004'), { ctrl: true });
    view.setNoteTab('c:estudos');
    await settle();
    // grupos diferentes: a tira não move
    expect(board.markedGroup()).toBeUndefined();
    const tip = await dragTo(folderButton('pvazi000001'), () => folderButton('pprog000001'));
    expect(tip).toBe('Guardar em Programação [2]');
    expect(TestBed.inject(Toasts).current()!.text).toBe('1 pasta guardada em Programação. 1 ficou onde estava: de outro grupo, ou já estava lá.');
    expect(TestBed.inject(ReviewStore).get('nm000004')!.folder).toBeUndefined();
  });

  it('o menu de uma pasta marcada, com outras marcadas, leva a todas', async () => {
    await mount();
    tap(folderButton('pvazi000001'), { ctrl: true });
    tap(await card('nm000001'), { ctrl: true });
    await settle(2);
    const b = folderButton('pvazi000001');
    const r = b.getBoundingClientRect();
    b.dispatchEvent(new MouseEvent('contextmenu', { clientX: r.left + 10, clientY: r.top + 10, bubbles: true, cancelable: true }));
    await settle();
    const items = Array.from(el.querySelectorAll('.menu-contexto:popover-open .escolha .nome')).map((n) => n.textContent!.trim());
    expect(items.slice(0, 3)).toEqual(['Mover as 2 marcadas…', 'Copiar as 2 marcadas', 'Abrir']);
  });

  it('sem as mudanças de pasta (a visita), Ctrl+clique na pasta abre ela, como sempre', async () => {
    await mount(false);
    tap(folderButton('pprog000001'), { ctrl: true });
    await settle();
    expect(board.selection.folders()).toEqual([]);
    expect(TestBed.inject(WallView).openFolder()).toBe('pprog000001');
  });
});

describe('a tira com pastas marcadas', () => {
  it('diz quantas de cada e quantas estão fora da vista', async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(SelectionTray);
    fixture.componentRef.setInput('count', 5);
    fixture.componentRef.setInput('folders', 2);
    fixture.componentRef.setInput('units', ['anotação', 'anotações']);
    fixture.componentRef.setInput('hidden', 1);
    await fixture.whenStable();
    const text = (fixture.nativeElement as HTMLElement).querySelector('.conta')!.textContent!.replace(/\s+/g, ' ').trim();
    expect(text).toBe('5 marcadas 2 pastas e 3 anotações · 1 fora da vista');
    fixture.componentRef.setInput('folders', 0);
    fixture.componentRef.setInput('hidden', 0);
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).querySelector('.fora')).toBeNull();
    fixture.destroy();
  });
});
