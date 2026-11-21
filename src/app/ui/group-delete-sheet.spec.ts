import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CloudAccount } from '../core/cloud-account';
import { LabelEdits } from '../core/label-edits';
import { NoteFolders } from '../core/note-folders';
import { SharedStore } from '../core/shared-store';
import { Review, sanitizeReview } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { SharedGroup } from '../core/shared-groups';
import { SharedGroupsStore } from '../core/shared-groups-store';
import { StudyStore } from '../core/study-store';
import { Settings } from '../core/settings';
import { GroupDeleteSheet } from './group-delete-sheet';

let seq = 0;
const note = (category: string): Review =>
  sanitizeReview({
    id: `nagd${++seq}`,
    kind: 'anotacoes',
    game: { name: `Nota ${seq}`, coverUrl: null, source: 'manual' },
    completedAt: '2026-10-01',
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
    category,
  })!;

const group = (nome: string, papel: string, membros: string[] = []): SharedGroup =>
  ({ id: `g${nome}0000001`.slice(0, 13), papel, dono: { nome: papel === 'dono' ? 'Eu' : 'Ana', codigo: 'X' }, membros: membros.map((m) => ({ nome: m, codigo: m, papel: 'editor' })), publico: false, dados: { nome } }) as unknown as SharedGroup;

