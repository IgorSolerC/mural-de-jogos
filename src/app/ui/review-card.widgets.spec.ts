import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Review, sanitizeReview } from '../core/review';
import { ReviewCard } from './review-card';

const AUDIO = '{{audio: https://www.youtube.com/watch?v=dQw4w9WgXcQ | simples}}';
const COUNTDOWN = '{{contador: 25/12 | Natal}}';
const TABLE = '{{tabela: listrada}}\n| a | b |\n| - | - |\n| 1 | 2 |';

function card(kind: 'anotacoes' | 'jogos', text: string, extra: Partial<Review> = {}): Review {
  return {
    ...sanitizeReview({
      id: 'rwidg001',
      kind,
      game: { name: 'Com widget', coverUrl: null, source: 'manual' },
      scores: { final: 8 },
      status: 'finalizado',
      stock: 'amarelo',
      text,
      createdAt: '2026-10-01T10:00:00.000Z',
      updatedAt: '2026-10-01T10:00:00.000Z',
    })!,
    ...extra,
  };
}

/** Os widgets do texto na ficha do mural: tocam na resenha inteira como na anotação, e ficam na frente do estrago. */
describe('os widgets na ficha do mural', () => {
  let fixture: ComponentFixture<ReviewCard>;
  let el: HTMLElement;

  async function show(review: Review, inputs: Record<string, unknown> = {}): Promise<void> {
    TestBed.configureTestingModule({ imports: [ReviewCard], providers: [provideZonelessChangeDetection()] });
    fixture = TestBed.createComponent(ReviewCard);
    fixture.componentRef.setInput('review', review);
    for (const [k, v] of Object.entries(inputs)) fixture.componentRef.setInput(k, v);
    el = fixture.nativeElement as HTMLElement;
    el.style.width = '360px';
    document.body.appendChild(el);
    await fixture.whenStable();
  }

  afterEach(() => {
    el?.remove();
    fixture?.destroy();
  });

  it('na resenha inteira, o texto com widget sobe por cima do botão da ficha, como na anotação', async () => {
    await show(card('jogos', `Ótimo jogo.\n${AUDIO}`), { full: true, checkable: true });
    const box = el.querySelector<HTMLElement>('.texto-inteiro')!;
    expect(box.classList).toContain('marcavel');
    expect(getComputedStyle(box).zIndex).toBe('5');
    expect(getComputedStyle(box).pointerEvents).toBe('none');
  });

  it('na anotação, o mesmo (no seu mural e no dos outros)', async () => {
    await show(card('anotacoes', `Ouvir:\n${AUDIO}`), { checkable: false });
    expect(el.querySelector('.nota-texto')!.classList).toContain('marcavel');
  });

  it('a tabela, sem nada para tocar, não sobe o texto por cima do botão da ficha', async () => {
    await show(card('anotacoes', `Falta:\n${TABLE}`), { checkable: true });
    expect(el.querySelector('.nota-texto table')).not.toBeNull();
    expect(el.querySelector('.nota-texto')!.classList).not.toContain('marcavel');
  });

  it('na ficha que corta o texto, dois widgets do mesmo tamanho ficam iguais: o que passa do fim fica escondido, sem encolher', async () => {
    await show(card('anotacoes', `Antes\nmais uma linha\n${COUNTDOWN}\n{{contador: 31/12 | Ano novo}}`), { checkable: true });
    const widgets = () => Array.from(el.querySelectorAll<HTMLElement>('.nota-texto app-note-widget'));
    for (let i = 0; i < 100 && el.querySelectorAll('.nota-texto app-countdown').length < 2; i++) {
      await new Promise((r) => setTimeout(r, 20));
      await fixture.whenStable();
    }
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 50)));
    const [a, b] = widgets();
    const box = el.querySelector<HTMLElement>('.nota-texto')!;
    // o segundo começa depois do fim da ficha (ou perto dele): passa da caixa, que corta
    expect(b.getBoundingClientRect().bottom).toBeGreaterThan(box.getBoundingClientRect().bottom);
    expect(getComputedStyle(b).getPropertyValue('--widget-alto')).toBe(getComputedStyle(a).getPropertyValue('--widget-alto'));
    expect(b.offsetHeight).toBe(a.offsetHeight);
  });

  for (const checkable of [true, false]) {
    it(`a nota só de contadores, sem link nem tarefa, amplia na ficha fechada (${checkable ? 'no seu mural' : 'no dos outros'})`, async () => {
      await show(card('anotacoes', `${COUNTDOWN}\n{{contador: 31/12 | neon | Ano novo | pequeno}}`), { checkable });
      expect(el.querySelector('.nota-texto')!.classList).toContain('marcavel');
      // o contador vem num @defer: espera ele chegar
      for (let i = 0; i < 100 && !el.querySelector('app-zoom-knob button'); i++) {
        await new Promise((r) => setTimeout(r, 20));
        await fixture.whenStable();
      }
      // o broche de ampliar fica por cima do botão da ficha: o toque chega nele, não na ficha
      const knob = el.querySelector<HTMLElement>('app-zoom-knob button')!;
      expect(getComputedStyle(knob).pointerEvents).toBe('auto');
      const r = knob.getBoundingClientRect();
      expect(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.closest('app-zoom-knob')).not.toBeNull();
      // o widget é o primeiro do texto: o broche, metade para fora do canto dele, cabe inteiro no
      // corte da caixa do texto (a folga dela), sem perder a metade de cima
      const clip = el.querySelector<HTMLElement>('.nota-texto')!.getBoundingClientRect();
      const host = knob.closest('app-zoom-knob')!.getBoundingClientRect();
      expect(host.top).toBeGreaterThanOrEqual(clip.top);
      expect(host.right).toBeLessThanOrEqual(clip.right);
      expect(document.elementFromPoint(r.left + r.width / 2, r.top + 2)?.closest('app-zoom-knob')).not.toBeNull();
      let opened = 0;
      fixture.componentInstance.opened.subscribe(() => opened++);
      knob.click();
      expect(opened).toBe(0);
    });
  }

  it('a folga do broche não tira o texto do lugar: ele começa e acaba onde sempre, com as mesmas linhas', async () => {
    await show(card('anotacoes', 'Uma linha\nOutra'), { checkable: true });
    const box = el.querySelector<HTMLElement>('.nota-texto')!;
    // (sem o giro da ficha: pelos offsets, do canto dela)
    const where = () => {
      const t = box.querySelector<HTMLElement>('app-rich-text')!;
      return { top: box.offsetTop + t.offsetTop, left: box.offsetLeft + t.offsetLeft, width: t.offsetWidth, cut: box.offsetTop + box.offsetHeight, card: el.offsetHeight };
    };
    const with12 = where();
    // sem a folga: tudo igual
    box.style.setProperty('--broche-folga', '0px');
    expect(where()).toEqual(with12);
    expect(parseFloat(getComputedStyle(box).paddingTop)).toBe(0);
    box.style.removeProperty('--broche-folga');
    expect(parseFloat(getComputedStyle(box).paddingTop)).toBe(12);
  });

  it('o spoiler se revela tocando na própria ficha, sem abrir a leitura; revelado, o toque volta a abrir', async () => {
    await show(card('anotacoes', 'O final: ||ele volta|| e pronto.'), { checkable: false });
    const box = el.querySelector<HTMLElement>('.nota-texto')!;
    expect(box.classList).toContain('marcavel');
    const spoiler = box.querySelector<HTMLElement>('.spoiler')!;
    expect(getComputedStyle(spoiler).pointerEvents).toBe('auto');
    let opened = 0;
    fixture.componentInstance.opened.subscribe(() => opened++);
    let reached = 0;
    el.addEventListener('click', () => reached++);
    spoiler.click();
    expect(spoiler.classList).toContain('revelado');
    expect(reached).toBe(0);
    expect(opened).toBe(0);
    // revelado, o texto deixa o toque passar para o botão da ficha, como o resto
    expect(getComputedStyle(spoiler).pointerEvents).toBe('none');
  });

  it('na resenha inteira também, e o texto sem spoiler (nem nada para tocar) fica por baixo', async () => {
    await show(card('jogos', 'Bom. >!O vilão é o pai!<'), { full: true, checkable: true });
    expect(el.querySelector('.texto-inteiro')!.classList).toContain('marcavel');
    fixture.destroy();
    el.remove();
    TestBed.resetTestingModule();
    await show(card('jogos', 'a || b, sem spoiler'), { full: true, checkable: true });
    expect(el.querySelector('.texto-inteiro')!.classList).not.toContain('marcavel');
  });

  it('o texto sem widget continua onde sempre esteve', async () => {
    await show(card('anotacoes', 'Só texto.'), { checkable: true });
    expect(getComputedStyle(el.querySelector('.nota-texto')!).zIndex).toBe('auto');
  });

  it('o estrago corta o texto, mas não o widget', async () => {
    await show(card('anotacoes', `Antes do widget\n${COUNTDOWN}\nDepois do widget`, { damage: 'queimado', damageSeed: 7 }), { checkable: true });
    const masked = (n: Element) => [...n.classList].some((c) => c.startsWith('mascara-'));
    // o papel é medido e queimado depois de desenhado
    for (let i = 0; i < 40 && !el.querySelector('.nota-texto .linha[class*="mascara-"]'); i++) {
      await new Promise((r) => setTimeout(r, 25));
      await fixture.whenStable();
    }
    const widget = el.querySelector('app-note-widget')!;
    expect([...el.querySelectorAll('.nota-texto .linha')].some(masked)).toBeTrue();
    expect(masked(widget)).toBeFalse();
    expect(masked(el.querySelector('.nota-texto app-rich-text')!)).toBeFalse();
  });

  it('as tarefas ficam um pouco afastadas umas das outras na ficha (menos que uma linha), com ou sem descrição', async () => {
    await show(card('anotacoes', '- [ ] Cola\n- [ ] Panelas\n      fundo triplo\n- [ ] Mandolin'), { checkable: true });
    const items = [...el.querySelectorAll<HTMLElement>('.nota-texto .tarefas > li')];
    expect(items.length).toBe(3);
    const line = parseFloat(getComputedStyle(items[0]).minHeight);
    // (pelo offsetTop: a ficha é torta, e a caixa girada engana a medida)
    const gap = (a: HTMLElement, b: HTMLElement) => b.offsetTop - (a.offsetTop + a.offsetHeight);
    // o mesmo respiro entre todas, pequeno: nem colado, nem a linha inteira da leitura
    expect(gap(items[0], items[1])).toBeGreaterThan(4);
    expect(gap(items[0], items[1])).toBeLessThan(line / 2);
    // (o offset é arredondado ao pixel)
    expect(Math.abs(gap(items[1], items[2]) - gap(items[0], items[1]))).toBeLessThanOrEqual(1);
  });

  for (const checkable of [true, false]) {
    it(`a caixinha da tarefa sobe 3,5px na ficha, para o meio das letras (${checkable ? 'no seu mural' : 'no dos outros'})`, async () => {
      await show(card('anotacoes', '- [ ] Reunião\n- [x] Feita'), { checkable });
      const text = el.querySelector<HTMLElement>('.nota-texto')!;
      // (pelo offsetTop: a ficha é torta, e a caixa girada engana a medida)
      const caixa = () => el.querySelector<HTMLElement>('.nota-texto .tarefas :is(input, .caixa)')!.offsetTop;
      const raised = caixa();
      text.style.setProperty('--caixa-sobe', '0px');
      const still = caixa();
      text.style.removeProperty('--caixa-sobe');
      // (o offset é arredondado ao pixel)
      expect(still - raised).toBeGreaterThanOrEqual(3);
      expect(still - raised).toBeLessThanOrEqual(4);
    });
  }
});

