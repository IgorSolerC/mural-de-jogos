import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Cloud } from '../core/cloud-config';
import { CloudAccount } from '../core/cloud-account';
import { LocalData } from '../core/local-data';
import { Review, sanitizeReview } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { SHARED_AUTO } from '../core/shared-store';
import { SideBySide } from '../core/side-by-side';
import { KanbanStore } from '../core/kanban-store';
import { CalendarStore } from '../core/calendar-store';
import { boardIdFor, freshBoard } from '../core/kanban';
import { ReviewReader } from './review-reader';

/**
 * A ficha aberta, arrumada para ler: o nome escrito na faixa da cartolina, quem vê como um desenho
 * antes da data (sem a frase comprida de antes), e o pé com uma fileira só, o que se faz de vez em
 * quando guardado no bilhete do "Mais".
 */

class MemoryData {
  private readonly map = new Map<string, string>();
  readonly where = 'local';
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  onExternalChange(): void {
    /* sem outras abas */
  }
  takeForeign(): null {
    return null;
  }
}

function review(id: string, name: string, extra: Partial<Review> = {}): Review {
  return sanitizeReview({
    id,
    kind: 'jogos',
    game: { name, coverUrl: null, source: 'manual' },
    scores: { historia: 8, diversao: 8, jogabilidade: 8, visual: 8 },
    status: 'finalizado',
    difficulty: 'nenhuma',
    verdict: null,
    text: 'Valeu cada hora, mesmo com o final corrido.',
    completedAt: '2026-01-01',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...extra,
  })!;
}

function note(id: string, name: string, extra: Partial<Review> = {}): Review {
  return review(id, name, { kind: 'anotacoes', scores: { final: 0 }, text: '- [ ] Pão\n- [x] Leite', ...extra });
}

