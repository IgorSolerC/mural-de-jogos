import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Review, sanitizeReview } from '../core/review';
import { Desk } from '../core/desk';
import { ReviewStore } from '../core/review-store';
import { StudyStore } from '../core/study-store';
import { DrillPlan, drillPool } from '../core/study-drill';
import { BOUNCE_MS, DRILL_UNDO_MAX, StudySession, TURN_MS } from './study-session';
import { GROW_MAX } from './grow-to-fit';

/** A sessão de estudo (PLANO-ESTUDOS.md, 6.7): a carta, virar, Errei e Acertei, as teclas, o Desfazer e o fim. */

@Component({
  imports: [StudySession],
  template: `@if (open()) {
    <app-study-session [deck]="deck()" [group]="group()" [drill]="drill()" (closed)="open.set(false)" (all)="deck.set(null)" (groupAll)="deck.set(null); group.set($event)" />
  }`,
})
class Host {
  readonly open = signal(true);
  readonly deck = signal<string | null>(null);
  readonly group = signal<string | null>(null);
  readonly drill = signal<DrillPlan | null>(null);
}

const T0 = '2026-10-01T10:00:00.000Z';
const note = (id: string, name: string, extra: Record<string, unknown> = {}): Review => ({ ...sanitizeReview({ kind: 'anotacoes', category: 'Estudos', game: { name }, completedAt: '2026-10-01', createdAt: T0, ...extra })!, id });

