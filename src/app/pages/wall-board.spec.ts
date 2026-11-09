import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Mural } from '../core/mural';
import { Kind, sanitizeReview } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { Density, WallView } from '../core/wall-view';
import { WallAccess, WallBoard } from './wall-board';

const ACCESS: WallAccess = { landingId: null, picking: false, picked: new Map(), masked: false, secret: new Set(), reactCode: null, checkable: true, looks: {} };

const SCORES: Record<string, Record<string, number>> = {
  jogos: { diversao: 8, historia: 8, jogabilidade: 8, visual: 8 },
  musicas: { envolvimento: 9, letra: 9, vocal: 9, instrumental: 9 },
  anotacoes: { final: 0 },
};

/** As fichas com orelha (a categoria da anotação, o artista da música): a seção abre lugar para ela no alto. */
describe('a parede abre lugar para as orelhas', () => {
  afterEach(() => {
    document.querySelectorAll('app-wall-board').forEach((e) => e.remove());
    localStorage.clear();
  });

  async function wall(kind: Kind): Promise<HTMLElement> {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    TestBed.inject(ReviewStore).add(
      sanitizeReview({
        id: 'rorel001',
        kind,
        game: { name: 'Uma ficha', coverUrl: null, source: 'manual' },
        category: 'Radiohead',
        scores: SCORES[kind],
        status: 'finalizado',
        stock: 'azul',
        completedAt: '2026-10-02',
        createdAt: '2026-10-02T10:00:00.000Z',
        updatedAt: '2026-10-02T10:00:00.000Z',
      })!,
    );
    TestBed.inject(Mural).kind.set(kind);
    const fixture = TestBed.createComponent(WallBoard);
    fixture.componentRef.setInput('access', ACCESS);
    document.body.appendChild(fixture.nativeElement);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  for (const [kind, room] of [['musicas', 18], ['anotacoes', 18], ['jogos', 0]] as const) {
    it(`${kind}: ${room ? 'a primeira fileira desce para a orelha' : 'sem orelha, nada muda'}`, async () => {
      const el = await wall(kind);
      const board = el.querySelector('.wall')!;
      expect(board.classList.contains('com-orelhas')).toBe(room > 0);
      // a 1300px de tela (o Karma abre largo): a ficha completa
      if (innerWidth > 559) expect(parseFloat(getComputedStyle(board.querySelector('.fichas')!).paddingTop)).toBe(room);
    });
  }
});

/** O id de cada seção vem da chave dela (WallMotion e os aria-* dependem dele): chaves diferentes, ids diferentes. */
describe('o id da seção', () => {
  it('nunca é o mesmo para duas chaves diferentes', () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const board = TestBed.createComponent(WallBoard).componentInstance as unknown as { idOf(key: string): string };
    const keys = ['c:x', 'c_3ax', 'c_3a_x', ':b', 'Ϋ', 'a b', 'a_20b', 'Ação 🎮', 'abc-1'];
    const ids = keys.map((k) => board.idOf(k));
    expect(new Set(ids).size).toBe(keys.length);
    for (const id of ids) expect(id).toMatch(/^[a-zA-Z0-9_-]+$/);
    // o que já é seguro fica igual
    expect(board.idOf('abc-1')).toBe('abc-1');
  });
});

/**
 * As vistas do mural de anotações: a Visão geral (a Simples daqui), a Lista em colunas e, com um grupo
 * aberto, a orelha do assunto; as setas andam entre as fichas e as linhas.
 */