describe('A ficha aberta, arrumada para ler (ReviewReader)', () => {
  let fixture: ComponentFixture<ReviewReader>;
  let el: HTMLElement;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: LocalData, useClass: MemoryData },
        { provide: SHARED_AUTO, useValue: false },
        { provide: Cloud, useValue: { ready: Promise.resolve(), config: signal({ api: 'https://api.teste', googleClientId: 'x' }) } },
        { provide: CloudAccount, useValue: { account: signal(null), signedIn: signal(false), request: async () => ({}) } },
      ],
    });
    fixture = TestBed.createComponent(ReviewReader);
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  afterEach(() => {
    el.querySelector('dialog')?.close();
    localStorage.clear();
  });

  const q = <T extends HTMLElement>(selector: string) => el.querySelector<T>(selector);
  const qa = (selector: string) => [...el.querySelectorAll<HTMLElement>(selector)];
  const wait = (ms = 0) => new Promise((res) => setTimeout(res, ms));
  async function settle(): Promise<void> {
    await wait();
    fixture.detectChanges();
    await fixture.whenStable();
  }
  const words = (node: Element | null) => node?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

  /** Abre o "Mais" do pé (se ainda não está aberto) e devolve os caminhos do bilhete, na ordem. */
  async function openMore(): Promise<HTMLButtonElement[]> {
    if (!q('app-more-menu .bilhete')) q<HTMLButtonElement>('app-more-menu .mais')!.click();
    await settle();
    await wait();
    return qa('app-more-menu .item') as HTMLButtonElement[];
  }

  it('o nome vai escrito na faixa da cartolina, no alto, e não se repete na folha', async () => {
    fixture.componentInstance.open(review('r-hades', 'Hades'));
    await settle();
    const title = q('#leitura-titulo')!;
    expect(title.textContent?.trim()).toBe('Hades');
    expect(title.closest('header.head')).not.toBeNull();
    expect(qa('.body .title').length).toBe(0);
    // o X continua na ponta da faixa
    expect(q('header.head .fecha')?.getAttribute('aria-label')).toBe('Fechar');
  });

  it('a análise privada mostra só o cadeado antes da data, sem a frase comprida', async () => {
    fixture.componentInstance.open(review('r-hades', 'Hades', { private: true }));
    await settle();
    const mark = q('.meta .quem-ve')!;
    expect(mark.getAttribute('title')).toBe('Privada: só você vê');
    // o leitor de tela ainda ouve o que o desenho quer dizer
    expect(words(mark)).toBe('Privada: só você vê.');
    expect(el.textContent).not.toContain('Ninguém foi avisado');
  });

  it('a anotação (que nasce privada) não leva desenho; a publicada leva o olho, e a sem aviso o sino cortado', async () => {
    fixture.componentInstance.open(note('n-mercado', 'Mercado', { private: true }));
    await settle();
    expect(q('.quem-ve')).toBeNull();

    fixture.componentInstance.open(note('n-mercado-2', 'Mercado'));
    await settle();
    expect(q('.quem-ve')?.getAttribute('title')).toBe('Publicada: quem abre o seu mural vê');

    fixture.componentInstance.open(note('n-mercado-3', 'Mercado', { quiet: true }));
    await settle();
    expect(q('.quem-ve')?.getAttribute('title')).toContain('não foi para o Feed');
  });

  it('a ficha de outra pessoa não diz quem vê (só o dono sabe)', async () => {
    fixture.componentInstance.open(review('r-hades', 'Hades', { private: true }), 'Ana');
    await settle();
    expect(q('.quem-ve')).toBeNull();
    expect(q('app-more-menu')).toBeNull();
    expect(words(q('.foot p'))).toBe('Resenha de Ana');
  });

  it('o pé da análise tem só o "Mais" e o Editar; o resto mora no bilhete', async () => {
    const reader = fixture.componentInstance;
    const removed: string[] = [];
    const revisits: string[] = [];
    reader.remove.subscribe((id) => removed.push(id));
    reader.revisit.subscribe((id) => revisits.push(id));
    // o Lado a lado só marca o que está no mural
    TestBed.inject(ReviewStore).add(review('r-hades', 'Hades'));
    reader.open(review('r-hades', 'Hades'));
    await settle();

    const foot = q('.foot')!;
    expect(qa('.foot .actions button').map(words)).toEqual(['Editar']);
    expect(foot.textContent).not.toContain('Remover do mural');

    const items = await openMore();
    expect(items.map(words)).toEqual(['Escrever rejogada', 'Lado a lado', 'Remover do mural']);
    // o Lado a lado é um ligar e desligar; o que apaga vai por último, na tinta vermelha
    expect(items[1].getAttribute('role')).toBe('menuitemcheckbox');
    expect(items[1].getAttribute('aria-checked')).toBe('false');
    expect(items[2].classList.contains('perigo')).toBeTrue();

    items[1].click();
    await settle();
    expect(TestBed.inject(SideBySide).has('r-hades')).toBeTrue();
    expect((await openMore())[1].getAttribute('aria-checked')).toBe('true');

    (await openMore())[0].click();
    await settle();
    expect(revisits).toEqual(['r-hades']);

    (await openMore())[2].click();
    await settle();
    expect(removed).toEqual(['r-hades']);
    // escolher fecha o bilhete
    expect(q('app-more-menu .bilhete')).toBeNull();
  });

  it('a rejogada não oferece o Lado a lado', async () => {
    fixture.componentInstance.open(review('r-hades-2', 'Hades', { revisitOf: 'r-hades' }));
    await settle();
    expect((await openMore()).map(words)).toEqual(['Escrever rejogada', 'Remover do mural']);
  });

  it('a anotação deixa o Finalizar à mão; fixar, compartilhar e apagar ficam no "Mais"', async () => {
    const store = TestBed.inject(ReviewStore);
    const n = note('n-mercado', 'Mercado');
    store.add(n);
    fixture.componentInstance.open(store.get('n-mercado')!);
    await settle();

    expect(qa('.foot .actions button').map(words)).toEqual(['Finalizar', 'Editar']);
    const items = await openMore();
    expect(items.map(words)).toEqual(['Fixar no topo', 'Compartilhar', 'Apagar anotação']);
    expect(items[1].getAttribute('aria-haspopup')).toBe('dialog');

    items[0].click();
    await settle();
    expect(store.get('n-mercado')?.noteRank).toBe('fixada');
    // a linha da data diz o lugar dela no mural, e o bilhete oferece desafixar
    expect(words(q('.meta'))).toContain('Fixada');
    expect((await openMore())[0].textContent?.trim()).toBe('Desafixar');
  });

  it('as tarefas feitas viram a conta no texto, que se abre tocando nela (sem botão à parte)', async () => {
    fixture.componentInstance.open(note('n-mercado', 'Mercado'));
    await settle();
    expect(el.textContent).not.toContain('Mostrar a tarefa feita');
    const folded = q<HTMLButtonElement>('.text .resumo-btn')!;
    expect(words(folded)).toContain('1 tarefa feita');
    folded.click();
    await settle();
    expect(q('.text .resumo-btn')).toBeNull();
    expect(el.querySelector('.text')?.textContent).toContain('Leite');
  });

  it('a conta das tarefas fica na linha da data, como na ficha do mural', async () => {
    fixture.componentInstance.open(note('n-mercado', 'Mercado'));
    await settle();
    expect(words(q('.meta .tarefas-conta'))).toContain('1/2 tarefas feitas');
  });

  it('a finalizada leva o carimbo na faixa, ao lado do nome', async () => {
    fixture.componentInstance.open(note('n-mercado', 'Mercado', { doneAt: '2026-01-02T10:00:00.000Z' }));
    await settle();
    expect(q('header.head.feita .carimbo app-done-stamp')).not.toBeNull();
    expect(q('.top.com-carimbo')).not.toBeNull();
  });

  it('o "Mais" anda pelas setas e o Esc fecha só o bilhete, com o foco de volta no botão', async () => {
    fixture.componentInstance.open(review('r-hades', 'Hades'));
    await settle();
    const items = await openMore();
    expect(document.activeElement).toBe(items[0]);
    const key = (k: string) => (document.activeElement as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
    key('ArrowDown');
    expect(document.activeElement).toBe(items[1]);
    key('End');
    expect(document.activeElement).toBe(items[2]);
    key('ArrowDown');
    expect(document.activeElement).toBe(items[0]);

    const esc = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    (document.activeElement as HTMLElement).dispatchEvent(esc);
    await settle();
    expect(esc.defaultPrevented).toBeTrue();
    expect(q('app-more-menu .bilhete')).toBeNull();
    expect(document.activeElement).toBe(q('app-more-menu .mais'));
    expect(el.querySelector('dialog')!.open).toBeTrue();
  });

  it('veio por um link: a volta é a seta na ponta da faixa, com o nome de onde veio', async () => {
    const from = note('n-tudo', 'Lista de tudo');
    fixture.componentInstance.open(note('n-mercado', 'Mercado'), null, [], false, null, from);
    await settle();
    const back = q('header.head .voltar-elo')!;
    expect(back.getAttribute('aria-label')).toBe('Voltar para “Lista de tudo”');
    back.click();
    await settle();
    expect(q('#leitura-titulo')?.textContent?.trim()).toBe('Lista de tudo');
    expect(q('.voltar-elo')).toBeNull();
  });

  it('o grupo é a orelha da ficha (como no mural), e não se repete junto das tags', async () => {
    fixture.componentInstance.open(note('n-mercado', 'Mercado', { category: 'Casa', tags: ['Feira'] }));
    await settle();
    expect(words(q('.orelhas .orelha-grupo'))).toBe('Grupo: Casa');
    expect(qa('.categorias li').map(words)).toEqual(['Feira']);
    expect(q('.par')!.classList.contains('com-grupo')).toBeTrue();

    // sem grupo, sem orelha
    fixture.componentInstance.open(note('n-mercado-2', 'Mercado'));
    await settle();
    expect(q('.orelha-grupo')).toBeNull();
  });

  it('a anotação no quadro do Kanban diz a coluna, a importância e o status; tocar na coluna abre o quadro', async () => {
    const store = TestBed.inject(ReviewStore);
    store.add(note('n-mercado', 'Mercado', { category: 'Casa' }));
    const kanban = TestBed.inject(KanbanStore);
    const id = boardIdFor('Casa');
    const board = freshBoard('Casa');
    kanban.state.update((st) => ({
      ...st,
      boards: [{ ...board, cards: [{ note: 'n-mercado', column: board.columns[1].id, importance: 'importante', status: 'Com o Caio' }] }],
    }));
    fixture.componentInstance.open(store.get('n-mercado')!);
    await settle();
    const line = q('.lugares .no-quadro')!;
    expect(words(line)).toContain('Fazendo');
    expect(words(line.querySelector('.etq.imp'))).toBe('Importância: Importante');
    expect(words(line.querySelector('.etq.status'))).toBe('Status: Com o Caio');

    const router = TestBed.inject(Router);
    const go = spyOn(router, 'navigate').and.resolveTo(true);
    line.querySelector<HTMLButtonElement>('.parte-de')!.click();
    expect(go).toHaveBeenCalledWith(['/anotacoes/kanban', id]);
  });

  it('os lembretes do Calendário em que a anotação foi presa: o mais perto, e o "e mais N" mostra os outros', async () => {
    const calendar = TestBed.inject(CalendarStore);
    calendar.today.set('2026-10-19');
    const base = { color: 'azul' as const, notes: ['n-mercado'], skip: [], createdAt: '2026-10-01T00:00:00.000Z', at: '2026-10-01T00:00:00.000Z' };
    calendar.state.set({
      reminders: [
        { ...base, id: 'rfeira0001', title: 'Feira', date: '2026-10-20', time: '08:30' },
        { ...base, id: 'rmercado01', title: 'Mercado grande', date: '2026-11-02' },
        { ...base, id: 'routra0001', title: 'De outra', date: '2026-10-19', notes: ['n-outra'] },
      ],
      removed: {},
    });
    fixture.componentInstance.open(note('n-mercado', 'Mercado'));
    await settle();
    expect(qa('.na-agenda').map(words)).toEqual(['No Calendário: Amanhã, 8h30Feirae mais 1']);
    q<HTMLButtonElement>('.mais-lembretes')!.click();
    await settle();
    expect(qa('.na-agenda .lembrete').map(words)).toEqual(['Feira', 'Mercado grande']);

    const go = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    q<HTMLButtonElement>('.na-agenda .parte-de')!.click();
    expect(go).toHaveBeenCalledWith(['/anotacoes/calendario'], { queryParams: { vista: 'dia', dia: '2026-10-20' } });
  });
});