/** O título no texto da cartolina: longe do texto, mais que a quebra de linha e menos que a linha em branco. */
describe('o título no texto da ficha do mural', () => {
  let fixture: ComponentFixture<ReviewCard>;
  let el: HTMLElement;

  async function show(review: Review, inputs: Record<string, unknown> = {}): Promise<void> {
    TestBed.configureTestingModule({ imports: [ReviewCard], providers: [provideZonelessChangeDetection()] });
    fixture = TestBed.createComponent(ReviewCard);
    fixture.componentRef.setInput('review', review);
    for (const [k, v] of Object.entries(inputs)) fixture.componentRef.setInput(k, v);
    el = fixture.nativeElement as HTMLElement;
    el.style.width = '360px';
    document.body.appendChild(el);
    await fixture.whenStable();
  }

  afterEach(() => {
    el?.remove();
    fixture?.destroy();
  });

  const gaps = (box: string) => {
    const t = getComputedStyle(el.querySelector(`${box} .titulo`)!);
    const line = parseFloat(getComputedStyle(el.querySelector(box)!).lineHeight);
    return { top: parseFloat(t.marginTop) / line, bottom: parseFloat(t.marginBottom) / line };
  };

  it('na anotação, o título se afasta do texto de cima e do de baixo', async () => {
    await show(card('anotacoes', 'Antes\n## Mercado\nPão'));
    const { top, bottom } = gaps('.nota-texto');
    expect(top).toBeGreaterThan(0.4);
    expect(top).toBeLessThan(1);
    expect(bottom).toBeGreaterThan(0.2);
    expect(bottom).toBeLessThan(top);
  });

  it('na resenha inteira, o mesmo', async () => {
    await show(card('jogos', 'Antes\n## O fim\nDepois'), { full: true });
    const { top, bottom } = gaps('.texto-inteiro');
    expect(top).toBeGreaterThan(0.4);
    expect(top).toBeLessThan(1);
    expect(bottom).toBeGreaterThan(0.2);
  });
});
