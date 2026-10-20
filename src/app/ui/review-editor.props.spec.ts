import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Cloud } from '../core/cloud-config';
import { KanbanBoard, boardIdFor } from '../core/kanban';
import { KanbanStore } from '../core/kanban-store';
import { Review, sanitizeReview } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { Settings } from '../core/settings';
import { ReviewEditor } from './review-editor';

const T0 = '2026-10-01T10:00:00.000Z';
const TRAB = boardIdFor('trabalho');

function note(id: string, extra: Record<string, unknown> = {}): Review {
  return { ...sanitizeReview({ kind: 'anotacoes', game: { name: `Nota ${id}`, coverUrl: null, source: 'manual' }, completedAt: '2026-10-01', createdAt: T0, ...extra })!, id };
}

function board(cards: KanbanBoard['cards'] = []): KanbanBoard {
  return {
    id: TRAB,
    category: 'trabalho',
    at: T0,
    columns: [
      { id: 'afazer', name: 'A fazer', icon: 'circulo', color: 'cinza', finishes: false },
      { id: 'fazendo', name: 'Fazendo', icon: 'lapis', color: 'amarelo', finishes: false },
      { id: 'feito', name: 'Feito', icon: 'check', color: 'verde', finishes: true },
    ],
    cards,
  };
}

/**
 * O editor como uma página: o nome na faixa, as abas (o que se escreve e a cartolina), a fileira de
 * etiquetas com os detalhes (cada uma abre a sua parte) e o lugar da anotação no Kanban.
 */
