import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoteLinks } from '../core/note-links';
import { Review, sanitizeReview } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { LinkedCard } from './linked-card';

function card(id: string, name: string, kind = 'jogos', extra: Record<string, unknown> = {}): Review {
  return sanitizeReview({
    id,
    kind,
    game: { name, coverUrl: null, source: 'manual' },
    scores: { diversao: 9, historia: 8, jogabilidade: 9, visual: 8 },
    status: 'finalizado',
    text: '',
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
    ...extra,
  })!;
}

describe('a nota colada no texto (o widget Nota)', () => {
  let fixture: ComponentFixture<LinkedCard>;
  let el: HTMLElement;

  async function show(args: string[], links: NoteLinks | null = null): Promise<void> {
    fixture = TestBed.createComponent(LinkedCard);
    fixture.componentRef.setInput('args', args);
    fixture.componentRef.setInput('links', links);
    el = fixture.nativeElement as HTMLElement;
    el.style.setProperty('--widget-alto', '200px');
    el.style.width = '500px';
    document.body.appendChild(el);
    await fixture.whenStable();
  }

  /**
   * Espera a ficha se medir de novo até parar de mudar (a fonte e o título assentam depois; com a
   * janela do Karma atrás, os quadros demoram), ou até `done` valer.
   */
  async function settle(done?: () => boolean): Promise<void> {
    let last = '';
    let still = 0;
    for (let i = 0; i < 50; i++) {
      await new Promise((r) => setTimeout(r, 40));
      await fixture.whenStable();
      if (done?.()) return;
      const now = el.querySelector('.lugar')?.getAttribute('style') ?? '';
      still = now === last ? still + 1 : 0;
      if (!done && still >= 4) return;
      last = now;
    }
  }

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [LinkedCard], providers: [provideZonelessChangeDetection()] });
    TestBed.inject(ReviewStore).reviews.set([
      card('rjogo1', 'Hollow Knight'),
      card('rnota1', 'Comprar um console', 'anotacoes', { category: 'Compras' }),
    ]);
  });

  afterEach(() => {
    el?.remove();
    fixture?.destroy();
    localStorage.clear();
  });

  it('o broche de ampliar sobe a ficha colada (que já é papel) e o texto inteiro para o meio da tela', async () => {
    await show(['#rjogo1', 'Hollow Knight']);
    const lugar = el.querySelector<HTMLElement>('.lugar')!;
    const knob = lugar.querySelector<HTMLButtonElement>(':scope > app-zoom-knob button')!;
    expect(knob.getAttribute('aria-label')).toBe('Ampliar Hollow Knight');
    knob.click();
    expect(lugar.classList).toContain('erguida');
    expect(lugar.classList).not.toContain('erguida-papel');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.destroy();
    el.remove();

    await show(['#rnota1', 'inteira']);
    const sheet = el.querySelector<HTMLElement>('article.inteira')!;
    // na faixa, ao lado da seta de recolher
    const band = [...sheet.querySelectorAll('header > *')].map((k) => k.tagName.toLowerCase() + (k.classList.length ? '.' + k.classList[0] : ''));
    expect(band.slice(-2)).toEqual(['app-zoom-knob.ampliar-faixa', 'button.dobra']);
    sheet.querySelector<HTMLButtonElement>('app-zoom-knob button')!.click();
    expect(sheet.classList).toContain('erguida');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  });

  it('é a ficha simples de verdade, de outro mural, colada (o estrago de fora não a come)', async () => {
    await show(['#rjogo1', 'Hollow Knight']);
    const inner = el.querySelector('app-review-card')!;
    expect(inner.classList).toContain('compact');
    expect(inner.querySelector('.title')?.textContent).toContain('Hollow Knight');
    expect(el.querySelector('.lugar')!.hasAttribute('data-colado')).toBeTrue();
    expect(el.querySelectorAll('.fita').length).toBe(0);
    // colada, e não pregada: sem a tachinha
    expect(getComputedStyle(inner.querySelector('.pin')!).display).toBe('none');
  });

  it('encolhe até a altura do tamanho, e até a largura da linha', async () => {
    await show(['#rjogo1']);
    await settle();
    const inner = el.querySelector<HTMLElement>('app-review-card')!;
    const box = el.querySelector<HTMLElement>('.lugar')!;
    expect(box.offsetHeight).toBeLessThanOrEqual(201);
    expect(Math.abs(box.offsetHeight - inner.offsetHeight * Number(getComputedStyle(el.querySelector('.escala')!).scale))).toBeLessThan(2);
    el.style.width = '150px';
    await settle();
    expect(box.offsetWidth).toBeLessThanOrEqual(150);
  });

  it('colada reta, rente ao alto: sem a queda nem o giro do papel dela', async () => {
    await show(['#rnota1'], { openCard: () => undefined });
    await settle();
    const inner = el.querySelector<HTMLElement>('app-review-card')!;
    // a ficha tem a queda e a inclinação dela (as do mural), mas colada não usa nenhuma das duas
    expect(inner.style.getPropertyValue('--drop-y')).not.toBe('');
    const style = getComputedStyle(inner);
    expect(style.marginTop).toBe('0px');
    expect(style.rotate).toBe('none');
    expect(style.translate).toBe('none');
    // o alto dela é o alto do lugar
    const lugar = el.querySelector<HTMLElement>('.lugar')!;
    expect(Math.abs(inner.getBoundingClientRect().top - lugar.getBoundingClientRect().top)).toBeLessThan(1);
    // quem sobe com o mouse é a ficha (reta), e não o lugar
    const sheet = Array.from(document.querySelectorAll('style'))
      .map((s) => s.textContent ?? '')
      .join('\n');
    expect(sheet).toMatch(/\.perdida-nome/);
    expect(sheet).not.toMatch(/\.lugar[^{,]*:hover/);
  });

  it('a orelha da categoria cabe no espaço do widget, sem tampar a linha de cima', async () => {
    await show(['#rnota1']);
    await settle();
    const ear = el.querySelector<HTMLElement>('app-review-card .aba-cat')!;
    expect(ear.getBoundingClientRect().width).toBeGreaterThan(0);
    expect(ear.getBoundingClientRect().top).toBeGreaterThanOrEqual(el.getBoundingClientRect().top);
    // e a ficha com a folga cabe na altura do tamanho
    const lugar = el.querySelector<HTMLElement>('.lugar')!;
    expect(lugar.getBoundingClientRect().bottom - el.getBoundingClientRect().top).toBeLessThanOrEqual(201);
  });

  it('muda de tamanho junto com o widget, mesmo numa linha estreita', async () => {
    await show(['#rjogo1']);
    // estreita: a caixa fica com a altura em linhas, e a --widget-alto muda sem nada mudar de tamanho
    el.style.width = '200px';
    await settle();
    const lugar = el.querySelector<HTMLElement>('.lugar')!;
    const before = lugar.offsetHeight;
    el.style.setProperty('--widget-alto', '60px');
    fixture.componentRef.setInput('lines', 3);
    await settle(() => lugar.offsetHeight < before);
    expect(lugar.offsetHeight).toBeLessThan(before);
    expect(lugar.offsetHeight).toBeLessThanOrEqual(60);
  });

  it('com quem abra, tocar abre a ficha; sem, ela só se vê (nem o teclado para nela)', async () => {
    const opened: string[] = [];
    await show(['#rjogo1'], { openCard: (r) => opened.push(r.id) });
    el.querySelector<HTMLButtonElement>('app-review-card .hit')!.click();
    expect(opened).toEqual(['rjogo1']);
    expect(el.classList).toContain('abre');
    fixture.destroy();
    el.remove();

    await show(['#rjogo1'], {});
    expect(el.querySelector('app-review-card')!.hasAttribute('inert')).toBeTrue();
    expect(el.querySelector('.sr-only')?.textContent).toContain('Hollow Knight');
  });

  it('escrita à mão só com o título: a anotação dele, pelos links do texto', async () => {
    const notes = TestBed.inject(ReviewStore).notes();
    await show(['Comprar um console'], { resolve: (t) => notes.find((n) => n.game.name === t) ?? null });
    expect(el.querySelector('app-review-card .title')?.textContent).toContain('Comprar um console');
  });

  it('a que sumiu deixa o papel rasgado com o nome dela', async () => {
    await show(['#rapagada', 'Uma ficha apagada']);
    expect(el.querySelector('app-review-card')).toBeNull();
    expect(el.querySelector('.perdida-nome')?.textContent).toBe('Uma ficha apagada');
    expect(el.querySelector('.perdida-dica')?.textContent).toContain('apagada');
  });

  it('a privada (o cadeado no texto de quem visita) diz que é privada, e não que foi apagada', async () => {
    await show(['#rprivada', '🔒']);
    expect(el.querySelector('app-review-card')).toBeNull();
    expect(el.querySelector('.perdida')?.classList).toContain('privada');
    expect(el.querySelector('.perdida-nome')?.textContent).toBe('Nota privada');
    expect(el.querySelector('.perdida-dica')?.textContent).toContain('é privada');
    expect(el.textContent).not.toContain('🔒');
  });

  it('no mural, o vazio ao lado da ficha colada abre a ficha de fora; a colada abre a dela', async () => {
    const { ReviewCard } = await import('./review-card');
    const outer = TestBed.createComponent(ReviewCard);
    outer.componentRef.setInput('review', card('rfora', 'Viagem', 'anotacoes', { text: '{{nota: #rjogo1 | Hollow Knight | mini}}' }));
    outer.componentRef.setInput('checkable', true);
    const host = outer.nativeElement as HTMLElement;
    host.style.width = '420px';
    document.body.appendChild(host);
    let lugar: HTMLElement | null = null;
    for (let i = 0; i < 50 && !lugar?.offsetWidth; i++) {
      await new Promise((r) => setTimeout(r, 40));
      await outer.whenStable();
      lugar = host.querySelector<HTMLElement>('app-linked-card .lugar');
    }
    // o que outros testes deixaram na página pode empurrar a ficha para fora da janela: os pontos
    // medidos abaixo precisam estar à vista
    host.scrollIntoView({ block: 'start' });
    const line = host.querySelector<HTMLElement>('app-linked-card')!.getBoundingClientRect();
    const box = lugar!.getBoundingClientRect();
    expect(line.right - box.right).toBeGreaterThan(40);
    const y = box.top + box.height / 2;
    // o vazio à direita: o botão da ficha de fora, por baixo do texto
    const empty = document.elementFromPoint(box.right + (line.right - box.right) / 2, y)!;
    expect(empty.closest('app-linked-card')).toBeNull();
    expect(empty.classList).toContain('hit');
    expect(host.contains(empty)).toBeTrue();
    // a ficha colada: a dela
    const glued = document.elementFromPoint(box.left + box.width / 2, y)!;
    expect(glued.closest('app-linked-card')).not.toBeNull();
    host.remove();
    outer.destroy();
  });

  it('as regras da ficha de fora não pegam a de dentro (a anotação sem capa não desmonta a cabeça dela)', async () => {
    // a ficha colada dentro de uma anotação sem capa, num mural: a cabeça dela tem a capa ao lado do nome
    const { ReviewCard } = await import('./review-card');
    const outer = TestBed.createComponent(ReviewCard);
    outer.componentRef.setInput('review', card('rfora', 'Viagem', 'anotacoes', { text: 'oi\n{{nota: #rjogo1 | Hollow Knight}}' }));
    outer.componentRef.setInput('full', true);
    document.body.appendChild(outer.nativeElement);
    await outer.whenStable();
    await new Promise((r) => setTimeout(r, 50));
    await outer.whenStable();
    const head = (outer.nativeElement as HTMLElement).querySelector<HTMLElement>('app-linked-card app-review-card > .corpo > .head');
    expect(head).not.toBeNull();
    expect(getComputedStyle(head!).gridTemplateColumns.split(' ').length).toBe(2);
    outer.nativeElement.remove();
    outer.destroy();
  });

  describe('os jeitos', () => {
    beforeEach(() => {
      TestBed.inject(ReviewStore).reviews.set([
        card('rjogo1', 'Hollow Knight'),
        card('rnota1', 'Comprar um console', 'anotacoes', { category: 'Compras', subject: 'Casa', text: 'Ver o preço.\n\n- [ ] Pesquisar\n\n==importante==' }),
        card('rnotaA', 'Volta para mim', 'anotacoes', { text: 'antes\n{{nota: #rnotaA | Volta para mim | inteira}}\ndepois' }),
      ]);
    });

    it('capa e título: a ficha da vista "Só capa e nome" do mural, encolhida como a ficha', async () => {
      await show(['#rjogo1', 'capa']);
      await settle();
      const glued = el.querySelector('app-review-card')!;
      expect(glued.classList).toContain('capas');
      expect(glued.classList).not.toContain('compact');
      expect(el.querySelector<HTMLElement>('.escala')!.style.width).toBe('140px');
      expect(el.classList).not.toContain('sem-tamanho');
    });

    it('só o título: a tira da cartolina dela, com o assunto (ou o mural) antes do nome; toca e abre', async () => {
      const opened: string[] = [];
      await show(['#rnota1', 'tira'], { openCard: (r) => opened.push(r.id) });
      const tira = el.querySelector<HTMLButtonElement>('button.tira')!;
      expect(tira.querySelector('.tira-nome')?.textContent).toBe('Comprar um console');
      expect(tira.querySelector('.tira-assunto')?.textContent).toBe('Casa');
      expect(tira.classList).toContain('cartolina');
      expect(el.querySelector('app-review-card')).toBeNull();
      // a altura do que mostra, não a do tamanho do widget (200px)
      expect(el.classList).toContain('sem-tamanho');
      expect(el.getBoundingClientRect().height).toBeLessThan(120);
      tira.click();
      expect(opened).toEqual(['rnota1']);
      fixture.destroy();
      el.remove();

      // a ficha de outro mural diz de qual; sem quem abra, não pega o toque
      await show(['#rjogo1', 'tira'], {});
      expect(el.querySelector('.tira-assunto')?.textContent).toBe('Jogo');
      expect(el.querySelector('button.tira')!.hasAttribute('inert')).toBeTrue();
    });

    it('texto inteiro: o nome abre a nota; o papel vazio também abre esta, e não a de fora', async () => {
      const opened: string[] = [];
      await show(['#rnota1', 'inteira'], { openCard: (r) => opened.push(r.id) });
      const sheet = el.querySelector<HTMLElement>('article.inteira')!;
      const name = sheet.querySelector<HTMLButtonElement>('button.faixa-nome')!;
      expect(name.textContent?.trim()).toBe('Comprar um console');
      expect(sheet.querySelector('.folha app-rich-text')?.textContent).toContain('Ver o preço.');
      expect(sheet.querySelector('.folha app-rich-text')?.textContent).toContain('Pesquisar');
      expect(el.classList).toContain('sem-tamanho');
      name.click();
      expect(opened).toEqual(['rnota1']);
      // o canto vazio da folha (o fim da pauta, à direita) abre esta nota, e o toque não sobe
      let outer = 0;
      document.body.addEventListener('click', () => outer++, { once: true });
      // o canto tem de estar na janela: fora dela, elementsFromPoint não acha nada
      const folha = sheet.querySelector<HTMLElement>('.folha')!;
      folha.scrollIntoView({ block: 'end' });
      const r = folha.getBoundingClientRect();
      // o de cima naquele ponto, entre os desta nota colada: o que mais estiver na tela do teste
      // (preso no pé da janela, por exemplo) não conta, mas nada da ficha pode cobrir o canto
      const empty = document.elementsFromPoint(r.right - 4, r.bottom - 4).find((n) => el.contains(n)) as HTMLElement;
      expect(empty.closest('article.inteira')).toBe(sheet);
      empty.click();
      expect(opened).toEqual(['rnota1', 'rnota1']);
      expect(outer).toBe(0);
      // o que é de tocar faz o seu: a caixinha da tarefa não abre a nota
      sheet.querySelector<HTMLInputElement>('.folha input[type="checkbox"]')!.click();
      await fixture.whenStable();
      expect(opened).toEqual(['rnota1', 'rnota1']);
    });

    it('texto inteiro: a seta recolhe o texto (fica só o nome) e mostra de novo, sem abrir a nota', async () => {
      const opened: string[] = [];
      await show(['#rnota1', 'inteira'], { openCard: (r) => opened.push(r.id) });
      const arrow = el.querySelector<HTMLButtonElement>('button.dobra')!;
      const folha = el.querySelector<HTMLElement>('.folha')!;
      expect(arrow.getAttribute('aria-expanded')).toBe('true');
      expect(arrow.getAttribute('aria-controls')).toBe(folha.id);
      // a altura em linhas da pauta (min-height) chega num quadro depois: medir com ela já posta
      await settle(() => el.style.minHeight !== '');
      const tall = el.getBoundingClientRect().height;
      arrow.click();
      await fixture.whenStable();
      expect(arrow.getAttribute('aria-expanded')).toBe('false');
      expect(folha.hidden).toBeTrue();
      expect(el.querySelector('article.inteira')!.classList).toContain('fechada');
      // e, fechada, a altura em linhas baixa no quadro seguinte
      await settle(() => el.getBoundingClientRect().height < tall);
      expect(el.getBoundingClientRect().height).toBeLessThan(tall);
      arrow.click();
      await fixture.whenStable();
      expect(folha.hidden).toBeFalse();
      expect(opened).toEqual([]);
    });

    it('texto inteiro escrito "fechada" começa fechado; a seta abre só ali (a marca não muda)', async () => {
      await show(['#rnota1', 'inteira', 'fechada']);
      const arrow = el.querySelector<HTMLButtonElement>('button.dobra')!;
      expect(arrow.getAttribute('aria-expanded')).toBe('false');
      expect(el.querySelector<HTMLElement>('.folha')!.hidden).toBeTrue();
      arrow.click();
      await fixture.whenStable();
      expect(el.querySelector<HTMLElement>('.folha')!.hidden).toBeFalse();
      // a marca nova (aberta) volta a valer
      fixture.componentRef.setInput('args', ['#rnota1', 'inteira', 'fechada', 'Comprar um console']);
      await fixture.whenStable();
      expect(el.querySelector<HTMLElement>('.folha')!.hidden).toBeTrue();
    });

    it('texto inteiro: as tarefas da sua nota se marcam ali mesmo, e ela é salva marcada', async () => {
      const store = TestBed.inject(ReviewStore);
      await show(['#rnota1', 'inteira'], { openCard: () => undefined });
      const box = el.querySelector<HTMLInputElement>('.folha input[type="checkbox"]')!;
      expect(box).not.toBeNull();
      box.click();
      await fixture.whenStable();
      expect(store.get('rnota1')!.text).toContain('- [x] Pesquisar');
      fixture.destroy();
      el.remove();

      // sem quem abra (um lugar só de ver), as tarefas não se marcam
      store.update({ ...store.get('rnota1')!, text: '- [ ] Pesquisar' });
      await show(['#rnota1', 'inteira'], {});
      expect(el.querySelector('.folha input[type="checkbox"]')).toBeNull();
      expect(el.querySelector('.folha .caixa')).not.toBeNull();
    });

    it('a faixa, a tira e a ficha colada têm o papel delas, não o da nota em volta', async () => {
      const outer = document.createElement('div');
      outer.className = 'cartolina';
      outer.setAttribute('data-cor', 'preto');
      outer.style.setProperty('--estampa', 'url("data:image/svg+xml,x")');
      outer.style.setProperty('--textura', 'url("data:image/svg+xml,y")');
      document.body.appendChild(outer);
      const css = (sel: string, v: string) => getComputedStyle(el.querySelector(sel)!).getPropertyValue(v).trim();
      for (const [args, sel] of [
        [['#rnota1', 'inteira'], '.faixa'],
        [['#rnota1', 'tira'], '.tira'],
        [['#rnota1'], 'app-review-card'],
      ] as const) {
        await show([...args]);
        outer.appendChild(el);
        await fixture.whenStable();
        // a estampa e a textura da de fora não chegam; o papel escuro dela também não (a colada é clara)
        expect(css(sel, '--estampa')).withContext(sel).toBe('');
        expect(css(sel, '--textura')).withContext(sel).toBe('');
        expect(css(sel, '--estampa-uso')).withContext(sel).toBe('none');
        expect(css(sel, '--realce')).withContext(sel).toBe('none');
        expect(css(sel, '--grao-img')).withContext(sel).not.toContain('escura');
        fixture.destroy();
        el.remove();
      }
      outer.remove();
    });

    it('toda nota colada ocupa linhas inteiras da pauta (o texto de baixo continua nas linhas)', async () => {
      const lines = async (args: string[]) => {
        await show(args, { openCard: () => undefined });
        el.style.lineHeight = '24px';
        el.style.setProperty('--line', '24px');
        el.style.setProperty('--widget-alto', '168px');
        await settle(() => {
          const h = el.getBoundingClientRect().height;
          return h > 0 && Math.abs(h / 24 - Math.round(h / 24)) < 0.01;
        });
        return el.getBoundingClientRect().height / 24;
      };
      for (const args of [['#rnota1', 'inteira'], ['#rnota1', 'inteira', 'fechada'], ['#rnota1', 'tira'], ['#rjogo1'], ['#rjogo1', 'capa']]) {
        const n = await lines(args);
        expect(Math.abs(n - Math.round(n))).withContext(args.join(' ') + ': ' + n).toBeLessThan(0.01);
        if (args[1] === 'tira') expect(Math.round(n)).withContext('tira').toBe(2);
        if (!args[1] || args[1] === 'capa') expect(Math.round(n)).withContext(args.join(' ')).toBe(7);
        fixture.destroy();
        el.remove();
      }
      // a seta muda a altura, e ela continua em linhas inteiras (só as da faixa)
      const open = await lines(['#rnota1', 'inteira']);
      el.querySelector<HTMLButtonElement>('button.dobra')!.click();
      const art = el.querySelector<HTMLElement>('article.inteira')!;
      const band = () => Math.max(1, Math.ceil((art.offsetHeight + 2 * 3.6 - 1) / 24));
      await settle(() => Math.round(el.getBoundingClientRect().height / 24) === band());
      const closed = el.getBoundingClientRect().height / 24;
      expect(closed).toBeCloseTo(band(), 2);
      expect(closed).toBeLessThan(open);
    });

    it('texto inteiro sem texto diz que ainda não tem', async () => {
      await show(['#rjogo1', 'inteira']);
      expect(el.querySelector('.folha-vazia')?.textContent).toContain('Ainda sem texto');
    });

    it('colada dentro dela mesma, a nota de texto inteiro vira ficha: não se desenha para sempre', async () => {
      await show(['#rnotaA', 'inteira']);
      await settle();
      expect(el.querySelectorAll('article.inteira').length).toBe(1);
      expect(el.querySelector('article.inteira app-linked-card app-review-card')).not.toBeNull();
    });

    it('a folha do texto inteiro é creme mesmo dentro de uma ficha escura: o marca-texto é o da leitura', async () => {
      const dark = document.createElement('app-review-card');
      dark.setAttribute('data-cor', 'preto');
      document.body.appendChild(dark);
      await show(['#rnota1', 'inteira']);
      dark.appendChild(el);
      await fixture.whenStable();
      const mark = el.querySelector<HTMLElement>('.folha .marca')!;
      expect(getComputedStyle(mark).getPropertyValue('--marca-cor').trim()).toBe('rgb(255 218 66 / 0.62)');
      expect(getComputedStyle(el.querySelector('.folha')!).color).toBe('rgb(21, 21, 21)');
      dark.remove();
    });

    it('na leitura de uma nota escura, a ficha colada fica com a tinta da cartolina dela (a do cabeçalho da leitura não vaza)', async () => {
      const reader = document.createElement('article');
      reader.className = 'ficha cartolina';
      reader.setAttribute('data-cor', 'preto');
      document.body.appendChild(reader);
      await show(['#rnota1']);
      reader.appendChild(el);
      await fixture.whenStable();
      expect(getComputedStyle(el.querySelector('app-review-card .title')!).color).toBe('rgb(21, 21, 21)');
      reader.remove();
    });
  });
});
