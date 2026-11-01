import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Desk } from '../core/desk';
import { Mural } from '../core/mural';
import { Reactions } from '../core/reactions';
import { Review, isDone, isPinnedNote, sanitizeReview } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { SharedStore } from '../core/shared-store';
import { WallState } from '../core/wall-view';
import { WallAccess, WallBoard } from '../pages/wall-board';
import { NoteMenu } from './note-menu';

/** As opções à vista no menu aberto, pelo texto. */
const menuLabels = (root: ParentNode): string[] => Array.from(root.querySelectorAll<HTMLElement>('.menu-da-nota .escolha .nome')).map((x) => x.textContent?.trim() ?? '');

const ACCESS: WallAccess = { landingId: null, picking: false, picked: new Map(), masked: false, secret: new Set(), reactCode: null, checkable: true, looks: {} };

const note = (id: string, name: string, text: string, extra: Record<string, unknown> = {}): Review =>
  sanitizeReview({
    id,
    kind: 'anotacoes',
    game: { name, coverUrl: null, source: 'manual' },
    text,
    scores: { final: 0 },
    status: 'finalizado',
    completedAt: '2026-10-01',
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
    ...extra,
  })!;

const settle = async () => {
  for (let i = 0; i < 3; i++) {
    await new Promise((r) => setTimeout(r, 0));
    TestBed.tick();
  }
};

