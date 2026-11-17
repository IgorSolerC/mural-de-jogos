import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { LabelEdits } from '../core/label-edits';
import { Review, sanitizeReview } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { SharedGroup } from '../core/shared-groups';
import { SharedGroupsStore } from '../core/shared-groups-store';
import { StudyStore } from '../core/study-store';
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

  it('o dono de um grupo compartilhado é avisado de que ele deixa de ser, e de quem deixa de ver', async () => {
    shared['Trabalho'] = group('Trabalho', 'dono', ['Ana', 'Bia']);
    await open('Trabalho', ['Trabalho', 'Estudos']);
    expect(el.querySelector('.compartilhado')!.textContent).toContain('Trabalho é compartilhado. Antes de apagar, ele deixa de ser: Ana e Bia deixam de ver.');
  });

  it('para onde levar: os grupos seus e os compartilhados seus; os de outra pessoa ficam de fora', async () => {
    shared['Japones'] = group('Japones', 'editor');
    shared['Casa'] = group('Casa', 'dono', ['Ana']);
    await open('Trabalho', ['Trabalho', 'Estudos', 'Japones', 'Casa']);
    await choose('Levar para outro grupo');
    expect(Array.from(el.querySelectorAll('app-group-picker .op > .nome')).map((n) => n.textContent!.trim())).toEqual(['Casa', 'Estudos']);
  });

  it('levar para um grupo compartilhado seu avisa quem passa a ver tudo o que chega', async () => {
    shared['Casa'] = group('Casa', 'dono', ['Ana']);
    await open('Trabalho', ['Trabalho', 'Casa']);
    await choose('Levar para outro grupo');
    el.querySelector<HTMLButtonElement>('app-group-picker .op')!.click();
    await settle();
    expect(lines()).toContain('Casa é compartilhado: Ana passa a ver tudo o que chega.');
  });

  it('sem outro grupo para onde levar, diz o que fazer', async () => {
    await open('Trabalho', ['Trabalho']);
    await choose('Levar para outro grupo');
    expect(el.querySelector('app-group-picker')).toBeNull();
    expect(el.querySelector('.vazio')!.textContent).toContain('Não há outro grupo seu para onde levar.');
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
