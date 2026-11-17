import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CloudAccount } from '../core/cloud-account';
import { NOTES_CONFIG_DEFAULT } from '../core/mural-config';
import { Review, sanitizeReview } from '../core/review';
import { SharedGroupsStore } from '../core/shared-groups-store';
import { GroupFolders } from '../core/group-folders';
import { SharedEntry, SharedStore } from '../core/shared-store';
import { SyncConflict, SyncConflicts, conflictKey } from '../core/sync-conflicts';
import { ConflictSheet, differences } from './conflict-sheet';
import { CHANGE_HIGHLIGHT, changedHunks, clearChanges, paintChanges } from './mark-changes';

/**
 * A folha do conflito refeita (PLANO-CONFLITOS.md, rodada 2): "Qual versão fica?", as duas versões
 * lado a lado só no que difere, o texto formatado de verdade com o que mudou marcado, as orelhas do
 * celular e a escolha no pé. Serve às compartilhadas e à conta.
 */

const ANA = { codigo: 'AAAA-1111', nome: 'Ana', foto: null };
const BIA = { codigo: 'BBBB-2222', nome: 'Bia', foto: null };

function note(text: string, extra: Record<string, unknown> = {}): Review {
  return sanitizeReview({
    id: 'nota-1',
    kind: 'anotacoes',
    game: { name: 'Lista do mercado', coverUrl: null, source: 'manual' },
    text,
    completedAt: '2026-10-16',
    createdAt: '2026-10-16T10:00:00.000Z',
    updatedAt: '2026-10-16T10:00:00.000Z',
    stock: 'amarelo',
    private: true,
    ...extra,
  })!;
}

function entry(conflito: SharedEntry['conflito']): SharedEntry {
  const view = conflito!.a;
  return { id: 'nota-1', dono: ANA, papel: 'dono', membros: [], rev: 3, versao: 5, base: view, local: null, outra: null, resolver: false, conflito, atualizadoEm: view.updatedAt, atualizadoPor: ANA, pessoal: {}, grupo: null, criadoPor: null, view } as SharedEntry;
}

const TEXT_A = ['## Mercado', '', 'Passar no **sacolão**.', '', '- [ ] arroz', '- [ ] feijão preto', '', 'Gastar R$ 200.'].join('\n');
const TEXT_B = ['## Mercado', '', 'Passar no **sacolão**.', '', '- [ ] arroz', '- [x] feijão carioca', '- [ ] leite', '', 'Gastar R$ 200.'].join('\n');

async function sheetFor(providers: unknown[], inputs: Record<string, string>): Promise<{ f: ComponentFixture<ConflictSheet>; el: HTMLElement }> {
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      { provide: CloudAccount, useValue: { signedIn: () => true, account: () => ({ ...ANA }) } },
      // (a ficha do mural, que a folha traz, pergunta aos grupos compartilhados pelos quadros deles)
      { provide: SharedGroupsStore, useValue: { boards: () => [], groupOfBoard: () => undefined, ofCategory: () => null } },
      ...(providers as never[]),
    ],
  });
  const f = TestBed.createComponent(ConflictSheet);
  for (const [k, v] of Object.entries(inputs)) f.componentRef.setInput(k, v);
  f.detectChanges();
  await f.whenStable();
  // o afterRenderEffect das marcas roda depois do desenho do texto
  f.detectChanges();
  await f.whenStable();
  return { f, el: f.nativeElement as HTMLElement };
}

const texts = (el: ParentNode, sel: string) => [...el.querySelectorAll(sel)].map((e) => e.textContent!.replace(/\s+/g, ' ').trim());