/** O menu do botão direito numa anotação do mural: quem abre, o que aparece e o que cada opção faz. */
describe('menu da anotação no mural (NoteMenu)', () => {
  let el: HTMLElement;
  let copied: string[];
  let desk: Desk;
  let store: ReviewStore;

  afterEach(() => {
    document.querySelectorAll('app-wall-board').forEach((e) => e.remove());
    localStorage.clear();
  });

  async function mount(density: 'lista' | 'simples' | 'completa' = 'lista', kind: 'anotacoes' | 'jogos' = 'anotacoes'): Promise<void> {
    TestBed.inject(Mural).kind.set(kind);
    TestBed.inject(WallState).setDensity(density);
    const fixture = TestBed.createComponent(WallBoard);
    fixture.componentRef.setInput('access', ACCESS);
    document.body.appendChild(fixture.nativeElement);
    await fixture.whenStable();
    el = fixture.nativeElement as HTMLElement;
  }

  beforeEach(() => {
    localStorage.clear();
    copied = [];
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    spyOn(navigator.clipboard, 'writeText').and.callFake(async (t: string) => void copied.push(t));
    desk = TestBed.inject(Desk);
    spyOn(desk, 'editReview');
    spyOn(desk, 'removeReview');
    store = TestBed.inject(ReviewStore);
    store.add(note('rmenu001', 'Mercado', 'Pão e **café** [link](https://exemplo.com)'));
    store.add(note('rmenu002', 'Trabalho', '- [ ] Relatório'));
  });

  const row = (id: string) => el.querySelector<HTMLElement>(`.linha[data-ficha="${id}"]`)!;
  const panel = () => el.querySelector<HTMLElement>('.menu-da-nota')!;
  const isOpen = () => panel().matches(':popover-open');
  /** O lugar do menu (sem a escala do brotar, que ainda corre). */
  const box = () => ({ left: panel().offsetLeft, top: panel().offsetTop, width: panel().offsetWidth, height: panel().offsetHeight });
  const option = (label: string) => [...panel().querySelectorAll<HTMLButtonElement>('.escolha')].find((b) => b.textContent!.includes(label))!;
  const rightClick = (target: Element, x = 40, y = 40) => {
    target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 2, pointerType: 'mouse', clientX: x, clientY: y }));
    const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: x, clientY: y });
    target.dispatchEvent(e);
    return e;
  };
  const press = (k: string, init: KeyboardEventInit = {}) => document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }));

  it('o botão direito numa linha da lista abre o menu dela, perto do ponteiro, no lugar do menu do navegador', async () => {
    await mount();
    const e = rightClick(row('rmenu001').querySelector('.hit')!, 60, 80);
    await settle();
    expect(e.defaultPrevented).toBeTrue();
    expect(isOpen()).toBeTrue();
    expect(panel().getAttribute('role')).toBe('menu');
    expect(panel().querySelector('.legenda')!.textContent).toContain('Mercado');
    expect(menuLabels(el)).toEqual(['Abrir', 'Editar', 'Copiar o conteúdo', 'Fixar no topo', 'Finalizar', 'Compartilhar', 'Apagar anotação']);
    const r = box();
    expect(r.left).toBe(62);
    // embaixo do ponteiro; sem lugar embaixo (a janela dos testes é baixa), em cima dele
    if (82 + r.height <= innerHeight - 8) expect(r.top).toBe(82);
    else if (78 - r.height >= 8) expect(r.top + r.height).toBe(78);
    else expect(r.top + r.height).toBeLessThanOrEqual(innerHeight - 8);
    // apagar vai sozinho no fim, em vermelho
    expect(option('Apagar anotação').classList).toContain('perigo');
    expect(option('Apagar anotação').closest('.leva')!.querySelectorAll('.escolha').length).toBe(1);
  });

  it('nunca sai da tela: perto da beirada, vira para o outro lado do ponteiro', async () => {
    await mount();
    rightClick(row('rmenu001').querySelector('.hit')!, innerWidth - 5, innerHeight - 5);
    await settle();
    const r = box();
    expect(r.left + r.width).toBeLessThanOrEqual(innerWidth - 5);
    expect(r.top + r.height).toBeLessThanOrEqual(innerHeight - 5);
    expect(r.left).toBeGreaterThanOrEqual(8);
  });

  it('também nas fichas da Visão geral', async () => {
    await mount('simples');
    await settle();
    const box = el.querySelector<HTMLElement>('.lugar[data-lugar="rmenu002"]')!;
    rightClick(box);
    await settle();
    expect(isOpen()).toBeTrue();
    expect(panel().querySelector('.legenda')!.textContent).toContain('Trabalho');
  });

  it('um link do texto e um trecho selecionado ficam com o menu do navegador; nos murais de resenhas também', async () => {
    await mount('completa');
    await settle();
    const link = el.querySelector<HTMLElement>('.lugar[data-lugar="rmenu001"] a[href]');
    if (link) {
      expect(rightClick(link).defaultPrevented).toBeFalse();
      expect(isOpen()).toBeFalse();
    }
    document.querySelectorAll('app-wall-board').forEach((e) => e.remove());
    store.add(sanitizeReview({ id: 'rjogo001', kind: 'jogos', game: { name: 'Hades', coverUrl: null, source: 'manual' }, scores: { final: 9 }, status: 'finalizado', completedAt: '2026-10-01', createdAt: '2026-10-01T10:00:00.000Z', updatedAt: '2026-10-01T10:00:00.000Z' })!);
    await mount('completa', 'jogos');
    await settle();
    const card = el.querySelector<HTMLElement>('.lugar[data-lugar="rjogo001"]')!;
    expect(rightClick(card).defaultPrevented).toBeFalse();
    expect(el.querySelector('.menu-da-nota')).toBeNull();
  });

  it('pelo teclado: as setas andam parando nas pontas (como no Mais), Home e End, a letra pula; Esc fecha e o foco volta para a linha', async () => {
    await mount();
    const hit = row('rmenu001').querySelector<HTMLElement>('.hit')!;
    hit.focus();
    // Shift+F10 com o foco na linha abre com o foco na primeira opção
    hit.dispatchEvent(new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true, cancelable: true }));
    await settle();
    expect(isOpen()).toBeTrue();
    expect(document.activeElement).toBe(option('Abrir'));
    press('ArrowUp');
    expect(document.activeElement).toBe(option('Abrir'));
    press('ArrowDown');
    expect(document.activeElement).toBe(option('Editar'));
    press('End');
    expect(document.activeElement).toBe(option('Apagar anotação'));
    press('ArrowDown');
    expect(document.activeElement).toBe(option('Apagar anotação'));
    press('Home');
    press('c');
    expect(document.activeElement).toBe(option('Copiar o conteúdo'));
    press('f');
    expect(document.activeElement).toBe(option('Fixar no topo'));
    press('f');
    expect(document.activeElement).toBe(option('Finalizar'));
    press('Escape');
    await settle();
    expect(isOpen()).toBeFalse();
    expect(document.activeElement).toBe(hit);
    // a tecla de menu também abre
    hit.dispatchEvent(new KeyboardEvent('keydown', { key: 'ContextMenu', bubbles: true, cancelable: true }));
    await settle();
    expect(isOpen()).toBeTrue();
    press('Tab');
    await settle();
    expect(isOpen()).toBeFalse();
    expect(document.activeElement).toBe(hit);
  });

  it('aberto pelo mouse, o foco fica no menu: as setas, o Esc e o Tab são dele, e o Esc não desmarca as marcadas', async () => {
    await mount();
    const t = row('rmenu002');
    t.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, ctrlKey: true, button: 0 }));
    t.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true, button: 0 }));
    await settle();
    rightClick(row('rmenu002').querySelector('.hit')!);
    await settle();
    expect(document.activeElement).toBe(panel());
    press('ArrowDown');
    expect(document.activeElement).toBe(option('Abrir'));
    press('Escape');
    await settle();
    expect(isOpen()).toBeFalse();
    expect(document.activeElement).toBe(row('rmenu002').querySelector('.hit'));
    expect(row('rmenu002').hasAttribute('data-marcada')).toBeTrue();
  });

  it('rolar a página fecha o menu (a rolagem que não mexe na ficha, não)', async () => {
    await mount();
    const hit = row('rmenu001').querySelector<HTMLElement>('.hit')!;
    rightClick(hit);
    await settle();
    expect(isOpen()).toBeTrue();
    window.dispatchEvent(new Event('scroll'));
    await settle();
    expect(isOpen()).toBeTrue();
    const at = hit.getBoundingClientRect();
    spyOn(hit, 'getBoundingClientRect').and.returnValue(new DOMRect(at.left, at.top - 120, at.width, at.height));
    window.dispatchEvent(new Event('scroll'));
    await settle();
    expect(isOpen()).toBeFalse();
  });

  it('Copiar o conteúdo copia o título e o texto sem as marcas, como o Ctrl+C das marcadas', async () => {
    await mount();
    rightClick(row('rmenu001').querySelector('.hit')!);
    await settle();
    option('Copiar o conteúdo').click();
    await settle();
    expect(copied).toEqual(['TÍTULO: Mercado\nDESCRIÇÃO: Pão e café link']);
    expect(isOpen()).toBeFalse();
    expect(document.activeElement).toBe(row('rmenu001').querySelector('.hit'));
  });

  it('numa das marcadas (Ctrl+clique), o menu copia as marcadas também, e elas continuam marcadas', async () => {
    await mount();
    for (const id of ['rmenu002', 'rmenu001']) {
      const t = row(id);
      t.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, ctrlKey: true, button: 0 }));
      t.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true, button: 0 }));
    }
    await settle();
    rightClick(row('rmenu001').querySelector('.hit')!);
    await settle();
    expect(menuLabels(el)).toContain('Copiar as 2 marcadas');
    const all = option('Copiar as 2 marcadas');
    all.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }));
    all.click();
    await settle();
    expect(copied).toEqual(['1.\nTÍTULO: Trabalho\nDESCRIÇÃO: Relatório\n\n2.\nTÍTULO: Mercado\nDESCRIÇÃO: Pão e café link']);
    expect(row('rmenu001').hasAttribute('data-marcada')).toBeTrue();
    // numa que não está marcada, só ela
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
    await settle();
    rightClick(row('rmenu002').querySelector('.hit')!);
    await settle();
    expect(menuLabels(el)).not.toContain('Copiar as 2 marcadas');
  });

  it('Fixar e Finalizar mudam a anotação; Editar e Apagar vão pela mesa, como na leitura', async () => {
    await mount();
    rightClick(row('rmenu001').querySelector('.hit')!);
    await settle();
    option('Fixar no topo').click();
    await settle();
    expect(isPinnedNote(store.get('rmenu001')!)).toBeTrue();
    rightClick(row('rmenu001').querySelector('.hit')!);
    await settle();
    expect(menuLabels(el)).toContain('Desafixar');
    option('Finalizar').click();
    await settle();
    expect(isDone(store.get('rmenu001')!)).toBeTrue();
    rightClick(row('rmenu002').querySelector('.hit')!);
    await settle();
    option('Editar').click();
    expect(desk.editReview).toHaveBeenCalledWith('rmenu002');
    rightClick(row('rmenu002').querySelector('.hit')!);
    await settle();
    option('Apagar anotação').click();
    expect(desk.removeReview).toHaveBeenCalledWith('rmenu002');
  });

  it('Abrir abre a leitura pela página (o mesmo toque da ficha)', async () => {
    TestBed.inject(Mural).kind.set('anotacoes');
    TestBed.inject(WallState).setDensity('lista');
    const opened: string[] = [];
    const fixture = TestBed.createComponent(WallBoard);
    fixture.componentRef.setInput('access', ACCESS);
    fixture.componentInstance.opened.subscribe((id) => opened.push(id));
    document.body.appendChild(fixture.nativeElement);
    await fixture.whenStable();
    el = fixture.nativeElement;
    rightClick(row('rmenu002').querySelector('.hit')!);
    await settle();
    option('Abrir').click();
    expect(opened).toEqual(['rmenu002']);
  });

  it('o dedo segurado parado abre o menu, e o clique de quando ele sobe não abre a leitura; andando, é rolar', async () => {
    jasmine.clock().install();
    try {
      await mount();
      const opened: string[] = [];
      const hit = row('rmenu001').querySelector<HTMLElement>('.hit')!;
      hit.addEventListener('click', () => opened.push('clique'));
      const touch = (type: string, x = 30, y = 30) =>
        hit.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerType: 'touch', isPrimary: true, pointerId: 7, clientX: x, clientY: y }));
      touch('pointerdown');
      touch('pointermove', 50, 30);
      jasmine.clock().tick(600);
      expect(isOpen()).toBeFalse();
      touch('pointerup', 50, 30);
      touch('pointerdown', 120, 300);
      jasmine.clock().tick(600);
      touch('pointerup', 120, 300);
      hit.click();
      expect(isOpen()).toBeTrue();
      expect(opened).toEqual([]);
      // o menu do dedo fica fora do polegar: em cima dele (ou embaixo, sem lugar), longe 24px, centrado nele
      TestBed.tick();
      const r = box();
      if (300 - 24 - r.height >= 8) expect(r.top + r.height).toBe(276);
      else if (300 + 24 + r.height <= innerHeight - 8) expect(r.top).toBe(324);
      // o toque logo depois numa opção do menu não é engolido
      const copy = option('Copiar o conteúdo');
      copy.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerType: 'touch', isPrimary: true }));
      copy.click();
      expect(isOpen()).toBeFalse();
    } finally {
      jasmine.clock().uninstall();
    }
  });
});

