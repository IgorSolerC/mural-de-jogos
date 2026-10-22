import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FilterCard, FilterShow, SubjectOption } from './filter-card';
import { TagChip } from './tag-chips';

/** A ficha dos filtros sozinha: o resumo a lápis, as linhas que aparecem, as contagens e o que ela avisa. */
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

  async function mount(inputs: Record<string, unknown>, open = true): Promise<void> {
    localStorage.setItem('meu-mural:filtros-abertos:v1', String(open));
    fixture = TestBed.createComponent(FilterCard);
    for (const [k, v] of Object.entries(inputs)) fixture.componentRef.setInput(k, v);
    el = fixture.nativeElement;
    document.body.appendChild(el);
    await fixture.whenStable();
  }
  const summary = () => [...el.querySelectorAll('.resumo-item')].map((b) => b.textContent!.trim());

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  });

  afterEach(() => {
    el?.remove();
    localStorage.clear();
  });

  it('o resumo diz o assunto, as tags ligadas, as escondidas e o que voltou ao mural', async () => {
    await mount({ subjects: [{ ...subjects[0], on: true }, subjects[1]], tags: [...tags, { value: 'Lista', label: 'Lista', n: 1, on: true }], shows });
    expect(summary()).toEqual(['Site', 'Prova ou Lista', 'sem Urgente', 'com as do Kanban']);
  });

  it('sem nada ligado, o resumo é o "tudo" de quem usa', async () => {
    await mount({ subjects, tags: [], everything: 'Todo o quadro' });
    expect(summary()).toEqual(['Todo o quadro']);
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

  it('o Mostrando e o Limpar ficam na cabeça só quando filtra, e o Limpar não abre nem fecha a ficha', async () => {
    await mount({ subjects, filtering: false, shown: 2, total: 5 }, false);
    expect(el.querySelector('.achados')).toBeNull();
    fixture.componentRef.setInput('filtering', true);
    await fixture.whenStable();
    expect(el.querySelector('.achados')!.textContent).toContain('Mostrando 2 de 5');
    let cleared = 0;
    fixture.componentInstance.cleared.subscribe(() => cleared++);
    el.querySelector<HTMLButtonElement>('.achados .tinta-link')!.click();
    await fixture.whenStable();
    expect(cleared).toBe(1);
    expect(el.querySelector('.abre')!.getAttribute('aria-expanded')).toBe('false');
  });

  it('sem assunto que separe, sem tags e sem o que mostrar, a ficha some', async () => {
    await mount({ subjects: [subjects[0]], tags: [], shows: [] });
    expect(el.classList).toContain('vazio');
    expect(el.querySelector('.cabeca')).toBeNull();
  });
});