describe('a folha do conflito (refeita)', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    CSS.highlights.delete(CHANGE_HIGHLIGHT);
  });

  it('compartilhada: a pergunta, quem fez cada versão, só o que difere, e a escolha', async () => {
    const chosen: Review[] = [];
    const conflito = { a: note(TEXT_A, { tags: ['Kana'] }), b: note(TEXT_B, { tags: ['Kana', 'Estudo'], doneAt: '2026-11-14T10:00:00.000Z' }), autorA: ANA, autorB: BIA, em: new Date().toISOString() };
    const { el } = await sheetFor([{ provide: SharedStore, useValue: { get: () => entry(conflito), resolve: (_id: string, r: Review) => chosen.push(r) } }], { noteId: 'nota-1' });
    expect(el.querySelector('h2')?.textContent).toBe('Qual versão fica?');
    expect(el.querySelector('.sub')?.textContent).toBe('“Lista do mercado”');
    expect(el.querySelector('.quem-mexeu')?.textContent).toContain('Você e Bia mudaram o texto, as tags e se está finalizada ao mesmo tempo');
    expect(texts(el, '.cabeca-nome')).toEqual(['A sua versão', 'A versão de Bia']);
    expect(texts(el, '.dif-nome > span:first-of-type')).toEqual(['Finalizada', 'Tags', 'Texto']);
    expect(el.querySelector('.dif.texto .legenda')?.textContent).toBe('o que mudou');
    // a tag que só a de Bia tem leva a marca-texto
    expect(texts(el, '.dif:nth-of-type(2) .lado[data-lado="b"] .so-aqui')).toEqual(['Estudo (só nesta versão)']);
    el.querySelectorAll<HTMLButtonElement>('.manter')[1].click();
    expect(chosen[0].text).toBe(TEXT_B);
  });

  it('o texto aparece formatado (nunca as marcas cruas), com as linhas e as palavras que mudaram marcadas', async () => {
    const conflito = { a: note(TEXT_A), b: note(TEXT_B), autorA: ANA, autorB: BIA, em: new Date().toISOString() };
    const { el } = await sheetFor([{ provide: SharedStore, useValue: { get: () => entry(conflito), resolve: () => undefined } }], { noteId: 'nota-1' });
    const folhas = el.querySelectorAll('.dif.texto .folha');
    expect(folhas.length).toBe(2);
    for (const folha of folhas) {
      const shown = folha.textContent!;
      expect(shown).not.toContain('- [');
      expect(shown).not.toContain('**');
      expect(shown).not.toContain('##');
      expect(folha.querySelector('.tarefas .caixa')).not.toBeNull();
    }
    const [a, b] = [...folhas];
    expect(texts(a, '.mudou')).toEqual([jasmine.stringContaining('feijão preto')]);
    expect(texts(b, '.mudou')).toEqual([jasmine.stringContaining('feijão carioca'), jasmine.stringContaining('leite')]);
    // as palavras: só as que um lado tem (o "feijão" é das duas; o "A fazer:" do leitor de tela não conta)
    const words = [...(CSS.highlights.get(CHANGE_HIGHLIGHT) as Highlight)].map((r) => r.toString());
    expect(words).toEqual(['preto', 'carioca', 'leite']);
  });

  it('crítica: cada versão da ficha diz quando mudou, e a mais recente leva a etiqueta', async () => {
    const conflito = { a: note('um', { updatedAt: '2026-11-16T10:00:00.000Z' }), b: note('dois', { updatedAt: '2026-11-16T11:30:00.000Z' }), autorA: ANA, autorB: BIA, em: new Date().toISOString() };
    const { el } = await sheetFor([{ provide: SharedStore, useValue: { get: () => entry(conflito), resolve: () => undefined } }], { noteId: 'nota-1' });
    const heads = [...el.querySelectorAll('.cabeca')];
    expect(heads[0].querySelector('.cabeca-aparelho')?.textContent).toContain('mudada');
    expect(heads[0].querySelector('.mais-nova')).toBeNull();
    expect(heads[1].querySelector('.mais-nova')?.textContent).toBe('a mais recente');
  });

  it('revisão: a mesma hora nas duas (a da junção) não aparece, e a pasta de um grupo compartilhado sai pelo nome', async () => {
    const same = '2026-11-16T11:30:00.000Z';
    const conflito = { a: note('um', { updatedAt: same, folder: 'pkana001' }), b: note('um', { updatedAt: same, folder: 'pkanji01' }), autorA: ANA, autorB: BIA, em: new Date().toISOString() };
    const { el } = await sheetFor(
      [
        { provide: SharedStore, useValue: { get: () => entry(conflito), resolve: () => undefined } },
        { provide: GroupFolders, useValue: { folders: () => [{ id: 'pkana001', group: 'japones', name: 'Kana', parent: null }, { id: 'pkanji01', group: 'japones', name: 'Kanji', parent: null }] } },
      ],
      { noteId: 'nota-1' },
    );
    expect(el.querySelector('.mais-nova')).toBeNull();
    expect(el.querySelector('.cabeca-aparelho')).toBeNull();
    expect(texts(el, '.dif .valor')).toEqual(['Kana', 'Kanji']);
  });

  it('os trechos que mudaram, linha a linha', () => {
    expect(changedHunks('a\nb\nc', 'a\nB\nc\nd')).toEqual([
      { a: [1], b: [1] },
      { a: [], b: [3] },
    ]);
    expect(changedHunks('igual', 'igual')).toEqual([]);
    // a linha em branco a mais não se vê: não marca nada (nem o bloco de antes dela)
    expect(changedHunks('título\ntexto', 'título\n\ntexto')).toEqual([]);
  });

  it('revisão: o texto que se redesenha sozinho continua marcado', async () => {
    const conflito = { a: note('um\ndois'), b: note('um\ntrês'), autorA: ANA, autorB: BIA, em: new Date().toISOString() };
    const { el } = await sheetFor([{ provide: SharedStore, useValue: { get: () => entry(conflito), resolve: () => undefined } }], { noteId: 'nota-1' });
    const b = el.querySelectorAll('.dif.texto .texto-formatado')[1];
    const line = b.querySelector('.mudou')!;
    // um redesenho do texto de dentro (como o do colorir do código): o nó novo perde a classe
    const copy = line.cloneNode(true) as HTMLElement;
    copy.classList.remove('mudou');
    line.replaceWith(copy);
    await new Promise((r) => setTimeout(r, 60));
    expect(copy.classList).toContain('mudou');
    expect([...(CSS.highlights.get(CHANGE_HIGHLIGHT) as Highlight)].map((r) => r.toString())).toEqual(['dois', 'três']);
  });

  it('revisão: duas pessoas sem nome não viram uma pessoa só', async () => {
    const conflito = { a: note('um'), b: note('dois'), autorA: null, autorB: null, em: new Date().toISOString() };
    const { el } = await sheetFor([{ provide: SharedStore, useValue: { get: () => entry(conflito as never), resolve: () => undefined } }], { noteId: 'nota-1' });
    expect(el.querySelector('.quem-mexeu')?.textContent).toContain('mudaram o texto ao mesmo tempo');
  });

  it('revisão: fechar uma folha não apaga o realce que outra pintou', () => {
    const one = {};
    const two = {};
    const r = document.createRange();
    r.selectNodeContents(document.body);
    paintChanges(one, [r]);
    paintChanges(two, [r]);
    clearChanges(one);
    expect(CSS.highlights.has(CHANGE_HIGHLIGHT)).toBeTrue();
    clearChanges(two);
    expect(CSS.highlights.has(CHANGE_HIGHLIGHT)).toBeFalse();
  });

  it('um ajuste da conta: o nome dele, onde fica no site, cada diferença desenhada, e nunca o dado guardado', async () => {
    const c: SyncConflict = {
      alvo: 'ajuste:muralAnotacoes',
      em: new Date().toISOString(),
      a: { ...NOTES_CONFIG_DEFAULT, audience: 'visivel', showPinned: true },
      b: { ...NOTES_CONFIG_DEFAULT, audience: 'publicar', folders: [{ id: 'pabc1234', group: '', name: 'Compras', parent: null }] },
      deA: { id: 'aparelho-pc', nome: 'Chrome no Windows' },
      deB: { id: 'aparelho-cel', nome: 'Chrome no Android' },
      partes: [],
    };
    const resolved: [string, string][] = [];
    const fake = {
      get: () => c,
      forFicha: () => null,
      titleOf: () => 'As configurações do mural de anotações',
      device: { id: 'aparelho-pc', nome: 'Chrome no Windows' },
      resolve: (k: string, side: string) => resolved.push([k, side]),
    };
    const { el } = await sheetFor([{ provide: SyncConflicts, useValue: fake }, { provide: SharedStore, useValue: { get: () => null } }], { chave: conflictKey(c) });
    expect(el.querySelector('.sub')?.textContent).toBe('As configurações do mural de anotações');
    expect(el.querySelector('.onde')?.textContent).toContain('Onde fica: Anotações › Configurações do mural');
    expect(el.querySelector('.quem-mexeu')?.textContent).toContain('Você mudou as configurações do mural de anotações em dois aparelhos ao mesmo tempo (Chrome no Windows e Chrome no Android)');
    expect(texts(el, '.cabeca-nome')).toEqual(['Este aparelho', 'Outro aparelho']);
    expect(texts(el, '.dif-nome')).toEqual(['Privacidade da anotação nova', 'Aba “Fixadas”', 'Pasta “Compras”']);
    expect(el.querySelectorAll('.interruptor').length).toBe(2);
    expect(el.querySelector('.comparar')!.textContent).not.toMatch(/[{}]|"\w+":/);
    // crítica: o marca-texto só no que marca parte de algo; o valor inteiro fica em tinta
    expect(el.querySelectorAll('.comparar .valor mark').length).toBe(0);
    // no celular, as linhas curtas mostram os dois lados (sem orelhas) e cada lado diz de quem é
    expect(el.querySelector('.orelhas')!.classList).not.toContain('com-longas');
    expect(texts(el, '.dif:first-of-type .lado-quem')).toEqual(['Este aparelho', 'Outro aparelho']);
    // o nome falado do botão é o escrito (WCAG 2.5.3)
    expect(el.querySelector('.manter')!.hasAttribute('aria-label')).toBeFalse();
    el.querySelectorAll<HTMLButtonElement>('.manter')[1].click();
    expect(resolved).toEqual([[conflictKey(c), 'b']]);
  });

  it('apagada num aparelho: o carimbo de um lado, a ficha e o texto do outro, e "Manter apagada"', async () => {
    const c: SyncConflict = { alvo: 'ficha:nota-1', em: new Date().toISOString(), a: note('arroz\nfeijão'), b: null, deA: null, deB: { id: 'aparelho-cel', nome: 'Chrome no Android' }, partes: [] };
    const fake = { get: () => c, forFicha: () => c, titleOf: () => 'Lista do mercado', device: { id: 'aparelho-pc', nome: 'Chrome no Windows' }, resolve: () => undefined };
    const { el } = await sheetFor([{ provide: SyncConflicts, useValue: fake }, { provide: SharedStore, useValue: { get: () => null } }], { noteId: 'nota-1' });
    expect(el.querySelector('.quem-mexeu')?.textContent).toContain('Você apagou esta anotação num aparelho e mudou no outro');
    expect(el.querySelector('.lado[data-lado="a"] app-review-card')).not.toBeNull();
    expect(el.querySelectorAll('.lado[data-lado="b"] .carimbo-texto').length).toBeGreaterThan(0);
    expect(texts(el, '.manter')).toEqual(['Ficar com a da nuvem', 'Manter apagada']);
    // a ficha do mural e o texto não cabem empilhados no celular: vão pelas orelhas
    expect(el.querySelector('.dif')!.classList).toContain('longa');
    expect(el.querySelector('.orelhas')!.classList).toContain('com-longas');
  });

  it('as orelhas trocam a versão à mostra (o celular), também pelas setas', async () => {
    const conflito = { a: note('um'), b: note('dois'), autorA: ANA, autorB: BIA, em: new Date().toISOString() };
    const { f, el } = await sheetFor([{ provide: SharedStore, useValue: { get: () => entry(conflito), resolve: () => undefined } }], { noteId: 'nota-1' });
    const comparar = () => el.querySelector('.comparar')!.getAttribute('data-mostra');
    expect(comparar()).toBe('a');
    el.querySelector<HTMLButtonElement>('#orelha-b')!.click();
    f.detectChanges();
    expect(comparar()).toBe('b');
    expect(el.querySelector('#orelha-b')!.getAttribute('aria-selected')).toBe('true');
    el.querySelector('.orelhas')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    f.detectChanges();
    expect(comparar()).toBe('a');
  });

  it('o que difere, nas palavras da frase de cima', () => {
    const n = (extra: Record<string, unknown>) => note('a', extra);
    expect(differences(note('a'), note('b', { game: { name: 'Outro' }, stock: 'azul' }))).toEqual(['titulo', 'texto', 'aparencia']);
    expect(differences(n({ tags: ['Kana'] }), n({ tags: ['Kana', 'Estudo'] }))).toEqual(['tags']);
    expect(differences(n({}), n({ doneAt: '2026-11-14' }))).toEqual(['finalizada']);
    // a mesma tag em outra ordem ou grafia não é diferença; nem a ordem das chaves da aparência
    expect(differences(n({ tags: ['Kana', 'Estudo'] }), n({ tags: ['estudo', 'Kana'] }))).toEqual([]);
    expect(differences(n({ stains: [{ stain: 'cafe', seed: 4 }] }), n({ stains: [{ seed: 4, stain: 'cafe' }] }))).toEqual([]);
  });
});
