import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideLocationMocks } from '@angular/common/testing';
import { provideRouter } from '@angular/router';
import { Colleague, ColleagueStore } from '../core/colleague-store';
import { Mural } from '../core/mural';
import { Kind, Review, sanitizeReview } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { VisitView } from '../core/visit-view';
import { Density, VISIT_KEY, WallState, WallView } from '../core/wall-view';
import { WallMotion } from '../core/wall-motion';
import { WallAccess, WallBoard } from './wall-board';

/** Termina já o fechar que ainda está juntando as fichas (ver WallMotion.fold) e desenha. */
const done = () => {
  TestBed.inject(WallMotion).finish();
  TestBed.tick();
};

const ACCESS: WallAccess = { landingId: null, picking: false, picked: new Map(), masked: false, secret: new Set(), reactCode: null, checkable: true, looks: {} };

/** A parede montada como na visita: a mesma peça sobre a vista de quem se visita. */
@Component({
  imports: [WallBoard],
  providers: [VisitView, { provide: WallState, useExisting: VisitView }],
  template: `<app-wall-board [access]="access" />`,
})
class VisitWall {
  readonly access = ACCESS;
}

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
    const row = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('.cabeca-secao')!;
    const before = row.getBoundingClientRect().height;
    row.setAttribute('data-marcada', '');
    row.style.setProperty('--marca-n', '1');
    expect(row.getBoundingClientRect().height).toBe(before);
  });
});

/**
 * A seção que fecha (PLANO-ETIQUETAS.md): a cabeça de giz fica no lugar e as fichas viram a pilha, com a
 * primeira ficha da seção em cima (a mesma da parede) e as folhas das seguintes atrás.
 */