describe('a sessão de estudo (ui/study-session.ts)', () => {
  let fixture: ComponentFixture<Host>;
  let study: StudyStore;
  let kanji: string;
  let bio: string;

  async function settle(): Promise<void> {
    for (let i = 0; i < 4; i++) {
      await new Promise((r) => setTimeout(r, 0));
      fixture.detectChanges();
      await fixture.whenStable();
    }
  }
  const dialog = () => document.querySelector<HTMLDialogElement>('dialog.sessao');
  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => dialog()?.querySelector<T>(sel) ?? null;
  const text = (el: Element | null) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const key = (k: string, extra: KeyboardEventInit = {}) => dialog()!.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...extra }));
  const frontTitle = () => text($('.frente app-study-card .titulo'));

  beforeEach(async () => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    TestBed.inject(ReviewStore).reviews.set([
      note('nsol', 'Sol (日)', { text: 'Leitura: nichi.', stock: 'azul', pattern: 'gatinhos', damage: 'rasgado', stains: [{ stain: 'cafe' }] }),
      note('nlua', 'Lua (月)', { text: 'Leitura: getsu.' }),
      note('nbio', 'Mitocôndria', { text: 'Respiração celular.', category: 'Biologia' }),
    ]);
    study = TestBed.inject(StudyStore);
    kanji = study.addDeck('Kanjis', 'amarelo', null, undefined, 'Estudos');
    bio = study.addDeck('Biologia', 'verde', null, undefined, 'Biologia');
    study.addCard('nsol', [kanji], { title: '日' });
    study.addCard('nlua', [kanji], { title: '月' });
    study.addCard('nbio', [bio]);
    fixture = TestBed.createComponent(Host);
    fixture.componentInstance.deck.set(kanji);
    document.body.appendChild(fixture.nativeElement);
    await settle();
  });

  afterEach(() => {
    dialog()?.close();
    fixture.nativeElement.remove();
    localStorage.clear();
  });

  it('abre só com as cartas do baralho escolhido, a frente à mostra e o verso escondido', async () => {
    expect(dialog()?.open).toBeTrue();
    expect(text($('.baralho'))).toBe('Kanjis');
    expect(frontTitle()).toBe('日');
    expect($('.verso')!.hasAttribute('inert')).toBeTrue();
    expect(text($('.mostrar'))).toContain('Mostrar a resposta');
    expect([...dialog()!.querySelectorAll('.monte')].map(text)).toEqual(['2 novos', '0 aprendendo', '0 revisões']);
  });

  it('Espaço vira; o verso é a cartolina da anotação (cor, papel e estampa, sem estrago nem mancha)', async () => {
    key(' ');
    await settle();
    const verso = $('.verso')!;
    expect(verso.hasAttribute('inert')).toBeFalse();
    expect(verso.classList).toContain('cartolina');
    expect(verso.getAttribute('data-cor')).toBe('azul');
    expect(verso.getAttribute('style')).toContain('--estampa');
    // o desenho do papel vai sem o estrago e sem as manchas
    expect(verso.querySelector('app-paper-art .mancha, app-paper-art [class*="estrago"]')).toBeNull();
    expect(text(verso.querySelector('app-rich-text'))).toContain('Leitura: nichi.');
    // embaixo de cada botão, quando a carta voltaria (a nova: 1 min ou 10 min)
    expect(text($('.errei .volta'))).toContain('1 min');
    expect(text($('.acertei .volta'))).toContain('10 min');
  });

  it('1 é Errei, 2 (ou Espaço) é Acertei; a próxima vem, e a resposta fica guardada na hora', async () => {
    key(' ');
    await settle();
    key('2');
    await settle();
    expect(study.cardOf().get('nsol')!.stats).toEqual({ seen: 1, right: 1, wrong: 0, marks: '1' });
    expect(frontTitle()).toBe('月');
    key('Enter');
    await settle();
    key('1');
    await settle();
    expect(study.cardOf().get('nlua')!.stats.wrong).toBe(1);
    // as duas em aprendizado voltam daqui a pouco (dentro dos 20 minutos): a mesa continua com elas
    expect(dialog()!.querySelector('.fim')).toBeNull();
    expect([...dialog()!.querySelectorAll('.monte')].map(text)).toEqual(['0 novos', '2 aprendendo', '0 revisões']);
  });

  it('Desfazer (Z) volta a última resposta e a carta dela, sem virar', async () => {
    key(' ');
    await settle();
    key('2');
    await settle();
    expect(frontTitle()).toBe('月');
    key('z');
    await settle();
    expect(frontTitle()).toBe('日');
    expect($('.verso')!.hasAttribute('inert')).toBeTrue();
    expect(study.cardOf().get('nsol')!.srs.state).toBe('nova');
    expect(study.state().today).toBeNull();
    expect($<HTMLButtonElement>('.desfazer')!.disabled).toBeTrue();
  });

  it('o fim: quantas vistas e acertos, e o Estudar tudo quando outro baralho ainda tem cartas', async () => {
    // as duas formadas de uma vez: Acertei, e de novo depois do passo
    for (let i = 0; i < 6 && !dialog()!.querySelector('.fim'); i++) {
      // o passo de 10 minutos: o relógio da carta anda para agora
      study.state.update((s) => ({ ...s, cards: s.cards.map((c) => (c.srs.state === 'aprendendo' ? { ...c, srs: { ...c.srs, due: new Date(Date.now() - 1000).toISOString() } } : c)) }));
      key(' ');
      await settle();
      key('2');
      await settle();
    }
    expect(text($('.fim h3'))).toBe('Por hoje, é isso.');
    expect(text($('.fim-conta'))).toContain('4 flashcards vistos · acertou 4 (100%)');
    const all = $<HTMLButtonElement>('.fim .papel')!;
    expect(text(all)).toBe('Estudar tudo');
    all.click();
    await settle();
    expect(fixture.componentInstance.deck()).toBeNull();
    expect(text($('.baralho'))).toBe('Tudo');
    expect(frontTitle()).toBe('Mitocôndria');
  });

  it('o fim de um baralho com outro do mesmo grupo por estudar: o resto do grupo vem antes de tudo', async () => {
    TestBed.inject(ReviewStore).reviews.update((list) => [...list, note('ncomer', 'Comer')]);
    const verbos = study.addDeck('Verbos', 'rosa', null, undefined, 'Estudos');
    study.addCard('ncomer', [verbos], { title: '食べる' });
    await settle();
    for (let i = 0; i < 6 && !dialog()!.querySelector('.fim'); i++) {
      study.state.update((s) => ({ ...s, cards: s.cards.map((c) => (c.srs.state === 'aprendendo' ? { ...c, srs: { ...c.srs, due: new Date(Date.now() - 1000).toISOString() } } : c)) }));
      key(' ');
      await settle();
      key('2');
      await settle();
    }
    const rest = $<HTMLButtonElement>('.fim .papel')!;
    expect(text(rest)).toBe('Estudar o resto de Estudos');
    rest.click();
    await settle();
    // a mesa continua, com os baralhos do grupo juntos (o Verbos; a Biologia é de outro grupo)
    expect(fixture.componentInstance.group()).toBe('Estudos');
    expect(text($('.baralho'))).toBe('Estudos');
    expect(frontTitle()).toBe('食べる');
  });

  it('Espaço num botão com o foco é do botão: no Errei escolhido pelo Tab, é Errei', async () => {
    key(' ');
    await settle();
    const errei = $<HTMLButtonElement>('.errei')!;
    errei.focus();
    const ev = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    errei.dispatchEvent(ev);
    // o atalho não toma o Espaço: o navegador aperta o botão com o foco
    expect(ev.defaultPrevented).toBeFalse();
    expect(study.cardOf().get('nsol')!.stats.seen).toBe(0);
    errei.click();
    await settle();
    expect(study.cardOf().get('nsol')!.stats.wrong).toBe(1);
  });

  describe('a rolagem do verso', () => {
    const long = Array.from({ length: 60 }, (_, i) => `Linha ${i + 1}`).join('\n');
    const scroller = () => $('.verso-conteudo')!;

    beforeEach(async () => {
      TestBed.inject(ReviewStore).reviews.update((list) => list.map((r) => (r.id === 'nsol' || r.id === 'nlua' ? { ...r, text: long } : r)));
      $('.giro')!.style.setProperty('--w', '380px');
      await settle();
    });

    /** Vira a carta na mesa, confere que abriu do começo e rola até o fim. */
    async function revealAndScroll(): Promise<void> {
      key(' ');
      await settle();
      expect(scroller().scrollTop).toBe(0);
      scroller().scrollTop = 99999;
      expect(scroller().scrollTop).toBeGreaterThan(0);
    }

    it('a resposta da próxima carta abre do começo, não onde a anterior parou', async () => {
      await revealAndScroll();
      key('2');
      await settle();
      expect(frontTitle()).toBe('月');
      await revealAndScroll();
    });

    it('a mesma carta de volta (o Desfazer) também abre do começo', async () => {
      await revealAndScroll();
      key('2');
      await settle();
      key('z');
      await settle();
      expect(frontTitle()).toBe('日');
      await revealAndScroll();
    });
  });

  describe('o clique rápido', () => {
    const versoTitle = () => text($('.verso-titulo'));
    /** O clique do mouse ou do dedo (`detail` 1), no instante dado do relógio dos eventos. */
    const press = (el: HTMLElement, at: number) => {
      const ev = new MouseEvent('click', { bubbles: true, detail: 1 });
      Object.defineProperty(ev, 'timeStamp', { value: at });
      el.dispatchEvent(ev);
    };
    /** Segura o relógio da mesa desvirando: quem solta é o teste, por mais lenta que a máquina esteja. */
    function holdTurn(): { release: () => void } {
      const real = window.setTimeout.bind(window) as (fn: () => void, ms?: number) => number;
      const held: (() => void)[] = [];
      spyOn(window, 'setTimeout').and.callFake(((fn: () => void, ms?: number) => {
        if (ms !== TURN_MS) return real(fn, ms);
        held.push(fn);
        return 0;
      }) as typeof window.setTimeout);
      return { release: () => held.splice(0).forEach((fn) => fn()) };
    }

    it('o verso espera o tempo do giro: TURN_MS é o transition do .giro', () => {
      expect(parseFloat(getComputedStyle($('.giro')!).transitionDuration) * 1000).toBe(TURN_MS);
    });

    it('enquanto a mesa desvira, a resposta nas costas ainda é a da carta respondida, nunca a da próxima', async () => {
      const turn = holdTurn();
      key(' ');
      await settle();
      key('2');
      await settle();
      expect(frontTitle()).toBe('月');
      expect($('.giro')!.classList).not.toContain('virada');
      expect(versoTitle()).toBe('日');
      expect(text($('.verso-texto'))).toContain('nichi');
      expect(text($('.verso-texto'))).not.toContain('getsu');
      turn.release();
      await settle();
      expect(versoTitle()).toBe('月');
      expect(text($('.verso-texto'))).toContain('getsu');
    });

    it('virar de novo no meio do giro mostra a resposta da carta na mesa', async () => {
      holdTurn();
      key(' ');
      await settle();
      key('2');
      await settle();
      expect(versoTitle()).toBe('日');
      key(' ');
      await settle();
      expect(frontTitle()).toBe('月');
      expect(versoTitle()).toBe('月');
      expect(text($('.verso-texto'))).toContain('getsu');
    });

    it('o Desfazer com a carta virada também não mostra a resposta da que volta', async () => {
      const turn = holdTurn();
      key(' ');
      await settle();
      key('2');
      await settle();
      key(' ');
      await settle();
      expect(versoTitle()).toBe('月');
      key('z');
      await settle();
      expect(frontTitle()).toBe('日');
      expect(versoTitle()).toBe('月');
      turn.release();
      await settle();
      expect(versoTitle()).toBe('日');
    });

    it('o segundo clique no Acertei não vira a próxima carta, que ainda nem foi vista', async () => {
      key(' ');
      await settle();
      const start = performance.now();
      key('2');
      await settle();
      const mostrar = $<HTMLButtonElement>('.mostrar')!;
      press(mostrar, start + 1);
      await settle();
      expect(frontTitle()).toBe('月');
      expect($('.giro')!.classList).not.toContain('virada');
      // passado o clique duplo, o toque vale
      press(mostrar, performance.now() + BOUNCE_MS + 1);
      await settle();
      expect($('.giro')!.classList).toContain('virada');
    });

    it('o segundo clique no Mostrar não responde a carta, que ainda nem foi lida', async () => {
      const start = performance.now();
      key(' ');
      await settle();
      const acertei = $<HTMLButtonElement>('.acertei')!;
      press(acertei, start + 1);
      press($<HTMLButtonElement>('.errei')!, start + 1);
      await settle();
      expect(study.cardOf().get('nsol')!.stats.seen).toBe(0);
      expect(frontTitle()).toBe('日');
      press(acertei, performance.now() + BOUNCE_MS + 1);
      await settle();
      expect(study.cardOf().get('nsol')!.stats.right).toBe(1);
    });

    it('o clique pelo teclado (detail 0) mira o botão com o foco, e vale na hora', async () => {
      key(' ');
      await settle();
      $<HTMLButtonElement>('.acertei')!.click();
      await settle();
      expect(study.cardOf().get('nsol')!.stats.right).toBe(1);
      $<HTMLButtonElement>('.mostrar')!.click();
      await settle();
      expect($('.giro')!.classList).toContain('virada');
    });

    it('a tecla segurada não vira nem responde: cada ação é um aperto', async () => {
      key(' ', { repeat: true });
      key('Enter', { repeat: true });
      await settle();
      expect($('.giro')!.classList).not.toContain('virada');
      key(' ');
      await settle();
      for (const k of [' ', 'Enter', '1', '2']) key(k, { repeat: true });
      await settle();
      expect(study.cardOf().get('nsol')!.stats.seen).toBe(0);
      expect(frontTitle()).toBe('日');
      // no botão com o foco, o Enter segurado também não aperta de novo
      const ev = new KeyboardEvent('keydown', { key: 'Enter', repeat: true, bubbles: true, cancelable: true });
      $<HTMLButtonElement>('.acertei')!.dispatchEvent(ev);
      expect(ev.defaultPrevented).toBeTrue();
    });
  });

  describe('o treino', () => {
    const placar = () => [...dialog()!.querySelectorAll('.placar .monte')].map(text);
    /** Reabre a mesa como treino, com as cartas desse tipo no baralho. */
    async function drill(kind: 'todos' | 'novos' = 'todos'): Promise<void> {
      fixture.componentInstance.open.set(false);
      await settle();
      fixture.componentInstance.drill.set({ kind, items: drillPool(study.view(), new Date(), kanji, kind, study.live) });
      fixture.componentInstance.open.set(true);
      await settle();
    }

    it('a mesa diz que é treino, mostra o placar no lugar dos montes, e embaixo do botão o que acontece na rodada', async () => {
      await drill();
      expect(text($('.baralho'))).toBe('Treino · Kanjis');
      expect($('.baralho')!.getAttribute('title')).toBe('Todos');
      expect(placar()).toEqual(['0 respostas', '0 acertos', '0 erros']);
      expect(dialog()!.querySelector('[data-monte="novas"]')).toBeNull();
      key(' ');
      await settle();
      expect(text($('.errei .volta'))).toContain('1 min');
      expect(text($('.acertei .volta'))).toContain('sai da rodada');
    });

    it('o Desfazer do treino guarda só as últimas respostas (cada uma leva a rodada inteira)', async () => {
      await drill();
      // erra sempre: a rodada nunca acaba (as teclas da mesa respondem na hora, sem esperar a tela)
      for (let i = 0; i < DRILL_UNDO_MAX + 5; i++) {
        key(' ');
        key('1');
      }
      await settle();
      expect(placar()[0]).toBe(`${DRILL_UNDO_MAX + 5} respostas`);
      for (let i = 0; i < DRILL_UNDO_MAX; i++) key('z');
      await settle();
      expect(placar()[0]).toBe('5 respostas');
      expect($<HTMLButtonElement>('.desfazer')!.disabled).toBeTrue();
    });

    it('responder conta no placar e não guarda nada: nem o progresso, nem o boletim, nem o dia', async () => {
      const before = JSON.stringify(study.state());
      await drill();
      key(' ');
      await settle();
      key('1');
      await settle();
      key(' ');
      await settle();
      key('2');
      await settle();
      expect(placar()).toEqual(['2 respostas', '1 acerto', '1 erro']);
      expect(JSON.stringify(study.state())).toBe(before);
      expect(study.cardOf().get('nsol')!.stats.seen).toBe(0);
    });

    it('quem errou volta na mesma rodada (1 min, depois 10, como no estudo); sem mais nada, volta na hora', async () => {
      await drill();
      const first = frontTitle();
      key(' ');
      await settle();
      key('1');
      await settle();
      const second = frontTitle();
      expect(second).not.toBe(first);
      key(' ');
      await settle();
      key('2');
      await settle();
      // só sobrou a que errou: ela volta já, e os botões dizem isso (não "1 min" nem "10 min")
      expect(frontTitle()).toBe(first);
      key(' ');
      await settle();
      expect(text($('.acertei .volta'))).toContain('volta já');
      expect(text($('.errei .volta'))).toContain('volta já');
      key('2');
      await settle();
      expect(frontTitle()).toBe(first);
      key(' ');
      await settle();
      expect(text($('.acertei .volta'))).toContain('sai da rodada');
      key('2');
      await settle();
      expect(text($('.fim h3'))).toBe('Rodada completa.');
      expect(text($('.fim-conta'))).toContain('4 respostas · acertou 3 · errou 1');
    });

    it('"Mais uma rodada" passa as mesmas cartas de novo, e o placar continua somando', async () => {
      await drill();
      for (let i = 0; i < 2; i++) {
        key(' ');
        await settle();
        key('2');
        await settle();
      }
      expect(text($('.fim h3'))).toBe('Rodada completa.');
      expect($<HTMLButtonElement>('.fim .btn-ink')).toBe(document.activeElement as HTMLButtonElement);
      $<HTMLButtonElement>('.fim .btn-ink')!.click();
      await settle();
      expect($('.fim')).toBeNull();
      expect(['日', '月']).toContain(frontTitle());
      expect(placar()).toEqual(['2 respostas', '2 acertos', '0 erros']);
    });

    it('Desfazer (Z) volta a resposta do treino e a carta dela', async () => {
      await drill();
      const first = frontTitle();
      key(' ');
      await settle();
      key('1');
      await settle();
      key('z');
      await settle();
      expect(frontTitle()).toBe(first);
      expect(placar()).toEqual(['0 respostas', '0 acertos', '0 erros']);
      expect($('.mostrar')).not.toBeNull();
    });
  });

  it('Parar fecha a mesa; o que foi respondido continua guardado', async () => {
    key(' ');
    await settle();
    key('2');
    await settle();
    $<HTMLButtonElement>('.parar')!.click();
    await settle();
    expect(fixture.componentInstance.open()).toBeFalse();
    expect(study.cardOf().get('nsol')!.stats.seen).toBe(1);
  });

  describe('o texto do verso sai como na ficha do mural', () => {
    /** Troca o texto (e a cor) da anotação da primeira carta e vira. */
    async function reveal(text: string, extra: Record<string, unknown> = {}): Promise<HTMLElement> {
      TestBed.inject(ReviewStore).reviews.update((list) => list.map((r) => (r.id === 'nsol' ? { ...r, text, ...extra } : r)));
      await settle();
      key(' ');
      await settle();
      return $('.verso-texto')!;
    }

    it('o link "[[título|texto]]" é a caneta azul com o texto escolhido, sem os colchetes; o que não existe, tracejado', async () => {
      const verso = await reveal('Ver [[Lua (月)|a lua]] e [[Estrela]].');
      expect(text(verso)).toBe('Ver a lua e Estrela.');
      expect(text(verso)).not.toContain('[[');
      const [lua, estrela] = [...verso.querySelectorAll<HTMLElement>('.elo')];
      expect(text(lua)).toBe('a lua');
      expect(lua.classList).not.toContain('quebrado');
      expect(estrela.classList).toContain('quebrado');
    });

    it('tocar no link abre a anotação na leitura, com a da carta no "Voltar", sem responder a carta', async () => {
      const open = spyOn(TestBed.inject(Desk), 'openReview');
      const verso = await reveal('Ver [[Lua (月)|a lua]].');
      const lua = verso.querySelector<HTMLElement>('.elo')!;
      lua.click();
      lua.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await settle();
      expect(open).toHaveBeenCalledWith('nlua', 'nsol');
      expect(study.cardOf().get('nsol')!.stats.seen).toBe(0);
      // de volta da leitura, o foco no link: o Espaço (que o link não usa) ainda é o Acertei
      lua.focus();
      lua.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
      await settle();
      expect(study.cardOf().get('nsol')!.stats.seen).toBe(1);
    });

    it('a letra, a linha e os espaços escritos são os da ficha', async () => {
      const verso = await reveal('Leitura:\n    recuada');
      const css = getComputedStyle(verso);
      expect(css.whiteSpace).toBe('pre-wrap');
      // a letra à mão das anotações (--f-hand), não a da interface
      const hand = document.createElement('span');
      hand.style.fontFamily = 'var(--f-hand)';
      document.body.append(hand);
      expect(css.fontFamily).toBe(getComputedStyle(hand).fontFamily);
      hand.remove();
      expect(css.getPropertyValue('--line').trim()).toBe('1.4rem');
      expect(verso.textContent).toContain('    recuada');
    });

    it('na cartolina escura, o link é a caneta azul-céu, como na ficha do mural', async () => {
      const verso = await reveal('Ver [[Lua (月)|a lua]].', { stock: 'preto' });
      expect($('.verso')!.getAttribute('data-cor')).toBe('preto');
      expect(getComputedStyle(verso.querySelector('.elo')!).getPropertyValue('--elo-traco')).toContain('8fd3ff');
    });

    it('Espaço no título do card que abre e fecha é do card: não responde a carta', async () => {
      const verso = await reveal('> [!citacao]- Leituras\n> toki');
      const summary = verso.querySelector<HTMLElement>('summary')!;
      summary.focus();
      summary.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
      await settle();
      expect(study.cardOf().get('nsol')!.stats.seen).toBe(0);
      expect(frontTitle()).toBe('日');
    });

    describe('o título, uma vez só', () => {
      it('é o da frente, e o nome da anotação não repete', async () => {
        await reveal('Leitura: nichi.');
        const titles = dialog()!.querySelectorAll('.verso h3');
        expect(titles.length).toBe(1);
        expect(text(titles[0])).toBe('日');
        expect(text($('.verso'))).not.toContain('Sol (日)');
      });

      it('em negrito, maior que o texto, na tinta da carta', async () => {
        await reveal('Leitura: nichi.');
        const css = getComputedStyle($('.verso-titulo')!);
        expect(Number(css.fontWeight)).toBeGreaterThanOrEqual(700);
        expect(parseFloat(css.fontSize)).toBeGreaterThanOrEqual(1.6 * parseFloat(getComputedStyle(document.documentElement).fontSize));
        expect(css.color).toBe(getComputedStyle($('.verso')!).color);
      });

      it('o subtítulo da frente continua ao lado dele; a pergunta comprida é escrita à mão, como na frente', async () => {
        study.updateFront('nsol', { title: 'Qual astro nasce no leste?', subtitle: 'um só' });
        await reveal('O Sol.');
        const title = $('.verso-titulo')!;
        expect(text(title)).toBe('Qual astro nasce no leste? · um só');
        expect(title.classList).toContain('frase');
      });

      it('a anotação sem texto: o nome dela é a resposta, se a frente tem outro título; se é o mesmo, o aviso', async () => {
        await reveal('');
        expect(text($('.verso-nome'))).toBe('Sol (日)');
        expect($('.verso-vazio')).toBeNull();
        study.updateFront('nsol', {});
        await settle();
        expect(text($('.verso-titulo'))).toBe('Sol (日)');
        expect($('.verso-nome')).toBeNull();
        expect($('.verso-vazio')).not.toBeNull();
      });
    });

    describe('a resposta curta cresce para ser lida (ui/grow-to-fit.ts)', () => {
      const frame = () => new Promise((r) => requestAnimationFrame(r));
      /** Vira com o texto, na carta do tamanho de sempre (a janela dos testes é baixa), e espera a conta do próximo quadro. */
      async function grown(body: string): Promise<{ text: HTMLElement; zoom: number; scroller: HTMLElement }> {
        $('.giro')!.style.setProperty('--w', '380px');
        const el = await reveal(body);
        await frame();
        await frame();
        return { text: el, zoom: Number(el.style.getPropertyValue('zoom') || 1), scroller: $('.verso-conteudo')! };
      }

      it('o card pequeno, como o do print, chega ao dobro, e o texto dele cresce junto', async () => {
        const { text: el, zoom, scroller } = await grown('> [!info] Hiragana\n> Símbolo → え\n> Romaji → e');
        expect(zoom).toBe(GROW_MAX);
        expect(scroller.scrollHeight).toBeLessThanOrEqual(scroller.clientHeight);
        // a largura da carta não muda: o texto cresce por dentro dela
        expect(el.parentElement!.scrollWidth).toBeLessThanOrEqual(el.parentElement!.clientWidth + 1);
      });

      it('o texto médio cresce até encher, sem rolar', async () => {
        // linhas curtas, que não quebram em letra nenhuma: quem limita é a altura. Com linhas compridas, seria a
        // largura, e o zoom dependeria da letra (na Kalam, 15% mais estreita que a de reserva, elas cabem no dobro)
        const { text: el, zoom, scroller } = await grown(Array.from({ length: 12 }, (_, i) => `Linha ${i + 1}`).join('\n'));
        expect(zoom).toBeGreaterThan(1);
        expect(zoom).toBeLessThan(GROW_MAX);
        expect(scroller.scrollHeight).toBeLessThanOrEqual(scroller.clientHeight);
        // encheu: a resposta chega perto do respiro do pé (a conta para a menos de um passo de 5% do que cabe)
        const box = el.parentElement!;
        const room = scroller.clientHeight - parseFloat(getComputedStyle(scroller).paddingBottom) - (box.offsetTop - scroller.offsetTop);
        expect(box.offsetHeight).toBeGreaterThan(room * 0.92);
      });

      it('o texto comprido fica como é, e rola', async () => {
        const { text: el, scroller } = await grown(Array.from({ length: 40 }, (_, i) => `Linha ${i + 1}`).join('\n'));
        expect(el.style.getPropertyValue('zoom')).toBe('');
        expect(scroller.scrollHeight).toBeGreaterThan(scroller.clientHeight);
        expect(getComputedStyle(el).lineHeight).toBe(`${1.4 * parseFloat(getComputedStyle(document.documentElement).fontSize)}px`);
      });

      it('a palavra comprida limita o tamanho: não quebra no meio por causa do crescimento', async () => {
        const word = 'Pneumoultramicroscopicossilicovulcanoconiose'.slice(0, 26);
        const { text: el, zoom } = await grown(word);
        expect(zoom).toBeLessThan(GROW_MAX);
        // uma linha só: inteira, sem quebrar
        const line = parseFloat(getComputedStyle(el).lineHeight);
        expect(el.getBoundingClientRect().height).toBeLessThan(line * zoom * 1.5);
        expect(el.style.overflowWrap).toBe('');
      });

      it('o texto com uma peça que amplia fica do tamanho de sempre (o zoom dela e o da carta se multiplicariam)', async () => {
        const { text: el } = await grown('{{contador: 2030-01-01 | Prova}}');
        expect(el.querySelector('app-zoom-knob')).not.toBeNull();
        expect(el.style.getPropertyValue('zoom')).toBe('');
      });

      it('o texto que muda refaz a conta: a curta que vira comprida volta ao tamanho de sempre', async () => {
        const { zoom } = await grown('Curta.');
        expect(zoom).toBe(GROW_MAX);
        TestBed.inject(ReviewStore).reviews.update((list) => list.map((r) => (r.id === 'nsol' ? { ...r, text: Array.from({ length: 40 }, (_, i) => `Linha ${i + 1}`).join('\n') } : r)));
        await settle();
        await frame();
        await frame();
        expect($('.verso-texto')!.style.getPropertyValue('zoom')).toBe('');
      });
    });
  });
});