/** As opções de quem não é o dono: a visita, quem só lê ou edita a compartilhada, o link. */
describe('menu da anotação: quem vê o quê', () => {
  let menu: NoteMenu;
  let host: HTMLElement;

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(NoteMenu);
    host = fixture.nativeElement;
    document.body.appendChild(host);
    menu = fixture.componentInstance;
    await fixture.whenStable();
  });
  afterEach(() => host.remove());

  const show = async (r: Review) => {
    menu.show({ review: r, x: 10, y: 10, back: null });
    await settle();
    return menuLabels(host);
  };

  it('a visita só abre e copia (o texto e o link da ficha pública)', async () => {
    const fixture = TestBed.createComponent(NoteMenu);
    fixture.componentRef.setInput('owner', 'Ana');
    fixture.componentRef.setInput('ownerCode', 'ANA123');
    document.body.appendChild(fixture.nativeElement);
    await fixture.whenStable();
    fixture.componentInstance.show({ review: note('rvis0001', 'Viagem', 'Mala'), x: 10, y: 10, back: null });
    await settle();
    expect(menuLabels(fixture.nativeElement)).toEqual(['Abrir', 'Copiar o conteúdo', 'Copiar o link']);
    fixture.nativeElement.remove();
  });

  it('a ficha em segredo da visita não copia o texto nem o link', async () => {
    const fixture = TestBed.createComponent(NoteMenu);
    fixture.componentRef.setInput('owner', 'Ana');
    fixture.componentRef.setInput('ownerCode', 'ANA123');
    fixture.componentRef.setInput('secret', new Set(['rvis0001']));
    document.body.appendChild(fixture.nativeElement);
    await fixture.whenStable();
    fixture.componentInstance.show({ review: note('rvis0001', 'Viagem', 'Mala'), x: 10, y: 10, back: null });
    await settle();
    expect(menuLabels(fixture.nativeElement)).toEqual(['Abrir']);
    fixture.nativeElement.remove();
  });

  it('o link só aparece com conta e na anotação pública, e copia o endereço que abre só ela', async () => {
    const copied: string[] = [];
    spyOn(navigator.clipboard, 'writeText').and.callFake(async (t: string) => void copied.push(t));
    expect(await show(note('rpriv001', 'Diário', 'Hoje', { private: true }))).not.toContain('Copiar o link');
    expect(await show(note('rpub0001', 'Receita', 'Bolo', { private: false }))).not.toContain('Copiar o link');
    spyOn(TestBed.inject(Reactions), 'myCode').and.returnValue('EU1234');
    expect(await show(note('rpriv001', 'Diário', 'Hoje', { private: true }))).not.toContain('Copiar o link');
    expect(await show(note('rpub0001', 'Receita', 'Bolo', { private: false }))).toContain('Copiar o link');
    [...host.querySelectorAll<HTMLButtonElement>('.escolha')].find((b) => b.textContent!.includes('Copiar o link'))!.click();
    await settle();
    expect(copied.length).toBe(1);
    expect(copied[0]).toContain('#/ficha/EU1234/rpub0001');
  });

  it('a compartilhada: quem só lê não edita, não finaliza, vê as pessoas e sai em vez de apagar; o dono com gente apaga para todos', async () => {
    const shared = TestBed.inject(SharedStore);
    const entry = (papel: string, membros = 0) =>
      ({ papel, dono: { codigo: 'ANA123', nome: 'Ana' }, membros: Array.from({ length: membros }, (_, i) => ({ codigo: `P${i}`, nome: `P${i}` })), view: {} }) as never;
    const get = spyOn(shared, 'get');
    // (o link da compartilhada de outra pessoa é o do mural da dona)
    get.and.returnValue(entry('leitor'));
    expect(await show(note('rsh00001', 'Plano', 'Texto'))).toEqual(['Abrir', 'Copiar o conteúdo', 'Copiar o link', 'Fixar no topo', 'Pessoas', 'Sair da anotação']);
    get.and.returnValue(entry('editor'));
    expect(await show(note('rsh00001', 'Plano', 'Texto'))).toEqual(['Abrir', 'Editar', 'Copiar o conteúdo', 'Copiar o link', 'Fixar no topo', 'Finalizar', 'Pessoas', 'Sair da anotação']);
    get.and.returnValue(entry('dono', 2));
    const labels = await show(note('rsh00001', 'Plano', 'Texto'));
    expect(labels).toContain('Compartilhar');
    expect(labels.at(-1)).toBe('Apagar para todos');
  });

  it('no quadro: sem fixar, com levar para a coluna seguinte e os ajustes no quadro', async () => {
    const calls: string[] = [];
    menu.show({
      review: note('rkb00001', 'Cartão', 'Texto'),
      x: 10,
      y: 10,
      back: null,
      board: { next: 'Fazendo', advance: () => calls.push('avançar'), details: () => calls.push('ajustes') },
    });
    await settle();
    expect(menuLabels(host)).toEqual(['Abrir', 'Editar', 'Copiar o conteúdo', 'Finalizar', 'Levar para Fazendo', 'Ajustes no quadro', 'Compartilhar', 'Apagar anotação']);
    [...host.querySelectorAll<HTMLButtonElement>('.escolha')].find((b) => b.textContent!.includes('Levar para'))!.click();
    expect(calls).toEqual(['avançar']);
  });
});