describe('o editor: a fileira de etiquetas, o Kanban e a cartolina', () => {
  let fixture: ComponentFixture<ReviewEditor>;
  let el: HTMLElement;
  let store: ReviewStore;
  let kanban: KanbanStore;
  let settings: Settings;

  beforeEach(async () => {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [ReviewEditor], providers: [provideZonelessChangeDetection()] });
    TestBed.inject(Cloud).config.set({ api: 'https://api.teste', googleClientId: 'x.apps.googleusercontent.com' });
    store = TestBed.inject(ReviewStore);
    kanban = TestBed.inject(KanbanStore);
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

  const chips = () => Array.from(el.querySelectorAll<HTMLButtonElement>('.prop')).map((b) => b.dataset['prop']);
  const chip = (id: string) => el.querySelector<HTMLButtonElement>(`.prop[data-prop="${id}"]`)!;
  const part = () => el.querySelector<HTMLElement>('#editor-parte');
  const openPart = async (id: string) => {
    chip(id).click();
    await fixture.whenStable();
    return part()!;
  };
  const edit = async (r: Review) => {
    fixture.componentInstance.open(r);
    await fixture.whenStable();
  };
  /** Salva e espera o diálogo fechar. */
  const saveAndClose = async () => {
    const dialog = el.querySelector('dialog')!;
    const closed = new Promise((r) => dialog.addEventListener('close', r, { once: true }));
    el.querySelector<HTMLButtonElement>('.pregar .btn-ink')!.click();
    await closed;
    await fixture.whenStable();
  };

  it('a anotação: o nome na faixa e as etiquetas de grupo, tags, data, capa e quem vê; sem grupo, sem Kanban', async () => {
    fixture.componentInstance.openNote('Ideias');
    await fixture.whenStable();
    const name = el.querySelector<HTMLTextAreaElement>('.head #editor-titulo-nota')!;
    expect(name.value).toBe('Ideias');
    expect(chips()).toEqual(['grupo', 'tags', 'data', 'capa', 'quem']);
    expect(chip('grupo').classList).toContain('vazia');
    expect(chip('data').textContent!.trim()).toBe('Hoje');
    // nada de sub-nota nem de "Lugar no mural"
    expect(el.textContent).not.toMatch(/Sub-nota|Lugar no mural/);
  });

  it('a resenha: data, horas, dificuldade e quem vê; a capa só depois de escolher o jogo', async () => {
    fixture.componentInstance.open(undefined, undefined, undefined, undefined, 'jogos');
    await fixture.whenStable();
    expect(chips()).toEqual(['data', 'horas', 'dificuldade', 'quem']);
    expect(el.querySelector('.modo#editor-modo-escrever')!.textContent!.trim()).toBe('Resenha');
  });

  it('uma parte de cada vez: abrir outra troca, a mesma etiqueta fecha, e o Esc fecha só a parte', async () => {
    fixture.componentInstance.openNote('Ideias');
    await fixture.whenStable();
    await openPart('data');
    expect(part()!.querySelector('#editor-data')).not.toBeNull();
    expect(chip('data').getAttribute('aria-expanded')).toBe('true');
    await openPart('tags');
    expect(part()!.querySelector('app-tag-picker')).not.toBeNull();
    expect(chip('data').getAttribute('aria-expanded')).toBe('false');
    chip('tags').click();
    await fixture.whenStable();
    expect(part()).toBeNull();
    const p = await openPart('grupo');
    const esc = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    p.querySelector('input')!.dispatchEvent(esc);
    await fixture.whenStable();
    expect(esc.defaultPrevented).toBeTrue();
    expect(part()).toBeNull();
    expect(el.querySelector('dialog')!.open).toBeTrue();
  });

  it('as tags: tocar amarra e solta; um nome novo com Enter cria; a estrela deixa sempre à mão', async () => {
    store.add(note('noutra01', { category: 'Trabalho', tags: ['Correção'] }));
    fixture.componentInstance.openInCategory('Trabalho');
    await fixture.whenStable();
    const p = await openPart('tags');
    const tag = () => Array.from(p.querySelectorAll<HTMLButtonElement>('.tag-op')).find((b) => b.textContent!.includes('Correção'))!;
    expect(tag().getAttribute('aria-pressed')).toBe('false');
    tag().click();
    await fixture.whenStable();
    expect(tag().getAttribute('aria-pressed')).toBe('true');
    expect(chip('tags').textContent).toContain('Correção');
    const field = p.querySelector<HTMLInputElement>('input')!;
    field.value = 'Urgente';
    field.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(p.querySelector('.criar')!.textContent).toContain('Criar “Urgente”');
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await fixture.whenStable();
    // a conta só aparece perto do limite
    expect(p.querySelector('.conta')).toBeNull();
    expect(chip('tags').querySelectorAll('app-note-tag').length).toBe(2);
    p.querySelector<HTMLButtonElement>('.estrela[aria-label="Sempre à mão: Urgente"]')!.click();
    await fixture.whenStable();
    expect(settings.isPinnedTag('Urgente')).toBeTrue();
    tag().click();
    await fixture.whenStable();
    expect(chip('tags').textContent).not.toContain('Correção');
  });

  it('o Kanban: a anotação do quadro anda de coluna, ganha importância e status ao salvar', async () => {
    const n = note('nquadro1', { category: 'Trabalho', tags: ['x'] });
    store.add(n);
    kanban.state.set({ boards: [board([{ note: 'nquadro1', column: 'afazer', importance: null, at: T0 }])], removed: {}, legacy: [] });
    await edit(store.get('nquadro1')!);
    expect(chip('quadro').textContent!.trim()).toBe('A fazer');
    const p = await openPart('quadro');
    const radio = (name: string) => Array.from(p.querySelectorAll<HTMLButtonElement>('[role="radio"]')).find((b) => b.textContent!.trim() === name)!;
    radio('Fazendo').click();
    await fixture.whenStable();
    radio('Importante').click();
    await fixture.whenStable();
    const status = p.querySelector<HTMLInputElement>('app-board-place input')!;
    status.value = 'Em revisão';
    status.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(chip('quadro').textContent!.trim()).toBe('Fazendo');
    // nada vale antes de salvar
    expect(kanban.get(TRAB)!.cards[0].column).toBe('afazer');
    await saveAndClose();
    const card = kanban.get(TRAB)!.cards.find((c) => c.note === 'nquadro1')!;
    expect(card.column).toBe('fazendo');
    expect(card.importance).toBe('importante');
    expect(card.status).toBe('Em revisão');
  });

  it('o Kanban: "Fora do quadro" tira a anotação do quadro (ela fica no mural)', async () => {
    store.add(note('nquadro2', { category: 'Trabalho', tags: ['x'] }));
    kanban.state.set({ boards: [board([{ note: 'nquadro2', column: 'fazendo', importance: 'baixo', at: T0 }])], removed: {}, legacy: [] });
    await edit(store.get('nquadro2')!);
    const p = await openPart('quadro');
    p.querySelector<HTMLButtonElement>('.etapa.fora')!.click();
    await fixture.whenStable();
    // a importância e o status somem: fora do quadro não tem
    expect(p.querySelector('.imp')).toBeNull();
    await saveAndClose();
    expect(kanban.get(TRAB)!.cards.some((c) => c.note === 'nquadro2')).toBeFalse();
    expect(store.get('nquadro2')).toBeDefined();
  });

  it('o Kanban: a nova escolhe a coluna (e a importância) e cai nela pelo pedido', async () => {
    store.add(note('noutra02', { category: 'Trabalho' }));
    kanban.state.set({ boards: [board()], removed: {}, legacy: [] });
    fixture.componentInstance.openInCategory('Trabalho');
    await fixture.whenStable();
    expect(chip('quadro').classList).toContain('vazia');
    const p = await openPart('quadro');
    Array.from(p.querySelectorAll<HTMLButtonElement>('[role="radio"]')).find((b) => b.textContent!.trim().startsWith('Feito'))!.click();
    await fixture.whenStable();
    Array.from(p.querySelectorAll<HTMLButtonElement>('[role="radio"]')).find((b) => b.textContent!.trim() === 'Crítico')!.click();
    await fixture.whenStable();
    const name = el.querySelector<HTMLTextAreaElement>('#editor-titulo-nota')!;
    name.value = 'Nova do quadro';
    name.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    await saveAndClose();
    expect(kanban.pending()).toEqual({ board: TRAB, column: 'feito', importance: 'critico', status: '' });
  });

  it('a nova pedida de uma coluna já mostra a coluna; trocar o grupo leva para a primeira do quadro novo', async () => {
    kanban.state.set({ boards: [board()], removed: {}, legacy: [] });
    kanban.pending.set({ board: TRAB, column: 'fazendo' });
    fixture.componentInstance.openInCategory('Trabalho');
    await fixture.whenStable();
    expect(chip('quadro').textContent!.trim()).toBe('Fazendo');
    // fechar sem mexer não pergunta: a coluna pedida é o começo, não uma mudança
    expect(fixture.componentInstance['serialize']()).toBe(fixture.componentInstance['snapshot']);
    const p = await openPart('grupo');
    Array.from(p.querySelectorAll<HTMLButtonElement>('.op')).find((b) => b.textContent!.includes('Estudos'))!.click();
    await fixture.whenStable();
    expect(chip('quadro').textContent!.trim()).toBe('A fazer');
  });

  it('as abas: a da cartolina mostra o estojo e as camadas da ficha, que saem pelo x ou de uma vez', async () => {
    store.add(note('nvisual1', { paper: 'canson', pattern: 'gatinhos', stains: [{ stain: 'cafe' }], tags: ['x'], category: 'Casa' }));
    await edit(store.get('nvisual1')!);
    const tabs = Array.from(el.querySelectorAll<HTMLButtonElement>('.modo'));
    expect(tabs.map((t) => t.getAttribute('aria-selected'))).toEqual(['true', 'false']);
    tabs[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await fixture.whenStable();
    expect(tabs[1].getAttribute('aria-selected')).toBe('true');
    expect(el.querySelector<HTMLElement>('.escrever')!.hidden).toBeTrue();
    const layers = () => Array.from(el.querySelectorAll<HTMLElement>('.na-ficha .camada')).map((c) => c.querySelector('.camada-tipo')!.textContent!.trim());
    expect(layers()).toEqual(['Cor', 'Papel', 'Estampa', 'Mancha']);
    el.querySelectorAll<HTMLElement>('.na-ficha .camada')[3].querySelector<HTMLButtonElement>('.camada-tirar')!.click();
    await fixture.whenStable();
    expect(layers()).toEqual(['Cor', 'Papel', 'Estampa']);
    el.querySelector<HTMLButtonElement>('.limpar')!.click();
    await fixture.whenStable();
    expect(el.querySelector<HTMLElement>('.na-ficha')!.hidden).toBeTrue();
    const r = (fixture.componentInstance as unknown as { preview(): Review }).preview();
    expect(r.paper).toBe('cartolina');
    expect(r.pattern).toBeUndefined();
    expect(r.stains).toBeUndefined();
  });

  it('o que falta abre a parte dele: a data inválida abre a Data', async () => {
    fixture.componentInstance.openNote('Data ruim');
    await fixture.whenStable();
    (fixture.componentInstance as unknown as { dateYear: { set(v: string): void } }).dateYear.set('1900');
    await fixture.whenStable();
    el.querySelector<HTMLButtonElement>('.pregar .btn-ink')!.click();
    await fixture.whenStable();
    expect(chip('data').classList).toContain('errada');
    expect(part()!.querySelector('#editor-data')).not.toBeNull();
    expect(el.querySelector('dialog')!.open).toBeTrue();
  });
});
