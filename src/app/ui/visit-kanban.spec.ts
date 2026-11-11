import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { freshBoard, placeCard } from '../core/kanban';
import { Review, sanitizeReview } from '../core/review';
import { VisitGroup, VisitGroups } from '../core/visit-groups';
import { VisitKanban } from './visit-kanban';

/**
 * O Kanban de um grupo público na visita (PLANO-COMPARTILHAR.md, 4.6): as mesmas peças do quadro do dono (a
 * etiqueta da coluna e o cartão), só para ler, e a anotação abre na leitura da visita.
 */

const note = (id: string): Review =>
  sanitizeReview({
    id,
    kind: 'anotacoes',
    game: { name: `Tarefa ${id}`, coverUrl: null, source: 'manual' },
    text: '',
    category: 'Trabalho',
    completedAt: '2026-11-11',
    createdAt: '2026-11-11T10:00:00.000Z',
    updatedAt: '2026-11-11T10:00:00.000Z',
  })!;

describe('o Kanban de um grupo público na visita (ui/visit-kanban.ts)', () => {
  afterEach(() => TestBed.resetTestingModule());

  function render(groups: VisitGroup[]) {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideRouter([]), { provide: VisitGroups, useValue: { groups: signal(groups) } }],
    });
    const f = TestBed.createComponent(VisitKanban);
    f.componentRef.setInput('name', 'Ana');
    f.detectChanges();
    return f;
  }

  it('as colunas do quadro do grupo, com a etiqueta e os cartões do dono, sem nada que mexa; tocar abre a leitura', () => {
    let board = freshBoard('Trabalho');
    board = placeCard(board, 'n-um0001', board.columns[0]!.id, '2026-11-11T10:00:00.000Z');
    board = placeCard(board, 'n-dois01', board.columns[2]!.id, '2026-11-11T10:00:01.000Z');
    // um cartão de uma anotação que não está à mostra não aparece
    board = placeCard(board, 'n-sumiu1', board.columns[0]!.id, '2026-11-11T10:00:02.000Z');
    const f = render([{ id: 'gTrabalho001', nome: 'Trabalho', look: {}, board, versao: '1', notes: [note('n-um0001'), note('n-dois01')] }]);
    const el = f.nativeElement as HTMLElement;
    expect([...el.querySelectorAll('app-kanban-column-head .etiqueta-nome')].map((h) => h.childNodes[0]!.textContent!.trim())).toEqual(['A fazer', 'Fazendo', 'Feito']);
    expect([...el.querySelectorAll('.coluna')].map((c) => [...c.querySelectorAll('[data-nota]')].map((x) => x.getAttribute('data-nota')))).toEqual([['n-um0001'], [], ['n-dois01']]);
    // nada que mexa: sem o lápis da coluna, sem adicionar, sem as etiquetas das ações do cartão
    expect(el.querySelector('.etiqueta-btn')).toBeNull();
    expect(el.querySelector('.adicionar')).toBeNull();
    let opened = '';
    f.componentInstance.opened.subscribe((e) => (opened = e.note.id));
    el.querySelector<HTMLElement>('[data-nota="n-um0001"] app-kanban-note button, [data-nota="n-um0001"] app-kanban-note [role="button"]')?.click();
    expect(opened).toBe('n-um0001');
  });

  it('sem grupo público: diz que os Kanbans ficam com quem está neles', () => {
    const f = render([]);
    expect((f.nativeElement as HTMLElement).textContent).toContain('Ana não tem grupos públicos');
  });
});