/** A folha de apagar o grupo (PLANO-APAGAR-GRUPO.md, feature 2). */
describe('a folha de apagar o grupo (ui/group-delete-sheet.ts)', () => {
  let fixture: ComponentFixture<GroupDeleteSheet>;
  let el: HTMLElement;
  let shared: Record<string, SharedGroup>;

  const settle = async () => {
    for (let i = 0; i < 3; i++) {
      await new Promise((r) => setTimeout(r));
      await fixture.whenStable();
    }
  };
  const lines = () => Array.from(el.querySelectorAll('.acontece li')).map((li) => li.textContent!.trim());
  const choose = async (label: string) => {
    Array.from(el.querySelectorAll<HTMLLabelElement>('.segmento')).find((s) => s.textContent!.includes(label))!.querySelector('input')!.click();
    await settle();
  };

  async function open(name: string, groups: string[]): Promise<void> {
    fixture = TestBed.createComponent(GroupDeleteSheet);
    fixture.componentRef.setInput('name', name);
    fixture.componentRef.setInput('groups', groups);
    document.body.appendChild(fixture.nativeElement);
    el = fixture.nativeElement;
    await settle();
  }

  beforeEach(() => {
    localStorage.clear();
    shared = {};
    TestBed.configureTestingModule({ imports: [GroupDeleteSheet], providers: [provideZonelessChangeDetection()] });
    TestBed.inject(ReviewStore).reviews.set([note('Trabalho'), note('Trabalho'), note('Estudos'), note('Japones'), note('Casa')]);
    spyOn(TestBed.inject(SharedGroupsStore), 'ofCategory').and.callFake((c) => (c ? shared[c] : undefined));
  });

  afterEach(() => {
    el?.querySelector('dialog')?.close();
    fixture?.nativeElement.remove();
    localStorage.clear();
  });

  it('abre como diálogo, com o foco no destino escolhido (nunca no botão de apagar)', async () => {
    await open('Trabalho', ['Trabalho', 'Estudos']);
    expect(el.querySelector('dialog')!.open).toBeTrue();
    expect(document.activeElement).toBe(el.querySelector('input[value="soltar"]'));
  });

  it('o grupo vazio (o criado no "Novo grupo" do "Mais"): sem destino a escolher, só apagar o nome (PLANO-NOVO-GRUPO.md)', async () => {
    const edits = TestBed.inject(LabelEdits);
    edits.createCategory('Viagens');
    await open('Viagens', ['Trabalho', 'Estudos', 'Viagens']);
    expect(el.querySelector('.destinos')).toBeNull();
    expect(el.querySelector('.sub')!.textContent!.trim()).toBe('Nenhuma anotação ainda');
    expect(lines()).toEqual(['O grupo está vazio: só o nome, o ícone, a cor e os padrões vão embora.']);
    const button = el.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    expect(button.textContent!.trim()).toBe('Apagar o grupo');
    expect(button.classList.contains('danger')).toBeFalse();
    // o foco nunca no botão de apagar
    expect(document.activeElement).not.toBe(button);
    button.click();
    for (let i = 0; i < 10 && TestBed.inject(Settings).madeGroups().length; i++) await settle();
    expect(TestBed.inject(Settings).madeGroups()).toEqual([]);
  });

  it('o botão só é vermelho, com a lixeira, quando algo não volta', async () => {
    await open('Trabalho', ['Trabalho', 'Estudos']);
    const button = () => el.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    expect(button().classList.contains('danger')).toBeFalse();
    await choose('Apagar tudo');
    expect(button().classList.contains('danger')).toBeTrue();
  });

  it('o dono de um grupo compartilhado é avisado de que ele deixa de ser, e de quem deixa de ver', async () => {
    shared['Trabalho'] = group('Trabalho', 'dono', ['Ana', 'Bia']);
    await open('Trabalho', ['Trabalho', 'Estudos']);
    expect(el.querySelector('.compartilhado')!.textContent).toContain('Trabalho é compartilhado, e antes de apagar ele deixa de ser: Ana e Bia deixam de ver.');
  });

  it('para onde levar: os grupos seus e os compartilhados em que você escreve (até os de outra pessoa); os em que só lê ficam de fora', async () => {
    shared['Japones'] = group('Japones', 'editor');
    shared['Leitura'] = group('Leitura', 'leitor');
    shared['Casa'] = group('Casa', 'dono', ['Ana']);
    await open('Trabalho', ['Trabalho', 'Estudos', 'Japones', 'Leitura', 'Casa']);
    await choose('Levar para outro grupo');
    expect(Array.from(el.querySelectorAll('app-group-picker .op > .nome')).map((n) => n.textContent!.trim())).toEqual(['Casa', 'Estudos', 'Japones']);
  });

  it('levar para o grupo de outra pessoa avisa que ela e as outras pessoas dele passam a ver o que chega (você não entra na conta)', async () => {
    const g = group('Japones', 'editor', ['Bia']);
    shared['Japones'] = { ...g, membros: [...g.membros, { nome: 'Eu', codigo: 'EEEE-0000', papel: 'editor' }] } as unknown as SharedGroup;
    spyOn(TestBed.inject(CloudAccount), 'account').and.returnValue({ codigo: 'EEEE-0000' } as never);
    await open('Trabalho', ['Trabalho', 'Japones']);
    await choose('Levar para outro grupo');
    el.querySelector<HTMLButtonElement>('app-group-picker .op')!.click();
    await settle();
    expect(lines()).toContain('Japones é compartilhado: Ana e Bia passam a ver o que chega.');
  });

  it('levar para um grupo compartilhado seu avisa quem passa a ver tudo o que chega', async () => {
    shared['Casa'] = group('Casa', 'dono', ['Ana']);
    await open('Trabalho', ['Trabalho', 'Casa']);
    await choose('Levar para outro grupo');
    el.querySelector<HTMLButtonElement>('app-group-picker .op')!.click();
    await settle();
    expect(lines()).toContain('Casa é compartilhado: Ana passa a ver o que chega.');
  });

  /** Levar para Estudos, já escolhido. */
  const toStudies = async () => {
    await choose('Levar para outro grupo');
    Array.from(el.querySelectorAll<HTMLButtonElement>('app-group-picker .op')).find((b) => b.textContent!.includes('Estudos'))!.click();
    await settle();
  };
  const folderOps = () => Array.from(el.querySelectorAll('app-folder-picker .op .nome')).map((n) => n.textContent!.trim());

  it('levar: escolhido o grupo, a pasta dele (direto nele, de começo); a frase e o destino seguem a pasta', async () => {
    const folders = TestBed.inject(NoteFolders);
    const arquivo = folders.create('Estudos', null, 'Arquivo')!;
    folders.create('Trabalho', null, 'Reuniões');
    const del = spyOn(TestBed.inject(LabelEdits), 'deleteCategory').and.resolveTo({ ok: true, moved: 2, removed: 0 });
    await open('Trabalho', ['Trabalho', 'Estudos', 'Casa']);
    await choose('Levar para outro grupo');
    expect(el.querySelector('app-folder-picker')).toBeNull();
    await toStudies();
    expect(el.querySelector('#ag-pasta')!.textContent).toBe('Em qual pasta de Estudos');
    // só as pastas de Estudos
    expect(folderOps()).toEqual(['Direto em Estudos', 'Arquivo']);
    Array.from(el.querySelectorAll<HTMLButtonElement>('app-folder-picker .op')).find((b) => b.textContent!.includes('Arquivo'))!.click();
    await settle();
    expect(lines()[0]).toBe('As 2 anotações e a pasta vão para Estudos, dentro da pasta Arquivo.');
    // outro grupo: a pasta volta para direto nele
    Array.from(el.querySelectorAll<HTMLButtonElement>('app-group-picker .op')).find((b) => b.textContent!.includes('Casa'))!.click();
    await settle();
    expect(lines()[0]).toBe('As 2 anotações e a pasta vão para Casa.');
    await toStudies();
    Array.from(el.querySelectorAll<HTMLButtonElement>('app-folder-picker .op')).find((b) => b.textContent!.includes('Arquivo'))!.click();
    await settle();
    el.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await settle();
    expect(del).toHaveBeenCalledOnceWith('Trabalho', { kind: 'levar', to: 'Estudos', folder: arquivo.id });
  });

  it('o Criar da escolha cria a pasta em Estudos e a escolhe; desistindo, a que ficou vazia sai', async () => {
    const folders = TestBed.inject(NoteFolders);
    await open('Trabalho', ['Trabalho', 'Estudos']);
    await toStudies();
    const search = el.querySelector<HTMLInputElement>('app-folder-picker input')!;
    search.value = 'Antigos';
    search.dispatchEvent(new Event('input'));
    await settle();
    search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await settle();
    const made = folders.tree().kids('estudos', null).find((f) => f.name === 'Antigos')!;
    expect(made).toBeDefined();
    expect(lines()[0]).toBe('As 2 anotações vão para Estudos, dentro da pasta Antigos.');
    fixture.destroy();
    expect(folders.tree().live(made.id)).toBeUndefined();
  });

  it('a pasta criada e usada fica; a criada e trocada por outra sai; apagando, nada sai', async () => {
    const folders = TestBed.inject(NoteFolders);
    let release!: () => void;
    spyOn(TestBed.inject(LabelEdits), 'deleteCategory').and.callFake(
      () => new Promise((r) => (release = () => r({ ok: true, moved: 2, removed: 0 }))),
    );
    await open('Trabalho', ['Trabalho', 'Estudos']);
    await toStudies();
    const search = el.querySelector<HTMLInputElement>('app-folder-picker input')!;
    for (const name of ['Velha', 'Nova']) {
      search.value = name;
      search.dispatchEvent(new Event('input'));
      await settle();
      search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      await settle();
    }
    const nova = folders.tree().index.get([...folders.tree().all].find((f) => f.name === 'Nova')!.id)!;
    el.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await settle();
    // a folha sai da tela no meio: nada é desfeito ainda
    fixture.destroy();
    expect(folders.tree().live(nova.id)).toBeDefined();
    release();
    await new Promise((r) => setTimeout(r));
    expect(folders.tree().all.filter((f) => !f.gone).map((f) => f.name)).toContain('Nova');
  });

  it('a compartilhada de outra pessoa não entra no grupo compartilhado de destino, e a folha diz isso', async () => {
    shared['Casa'] = group('Casa', 'dono', ['Ana']);
    const theirs = TestBed.inject(ReviewStore).notes().find((r) => r.category === 'Trabalho')!.id;
    spyOn(TestBed.inject(SharedStore), 'get').and.callFake(((id: string) => (id === theirs ? { id, papel: 'editor', grupo: null, criadoPor: null } : undefined)) as never);
    await open('Trabalho', ['Trabalho', 'Casa']);
    await choose('Levar para outro grupo');
    el.querySelector<HTMLButtonElement>('app-group-picker .op')!.click();
    await settle();
    expect(lines()).toContain('A anotação que outra pessoa compartilhou com você fica só no seu mural, sem entrar no grupo.');
  });

  it('sem outro grupo para onde levar, diz o que fazer', async () => {
    await open('Trabalho', ['Trabalho']);
    await choose('Levar para outro grupo');
    expect(el.querySelector('app-group-picker')).toBeNull();
    expect(el.querySelector('.vazio')!.textContent).toContain('Não há outro grupo em que você escreva para onde levar.');
  });

  it('com baralhos, deixar sem grupo diz que eles vão embora; levar diz que vão junto, com o progresso', async () => {
    TestBed.inject(StudyStore).addDeck('Kana', 'azul', null, undefined, 'Trabalho');
    await open('Trabalho', ['Trabalho', 'Estudos']);
    expect(lines()).toContain('O baralho Kana dos Flashcards vai embora: anotação sem grupo não tem baralho.');
    await choose('Levar para outro grupo');
    el.querySelector<HTMLButtonElement>('app-group-picker .op')!.click();
    await settle();
    expect(lines()).toContain('O baralho Kana dos Flashcards vai para Estudos, com o progresso.');
  });

  it('a nuvem falhou: a folha fica aberta, com o erro, e mudar o destino o tira', async () => {
    spyOn(TestBed.inject(LabelEdits), 'deleteCategory').and.resolveTo({ ok: false, error: 'Sem internet agora.', moved: 0, removed: 0 });
    let done = 0;
    await open('Trabalho', ['Trabalho', 'Estudos']);
    fixture.componentInstance.done.subscribe(() => done++);
    el.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await settle();
    expect(el.querySelector('dialog')!.open).toBeTrue();
    expect(el.querySelector('.erro')!.textContent).toContain('Sem internet agora.');
    expect(done).toBe(0);
    await choose('Apagar tudo');
    expect(el.querySelector('.erro')).toBeNull();
  });
});
