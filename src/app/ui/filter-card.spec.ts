import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FilterCard, FilterShow, SubjectOption, activeFilters, removeActive } from './filter-card';
import { TagChip } from './tag-chips';

/** A folha dos filtros sozinha: as linhas que aparecem, as contagens, as cores, o pé e os ligados. */
describe('FilterCard', () => {
  let fixture: ComponentFixture<FilterCard>;
  let el: HTMLElement;

  const subjects: SubjectOption[] = [
    { value: 'Site', label: 'Site', n: 2, on: false },
    { value: 'sem', label: 'Sem assunto', n: 0, on: false },
  ];
  const tags: TagChip[] = [
    { value: 'Prova', label: 'Prova', n: 3, on: true },
    { value: 'Resumo', label: 'Resumo', n: 0, on: false },
    { value: 'Urgente', label: 'Urgente', n: 2, on: false, out: true },
  ];
  const shows: FilterShow[] = [{ key: 'kanban', label: 'Só no Kanban', n: 4, on: true, summary: 'com as do Kanban' }];

  async function mount(inputs: Record<string, unknown>): Promise<void> {
    fixture = TestBed.createComponent(FilterCard);
    for (const [k, v] of Object.entries(inputs)) fixture.componentRef.setInput(k, v);
    el = fixture.nativeElement;
    document.body.appendChild(el);
    await fixture.whenStable();
  }

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  });

  afterEach(() => {
    el?.remove();
    localStorage.clear();
  });

  it('os ligados (para os adesivos embaixo da pasta) são o assunto, as tags ligadas, as escondidas e o que voltou ao mural', () => {
    const chips = activeFilters([{ ...subjects[0], on: true }, subjects[1]], [...tags, { value: 'Lista', label: 'Lista', n: 1, on: true }], shows);
    expect(chips.map((c) => c.label)).toEqual(['Site', '#Prova', '#Lista', 'Sem #Urgente', 'com as do Kanban']);
    expect(chips.map((c) => c.key)).toEqual(['subject', 'tag', 'tag', 'out', 'show']);
    expect(activeFilters(subjects, [], [])).toEqual([]);
  });

  it('tirar um adesivo é o mesmo toque que o ligou', () => {
    const calls: string[] = [];
    const to = { subjectChosen: (v: string | null) => calls.push(`assunto:${v}`), tagToggled: (v: string) => calls.push(`tag:${v}`), showToggled: (k: string) => calls.push(`mostrar:${k}`) };
    for (const c of activeFilters([{ ...subjects[0], on: true }], tags, shows)) removeActive(c, to);
    expect(calls).toEqual(['assunto:null', 'tag:Prova', 'tag:Urgente', 'mostrar:kanban']);
  });

  it('a tag com cor vai pintada na etiqueta: o contorno tracejado, e a cor por dentro quando ligada', async () => {
    await mount({ tags: [{ ...tags[0], color: '#2f6fd1' }, { ...tags[1], color: '#2f6fd1' }, tags[2]] });
    const notes = [...el.querySelectorAll<HTMLElement>('app-note-tag')];
    expect(notes[0].classList).toContain('cor');
    expect(notes[1].classList).toContain('tingida');
    expect(notes[1].classList).toContain('ghost');
    expect(getComputedStyle(notes[1]).outlineColor).toBe('rgb(47, 111, 209)');
    expect(notes[2].classList).not.toContain('tingida');
  });

  it('cada tag traz o número na própria etiqueta, e a que não mostraria nada desbota', async () => {
    await mount({ tags });
    const chip = (name: string) => [...el.querySelectorAll<HTMLElement>('.atalho')].find((b) => b.querySelector('.txt')!.textContent!.trim() === name)!;
    expect(chip('Prova').querySelector('app-note-tag .n')!.textContent).toBe('3');
    expect(chip('Resumo').classList).toContain('zero');
    expect(chip('Prova').classList).not.toContain('zero');
    // a escondida conta quantas tira, e não desbota pelo zero
    expect(chip('Urgente').classList).not.toContain('zero');
  });

  it('o assunto que não mostraria nada desbota; o escolhido, nunca', async () => {
    await mount({ subjects: [subjects[0], { ...subjects[1], n: 0 }, { value: 'Prova', label: 'Prova', n: 0, on: true }] });
    const zero = [...el.querySelectorAll('.recorte.zero .recorte-nome')].map((n) => n.textContent!.trim());
    expect(zero).toEqual(['Sem assunto']);
  });

  it('o "Mostrar também" é um interruptor por item, e o toque no nome também o liga', async () => {
    await mount({ shows: [{ ...shows[0], on: false }] });
    const toggled: string[] = [];
    fixture.componentInstance.showToggled.subscribe((k) => toggled.push(k));
    const sw = el.querySelector<HTMLButtonElement>('.chave [role="switch"]')!;
    expect(sw.getAttribute('aria-checked')).toBe('false');
    sw.click();
    el.querySelector<HTMLElement>('.chave-nome')!.click();
    expect(toggled).toEqual(['kanban', 'kanban']);
  });

  it('o pé diz quantas mostra; Limpar tudo só com algo ligado; Esc e Pronto fecham', async () => {
    await mount({ subjects, tags: [tags[1]], filtering: false, shown: 2, total: 5 });
    expect(el.querySelector('.conta')!.textContent!.trim()).toBe('5 anotações');
    expect(el.querySelector('.pe .acao-caneta')).toBeNull();
    fixture.componentRef.setInput('filtering', true);
    fixture.componentRef.setInput('tags', tags);
    await fixture.whenStable();
    expect(el.querySelector('.conta')!.textContent!.trim()).toBe('Mostrando 2 de 5 anotações');
    let cleared = 0;
    let done = 0;
    fixture.componentInstance.cleared.subscribe(() => cleared++);
    fixture.componentInstance.done.subscribe(() => done++);
    el.querySelector<HTMLButtonElement>('.pe .acao-caneta')!.click();
    el.querySelector<HTMLButtonElement>('.pronto')!.click();
    el.querySelector<HTMLElement>('.recorte input')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(cleared).toBe(1);
    expect(done).toBe(2);
  });

  it('é a cartela das resenhas: a folha branca com as duas fitas', async () => {
    await mount({ subjects });
    expect(el.querySelectorAll('.fita').length).toBe(2);
    expect(el.getAttribute('role')).toBe('region');
  });

  it('sem assunto que separe, sem tags e sem o que mostrar, a folha diz que não há o que filtrar', async () => {
    await mount({ subjects: [subjects[0]], tags: [], shows: [] });
    expect(el.querySelector('.linha')).toBeNull();
    expect(el.querySelector('.vazio')).not.toBeNull();
  });
});
