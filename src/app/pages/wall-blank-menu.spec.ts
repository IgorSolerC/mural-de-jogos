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
import { ALL_TAB, PINNED_TAB } from '../core/note-tabs';
import { WallView } from '../core/wall-view';
import { HOLD_MS } from '../ui/context-menu';
import { WallToolbar } from '../ui/wall-toolbar';
import { WallAccess, WallBoard } from './wall-board';

/**
 * O botão direito no nada do mural de anotações (cartão do Kanban "Melhorar hitbox de onde vale o botão direito
 * nas anotações"): tudo abaixo do campo de busca que não tem menu próprio abre o menu do nada (Nova anotação
 * aqui, Nova pasta aqui): os vãos da parede, as margens em volta da página, o fim dela e o cartaz de vazio. As
 * fichas, as pastas e as cabeças continuam com o delas; os campos, os links e a barra do mural, com o do navegador.
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

/** A página como no site: a barra e a parede dentro de quem as contém (com margem em volta e folga no pé). */
@Component({
  imports: [WallToolbar, WallBoard],
  template: `
    <div class="em-volta" style="padding: 40px 60px 400px">
      <app-wall-toolbar />
      <app-wall-board [access]="access" [folderActions]="actions ? folders : null" (create)="created = created + 1" />
    </div>
  `,
})
class PageHost {
  readonly access = ACCESS;
  readonly folders = TestBed.inject(NoteFolders);
  actions = true;
  created = 0;
}

