import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { categoryBonus } from '../core/note-labels';
import { GroupPicker } from './group-picker';
import { TagPicker } from './tag-picker';

/** As partes Grupo e Tags do editor: a busca que filtra, cria e, com Enter, escolhe. */

async function type(fixture: ComponentFixture<unknown>, text: string, enter = true): Promise<void> {
  const field = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>('input')!;
  field.value = text;
  field.dispatchEvent(new Event('input'));
  await fixture.whenStable();
  if (enter) {
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await fixture.whenStable();
  }
}

describe('a parte Tags: Enter na busca', () => {
  let fixture: ComponentFixture<TagPicker>;

  beforeEach(async () => {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [TagPicker], providers: [provideZonelessChangeDetection()] });
    fixture = TestBed.createComponent(TagPicker);
    fixture.componentRef.setInput('tags', ['Bug', 'UI']);
    fixture.componentRef.setInput('library', [{ label: 'Docs', n: 2, pinned: false }]);
    await fixture.whenStable();
  });

  afterEach(() => localStorage.clear());

  it('só "#" (o começo de uma tag) não solta a primeira tag da anotação', async () => {
    await type(fixture, '#');
    expect(fixture.componentInstance.tags()).toEqual(['Bug', 'UI']);
    await type(fixture, ' # ');
    expect(fixture.componentInstance.tags()).toEqual(['Bug', 'UI']);
  });

  it('"#docs" amarra a Docs, e "#bug" solta a Bug, como sem o "#"', async () => {
    await type(fixture, '#docs');
    expect(fixture.componentInstance.tags()).toEqual(['Bug', 'UI', 'Docs']);
    await type(fixture, '#bug');
    expect(fixture.componentInstance.tags()).toEqual(['UI', 'Docs']);
  });
});

describe('a parte Grupo: a busca e o grupo novo', () => {
  let fixture: ComponentFixture<GroupPicker>;
  const options = () => [...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('.op')].map((b) => b.textContent!.trim());

  beforeEach(async () => {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [GroupPicker], providers: [provideZonelessChangeDetection()] });
    fixture = TestBed.createComponent(GroupPicker);
    fixture.componentRef.setInput('categories', [categoryBonus('Trabalho'), categoryBonus('Estudos')]);
    await fixture.whenStable();
  });

  afterEach(() => localStorage.clear());

  it('só "#" não escolhe um grupo qualquer, nem cria o grupo "#"', async () => {
    await type(fixture, '#');
    expect(fixture.componentInstance.category()).toBeNull();
    expect(options().some((o) => o.startsWith('Criar'))).toBeFalse();
  });

  it('o grupo novo nasce sem o "#" da frente, e "#trab" acha o Trabalho', async () => {
    await type(fixture, '#trab', false);
    expect(options()).toEqual(['Trabalho', 'Criar “Trab”']);
    await type(fixture, '#viagens');
    expect(fixture.componentInstance.category()).toBe('Viagens');
  });
});

describe('as partes Grupo e Tags em linhas', () => {
  afterEach(() => localStorage.clear());

  it('Tags: cada uma numa linha, com a caixinha, em quantas anotações está e a estrela; todas, sem teto', async () => {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [TagPicker], providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(TagPicker);
    const library = Array.from({ length: 40 }, (_, i) => ({ label: `Tag ${i + 1}`, n: 40 - i, pinned: false }));
    fixture.componentRef.setInput('tags', ['Bug']);
    fixture.componentRef.setInput('library', library);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const rows = Array.from(el.querySelectorAll('.tag-li .op'));
    expect(rows.length).toBe(41);
    expect(el.querySelector('.mais')).toBeNull();
    // a desta anotação primeiro, marcada
    expect(rows[0].textContent).toContain('Bug');
    expect(rows[0].getAttribute('aria-pressed')).toBe('true');
    expect(rows[0].querySelector('.caixa svg')).not.toBeNull();
    expect(rows[1].querySelector('.n')!.textContent).toContain('40');
    expect(el.querySelectorAll('.tag-li .estrela').length).toBe(41);
  });

  it('Grupo: em ordem alfabética, cada um com quantas anotações tem; Sem grupo na frente', async () => {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [GroupPicker], providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(GroupPicker);
    fixture.componentRef.setInput('categories', ['Viagens', 'Trabalho', 'Estudos', 'Receitas'].map(categoryBonus));
    fixture.componentRef.setInput('category', 'Receitas');
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const ops = Array.from(el.querySelectorAll('.lista .op'));
    expect(ops[0].textContent!.trim()).toBe('Sem grupo');
    expect(ops.slice(1).map((o) => o.querySelector('app-cat-label')!.textContent!.trim())).toEqual(['Estudos', 'Receitas', 'Trabalho', 'Viagens']);
    expect(ops[2].getAttribute('aria-checked')).toBe('true');
  });
});
