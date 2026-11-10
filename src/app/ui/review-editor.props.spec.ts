import { provideZonelessChangeDetection } from '@angular/core';
import { NoteFolders } from '../core/note-folders';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Cloud } from '../core/cloud-config';
import { KanbanBoard, boardIdFor } from '../core/kanban';
import { KanbanStore } from '../core/kanban-store';
import { Review, sanitizeReview } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { Settings } from '../core/settings';
import { SharedStore } from '../core/shared-store';
import { Confirm } from './confirm';
import { ReviewEditor } from './review-editor';
import { comMarkdown } from '../testing/writing-mode.spec';

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
  // a <textarea> das marcas à vista (o editor abre no Visual para quem não escolheu)
  comMarkdown();
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
  const kbTab = () => el.querySelector<HTMLButtonElement>('#editor-modo-kanban')!;
  /** Abre a aba Kanban e devolve o painel dela. */
  const openBoardTab = async () => {
    kbTab().click();
    await fixture.whenStable();
    return el.querySelector<HTMLElement>('.kanban-modo')!;
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

  it('a anotação: o nome na faixa e as etiquetas de grupo, tags, data, capa e quem vê; o Kanban é uma aba', async () => {
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

  /** Toca na etapa (a coluna do quadro). */
  const pickColumn = async (scope: Element, value: string) => {
    scope.querySelector<HTMLButtonElement>(`app-kanban-props .etapa[data-coluna="${value}"]`)!.click();
    await fixture.whenStable();
  };
  /** A etapa escolhida (a coluna), ou null sem nenhuma. */
  const chosenColumn = (scope: Element) => scope.querySelector<HTMLElement>('app-kanban-props .etapa[aria-checked="true"]')?.dataset['coluna'] ?? null;
  /** Toca na etiqueta da importância. */
  const pickImportance = async (scope: Element, label: string) => {
    [...scope.querySelectorAll<HTMLButtonElement>('app-kanban-props .imp')].find((b) => b.textContent!.trim() === label)!.click();
    await fixture.whenStable();
  };

  it('o Kanban: a anotação do quadro anda de coluna, ganha importância e status ao salvar', async () => {
    const n = note('nquadro1', { category: 'Trabalho', tags: ['x'] });
    store.add(n);
    // outra anotação do quadro com status: nada de sugestão de status
    kanban.state.set({ boards: [board([{ note: 'nquadro1', column: 'afazer', importance: null, at: T0 }, { note: 'nquadro9', column: 'afazer', importance: null, status: 'Com o Sérgio', at: T0 }])], removed: {}, legacy: [] });
    await edit(store.get('nquadro1')!);
    expect(kbTab().querySelector('.modo-marca')).not.toBeNull();
    expect(kbTab().getAttribute('aria-label')).toContain('A fazer');
    const p = await openBoardTab();
    // as colunas do quadro, na ordem, em toques; sem o atalho de levar para a coluna seguinte
    expect([...p.querySelectorAll<HTMLElement>('.etapa')].map((b) => b.dataset['coluna'])).toEqual(['afazer', 'fazendo', 'feito']);
    expect(p.querySelector('.avancar')).toBeNull();
    await pickColumn(p, 'fazendo');
    expect(chosenColumn(p)).toBe('fazendo');
    await pickImportance(p, 'Importante');
    const colado = p.querySelector<HTMLElement>('.imp.colado')!;
    expect(colado.textContent!.trim()).toBe('Importante');
    expect(colado.getAttribute('aria-checked')).toBe('true');
    expect(colado.querySelectorAll('.escala i.acesa').length).toBe(4);
    const status = p.querySelector<HTMLInputElement>('.observacao input')!;
    // só o campo: sem exemplo e sem os status já usados no quadro
    expect(status.placeholder).toBe('');
    expect(p.querySelector('.usados, .usado')).toBeNull();
    status.value = 'Em revisão';
    status.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(kbTab().getAttribute('aria-label')).toContain('Fazendo');
    // nada vale antes de salvar
    expect(kanban.get(TRAB)!.cards[0].column).toBe('afazer');
    // o status ainda sendo escrito vale ao salvar
    await saveAndClose();
    const card = kanban.get(TRAB)!.cards.find((c) => c.note === 'nquadro1')!;
    expect(card.column).toBe('fazendo');
    expect(card.importance).toBe('importante');
    expect(card.status).toBe('Em revisão');
  });

  it('a parte aberta fica na frente do alto do texto e da régua, que ficam presos em cima da folha', async () => {
    fixture.componentInstance.openNote('Ideias');
    await fixture.whenStable();
    await openPart('assunto');
    // as regras da página, também as de dentro dos @media: a janela do teste é estreita, e é no largo que a
    // parte cai por cima do texto (no estreito ela empurra o texto para baixo, sem cobrir nada)
    const rules: { sel: string; style: CSSStyleDeclaration; media: string }[] = [];
    const walk = (list: CSSRuleList, media: string) => {
      for (const r of Array.from(list)) {
        if (r instanceof CSSStyleRule) rules.push({ sel: r.selectorText, style: r.style, media });
        if (r instanceof CSSMediaRule) walk(r.cssRules, media + r.conditionText);
        else if ('cssRules' in r) walk((r as CSSGroupingRule).cssRules, media);
      }
    };
    for (const sheet of [...Array.from(document.styleSheets), ...document.adoptedStyleSheets]) walk(sheet.cssRules, '');
    const layer = (pick: (sel: string, style: CSSStyleDeclaration, media: string) => boolean) => {
      const found = rules.filter((r) => pick(r.sel, r.style, r.media) && r.style.zIndex);
      expect(found.length).withContext('a regra existe').toBeGreaterThan(0);
      return Math.max(...found.map((r) => Number(r.style.zIndex)));
    };
    const parte = layer((sel, st, media) => /^\.parte\[/.test(sel) && st.position === 'absolute' && media.includes('1024'));
    const presos = layer((sel, st) => /\.(cabeca|regua)\[/.test(sel) && st.position === 'sticky');
    const ancorados = layer((sel, st) => /\.(gaveta|ancorada)\[/.test(sel) && st.position === 'absolute');
    expect(parte).toBeGreaterThan(presos);
    expect(parte).toBeGreaterThan(ancorados);
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
    // a altura da página chega à folha no quadro depois do aviso do observador (ui/height-var.ts): um
    // quadro para o aviso, um para a escrita, e o de fechar, pedido depois dela
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r))));
    const page = el.querySelector<HTMLElement>('.conteudo')!;
    const area = el.querySelector<HTMLTextAreaElement>('.bloco.texto textarea')!;
    expect(page.scrollHeight).toBeLessThanOrEqual(page.clientHeight + 1);
    // embaixo da folha, só o contador e a margem da página
    expect(page.getBoundingClientRect().bottom - area.getBoundingClientRect().bottom).toBeLessThan(80);
    // a alça de esticar sai: a folha já é do tamanho da página
    expect(getComputedStyle(area).resize).toBe('none');
  });

  it('o Kanban: o palco mostra a coluna escolhida com a anotação nela, como vai ficar, entre as vizinhas', async () => {
    store.add(note('nquadro7', { category: 'Trabalho', tags: ['x'] }));
    store.add(note('nquadro8', { category: 'Trabalho' }));
    kanban.state.set({ boards: [board([{ note: 'nquadro8', column: 'fazendo', importance: null, at: T0 }, { note: 'nquadro7', column: 'afazer', importance: null, at: T0 }])], removed: {}, legacy: [] });
    await edit(store.get('nquadro7')!);
    // fora da aba Kanban, o palco é a ficha do mural
    expect(el.querySelector('app-kanban-preview')).toBeNull();
    const p = await openBoardTab();
    const stage = () => el.querySelector<HTMLElement>('.palco app-kanban-preview')!;
    expect(stage().querySelector('.etiqueta-nome')!.textContent).toContain('A fazer');
    await pickColumn(p, 'fazendo');
    await pickImportance(p, 'Crítico');
    const status = p.querySelector<HTMLInputElement>('.observacao input')!;
    status.value = 'Quase';
    status.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    // a coluna nova, com a conta dela contando esta; a anotação chega no fim, depois da que já estava lá
    expect(stage().querySelector('.etiqueta-nome')!.textContent!.replace(/\s+/g, ' ').trim()).toBe('Fazendo 2');
    const fichas = [...stage().querySelectorAll('.fichas > li:not(.pilha)')];
    expect(fichas.map((li) => li.classList.contains('vizinha'))).toEqual([true, false]);
    // há uma antes: no estreito (que a esconde) a beirada dela sai da etiqueta; sem nada embaixo, a coluna acaba
    expect(stage().querySelector('.pilha.so-estreito')).not.toBeNull();
    expect(stage().classList).not.toContain('continua');
    // a etiqueta da importância e a observação ainda sendo escrita já estão na ficha
    expect(fichas[1].querySelector('.imp')!.textContent).toContain('Crítico');
    expect(fichas[1].querySelector('.status')!.textContent!.trim()).toBe('Quase');
    // sem as etiquetas das ações: o palco só mostra
    expect(stage().querySelector('.acoes')).toBeNull();
    expect(stage().classList).not.toContain('ainda-nao');
    // a coluna que finaliza leva o selo
    await pickColumn(p, 'feito');
    expect(stage().querySelector('.carimbo')).not.toBeNull();
  });

  it('o Kanban: "Deixar de ser tarefa no Kanban" tira a anotação do quadro (ela fica no mural); transformar de novo devolve tudo', async () => {
    store.add(note('nquadro2', { category: 'Trabalho', tags: ['x'] }));
    kanban.state.set({ boards: [board([{ note: 'nquadro2', column: 'fazendo', importance: 'baixo', at: T0 }])], removed: {}, legacy: [] });
    await edit(store.get('nquadro2')!);
    const p = await openBoardTab();
    // a última coluna tocada antes de deixar de ser é a de voltar
    await pickColumn(p, 'feito');
    p.querySelector<HTMLButtonElement>('.pe .papel.perigo')!.click();
    await fixture.whenStable();
    // o estado e uma ação só, como na aba Flashcard; o palco mostra a coluna onde ela entraria, apagada
    expect(p.querySelector('.estado')!.textContent).toContain('ainda não é uma tarefa no Kanban');
    expect(p.querySelector('.etapa, .imp, .observacao')).toBeNull();
    expect(el.querySelector('app-kanban-preview')!.classList).toContain('ainda-nao');
    expect(el.querySelector('app-kanban-preview .etiqueta-nome')!.textContent).toContain('Feito');
    // ainda não sendo, a aba não tem marca
    expect(kbTab().querySelector('.modo-marca')).toBeNull();
    expect(kbTab().getAttribute('aria-label')).toBe('Kanban: ainda não é tarefa');
    // transformar de novo antes de salvar: a mesma coluna e a mesma importância
    p.querySelector<HTMLButtonElement>('.virar')!.click();
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r, 0));
    expect(chosenColumn(p)).toBe('feito');
    expect(document.activeElement).toBe(p.querySelector('.etapa[aria-checked="true"]'));
    expect(p.querySelector('.imp.colado')!.textContent!.trim()).toBe('Baixo');
    p.querySelector<HTMLButtonElement>('.pe .papel.perigo')!.click();
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r, 0));
    expect(document.activeElement).toBe(p.querySelector('.virar'));
    await saveAndClose();
    expect(kanban.get(TRAB)!.cards.some((c) => c.note === 'nquadro2')).toBeFalse();
    expect(store.get('nquadro2')).toBeDefined();
  });

  it('o Kanban: a nova escolhe a coluna (e a importância) e cai nela pelo pedido', async () => {
    store.add(note('noutra02', { category: 'Trabalho' }));
    kanban.state.set({ boards: [board()], removed: {}, legacy: [] });
    fixture.componentInstance.openInCategory('Trabalho');
    await fixture.whenStable();
    expect(kbTab().querySelector('.modo-marca')).toBeNull();
    const p = await openBoardTab();
    // a nova ainda não é tarefa: transformar põe na primeira coluna
    p.querySelector<HTMLButtonElement>('.virar')!.click();
    await fixture.whenStable();
    expect(chosenColumn(p)).toBe('afazer');
    expect(kbTab().querySelector('.modo-marca')).not.toBeNull();
    await pickColumn(p, 'feito');
    expect(p.querySelector('.etapa[aria-checked="true"]')!.textContent).toContain('finaliza a anotação');
    await pickImportance(p, 'Crítico');
    const name = el.querySelector<HTMLTextAreaElement>('#editor-titulo-nota')!;
    name.value = 'Nova do quadro';
    name.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    await saveAndClose();
    expect(kanban.pending()).toEqual({ board: TRAB, column: 'feito', importance: 'critico', status: '', deps: [] });
  });

  it('de dentro do Kanban, o quadro é a mesma aba do mural (sem seção à parte), com as dependências', async () => {
    store.add(note('noutra03', { category: 'Trabalho' }));
    kanban.state.set({ boards: [board()], removed: {}, legacy: [] });
    kanban.pending.set({ board: TRAB, column: 'fazendo' });
    kanban.openBoard.set(TRAB);
    fixture.componentInstance.openInCategory('Trabalho');
    await fixture.whenStable();
    // a nova abre no que se escreve: o lugar pedido fica na marca da aba
    expect(el.querySelector('#editor-modo-escrever')!.getAttribute('aria-selected')).toBe('true');
    expect(chips()).not.toContain('quadro');
    expect(el.querySelector('.kanban-bloco')).toBeNull();
    expect(kbTab().getAttribute('aria-label')).toContain('Fazendo');
    const sec = await openBoardTab();
    expect(chosenColumn(sec)).toBe('fazendo');
    // fechar sem mexer não pergunta: a coluna pedida é o começo, não uma mudança
    expect(fixture.componentInstance['serialize']()).toBe(fixture.componentInstance['snapshot']);
    // com a aba inteira, as linhas ficam todas à vista, mesmo vazias
    expect(sec.querySelector('.observacao input')).not.toBeNull();
    sec.querySelector<HTMLButtonElement>('.por-dep')!.click();
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
    expect(kbTab().getAttribute('aria-label')).toContain('A fazer');
    expect(chosenColumn(await openBoardTab())).toBe(boardIdFor('estudos') + '-afazer');
  });

  it('a aba Kanban sem grupo: diz por quê e leva até o grupo; escolhido, o quadro dele aparece na aba', async () => {
    fixture.componentInstance.openNote('Ideias');
    await fixture.whenStable();
    expect(kbTab().getAttribute('aria-label')).toBe('Kanban: sem grupo');
    expect(kbTab().querySelector('.modo-marca')).toBeNull();
    const p = await openBoardTab();
    expect(p.querySelector('.estado')!.textContent).toContain('falta o grupo');
    p.querySelector<HTMLButtonElement>('.virar')!.click();
    await fixture.whenStable();
    // de volta à aba da anotação, com a parte do grupo aberta
    expect(el.querySelector('#editor-modo-escrever')!.getAttribute('aria-selected')).toBe('true');
    expect(el.querySelector('.kanban-modo')).toBeNull();
    expect(chip('grupo').getAttribute('aria-expanded')).toBe('true');
    Array.from(part()!.querySelectorAll<HTMLButtonElement>('.op')).find((b) => b.textContent!.includes('Estudos'))!.click();
    await fixture.whenStable();
    // com grupo, ainda não é tarefa: a ação de transformar
    expect((await openBoardTab()).querySelector('.virar')!.textContent).toContain('Transformar em tarefa');
  });

  it('as setas passam pela aba Kanban, entre a Cartolina e o Flashcard; a resenha não tem essa aba', async () => {
    store.add(note('nabas001', { category: 'Trabalho' }));
    await edit(store.get('nabas001')!);
    const tabs = () => Array.from(el.querySelectorAll<HTMLButtonElement>('.modo'));
    expect(tabs().map((t) => t.id)).toEqual(['editor-modo-escrever', 'editor-modo-cartolina', 'editor-modo-kanban', 'editor-modo-flashcard']);
    tabs()[1].click();
    await fixture.whenStable();
    tabs()[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await fixture.whenStable();
    expect(kbTab().getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(kbTab());
    expect(el.querySelector('#editor-conteudo')!.getAttribute('aria-labelledby')).toBe('editor-modo-kanban');
    fixture.componentInstance.open(undefined, undefined, undefined, undefined, 'jogos');
    await fixture.whenStable();
    expect(tabs().map((t) => t.id)).toEqual(['editor-modo-escrever', 'editor-modo-cartolina']);
    expect(el.querySelector('.kanban-modo')).toBeNull();
  });

  describe('aberto direto na aba Kanban (os ajustes das fichas do quadro)', () => {
    const onBoard = (extra: Partial<KanbanBoard['cards'][number]> = {}) => {
      store.add(note('nabre001', { category: 'Trabalho', tags: ['x'] }));
      kanban.state.set({ boards: [board([{ note: 'nabre001', column: 'afazer', importance: null, at: T0, ...extra }])], removed: {}, legacy: [] });
    };
    const cardOf = () => kanban.get(TRAB)!.cards.find((c) => c.note === 'nabre001')!;
    const panel = () => el.querySelector<HTMLElement>('.kanban-modo')!;
    const openHere = async () => {
      fixture.componentInstance.openAt(store.get('nabre001')!, 'kanban');
      await fixture.whenStable();
      await new Promise((r) => setTimeout(r, 0));
      await fixture.whenStable();
    };

    it('abre na aba, com o foco nela, e a próxima abertura volta ao que se escreve', async () => {
      onBoard();
      await openHere();
      expect(kbTab().getAttribute('aria-selected')).toBe('true');
      expect(document.activeElement).toBe(kbTab());
      expect(panel().querySelector('app-kanban-props')).not.toBeNull();
      el.querySelector('dialog')!.close();
      await fixture.whenStable();
      await edit(store.get('nabre001')!);
      expect(el.querySelector('#editor-modo-escrever')!.getAttribute('aria-selected')).toBe('true');
    });

    it('só o quadro mudou: a anotação fica como está, sem hora nova', async () => {
      onBoard();
      const before = store.get('nabre001')!;
      await openHere();
      await pickImportance(panel(), 'Importante');
      await saveAndClose();
      expect(cardOf().importance).toBe('importante');
      expect(store.get('nabre001')).toBe(before);
    });

    it('mudou o nome também: a anotação é salva junto', async () => {
      onBoard();
      const before = store.get('nabre001')!;
      await openHere();
      await pickImportance(panel(), 'Importante');
      const name = el.querySelector<HTMLTextAreaElement>('#editor-titulo-nota')!;
      name.value = 'Nome novo';
      name.dispatchEvent(new Event('input'));
      await fixture.whenStable();
      await saveAndClose();
      expect(cardOf().importance).toBe('importante');
      expect(store.get('nabre001')).not.toBe(before);
      expect(store.get('nabre001')!.game.name).toBe('Nome novo');
    });

    it('"Deixar de ser tarefa no Kanban" vale ao salvar; o Esc antes disso fala de ajustes, não do que foi escrito', async () => {
      onBoard();
      await openHere();
      const ask = spyOn(TestBed.inject(Confirm), 'ask').and.resolveTo(false);
      const leave = panel().querySelector<HTMLButtonElement>('.pe .papel.perigo')!;
      expect(leave.textContent!.trim()).toBe('Deixar de ser tarefa no Kanban');
      leave.click();
      await fixture.whenStable();
      expect(chosenColumn(panel())).toBeNull();
      expect(panel().querySelector('.pe .papel.perigo')).toBeNull();
      expect(cardOf()).toBeDefined();
      el.querySelector<HTMLButtonElement>('.btn-quiet.cancelar')!.click();
      await fixture.whenStable();
      expect(ask.calls.mostRecent().args[0].title).toBe('Descartar os ajustes?');
      expect(ask.calls.mostRecent().args[0].cancel).toBe('Continuar ajustando');
      await saveAndClose();
      expect(cardOf()).toBeUndefined();
    });

    it('a observação: limpa os espaços, vale no Enter, e o x tira', async () => {
      onBoard();
      await openHere();
      const input = panel().querySelector<HTMLInputElement>('.observacao input')!;
      expect(panel().querySelector('.observacao .tirar')).toBeNull();
      input.value = '  Em   revisão ';
      input.dispatchEvent(new Event('input'));
      await fixture.whenStable();
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      await fixture.whenStable();
      expect(input.value).toBe('Em revisão');
      // nada no quadro antes de salvar
      expect(cardOf().status).toBeUndefined();
      panel().querySelector<HTMLButtonElement>('.observacao .tirar')!.click();
      await fixture.whenStable();
      expect(input.value).toBe('');
      input.value = 'Com o Sérgio';
      input.dispatchEvent(new Event('input'));
      await fixture.whenStable();
      await saveAndClose();
      expect(cardOf().status).toBe('Com o Sérgio');
    });

    it('o interruptor do mural vale ao salvar', async () => {
      onBoard();
      await openHere();
      const was = kanban.isOnWall(cardOf(), 'Trabalho');
      const sw = panel().querySelector<HTMLButtonElement>('.linha-so [role="switch"]')!;
      expect(sw.getAttribute('aria-checked')).toBe(String(was));
      sw.click();
      await fixture.whenStable();
      expect(kanban.isOnWall(cardOf(), 'Trabalho')).toBe(was);
      await saveAndClose();
      expect(kanban.isOnWall(cardOf(), 'Trabalho')).toBe(!was);
    });

    it('salvar só grava o que mudou aqui: o que outra aba mudou nesse meio-tempo fica', async () => {
      onBoard({ importance: 'baixo', status: 'De antes' });
      await openHere();
      // na outra aba, a ficha anda, muda de importância e de observação
      kanban.update(TRAB, (b) => ({ ...b, cards: b.cards.map((c) => (c.note === 'nabre001' ? { ...c, column: 'feito', importance: 'importante', status: 'De lá' } : c)) }));
      const wall = kanban.isOnWall(cardOf(), 'Trabalho');
      panel().querySelector<HTMLButtonElement>('.linha-so [role="switch"]')!.click();
      await fixture.whenStable();
      await saveAndClose();
      expect(cardOf().column).toBe('feito');
      expect(cardOf().importance).toBe('importante');
      expect(cardOf().status).toBe('De lá');
      // o que mudou aqui vale
      expect(kanban.isOnWall(cardOf(), 'Trabalho')).toBe(!wall);
    });

    it('as dependências: o seletor esconde as que fariam roda; pôr e tirar valem ao salvar', async () => {
      store.add(note('nlogin02', { category: 'Trabalho' }));
      store.add(note('nprova02', { category: 'Estudos', doneAt: '2026-10-02' }));
      store.add(note('nsolta02'));
      onBoard();
      kanban.update(TRAB, (b) => ({ ...b, cards: [...b.cards, { note: 'nlogin02', column: 'afazer', importance: null, at: T0, deps: ['nabre001'] }] }));
      await openHere();
      expect(panel().querySelectorAll('.dep').length).toBe(0);
      panel().querySelector<HTMLButtonElement>('.por-dep')!.click();
      await fixture.whenStable();
      const listed = () => [...panel().querySelectorAll('app-card-picker .escolha .nome')].map((n) => n.textContent!.trim());
      for (let i = 0; i < 50 && !listed().length; i++) {
        await new Promise((r) => setTimeout(r, 10));
        await fixture.whenStable();
      }
      // nem ela mesma, nem a que depende dela; de qualquer grupo; a finalizada fica atrás do filtro
      expect(listed()).toEqual(['Nota nsolta02']);
      panel().querySelector<HTMLButtonElement>('app-card-picker .indice .idx[aria-pressed="true"]:not(.lugar)')!.click();
      await fixture.whenStable();
      expect(listed()).toEqual(['Nota nprova02', 'Nota nsolta02']);
      panel().querySelector<HTMLButtonElement>('app-card-picker .escolha')!.click();
      await fixture.whenStable();
      const rows = [...panel().querySelectorAll('.dep')];
      expect(rows.map((r) => r.querySelector('.dep-onde')!.textContent!.replace(/\s+/g, ' ').trim())).toEqual(['Finalizada Estudos · Fora do quadro']);
      expect(rows[0].classList).toContain('feita');
      expect(cardOf().deps).toBeUndefined();
      await saveAndClose();
      expect(cardOf().deps).toEqual(['nprova02']);
      await openHere();
      panel().querySelector<HTMLButtonElement>('.dep .tirar')!.click();
      await fixture.whenStable();
      await saveAndClose();
      expect(cardOf().deps).toBeUndefined();
    });

    it('ir para Feito com dependência aberta: "Esperar" deixa na coluna e guarda o resto; o sim leva', async () => {
      store.add(note('naberta2', { category: 'Trabalho' }));
      onBoard({ deps: ['naberta2'] });
      const ask = spyOn(TestBed.inject(Confirm), 'ask').and.resolveTo(false);
      const toFeito = async () => {
        await pickColumn(panel(), 'feito');
        // chegar na que finaliza com a dependência aberta já se vê na etapa
        expect(panel().querySelector('.aviso')!.textContent).toContain('ainda não foi finalizada');
        await pickImportance(panel(), 'Importante');
        await saveAndClose();
        await new Promise((r) => setTimeout(r, 0));
        await fixture.whenStable();
      };
      await openHere();
      await toFeito();
      expect(ask).toHaveBeenCalledTimes(1);
      expect(cardOf().column).toBe('afazer');
      expect(cardOf().importance).toBe('importante');
      ask.and.resolveTo(true);
      await openHere();
      await pickColumn(panel(), 'feito');
      await saveAndClose();
      await new Promise((r) => setTimeout(r, 0));
      await fixture.whenStable();
      expect(ask).toHaveBeenCalledTimes(2);
      expect(cardOf().column).toBe('feito');
    });

    it('quem só lê a compartilhada: só as abas Kanban e Flashcard, o nome sem escrever, e a anotação não muda', async () => {
      onBoard();
      spyOn(TestBed.inject(SharedStore), 'role').and.returnValue('leitor');
      const before = store.get('nabre001')!;
      // pelo caminho comum também: nunca cai na aba do que se escreve
      await edit(before);
      expect(kbTab().getAttribute('aria-selected')).toBe('true');
      expect(el.querySelector('#editor-modo-escrever')).toBeNull();
      expect(el.querySelector('#editor-modo-cartolina')).toBeNull();
      expect(el.querySelector('#editor-modo-flashcard')).not.toBeNull();
      expect(el.querySelector<HTMLTextAreaElement>('#editor-titulo-nota')!.readOnly).toBeTrue();
      expect(el.querySelector('#editor-titulo-nota')!.getAttribute('tabindex')).toBe('-1');
      expect(el.querySelector('.modos')!.classList).not.toContain('quatro');
      await pickImportance(panel(), 'Importante');
      await saveAndClose();
      expect(cardOf().importance).toBe('importante');
      expect(store.get('nabre001')).toBe(before);
    });
  });

  it('o Esc com a observação ainda sendo escrita pergunta antes de fechar, em vez de perdê-la', async () => {
    store.add(note('nabas003', { category: 'Trabalho', tags: ['x'] }));
    kanban.state.set({ boards: [board([{ note: 'nabas003', column: 'afazer', importance: null, at: T0 }])], removed: {}, legacy: [] });
    await edit(store.get('nabas003')!);
    const status = (await openBoardTab()).querySelector<HTMLInputElement>('.observacao input')!;
    status.value = 'Quase lá';
    status.dispatchEvent(new Event('input'));
    const ask = spyOn(TestBed.inject(Confirm), 'ask').and.resolveTo(false);
    const esc = new Event('cancel', { cancelable: true });
    el.querySelector('dialog')!.dispatchEvent(esc);
    await fixture.whenStable();
    expect(esc.defaultPrevented).toBeTrue();
    expect(ask).toHaveBeenCalled();
    expect(el.querySelector('dialog')!.open).toBeTrue();
  });

  it('a observação escrita na aba Kanban sobrevive a trocar de aba e voltar, e vale ao salvar de outra aba', async () => {
    store.add(note('nabas002', { category: 'Trabalho', tags: ['x'] }));
    kanban.state.set({ boards: [board([{ note: 'nabas002', column: 'afazer', importance: 'baixo', at: T0 }])], removed: {}, legacy: [] });
    await edit(store.get('nabas002')!);
    let p = await openBoardTab();
    const status = p.querySelector<HTMLInputElement>('.observacao input')!;
    status.value = 'Com a Ana';
    status.dispatchEvent(new Event('input'));
    // sem o `change`: nem todo toque tira o foco do campo antes de a aba trocar
    el.querySelector<HTMLButtonElement>('#editor-modo-escrever')!.click();
    await fixture.whenStable();
    expect(el.querySelector('.kanban-modo')).toBeNull();
    p = await openBoardTab();
    expect(p.querySelector<HTMLInputElement>('.observacao input')!.value).toBe('Com a Ana');
    el.querySelector<HTMLButtonElement>('#editor-modo-cartolina')!.click();
    await fixture.whenStable();
    await saveAndClose();
    const card = kanban.get(TRAB)!.cards.find((c) => c.note === 'nabas002')!;
    expect(card.status).toBe('Com a Ana');
    expect(card.importance).toBe('baixo');
  });

  it('a aba da cartolina: o que está na ficha aparece no estojo; "Só a cartolina" tira tudo menos a cor', async () => {
    store.add(note('nvisual1', { paper: 'canson', pattern: 'gatinhos', stains: [{ stain: 'cafe' }], tags: ['x'], category: 'Casa' }));
    await edit(store.get('nvisual1')!);
    const tabs = Array.from(el.querySelectorAll<HTMLButtonElement>('.modo'));
    // a anotação tem mais duas abas: a do Kanban e a do Flashcard
    expect(tabs.map((t) => t.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false', 'false']);
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

  it('a pasta: as do grupo à mão (também as criadas), de A a Z; tocar escolhe e fecha; um nome novo com Enter cria dentro da escolhida; salva na anotação', async () => {
    store.add(note('noutra01', { category: 'Estudos', subject: 'Geografia' }));
    store.add(note('noutra02', { category: 'Trabalho', subject: 'Site' }));
    settings.setSavedSubjects('Estudos', ['História']);
    fixture.componentInstance.openInCategory('Estudos');
    await fixture.whenStable();
    expect(chip('assunto').classList).toContain('vazia');
    let p = await openPart('assunto');
    const names = () => Array.from(p.querySelectorAll<HTMLElement>('.op:not(.raiz):not(.criar) .nome')).map((n) => n.textContent!.trim());
    // o do Trabalho não aparece nos Estudos
    expect(names()).toEqual(['Geografia', 'História']);
    expect(p.querySelector('.raiz')!.getAttribute('aria-checked')).toBe('true');
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
    // (nasce dentro da escolhida)
    expect(p.querySelector('.criar')!.textContent).toContain('Criar “Artes” em Geografia');
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await fixture.whenStable();
    expect(chip('assunto').textContent).toContain('Artes');
    const name = el.querySelector<HTMLTextAreaElement>('.head #editor-titulo-nota')!;
    name.value = 'Pintura moderna';
    name.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    await saveAndClose();
    const saved = store.notes().find((r) => r.game.name === 'Pintura moderna')!;
    expect([saved.category, TestBed.inject(NoteFolders).nameOf(saved.folder)]).toEqual(['Estudos', 'Artes']);
    expect(TestBed.inject(NoteFolders).tree().path(saved.folder).map((f) => f.name)).toEqual(['Geografia', 'Artes']);
  });

  it('a pasta: a anotação nova pedida numa pasta (a aberta no mural) já nasce nela; "Sem pasta" tira', async () => {
    const historia = TestBed.inject(NoteFolders).ensureTop('Estudos', 'História');
    fixture.componentInstance.openInCategory('Estudos', undefined, historia);
    await fixture.whenStable();
    expect(chip('assunto').textContent).toContain('História');
    const p = await openPart('assunto');
    p.querySelector<HTMLButtonElement>('.raiz')!.click();
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
  it('as tags sugeridas são só as das anotações do mesmo lugar (o mural, o Kanban ou os dois); as pastas são as do grupo', async () => {
    store.add(note('nmural01', { category: 'Trabalho', tags: ['App'], subject: 'Deploy' }));
    store.add(note('nquadro1', { category: 'Trabalho', tags: ['Daily'], subject: 'Reunião' }));
    store.add(note('nosdois1', { category: 'Trabalho', tags: ['Planejamento'], subject: 'Sprint' }));
    kanban.state.set({ boards: [board([{ note: 'nquadro1', column: 'afazer', importance: null, at: T0 }, { note: 'nosdois1', column: 'afazer', importance: null, wall: true, at: T0 }])], removed: {}, legacy: [] });
    const ed = fixture.componentInstance as unknown as { tagLib(): { label: string }[]; kbColumn: { set(v: string | null): void }; setKbWall(w: boolean): void };
    const tags = () => ed.tagLib().map((t) => t.label).sort();
    const subjects = () => TestBed.inject(NoteFolders).tree().kids('trabalho', null).map((f) => f.name);
    // a nova do mural (sem coluna): as do mural e as que estão nos dois
    fixture.componentInstance.openInCategory('Trabalho');
    await fixture.whenStable();
    expect(tags()).toEqual(['App', 'Planejamento']);
    // a pasta é um lugar do grupo: está à mão de qualquer lugar
    expect(subjects()).toEqual(['Deploy', 'Reunião', 'Sprint']);
    // numa coluna, só no Kanban (o padrão do grupo): as do quadro
    ed.kbColumn.set('afazer');
    expect(tags()).toEqual(['Daily', 'Planejamento']);
    expect(subjects()).toEqual(['Deploy', 'Reunião', 'Sprint']);
    // no quadro e no mural também: as dos dois
    ed.setKbWall(true);
    expect(tags()).toEqual(['App', 'Daily', 'Planejamento']);
    expect(subjects()).toEqual(['Deploy', 'Reunião', 'Sprint']);
  });
});