describe('a seção fechada vira uma pilha', () => {
  afterEach(() => {
    document.querySelectorAll('app-wall-board').forEach((e) => e.remove());
    localStorage.clear();
  });

  const game = (id: string, day: string, stock: string) =>
    sanitizeReview({
      id,
      kind: 'jogos',
      game: { name: `Jogo ${id}`, coverUrl: null, source: 'manual' },
      scores: { final: 8, ...SCORES['jogos'] },
      status: 'finalizado',
      stock,
      completedAt: day,
      createdAt: `${day}T10:00:00.000Z`,
      updatedAt: `${day}T10:00:00.000Z`,
    })!;

  /** Outubro com seis jogos, Novembro com um e Setembro com dois; `closed` são as chaves fechadas guardadas. */
  async function wall(density: Density, closed: string[]): Promise<HTMLElement> {
    localStorage.clear();
    localStorage.setItem('mural-de-jogos:vista:v1', JSON.stringify({ sort: 'data', direction: 'desc', density, collapsed: closed }));
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const store = TestBed.inject(ReviewStore);
    store.add(game('rpil0001', '2026-11-02', 'azul'));
    const stocks = ['rosa', 'verde', 'laranja', 'lilas', 'amarelo', 'cinza'];
    stocks.forEach((s, i) => store.add(game(`rpil001${i}`, `2026-10-${String(20 - i).padStart(2, '0')}`, s)));
    store.add(game('rpil0020', '2026-09-12', 'azul'));
    store.add(game('rpil0021', '2026-09-10', 'verde'));
    TestBed.inject(Mural).kind.set('jogos');
    const fixture = TestBed.createComponent(WallBoard);
    fixture.componentRef.setInput('access', ACCESS);
    document.body.appendChild(fixture.nativeElement);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  const section = (el: HTMLElement, label: string) =>
    Array.from(el.querySelectorAll<HTMLElement>('section.grupo')).find((s) => s.querySelector('.nome')?.textContent === label)!;

  it('aberta: a cabeça com o nome, quantas são e a média, e as fichas', async () => {
    const el = await wall('completa', []);
    const out = section(el, 'Outubro de 2026');
    expect(out.querySelector('.n')!.textContent!.trim()).toBe('6');
    expect(out.querySelector('.detalhe')!.textContent).toBe('média 8,0');
    expect(out.querySelector('.cabeca-secao')!.getAttribute('aria-expanded')).toBe('true');
    expect(out.querySelector('.fichas')).not.toBeNull();
    expect(out.querySelector('.guardadas')).toBeNull();
  });

  it('fechada: a primeira ficha em cima e as quatro seguintes atrás, só a cor; a seção não toma a fileira', async () => {
    const el = await wall('completa', ['k:jogos::2026-10']);
    const out = section(el, 'Outubro de 2026');
    expect(out.classList).toContain('fechada');
    expect(out.querySelector('.cabeca-secao')!.getAttribute('aria-expanded')).toBe('false');
    expect(out.querySelector('.fichas')).toBeNull();
    const pile = out.querySelector<HTMLElement>('.guardadas')!;
    // a ficha de cima é a mesma da parede, e não se usa (a pilha inteira abre)
    for (let i = 0; i < 100 && !pile.querySelector('app-review-card'); i++) await new Promise((r) => setTimeout(r, 20));
    expect(pile.querySelector('app-review-card')!.getAttribute('data-ficha')).toBe('rpil0010');
    expect(pile.querySelector('.pilha-ficha')!.hasAttribute('inert')).toBeTrue();
    expect(pile.getAttribute('aria-hidden')).toBe('true');
    // atrás, a mais longe primeiro: a quinta, a quarta, a terceira e a segunda
    const back = Array.from(pile.querySelectorAll<HTMLElement>('.folha'));
    expect(back.map((f) => f.dataset['cor'])).toEqual(['amarelo', 'lilas', 'laranja', 'verde']);
    expect(back.map((f) => f.style.getPropertyValue('--k'))).toEqual(['4', '3', '2', '1']);
    // a seção fechada é do tamanho de uma ficha, do lado da de Novembro
    const nov = section(el, 'Novembro de 2026');
    if (innerWidth > 559) expect(Math.round(out.getBoundingClientRect().top)).toBe(Math.round(nov.getBoundingClientRect().top));
    // tocar na pilha abre
    pile.click();
    await new Promise((r) => setTimeout(r, 0));
    done();
    expect(out.querySelector('.fichas')).not.toBeNull();
    expect(out.querySelector('.guardadas')).toBeNull();
  });

  it('a cabeça fecha e abre, e não sai do lugar', async () => {
    const el = await wall('simples', []);
    const out = section(el, 'Outubro de 2026');
    const button = out.querySelector<HTMLElement>('.cabeca-secao')!;
    // (medido a partir da parede: o foco pode rolar a página da suíte)
    const at = () => button.getBoundingClientRect().top - el.getBoundingClientRect().top;
    const top = at();
    button.focus();
    button.click();
    done();
    expect(out.classList).toContain('fechada');
    expect(out.querySelector('.guardadas')).not.toBeNull();
    // o mesmo botão, no mesmo lugar, com o foco
    expect(out.querySelector('.cabeca-secao')).toBe(button);
    expect(at()).toBe(top);
    expect(document.activeElement).toBe(button);
  });

  it('a seção de uma ficha nunca fecha: sem seta, e a chave guardada fica', async () => {
    const el = await wall('completa', ['k:jogos::2026-11']);
    const nov = section(el, 'Novembro de 2026');
    expect(nov.classList).not.toContain('fechada');
    expect(nov.querySelector('.guardadas')).toBeNull();
    expect(nov.querySelector('.fichas')).not.toBeNull();
    // a cabeça é texto: nem botão, nem seta
    expect(nov.querySelector('button.cabeca-secao')).toBeNull();
    expect(nov.querySelector('span.cabeca-secao')).not.toBeNull();
    expect(nov.querySelector('.seta')).toBeNull();
    expect(TestBed.inject(WallView).collapsed().has('k:jogos::2026-11')).toBeTrue();
  });

  it('Alt + clique na cabeça fecha as outras e deixa esta aberta', async () => {
    const el = await wall('simples', ['k:jogos::2026-09']);
    const head = (label: string) => section(el, label).querySelector<HTMLElement>('button.cabeca-secao')!;
    head('Setembro de 2026').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, altKey: true }));
    done();
    expect(section(el, 'Setembro de 2026').classList).not.toContain('fechada');
    expect(section(el, 'Outubro de 2026').classList).toContain('fechada');
    // a de uma ficha não fecha
    expect(section(el, 'Novembro de 2026').classList).not.toContain('fechada');
    // de novo, nada muda: esta continua aberta
    head('Setembro de 2026').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, altKey: true }));
    done();
    expect(section(el, 'Setembro de 2026').classList).not.toContain('fechada');
    expect(section(el, 'Outubro de 2026').classList).toContain('fechada');
  });

  describe('o menu do botão direito', () => {
    const openMenu = (el: HTMLElement) => Array.from(el.querySelectorAll<HTMLElement>('.menu-contexto')).find((m) => m.matches(':popover-open'));
    // o menu que ficou aberto fecha (o site tem um menu aberto por vez: um esquecido aqui atrapalharia o próximo teste)
    afterEach(() => openMenu(document.body)?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));

    /** O botão direito em `target`: as opções do menu que abriu (vazio: ficou o do navegador). */
    async function rightClick(el: HTMLElement, target: HTMLElement): Promise<string[]> {
      const r = target.getBoundingClientRect();
      const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: r.left + 5, clientY: r.top + 5 });
      target.dispatchEvent(e);
      await new Promise((ok) => setTimeout(ok, 0));
      done();
      const menu = openMenu(el);
      if (!e.defaultPrevented || !menu) return [];
      return Array.from(menu.querySelectorAll('.escolha .nome')).map((x) => x.textContent!.trim());
    }

    const choose = (el: HTMLElement, label: string) => {
      Array.from(openMenu(el)!.querySelectorAll<HTMLElement>('.escolha')).find((b) => b.querySelector('.nome')!.textContent!.trim() === label)!.click();
      done();
    };

    it('na cabeça: só o que faz sentido, com o nome da seção no alto', async () => {
      const el = await wall('completa', []);
      const head = (label: string) => section(el, label).querySelector<HTMLElement>('.cabeca-secao')!;
      expect(await rightClick(el, head('Outubro de 2026'))).toEqual(['Fechar esta seção', 'Fechar as outras', 'Fechar todas']);
      expect(openMenu(el)!.querySelector('.legenda')!.textContent).toContain('Outubro de 2026');
      // o atalho do Fechar as outras: Alt + clique
      expect(openMenu(el)!.querySelector('[data-k="so-esta"] .atalho')!.textContent).toBe('Alt+clique');
      choose(el, 'Fechar todas');
      expect(section(el, 'Outubro de 2026').classList).toContain('fechada');
      expect(section(el, 'Setembro de 2026').classList).toContain('fechada');
      // a de uma ficha não fecha, mas o menu dela fala das outras
      expect(await rightClick(el, head('Novembro de 2026'))).toEqual(['Abrir todas']);
      choose(el, 'Abrir todas');
      expect(section(el, 'Outubro de 2026').classList).not.toContain('fechada');
      expect(section(el, 'Setembro de 2026').classList).not.toContain('fechada');
      expect(await rightClick(el, head('Novembro de 2026'))).toEqual(['Fechar as outras', 'Fechar todas']);
    });

    it('na pilha: abrir esta, e fechar as outras deixa esta aberta', async () => {
      const el = await wall('completa', ['k:jogos::2026-10']);
      const pile = section(el, 'Outubro de 2026').querySelector<HTMLElement>('.guardadas')!;
      expect(await rightClick(el, pile)).toEqual(['Abrir esta seção', 'Fechar as outras', 'Abrir todas', 'Fechar todas']);
      choose(el, 'Fechar as outras');
      expect(section(el, 'Outubro de 2026').classList).not.toContain('fechada');
      expect(section(el, 'Setembro de 2026').classList).toContain('fechada');
    });

    it('na visita: o mesmo menu e o mesmo Alt + clique, sem guardar nada', async () => {
      localStorage.clear();
      const reviews: Review[] = [
        game('rvis0001', '2026-11-02', 'azul'),
        game('rvis0010', '2026-10-12', 'rosa'),
        game('rvis0011', '2026-10-10', 'verde'),
        game('rvis0020', '2026-09-12', 'lilas'),
        game('rvis0021', '2026-09-10', 'amarelo'),
      ];
      const marina = { id: 'Marina', name: 'Marina', fileName: '', loadedAt: '2026-11-01T00:00:00Z', reviews, exportedAt: null, skipped: 0, ownerName: null } as unknown as Colleague;
      TestBed.configureTestingModule({
        providers: [provideZonelessChangeDetection(), provideRouter([]), provideLocationMocks(), { provide: ColleagueStore, useValue: { selected: signal<Colleague | null>(marina) } }],
      });
      TestBed.inject(Mural).kind.set('jogos');
      const fixture = TestBed.createComponent(VisitWall);
      const el = fixture.nativeElement as HTMLElement;
      document.body.appendChild(el);
      await fixture.whenStable();
      const visit = fixture.debugElement.injector.get(VisitView);
      visit.setSort('data');
      await fixture.whenStable();
      const head = (label: string) => section(el, label).querySelector<HTMLElement>('.cabeca-secao')!;
      // a de uma ficha não fecha, como no seu mural
      expect(section(el, 'Novembro de 2026').querySelector('button.cabeca-secao')).toBeNull();
      expect(await rightClick(el, head('Outubro de 2026'))).toEqual(['Fechar esta seção', 'Fechar as outras', 'Fechar todas']);
      choose(el, 'Fechar todas');
      expect(section(el, 'Outubro de 2026').classList).toContain('fechada');
      expect(section(el, 'Setembro de 2026').classList).toContain('fechada');
      head('Setembro de 2026').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, altKey: true }));
      done();
      expect(section(el, 'Setembro de 2026').classList).not.toContain('fechada');
      expect(section(el, 'Outubro de 2026').classList).toContain('fechada');
      // o seu mural não mudou, e nada ficou guardado
      expect(TestBed.inject(WallView).collapsed().size).toBe(0);
      done();
      expect(JSON.parse(localStorage.getItem(VISIT_KEY) ?? '{}').collapsed).toBeUndefined();
      el.remove();
    });

    it('sem nada que fazer, fica o menu do navegador', async () => {
      localStorage.clear();
      localStorage.setItem('mural-de-jogos:vista:v1', JSON.stringify({ sort: 'data', direction: 'desc', density: 'completa' }));
      TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
      const store = TestBed.inject(ReviewStore);
      store.add(game('rpil0030', '2026-11-02', 'azul'));
      store.add(game('rpil0031', '2026-10-02', 'rosa'));
      TestBed.inject(Mural).kind.set('jogos');
      const fixture = TestBed.createComponent(WallBoard);
      fixture.componentRef.setInput('access', ACCESS);
      document.body.appendChild(fixture.nativeElement);
      await fixture.whenStable();
      const el = fixture.nativeElement as HTMLElement;
      expect(await rightClick(el, section(el, 'Novembro de 2026').querySelector<HTMLElement>('.cabeca-secao')!)).toEqual([]);
    });
  });

  describe('as animações (PLANO-ETIQUETAS.md, 5)', () => {
    const boxes = (out: HTMLElement) => Array.from(out.querySelectorAll<HTMLElement>('.fichas > .lugar'));
    const shown = (b: HTMLElement) => {
      const r = b.getBoundingClientRect();
      return r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
    };
    const flying = (box: HTMLElement) => box.getAnimations().some((a) => JSON.stringify((a.effect as KeyframeEffect).getKeyframes()).includes('translate'));

    it('fechar: as fichas da tela andam juntas até a pilha e só então a seção fecha', async () => {
      const el = await wall('simples', []);
      const out = section(el, 'Outubro de 2026');
      out.scrollIntoView({ block: 'start' });
      for (let i = 0; i < 100 && boxes(out).filter((b) => b.querySelector('app-review-card:not([data-veu])')).length < 6; i++) await new Promise((r) => setTimeout(r, 20));
      out.querySelector<HTMLElement>('.cabeca-secao')!.click();
      TestBed.tick();
      // ainda aberta: as primeiras da tela (até cinco) andando, por cima das outras (a primeira por cima de todas);
      // as outras da tela esmaecem, e as de fora dela não se mexem
      expect(out.classList).not.toContain('fechada');
      const onScreen = boxes(out).filter(shown);
      const movers = onScreen.slice(0, 5);
      expect(movers.length).toBeGreaterThan(1);
      expect(movers.every(flying)).toBeTrue();
      expect(movers.map((b) => b.style.zIndex)).toEqual(['6', '5', '4', '3', '2'].slice(0, movers.length));
      for (const b of onScreen.slice(5)) expect(flying(b)).toBeFalse();
      for (const b of boxes(out).filter((x) => !shown(x))) expect(b.getAnimations().length).toBe(0);
      // chegou: fecha, e nada fica para trás nas fichas
      await new Promise((r) => setTimeout(r, 450));
      TestBed.tick();
      expect(out.classList).toContain('fechada');
      expect(out.querySelector('.guardadas')).not.toBeNull();
      expect(Array.from(el.querySelectorAll<HTMLElement>('.lugar')).filter((b) => b.style.zIndex || b.style.transformOrigin)).toEqual([]);
    });

    it('abrir: as primeiras saem da pilha uma depois da outra', async () => {
      const el = await wall('simples', []);
      const out = section(el, 'Outubro de 2026');
      out.scrollIntoView({ block: 'start' });
      for (let i = 0; i < 100 && boxes(out).filter((b) => b.querySelector('app-review-card:not([data-veu])')).length < 6; i++) await new Promise((r) => setTimeout(r, 20));
      out.querySelector<HTMLElement>('.cabeca-secao')!.click();
      done();
      expect(out.classList).toContain('fechada');
      out.querySelector<HTMLElement>('.guardadas')!.click();
      TestBed.tick();
      expect(out.classList).not.toContain('fechada');
      // (a que ainda espera o papel sai quando ele fica pronto)
      const out5 = boxes(out).filter(shown).slice(0, 5);
      expect(out5.length).toBeGreaterThan(1);
      const delays = new Map<number, number>();
      for (let i = 0; i < 200 && delays.size < out5.length; i++) {
        out5.forEach((b, n) => {
          const a = b.getAnimations().find((x) => JSON.stringify((x.effect as KeyframeEffect).getKeyframes()).includes('translate'));
          if (a && !delays.has(n)) delays.set(n, (a.effect as KeyframeEffect).getTiming().delay as number);
        });
        await new Promise((r) => setTimeout(r, 10));
      }
      expect(delays.size).toBe(out5.length);
      // cada uma sai depois da anterior
      for (let n = 1; n < out5.length; n++) expect(delays.get(n)!).toBeGreaterThan(delays.get(n - 1)!);
      // as de fora da tela não saem da pilha
      for (const b of boxes(out).filter((x) => !shown(x))) expect(flying(b)).toBeFalse();
    });

    it('com Movimento reduzido, troca direto', async () => {
      const el = await wall('simples', []);
      const real = window.matchMedia.bind(window);
      spyOn(window, 'matchMedia').and.callFake((q: string) => (q.includes('reduced-motion') ? ({ matches: true } as MediaQueryList) : real(q)));
      const out = section(el, 'Outubro de 2026');
      out.querySelector<HTMLElement>('.cabeca-secao')!.click();
      TestBed.tick();
      expect(out.classList).toContain('fechada');
      expect(Array.from(el.querySelectorAll<HTMLElement>('.lugar')).some(flying)).toBeFalse();
    });

    it('um segundo clique no meio do fechar termina o primeiro e vale', async () => {
      const el = await wall('simples', []);
      const out = section(el, 'Outubro de 2026');
      out.scrollIntoView({ block: 'start' });
      const button = out.querySelector<HTMLElement>('.cabeca-secao')!;
      button.click();
      TestBed.tick();
      button.click();
      done();
      expect(out.classList).not.toContain('fechada');
      expect(TestBed.inject(WallView).isCollapsed('2026-10')).toBeFalse();
    });
  });

  it('na lista, a fechada fica só a cabeça', async () => {
    localStorage.clear();
    const v = { sort: 'criacao', direction: 'desc', density: 'lista' };
    localStorage.setItem('mural-de-jogos:vista:v1', JSON.stringify({ noteViews: { '': v }, collapsed: ['::2026-10'] }));
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const store = TestBed.inject(ReviewStore);
    for (const [id, day] of [['nlis0001', '2026-10-03'], ['nlis0002', '2026-10-02'], ['nlis0003', '2026-09-02']]) {
      store.add(sanitizeReview({ id, kind: 'anotacoes', game: { name: id, coverUrl: null, source: 'manual' }, scores: { final: 0 }, status: 'finalizado', createdAt: `${day}T10:00:00.000Z`, updatedAt: `${day}T10:00:00.000Z` })!);
    }
    TestBed.inject(Mural).kind.set('anotacoes');
    const fixture = TestBed.createComponent(WallBoard);
    fixture.componentRef.setInput('access', ACCESS);
    document.body.appendChild(fixture.nativeElement);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const out = section(el, 'Outubro de 2026');
    expect(out.classList).toContain('fechada');
    expect(out.querySelector('app-note-index')).toBeNull();
    expect(out.querySelector('.guardadas')).toBeNull();
    expect(section(el, 'Setembro de 2026').querySelector('app-note-index')).not.toBeNull();
  });
});
