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
    expect(chips()).toEqual(['grupo', 'assunto', 'tags', 'data', 'capa', 'quem']);
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

  /** Escolhe a etapa na lista do aparelho (o select por cima da tira). */
  const pickColumn = async (scope: Element, value: string) => {
    const select = scope.querySelector<HTMLSelectElement>('app-kanban-props select')!;
    select.value = value;
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();
  };
  /** Toca no tracinho da importância. */
  const pickImportance = async (scope: Element, label: string) => {
    scope.querySelector<HTMLButtonElement>(`app-kanban-props .traco[aria-label="${label}"]`)!.click();
    await fixture.whenStable();
  };

  it('o Kanban: a anotação do quadro anda de coluna, ganha importância e status ao salvar', async () => {
    const n = note('nquadro1', { category: 'Trabalho', tags: ['x'] });
    store.add(n);
    // outra anotação do quadro com status: nada de sugestão de status
    kanban.state.set({ boards: [board([{ note: 'nquadro1', column: 'afazer', importance: null, at: T0 }, { note: 'nquadro9', column: 'afazer', importance: null, status: 'Com o Sérgio', at: T0 }])], removed: {}, legacy: [] });
    await edit(store.get('nquadro1')!);
    expect(chip('quadro').textContent!.trim()).toBe('A fazer');
    const p = await openPart('quadro');
    // sem o atalho de levar para a coluna seguinte: a etapa é só a lista
    expect(p.querySelector('.avancar')).toBeNull();
    const etapa = p.querySelector<HTMLSelectElement>('select')!;
    etapa.value = 'fazendo';
    etapa.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    await pickImportance(p, 'Importante');
    expect(p.querySelector('.imp-nome:not(.medida)')!.textContent!.trim()).toBe('Importante');
    expect(p.querySelectorAll('.traco.aceso').length).toBe(4);
    // compacto: o "+ Status" abre o campo no lugar
    [...p.querySelectorAll<HTMLButtonElement>('.extras .mais')].find((b) => b.textContent!.includes('Observação'))!.click();
    await fixture.whenStable();
    const status = p.querySelector<HTMLInputElement>('.status-valor input')!;
    // só o campo: sem exemplo e sem os status já usados no quadro
    expect(status.placeholder).toBe('');
    expect(p.querySelector('.usados, .usado')).toBeNull();
    status.value = 'Em revisão';
    status.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(chip('quadro').textContent!.trim()).toBe('Fazendo');
    // nada vale antes de salvar
    expect(kanban.get(TRAB)!.cards[0].column).toBe('afazer');
    // o status ainda sendo escrito vale ao salvar
    await saveAndClose();
    const card = kanban.get(TRAB)!.cards.find((c) => c.note === 'nquadro1')!;
    expect(card.column).toBe('fazendo');
    expect(card.importance).toBe('importante');
    expect(card.status).toBe('Em revisão');
  });

  it('na anotação, a folha do texto vai até o pé da página, sem rolar', async () => {
    store.add(note('nfolha01', { category: 'Trabalho', text: 'Uma linha só.' }));
    await edit(store.get('nfolha01')!);
    // a janela do teste é baixa: uma ficha alta, como numa tela de computador
    const dialog = el.querySelector<HTMLElement>('dialog')!;
    dialog.style.maxHeight = 'none';
    const ficha = el.querySelector<HTMLElement>('.ficha')!;
    ficha.style.height = '1100px';
    ficha.style.maxHeight = 'none';
    await fixture.whenStable();
    const page = el.querySelector<HTMLElement>('.conteudo')!;
    const area = el.querySelector<HTMLTextAreaElement>('.bloco.texto textarea')!;
    expect(page.scrollHeight).toBeLessThanOrEqual(page.clientHeight + 1);
    // embaixo da folha, só o contador e a margem da página
    expect(page.getBoundingClientRect().bottom - area.getBoundingClientRect().bottom).toBeLessThan(80);
    // a alça de esticar sai: a folha já é do tamanho da página
    expect(getComputedStyle(area).resize).toBe('none');
  });

  it('o Kanban: passar o mouse pela régua da importância não mexe nos tracinhos (o nome tem lugar fixo)', async () => {
    store.add(note('nquadro7', { category: 'Trabalho', tags: ['x'] }));
    kanban.state.set({ boards: [board([{ note: 'nquadro7', column: 'afazer', importance: null, at: T0 }])], removed: {}, legacy: [] });
    await edit(store.get('nquadro7')!);
    const p = await openPart('quadro');
    const tracos = () => [...p.querySelectorAll<HTMLButtonElement>('app-kanban-props .traco')];
    // a posição na página pelo layout (offsetLeft), sem a animação de abrir a parte no meio
    const lefts = () =>
      tracos().map((t) => {
        let x = 0;
        for (let e: HTMLElement | null = t; e; e = e.offsetParent as HTMLElement | null) x += e.offsetLeft;
        return x;
      });
    const before = lefts();
    for (const t of tracos()) {
      t.dispatchEvent(new MouseEvent('mouseenter'));
      await fixture.whenStable();
      expect(lefts()).withContext(t.getAttribute('aria-label')!).toEqual(before);
    }
    // escolher também não mexe (o x de tirar já tinha o lugar)
    await pickImportance(p, 'Crítico');
    p.querySelector('.regua-imp')!.dispatchEvent(new MouseEvent('mouseleave'));
    await fixture.whenStable();
    expect(lefts()).toEqual(before);
  });

  it('o Kanban: "Fora do quadro" tira a anotação do quadro (ela fica no mural)', async () => {
    store.add(note('nquadro2', { category: 'Trabalho', tags: ['x'] }));
    kanban.state.set({ boards: [board([{ note: 'nquadro2', column: 'fazendo', importance: 'baixo', at: T0 }])], removed: {}, legacy: [] });
    await edit(store.get('nquadro2')!);
    const p = await openPart('quadro');
    await pickColumn(p, '');
    expect(p.querySelector('.escolha-nome')!.textContent!.trim()).toBe('Fora do quadro');
    // a importância, o status e as dependências somem: fora do quadro não tem
    expect(p.querySelector('.regua-imp')).toBeNull();
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
    await pickColumn(p, 'feito');
    expect(p.querySelector('.finaliza')).not.toBeNull();
    await pickImportance(p, 'Crítico');
    const name = el.querySelector<HTMLTextAreaElement>('#editor-titulo-nota')!;
    name.value = 'Nova do quadro';
    name.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    await saveAndClose();
    expect(kanban.pending()).toEqual({ board: TRAB, column: 'feito', importance: 'critico', status: '', deps: [] });
  });

  it('de dentro do Kanban, o quadro é a mesma etiqueta do mural (sem seção à parte), com as dependências', async () => {
    store.add(note('noutra03', { category: 'Trabalho' }));
    kanban.state.set({ boards: [board()], removed: {}, legacy: [] });
    kanban.pending.set({ board: TRAB, column: 'fazendo' });
    kanban.openBoard.set(TRAB);
    fixture.componentInstance.openInCategory('Trabalho');
    await fixture.whenStable();
    expect(chips()).toContain('quadro');
    expect(el.querySelector('.kanban-bloco')).toBeNull();
    expect(chip('quadro').textContent!.trim()).toBe('Fazendo');
    const sec = await openPart('quadro');
    expect(sec.querySelector<HTMLSelectElement>('select')!.value).toBe('fazendo');
    // fechar sem mexer não pergunta: a coluna pedida é o começo, não uma mudança
    expect(fixture.componentInstance['serialize']()).toBe(fixture.componentInstance['snapshot']);
    // vazios, o status e as dependências são só dois "+" numa linha
    const mais = [...sec.querySelectorAll<HTMLButtonElement>('.extras .mais')];
    expect(mais.map((b) => b.textContent!.trim())).toEqual(['Observação', 'Dependência']);
    mais[1].click();
    await fixture.whenStable();
    let item: HTMLButtonElement | undefined;
    for (let i = 0; i < 50 && !item; i++) {
      await new Promise((r) => setTimeout(r, 10));
      await fixture.whenStable();
      item = [...sec.querySelectorAll<HTMLButtonElement>('app-card-picker .escolha')].find((b) => b.textContent!.includes('Nota noutra03'));
    }
    item!.click();
    await fixture.whenStable();
    expect(sec.querySelector('.dep-nome')!.textContent).toContain('Nota noutra03');
    const name = el.querySelector<HTMLTextAreaElement>('#editor-titulo-nota')!;
    name.value = 'Com dependência';
    name.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    await saveAndClose();
    expect(kanban.pending()).toEqual({ board: TRAB, column: 'fazendo', importance: null, status: '', deps: ['noutra03'] });
  });

  it('a nova pedida de uma coluna: trocar o grupo leva para a primeira coluna do quadro novo', async () => {
    kanban.state.set({ boards: [board()], removed: {}, legacy: [] });
    kanban.pending.set({ board: TRAB, column: 'fazendo' });
    fixture.componentInstance.openInCategory('Trabalho');
    await fixture.whenStable();
    const p = await openPart('grupo');
    Array.from(p.querySelectorAll<HTMLButtonElement>('.op')).find((b) => b.textContent!.includes('Estudos'))!.click();
    await fixture.whenStable();
    expect(chip('quadro').textContent!.trim()).toBe('A fazer');
    expect((await openPart('quadro')).querySelector<HTMLSelectElement>('select')!.value).toBe(boardIdFor('estudos') + '-afazer');
  });

  it('a aba da cartolina: o que está na ficha aparece no estojo; "Só a cartolina" tira tudo menos a cor', async () => {
    store.add(note('nvisual1', { paper: 'canson', pattern: 'gatinhos', stains: [{ stain: 'cafe' }], tags: ['x'], category: 'Casa' }));
    await edit(store.get('nvisual1')!);
    const tabs = Array.from(el.querySelectorAll<HTMLButtonElement>('.modo'));
    expect(tabs.map((t) => t.getAttribute('aria-selected'))).toEqual(['true', 'false']);
    tabs[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await fixture.whenStable();
    expect(tabs[1].getAttribute('aria-selected')).toBe('true');
    expect(el.querySelector<HTMLElement>('.escrever')!.hidden).toBeTrue();
    // sem a fileira de camadas de antes: só o atalho de limpar
    expect(el.querySelector('.na-ficha')).toBeNull();
    el.querySelector<HTMLButtonElement>('.limpar')!.click();
    await fixture.whenStable();
    expect(el.querySelector('.limpar')).toBeNull();
    const r = (fixture.componentInstance as unknown as { preview(): Review }).preview();
    expect(r.stock).toBe(store.get('nvisual1')!.stock);
    expect(r.paper).toBe('cartolina');
    expect(r.pattern).toBeUndefined();
    expect(r.stains).toBeUndefined();
  });

  it('o assunto: os do grupo à mão (também os criados), de A a Z; tocar escolhe e fecha; um nome novo com Enter cria; salva na anotação', async () => {
    store.add(note('noutra01', { category: 'Estudos', subject: 'Geografia' }));
    store.add(note('noutra02', { category: 'Trabalho', subject: 'Site' }));
    settings.setSavedSubjects('Estudos', ['História']);
    fixture.componentInstance.openInCategory('Estudos');
    await fixture.whenStable();
    expect(chip('assunto').classList).toContain('vazia');
    let p = await openPart('assunto');
    const names = () => Array.from(p.querySelectorAll<HTMLElement>('.op .nome')).map((n) => n.textContent!.trim());
    // o do Trabalho não aparece nos Estudos
    expect(names()).toEqual(['Geografia', 'História']);
    expect(p.querySelector('.nenhum')!.getAttribute('aria-checked')).toBe('true');
    Array.from(p.querySelectorAll<HTMLButtonElement>('.op')).find((b) => b.textContent!.includes('Geografia'))!.click();
    await fixture.whenStable();
    // escolher fecha a parte, e a etiqueta diz o assunto
    expect(part()).toBeNull();
    expect(chip('assunto').classList).not.toContain('vazia');
    expect(chip('assunto').textContent).toContain('Geografia');
    p = await openPart('assunto');
    const field = p.querySelector<HTMLInputElement>('input')!;
    field.value = 'artes';
    field.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(p.querySelector('.criar')!.textContent).toContain('Criar “Artes”');
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await fixture.whenStable();
    expect(chip('assunto').textContent).toContain('Artes');
    const name = el.querySelector<HTMLTextAreaElement>('.head #editor-titulo-nota')!;
    name.value = 'Pintura moderna';
    name.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    await saveAndClose();
    const saved = store.notes().find((r) => r.game.name === 'Pintura moderna')!;
    expect([saved.category, saved.subject]).toEqual(['Estudos', 'Artes']);
  });

  it('o assunto: a anotação nova pedida com um assunto (o filtro do mural) já nasce nele; "Sem assunto" tira', async () => {
    fixture.componentInstance.openInCategory('Estudos', undefined, 'História');
    await fixture.whenStable();
    expect(chip('assunto').textContent).toContain('História');
    const p = await openPart('assunto');
    p.querySelector<HTMLButtonElement>('.nenhum')!.click();
    await fixture.whenStable();
    expect(chip('assunto').classList).toContain('vazia');
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
