import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ICON } from './icons';
import { ReaderDetails, ReaderDetailsData, priorityArrow, tapeDate, taskSegments } from './reader-details';

/** Os Detalhes da anotação (PLANO-LEITURA-UNIFICADA.md, D7): a peça só desenha o que a leitura dá e devolve os toques. */
describe('Os Detalhes da anotação (ReaderDetails)', () => {
  it('a data da fita: dia, mês curto e ano; sem dia (ou sem data), nenhuma fita', () => {
    expect(tapeDate('2026-11-21')).toBe('21 NOV 2026');
    expect(tapeDate('2026-01-05')).toBe('5 JAN 2026');
    expect(tapeDate('2026-11')).toBeNull();
    expect(tapeDate('2026')).toBeNull();
    expect(tapeDate(null)).toBeNull();
  });

  it('os gomos das tarefas: um por tarefa até dez; mais que isso, a barra', () => {
    expect(taskSegments(1, 3)).toEqual([true, false, false]);
    expect(taskSegments(10, 10)).toEqual(Array(10).fill(true));
    expect(taskSegments(3, 11)).toBeNull();
    expect(taskSegments(0, 0)).toBeNull();
  });

  it('a seta de prioridade: crítico três para cima, importante duas, médio uma; baixo uma para baixo, baixíssimo duas', () => {
    expect(priorityArrow('critico')).toEqual({ up: true, n: 3 });
    expect(priorityArrow('importante')).toEqual({ up: true, n: 2 });
    expect(priorityArrow('medio')).toEqual({ up: true, n: 1 });
    expect(priorityArrow('baixo')).toEqual({ up: false, n: 1 });
    expect(priorityArrow('baixissimo')).toEqual({ up: false, n: 2 });
  });

  describe('na tela', () => {
    let fixture: ComponentFixture<ReaderDetails>;
    let el: HTMLElement;
    const empty: ReaderDetailsData = {
      group: null,
      folder: null,
      date: { tape: null, long: 'Sem data', notes: [] },
      who: null,
      tasks: null,
      tags: [],
      board: null,
      study: null,
      reminders: [],
      moreReminders: 0,
    };
    const full: ReaderDetailsData = {
      group: { label: 'Viagens', look: {}, color: '#2d8bd6' },
      folder: { id: 'pfranca001', label: 'Viagens › 2027 › França' },
      date: { tape: '21 NOV 2026', long: '21 de novembro de 2026', notes: ['fixada no topo'] },
      who: {
        icon: ICON.pessoas,
        line: 'Bia, Cris e Davi',
        people: [
          { code: 'BIA1-0001', name: 'Bia', face: { emoji: '🦊', cor: 'rosa' } },
          { code: 'CRIS-0002', name: 'Cris', face: null },
        ],
        sub: 'Você, Bia e Cris veem. Todos editam. Ninguém mais vê.',
        opens: true,
      },
      tasks: { done: 1, total: 3 },
      tags: [
        { label: 'férias', color: '#cf9d00' },
        { label: 'com a Ana', color: null },
      ],
      board: { id: 'q-viagens', column: 'Fazendo', color: 'laranja', importance: 'baixissimo', status: 'esperando o visto', deps: false },
      study: { deckId: 'd-frances', deck: 'Francês de viagem', more: 1, icon: ICON.camadas, color: 'vermelho', level: 'aprendendo', levelLabel: 'Aprendendo', when: 'revisão amanhã' },
      reminders: [{ id: 'r-trem0001', day: '2026-12-01', when: 'seg., 1 de dez., 9:00', title: 'Trem para Lyon', past: false, icon: ICON.calendario, color: 'verde' }],
      moreReminders: 2,
    };

    beforeEach(() => {
      TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
      fixture = TestBed.createComponent(ReaderDetails);
      el = fixture.nativeElement as HTMLElement;
    });

    const keys = () => [...el.querySelectorAll<HTMLElement>('.linha')].map((l) => l.dataset['k']);
    function show(d: ReaderDetailsData): void {
      fixture.componentRef.setInput('data', d);
      fixture.detectChanges();
    }

    it('sem nada além da data, só a linha da data, sem fita', () => {
      show(empty);
      expect(keys()).toEqual(['data']);
      expect(el.querySelector('.fita')).toBeNull();
      expect(el.querySelector('[data-k="data"] .valor')?.textContent?.trim()).toBe('Sem data');
    });

    it('com tudo: uma linha por dado, na ordem, e a pausa antes de onde mais ela está', () => {
      show(full);
      expect(keys()).toEqual(['grupo', 'pasta', 'data', 'quem', 'tarefas', 'tags', 'kanban', 'flashcards', 'agenda']);
      // o grupo tingido da cor dele, sem orelha
      const group = el.querySelector<HTMLElement>('[data-k="grupo"] app-cat-label')!;
      expect(group.classList).toContain('tingido');
      expect(group.style.getPropertyValue('--cat-cor')).toBe('#2d8bd6');
      // a data na fita, com a frase inteira para o leitor de tela
      expect(el.querySelector('.fita .sr-only')?.textContent).toBe('21 de novembro de 2026');
      // as pessoas: o emoji na cartolina de quem tem foto; quem não tem, a inicial
      const faces = [...el.querySelectorAll<HTMLElement>('.rosto')];
      expect(faces.map((f) => f.textContent?.trim())).toEqual(['🦊', 'C']);
      expect(faces[0].dataset['cor']).toBe('rosa');
      // as tags na legenda da Wishlist, no tom do papel
      expect(el.querySelector('app-wish-tags')!.classList).toContain('tom-papel');
      expect(el.querySelector('app-wish-tags .sem-cor')?.textContent).toBe('com a Ana');
      // baixíssimo: duas setinhas para baixo
      expect(el.querySelectorAll('.prioridade .seta path').length).toBe(2);
      expect(el.querySelector('.prioridade .seta')!.classList).toContain('desce');
      expect(el.querySelector('.linha:not(.lugar) + .lugar')?.getAttribute('data-k')).toBe('kanban');
    });

    it('os toques voltam para a leitura: a pasta, as pessoas, o quadro, o baralho, o dia e o "e mais"', () => {
      show(full);
      const got: string[] = [];
      const c = fixture.componentInstance;
      c.folderOpened.subscribe((id) => got.push(`pasta ${id}`));
      c.peopleOpened.subscribe(() => got.push('pessoas'));
      c.boardOpened.subscribe((id) => got.push(`quadro ${id}`));
      c.deckOpened.subscribe((id) => got.push(`baralho ${id}`));
      c.dayOpened.subscribe((day) => got.push(`dia ${day}`));
      c.moreReminders.subscribe(() => got.push('mais'));
      for (const sel of ['[data-k="pasta"] .elo', '[data-k="quem"] .elo', '.coluna', '[data-k="flashcards"] .elo', '[data-k="agenda"] .elo', '[data-k="agenda"] .mais']) {
        el.querySelector<HTMLButtonElement>(sel)!.click();
      }
      expect(got).toEqual(['pasta pfranca001', 'pessoas', 'quadro q-viagens', 'baralho d-frances', 'dia 2026-12-01', 'mais']);
    });

    it('a sua privada não tem pessoas nem toque: o cadeado e "Só você"', () => {
      show({ ...empty, who: { icon: ICON.privada, line: 'Só você', people: [], sub: null, opens: false } });
      expect(el.querySelector('[data-k="quem"] .valor')?.textContent?.trim()).toBe('Só você');
      expect(el.querySelector('[data-k="quem"] button')).toBeNull();
      expect(el.querySelector('.rostos')).toBeNull();
    });
  });
});