describe('as vistas do mural de anotações', () => {
  afterEach(() => {
    document.querySelectorAll('app-wall-board').forEach((e) => e.remove());
    localStorage.clear();
  });

  const note = (id: string, name: string, subject: string | null, day: string) =>
    sanitizeReview({
      id,
      kind: 'anotacoes',
      game: { name, coverUrl: null, source: 'manual' },
      category: 'Trabalho',
      subject,
      scores: SCORES['anotacoes'],
      status: 'finalizado',
      stock: 'azul',
      completedAt: day,
      createdAt: `${day}T10:00:00.000Z`,
      updatedAt: `${day}T10:00:00.000Z`,
    })!;

  async function wall(density: Density, tab: string): Promise<HTMLElement> {
    localStorage.clear();
    const v = { sort: 'data', direction: 'desc', density };
    localStorage.setItem('mural-de-jogos:vista:v1', JSON.stringify({ noteViews: { '': v, [tab]: v }, noteTab: tab }));
    // o Tudo em pé (sem o olho, ele fica no Mais)
    localStorage.setItem('mural-de-jogos:config:v1', JSON.stringify({ notesConfig: { showAll: true } }));
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const store = TestBed.inject(ReviewStore);
    store.add(note('nvis0001', 'Daily de segunda', 'Dailys', '2026-10-03'));
    store.add(note('nvis0002', 'Daily de terça', 'Dailys', '2026-10-02'));
    store.add(note('nvis0003', 'Planejar a sprint', null, '2026-10-01'));
    store.add({ ...note('nvis0004', 'Receitas', null, '2026-09-30'), category: 'Casa' });
    TestBed.inject(Mural).kind.set('anotacoes');
    const fixture = TestBed.createComponent(WallBoard);
    fixture.componentRef.setInput('access', ACCESS);
    document.body.appendChild(fixture.nativeElement);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  /**
   * As fichas da parede são montadas aos poucos e ficam veladas até o papel ficar pronto (ver
   * wall-cards.ts e ui/veil.ts): espera até haver estas, à mostra.
   */
  async function cards(el: HTMLElement, n: number): Promise<HTMLElement[]> {
    for (let i = 0; i < 150; i++) {
      const all = Array.from(el.querySelectorAll<HTMLElement>('app-review-card'));
      if (all.length >= n && all.every((c) => !c.hasAttribute('data-veu'))) return all;
      await new Promise((r) => setTimeout(r, 20));
    }
    return Array.from(el.querySelectorAll<HTMLElement>('app-review-card'));
  }

  it('a Visão geral: fichas de relance, a orelha do grupo em Tudo; num grupo, a pasta antes das soltas', async () => {
    let el = await wall('simples', '');
    expect(el.querySelector('.wall')!.classList).toContain('geral');
    let all = await cards(el, 4);
    expect(all.length).toBe(4);
    expect(all.every((c) => c.classList.contains('geral'))).toBeTrue();
    expect(all.map((c) => c.querySelector('.aba-cat .nome')?.textContent?.trim())).toEqual(['Trabalho', 'Trabalho', 'Trabalho', 'Casa']);
    el.remove();
    TestBed.resetTestingModule();
    el = await wall('simples', 'c:trabalho');
    all = await cards(el, 1);
    // as duas do assunto Dailys estão na pasta: na parede, a pasta e a solta
    expect(all.map((c) => c.querySelector('.aba-cat .nome')?.textContent?.trim() ?? null)).toEqual([null]);
    const pastas = Array.from(el.querySelectorAll('app-folder-card'));
    expect(pastas.map((p) => p.querySelector('.nome')!.textContent!.trim())).toEqual(['Dailys']);
    expect(pastas[0].querySelector('.qtd')!.textContent!.trim()).toBe('2 notas');
    // as duas espiam pela boca em miniatura: sem capa, a cartolina com o título; de papel, sem o plástico
    expect(pastas[0].querySelectorAll('.boca .espia').length).toBe(2);
    expect(pastas[0].querySelectorAll('.boca app-mini-cartolina').length).toBe(2);
    expect(pastas[0].querySelector('app-cover-sleeve')).toBeNull();
  });

  it('procurando num grupo, a parede deixa as pastas e a orelha diz a pasta de cada anotação', async () => {
    const el = await wall('simples', 'c:trabalho');
    TestBed.inject(WallView).query.set('daily');
    const all = await cards(el, 2);
    expect(el.querySelector('app-folder-card')).toBeNull();
    expect(all.map((c) => c.querySelector('.aba-cat .nome')?.textContent?.trim() ?? null)).toEqual(['Dailys', 'Dailys']);
  });

  it('a lista: a orelhinha diz o grupo em Tudo; num grupo, as mesmas pastas no começo; sem as tags', async () => {
    let el = await wall('lista', '');
    const ears = () => Array.from(el.querySelectorAll('.linha')).map((l) => l.querySelector('.orelha .nome')?.textContent?.trim() ?? null);
    expect(ears()).toEqual(['Trabalho', 'Trabalho', 'Trabalho', 'Casa']);
    expect(el.querySelector('.linha .tags')).toBeNull();
    el.remove();
    TestBed.resetTestingModule();
    el = await wall('lista', 'c:trabalho');
    expect(ears()).toEqual([null]);
    const pastas = Array.from(el.querySelectorAll('.pastas-lista app-folder-card'));
    expect(pastas.map((r) => r.querySelector('.pasta .nome')!.textContent!.trim())).toEqual(['Dailys']);
  });

  it('a pasta é a mesma em todas as vistas; nas inteiras, fica em cima e as fichas começam embaixo dela', async () => {
    const sizes: string[] = [];
    for (const density of ['completa', 'inteira', 'simples', 'lista'] as const) {
      const el = await wall(density, 'c:trabalho');
      el.style.cssText = 'display: block; width: 1400px';
      await cards(el, 1);
      const pasta = el.querySelector<HTMLElement>('app-folder-card .pasta')!;
      // o tamanho sem o giro (a caixa girada mede um tico mais)
      sizes.push(`${pasta.offsetWidth}x${pasta.offsetHeight}`);
      if (density === 'inteira') {
        // a pasta tem a fileira dela: nenhuma ficha começa por cima do pé da pasta
        const bottom = el.querySelector('.pastas')!.getBoundingClientRect().bottom;
        const tops = Array.from(el.querySelectorAll('.lugar')).map((l) => l.getBoundingClientRect().top);
        expect(tops.length).toBeGreaterThan(0);
        expect(tops.every((t) => t >= bottom)).withContext(`pé da pasta ${bottom}, fichas ${tops}`).toBeTrue();
      }
      el.remove();
      TestBed.resetTestingModule();
    }
    // oito por fileira numa parede larga
    expect(new Set(sizes).size).withContext(sizes.join(', ')).toBe(1);
    expect(parseInt(sizes[0], 10)).toBeCloseTo((1400 - 7 * 22) / 8, -0.5);
  });

  it('as setas andam entre as linhas da lista (para baixo, na ordem; End, a última)', async () => {
    const el = await wall('lista', '');
    const hits = Array.from(el.querySelectorAll<HTMLButtonElement>('.linha .hit'));
    hits[0].focus();
    hits[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(hits[1]);
    hits[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(hits[3]);
    // com Ctrl, a tecla é de outro atalho
    const ctrl = new KeyboardEvent('keydown', { key: 'Home', ctrlKey: true, bubbles: true, cancelable: true });
    hits[3].dispatchEvent(ctrl);
    expect(document.activeElement).toBe(hits[3]);
    expect(ctrl.defaultPrevented).toBeFalse();
  });

  it('as setas andam entre as fichas da Visão geral (para o lado, na ordem)', async () => {
    const el = await wall('simples', '');
    await cards(el, 4);
    const hits = Array.from(el.querySelectorAll<HTMLButtonElement>('.lugar[data-lugar] .hit'));
    hits[0].focus();
    hits[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(hits[1]);
    hits[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(hits[0]);
  });
});

describe('a linha marcada da lista', () => {
  afterEach(() => {
    document.querySelectorAll('app-wall-board').forEach((e) => e.remove());
    localStorage.clear();
  });

  it('o adesivo da ordem fica no fim da linha, sem descer para uma segunda fileira', async () => {
    localStorage.clear();
    const v = { sort: 'data', direction: 'desc', density: 'lista' };
    localStorage.setItem('mural-de-jogos:vista:v1', JSON.stringify({ noteViews: { '': v }, noteTab: '' }));
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    TestBed.inject(ReviewStore).add(
      sanitizeReview({ id: 'nmarc001', kind: 'anotacoes', game: { name: 'Uma', coverUrl: null, source: 'manual' }, category: 'Trabalho', scores: SCORES['anotacoes'], status: 'finalizado', completedAt: '2026-10-02', createdAt: '2026-10-02T10:00:00.000Z' })!,
    );
    TestBed.inject(Mural).kind.set('anotacoes');
    const fixture = TestBed.createComponent(WallBoard);
    fixture.componentRef.setInput('access', ACCESS);
    document.body.appendChild(fixture.nativeElement);
    await fixture.whenStable();
    const row = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('.linha')!;
    const before = row.getBoundingClientRect().height;
    row.setAttribute('data-marcada', '');
    row.style.setProperty('--marca-n', '1');
    expect(row.getBoundingClientRect().height).toBe(before);
  });
});