describe('o botão direito no nada do mural de anotações', () => {
  let el: HTMLElement;
  let host: PageHost;

  const settle = async (n = 4) => {
    for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 16));
  };
  const openMenu = () => document.querySelector<HTMLElement>('.menu-contexto:popover-open');
  const items = () => Array.from(openMenu()?.querySelectorAll('.escolha .nome') ?? []).map((n) => n.textContent!.trim());
  const caption = () => openMenu()?.querySelector('.legenda')?.textContent?.trim() ?? null;
  const search = () => el.querySelector<HTMLElement>('#busca-mural')!;
  const around = () => el.querySelector<HTMLElement>('.em-volta')!;

  /** O botão direito em `target`, no ponto: o que ficou com ele (o menu do site ou o do navegador). */
  async function rightClick(target: Element, x: number, y: number): Promise<boolean> {
    target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 2, pointerType: 'mouse', clientX: x, clientY: y }));
    const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: x, clientY: y });
    target.dispatchEvent(e);
    await settle(2);
    return e.defaultPrevented;
  }
  /** O ponto no meio de `e`, já na tela. */
  const middle = (e: Element) => {
    const r = e.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + Math.min(r.height / 2, 30) };
  };
  /** A vaga da ficha na parede (a caixa que tem o menu dela; o papel chega depois, perto da tela). */
  async function card(id: string): Promise<HTMLElement> {
    for (let i = 0; i < 150; i++) {
      const c = el.querySelector<HTMLElement>(`.lugar[data-lugar="${id}"]`);
      if (c) return c;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error(`a ficha ${id} não apareceu`);
  }
  const close = () => openMenu()?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

  async function mount(opts: { actions?: boolean; tab?: string; notes?: Review[] } = {}): Promise<void> {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        provideLocationMocks(),
        { provide: ViewTransitions, useValue: { run: (change: () => void) => change() } },
      ],
    });
    TestBed.inject(Mural).kind.set('anotacoes');
    TestBed.inject(Settings).setNotesConfig({ folders: [f('phist000001', 'História'), f('pvazi000001', 'Vazia')] });
    TestBed.inject(ReviewStore).reviews.set(
      opts.notes ?? [note('nb000001', 'Revolução', 'Estudos'), note('nb000002', 'Era Vargas', 'Estudos'), note('nb000003', 'Guerra Fria', 'Estudos', 'phist000001'), note('nb000004', 'Daily', 'Trabalho')],
    );
    const fixture = TestBed.createComponent(PageHost);
    host = fixture.componentInstance;
    host.actions = opts.actions ?? true;
    el = fixture.nativeElement as HTMLElement;
    document.body.appendChild(el);
    window.scrollTo(0, 0);
    await fixture.whenStable();
    TestBed.inject(WallView).setNoteTab(opts.tab ?? 'c:estudos');
    await settle();
  }

  afterEach(() => {
    close();
    el?.remove();
    document.querySelectorAll('.menu-contexto').forEach((m) => (m as HTMLElement).hidePopover?.());
    localStorage.clear();
  });

  it('no vão da parede, na margem em volta e no fim da página: o menu do nada', async () => {
    await mount();
    await card('nb000001');
    const wall = el.querySelector<HTMLElement>('.wall')!;
    const w = wall.getBoundingClientRect();
    // o vão da parede (entre as fichas, à direita da última)
    expect(await rightClick(wall, w.right - 4, w.top + 4)).toBeTrue();
    expect(items()).toEqual(['Nova anotação aqui', 'Nova pasta aqui']);
    expect(caption()).toBe('Ações de Estudos');
    close();
    // a margem de quem contém a página, ao lado da parede
    const a = around().getBoundingClientRect();
    expect(await rightClick(around(), a.left + 10, w.top + 10)).toBeTrue();
    expect(items()).toEqual(['Nova anotação aqui', 'Nova pasta aqui']);
    close();
    // o fim da página, embaixo da última ficha (a folga no pé de quem a contém)
    expect(await rightClick(around(), a.left + a.width / 2, a.bottom - 20)).toBeTrue();
    expect(items()).toEqual(['Nova anotação aqui', 'Nova pasta aqui']);
    close();
    // o próprio corpo da página, embaixo de tudo
    expect(await rightClick(document.body, a.left + a.width / 2, a.bottom + 2)).toBeTrue();
    expect(items()).toEqual(['Nova anotação aqui', 'Nova pasta aqui']);
  });

  it('o Nova pasta aqui do nada cria a pasta, e o Nova anotação aqui abre a nova', async () => {
    await mount();
    const a = around().getBoundingClientRect();
    await rightClick(around(), a.left + 10, a.bottom - 20);
    Array.from(openMenu()!.querySelectorAll<HTMLButtonElement>('.escolha')).find((b) => b.textContent!.includes('Nova pasta aqui'))!.click();
    await settle();
    expect(el.querySelector('app-folder-card input')).not.toBeNull();
    (el.querySelector('app-folder-card input') as HTMLInputElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await settle();
    await rightClick(around(), a.left + 10, a.bottom - 20);
    Array.from(openMenu()!.querySelectorAll<HTMLButtonElement>('.escolha')).find((b) => b.textContent!.includes('Nova anotação aqui'))!.click();
    await settle();
    expect(host.created).toBe(1);
  });

  it('acima do fim da busca, na barra do mural, num campo e num link, fica o do navegador', async () => {
    await mount();
    const s = search().getBoundingClientRect();
    const a = around().getBoundingClientRect();
    // a margem ao lado da busca (ainda não é embaixo dela), e ao lado do pé da barra (os filtros ligados são dela)
    expect(await rightClick(around(), a.left + 10, s.top + 2)).toBeFalse();
    const t = el.querySelector('app-wall-toolbar')!.getBoundingClientRect();
    expect(await rightClick(around(), a.left + 10, t.bottom - 2)).toBeFalse();
    expect(await rightClick(around(), a.left + 10, t.bottom + 2)).toBeTrue();
    close();
    // a barra do mural (o que está embaixo da busca nela é dela: os filtros ligados, o picote)
    const bar = el.querySelector<HTMLElement>('app-wall-toolbar .pasta')!;
    const b = bar.getBoundingClientRect();
    expect(await rightClick(bar, b.left + 4, b.bottom - 3)).toBeFalse();
    // o próprio campo de busca
    expect(await rightClick(search(), s.left + 10, s.bottom - 1)).toBeFalse();
    // um link no nada
    const link = document.createElement('a');
    link.href = '#/outra';
    link.textContent = 'um link';
    el.querySelector('app-wall-board')!.appendChild(link);
    const l = link.getBoundingClientRect();
    expect(await rightClick(link, l.left + 2, Math.max(l.top + 2, s.bottom + 2))).toBeFalse();
    expect(openMenu()).toBeNull();
  });

  it('na ficha, na pasta e na cabeça da seção, cada uma com o seu', async () => {
    await mount();
    const c = await card('nb000001');
    const at = middle(c);
    expect(await rightClick(c, at.x, at.y)).toBeTrue();
    expect(caption()).toContain('Revolução');
    expect(items()).not.toContain('Nova pasta aqui');
    close();
    const folder = el.querySelector<HTMLElement>('app-folder-card[data-pasta="phist000001"] button')!;
    const fa = middle(folder);
    expect(await rightClick(folder, fa.x, fa.y)).toBeTrue();
    expect(items()).toContain('Nova pasta dentro');
    close();
    // a cabeça de uma seção sem nada para fechar: fica o do navegador, e não vira o nada
    const head = el.querySelector<HTMLElement>('app-section-head')!;
    const ha = middle(head);
    await rightClick(head, ha.x, ha.y);
    expect(items()).not.toContain('Nova pasta aqui');
  });

  it('no Tudo (sem grupo, a pasta não tem onde morar): só a anotação, com o nome do mural', async () => {
    await mount({ tab: ALL_TAB });
    const a = around().getBoundingClientRect();
    expect(await rightClick(around(), a.left + 10, a.bottom - 20)).toBeTrue();
    expect(items()).toEqual(['Nova anotação']);
    expect(caption()).toBe('Ações de Anotações');
  });

  it('nas abas que o mural gera (Fixadas), a anotação nova não nasceria nelas: fica o do navegador', async () => {
    await mount({ tab: PINNED_TAB, notes: [{ ...note('nb000001', 'Revolução', 'Estudos'), noteRank: 'fixada' }, note('nb000004', 'Daily', 'Trabalho')] });
    expect(TestBed.inject(WallView).activeTab()).toBe(PINNED_TAB);
    const a = around().getBoundingClientRect();
    expect(await rightClick(around(), a.left + 10, a.bottom - 20)).toBeFalse();
    expect(openMenu()).toBeNull();
  });

  it('o que flutua por cima da parede (preso na tela) não é o nada', async () => {
    await mount();
    const ticket = document.createElement('aside');
    ticket.style.cssText = 'position: fixed; left: 10px; bottom: 10px; width: 200px; height: 60px';
    ticket.textContent = 'Um bilhete';
    el.querySelector('app-wall-board')!.appendChild(ticket);
    const r = ticket.getBoundingClientRect();
    expect(await rightClick(ticket, r.left + 150, r.top + 50)).toBeFalse();
    ticket.remove();
  });

  it('na pasta vazia (o cartaz no lugar da parede), o nada também cria nela', async () => {
    await mount();
    TestBed.inject(WallView).enterFolder('pvazi000001');
    await settle();
    const empty = el.querySelector<HTMLElement>('.pasta-vazia')!;
    expect(empty).not.toBeNull();
    const at = middle(empty);
    expect(await rightClick(empty, at.x, at.y)).toBeTrue();
    expect(items()).toEqual(['Nova anotação aqui', 'Nova pasta aqui']);
    expect(caption()).toBe('Ações de Vazia');
  });

  it('sem as mudanças de pasta (a visita), o nada fica com o do navegador', async () => {
    await mount({ actions: false });
    const a = around().getBoundingClientRect();
    expect(await rightClick(around(), a.left + 10, a.bottom - 20)).toBeFalse();
    expect(openMenu()).toBeNull();
  });

  it('o trecho selecionado: o botão direito em cima dele copia; ao lado, o nada, e a seleção de uma ficha fica', async () => {
    await mount();
    await card('nb000001');
    const select = (node: Node) => {
      const range = document.createRange();
      range.selectNodeContents(node);
      getSelection()!.removeAllRanges();
      getSelection()!.addRange(range);
      return range;
    };
    // um trecho da parede (o nome de uma seção): o nada ao lado abre o menu e não tira a seleção
    select(el.querySelector('app-section-head')!);
    const a = around().getBoundingClientRect();
    expect(await rightClick(around(), a.left + 10, a.bottom - 20)).toBeTrue();
    expect(getSelection()!.isCollapsed).toBeFalse();
    close();
    // o texto do cartaz de vazio, selecionado: em cima dele, fica o do navegador (para copiar)
    TestBed.inject(WallView).enterFolder('pvazi000001');
    await settle();
    const h2 = el.querySelector('.pasta-vazia h2')!;
    h2.scrollIntoView({ block: 'center' });
    const r = select(h2.firstChild!).getClientRects()[0];
    expect(await rightClick(h2, r.left + 3, r.top + r.height / 2)).toBeFalse();
    // só a primeira palavra selecionada: o resto da linha é o nada
    const range = document.createRange();
    range.setStart(h2.firstChild!, 0);
    range.setEnd(h2.firstChild!, 3);
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(range);
    const w = range.getClientRects()[0];
    expect(await rightClick(h2, w.left + 2, w.top + w.height / 2)).toBeFalse();
    const line = h2.getBoundingClientRect();
    expect(await rightClick(h2, Math.min(line.right - 4, r.right - 4), r.top + r.height / 2)).toBeTrue();
    getSelection()!.removeAllRanges();
  });

  it('pelo teclado (a tecla de menu com o foco no corpo da página), o nada não abre, por mais que a tecla demore', async () => {
    await mount();
    const a = around().getBoundingClientRect();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ContextMenu', bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 700));
    // (o contextmenu da tecla chega sem o aperto do mouse antes)
    const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: a.left + 10, clientY: a.bottom - 20 });
    around().dispatchEvent(e);
    await settle(2);
    expect(e.defaultPrevented).toBeFalse();
    expect(openMenu()).toBeNull();
    // o mouse de novo: o nada volta
    expect(await rightClick(around(), a.left + 10, a.bottom - 20)).toBeTrue();
  });

  it('num botão do nada (o do cartaz de vazio), fica o do navegador', async () => {
    await mount();
    TestBed.inject(WallView).enterFolder('pvazi000001');
    await settle();
    const button = el.querySelector<HTMLElement>('.pasta-vazia button')!;
    const at = middle(button);
    expect(await rightClick(button, at.x, at.y)).toBeFalse();
  });

  it('o dedo que sobe depois de abrir o menu fora da página não engole o toque seguinte', async () => {
    await mount();
    const a = around().getBoundingClientRect();
    const x = a.left + 10;
    const y = a.bottom - 20;
    around().dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerType: 'touch', isPrimary: true, pointerId: 5, clientX: x, clientY: y }));
    await new Promise((r) => setTimeout(r, HOLD_MS + 60));
    await settle(2);
    expect(openMenu()).not.toBeNull();
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'touch', pointerId: 5, clientX: x, clientY: y }));
    // o clique de quando o dedo sobe cai na margem: é ele que fica de fora
    const lift = new MouseEvent('click', { bubbles: true, cancelable: true, clientX: x, clientY: y });
    around().dispatchEvent(lift);
    expect(lift.defaultPrevented).toBeTrue();
    close();
    // o toque seguinte, numa pasta, abre a pasta
    const folder = el.querySelector<HTMLElement>('app-folder-card[data-pasta="phist000001"] button')!;
    const tap = new MouseEvent('click', { bubbles: true, cancelable: true });
    folder.dispatchEvent(tap);
    expect(tap.defaultPrevented).toBeFalse();
  });

  it('o dedo segurado no nada abre o menu dele; andar (rolar) não', async () => {
    await mount();
    const a = around().getBoundingClientRect();
    const touch = (type: string, x: number, y: number, target: EventTarget = around()) =>
      target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerType: 'touch', isPrimary: true, pointerId: 9, button: 0, clientX: x, clientY: y }));
    const x = a.left + 10;
    const y = a.bottom - 20;
    touch('pointerdown', x, y);
    touch('pointermove', x + 30, y, window);
    await new Promise((r) => setTimeout(r, HOLD_MS + 60));
    expect(openMenu()).toBeNull();
    touch('pointerup', x + 30, y, window);
    touch('pointerdown', x, y);
    await new Promise((r) => setTimeout(r, HOLD_MS + 60));
    await settle(2);
    expect(items()).toEqual(['Nova anotação aqui', 'Nova pasta aqui']);
    touch('pointerup', x, y, window);
  });
});
