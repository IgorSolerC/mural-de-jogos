import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BulkPatch } from '../core/note-bulk';
import { Review, sanitizeReview } from '../core/review';
import { BulkEditSheet } from './bulk-edit-sheet';

const T0 = '2026-10-01T10:00:00.000Z';
const note = (id: string, extra: Record<string, unknown> = {}): Review => ({
  ...sanitizeReview({ kind: 'anotacoes', game: { name: id, coverUrl: null, source: 'manual' }, text: '', completedAt: '2026-10-01', createdAt: T0, updatedAt: T0, ...extra })!,
  id,
});

/** A folha "Editar as marcadas" (PLANO-SELECAO.md, 3): o que difere diz "Vários", e Aplicar manda só o que mudou. */
describe('editar as marcadas (BulkEditSheet)', () => {
  let el: HTMLElement;
  let applied: BulkPatch[];

  async function mount(notes: Review[], place: 'mural' | 'kanban' | 'estudos' = 'mural'): Promise<void> {
    localStorage.clear();
    applied = [];
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(BulkEditSheet);
    fixture.componentRef.setInput('notes', notes);
    fixture.componentRef.setInput('place', place);
    fixture.componentInstance.apply.subscribe((p) => applied.push(p));
    document.body.appendChild(fixture.nativeElement);
    await fixture.whenStable();
    el = fixture.nativeElement as HTMLElement;
  }
  const tick = async () => {
    TestBed.tick();
    await new Promise((r) => setTimeout(r));
    TestBed.tick();
  };
  const apply = () => el.querySelector<HTMLButtonElement>('[data-acao="aplicar"]')!;
  const op = (label: string) => [...el.querySelectorAll<HTMLButtonElement>('.op')].find((b) => b.textContent!.trim() === label)!;

  afterEach(() => {
    el?.remove();
    localStorage.clear();
  });

  it('diz "Vários" no que difere, com como está, e o Aplicar começa desligado', async () => {
    await mount([note('nfol00001', { category: 'Estudos', private: true, stock: 'azul' }), note('nfol00002', { category: 'Trabalho', stock: 'rosa' })]);
    expect(el.querySelector('h2')!.textContent).toContain('Editar 2 anotações');
    const text = el.textContent!;
    expect(text).toContain('Vários');
    expect(text).toContain('Estudos, Trabalho');
    expect(text).toContain('1 pública, 1 privada');
    expect(text).toContain('2 cores');
    // em grupos diferentes, a pasta espera o grupo
    expect(text).toContain('escolha o grupo antes');
    expect(apply().disabled).toBeTrue();
    expect(op('Público').getAttribute('aria-checked')).toBe('false');
    expect(op('Privado').getAttribute('aria-checked')).toBe('false');
  });

  it('mexer num campo marca a linha e manda só ele; "Deixar como está" desfaz', async () => {
    await mount([note('nfol00003', { private: true }), note('nfol00004')]);
    op('Privado').click();
    await tick();
    expect(op('Privado').getAttribute('aria-checked')).toBe('true');
    expect(el.querySelectorAll('.linha.mexida').length).toBe(1);
    expect(apply().disabled).toBeFalse();
    el.querySelector<HTMLButtonElement>('.linha.mexida .volta')!.click();
    await tick();
    expect(apply().disabled).toBeTrue();
    op('Privado').click();
    await tick();
    apply().click();
    expect(applied).toEqual([{ audience: 'privada' }]);
  });

  it('as tags de só algumas aparecem com quantas; tocar põe em todas, o X tira de todas', async () => {
    await mount([note('nfol00005', { tags: ['Prova', 'Resumo'] }), note('nfol00006', { tags: ['Prova', 'Código'] })]);
    const partial = () => [...el.querySelectorAll('.alguma')].map((li) => `${li.querySelector('app-note-tag')!.textContent!.trim()} ${li.querySelector('.em')!.textContent!.trim()}`);
    expect(partial()).toEqual(['Resumo em 1 de 2', 'Código em 1 de 2']);
    el.querySelector<HTMLButtonElement>('.alguma .por')!.click();
    await tick();
    el.querySelector<HTMLButtonElement>('.alguma .tirar')!.click();
    await tick();
    expect(partial()).toEqual([]);
    apply().click();
    expect(applied).toEqual([{ tags: { all: ['Prova', 'Resumo'], drop: ['Código'] } }]);
  });

  it('nos Flashcards: "Onde aparece" e a fala no masculino; sem apagar a anotação inteira', async () => {
    await mount([note('nfol00007'), note('nfol00008')], 'estudos');
    expect(el.querySelector('h2')!.textContent).toContain('Editar 2 flashcards');
    expect(el.textContent).toContain('vale para os dois');
    expect(el.textContent).not.toContain('Apagar');
    expect(apply().textContent!.trim()).toBe('Aplicar aos dois');
  });

  it('nas análises: só quem vê e a cartolina', async () => {
    const r = (id: string) => ({ ...note(id), kind: 'jogos' as const });
    await mount([r('gfol00001'), r('gfol00002')]);
    expect(el.querySelector('h2')!.textContent).toContain('Editar 2 fichas');
    const names = [...el.querySelectorAll('.linha .nome')].map((n) => n.textContent!.trim());
    expect(names).toEqual(['Quem vê', 'Cartolina', 'Agora']);
  });
});
