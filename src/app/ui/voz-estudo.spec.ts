import { STUDY_HIGHLIGHT, STUDY_LAYER, VozEstudo } from './voz-estudo';

/**
 * O modo estudo da voz (PLANO-VOZ-ESTUDO.md) sobre um texto de verdade na página: as letras escondidas pelo
 * realce, um rabisco do tamanho de cada pedaço de palavra, a pontuação à mostra, revelar sem nada se mexer.
 */
describe('o modo estudo da voz: o texto em rabisco', () => {
  let host: HTMLElement;
  let study: VozEstudo;

  function mount(markup: string): HTMLElement {
    host = document.body.appendChild(document.createElement('div'));
    host.style.cssText = 'width: 420px; font: 20px/1.6 sans-serif; color: rgb(29, 35, 64)';
    host.innerHTML = markup;
    return host;
  }
  const layer = () => host.querySelector<HTMLElement>(`.${STUDY_LAYER}`)!;
  const boxes = () => [...layer().querySelectorAll<HTMLElement>('span')];
  const hidden = () => [...((CSS.highlights.get(STUDY_HIGHLIGHT) as Highlight | undefined) ?? [])].map((r) => (r as Range).toString());
  /** O número da palavra do alvo debaixo do ponto. */
  const indexAt = (x: number, y: number) => {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    return (el?.tagName === 'I' ? el.parentElement : el)?.dataset['p'] ?? null;
  };
  const frame = () => new Promise((res) => requestAnimationFrame(() => setTimeout(res)));

  beforeEach(() => (study = new VozEstudo()));
  afterEach(() => {
    study.stop();
    host?.remove();
  });

  it('esconde cada palavra (o japonês partido em palavras) e deixa a pontuação, os espaços e os símbolos', () => {
    mount('<p>私のケーキです。</p><p>Cadê o seu café? 3 vezes → ok 🙂</p>');
    study.start([host], 'ja-JP');
    expect(hidden()).toEqual(['私', 'の', 'ケーキ', 'です', 'Cadê', 'o', 'seu', 'café', '3', 'vezes', 'ok']);
    expect(host.hasAttribute('data-voz-estudo')).toBeTrue();
    expect(getComputedStyle(host).userSelect).toBe('none');
  });

  it('cada rabisco tem o lugar e o tamanho exatos da palavra que cobre, na tinta e no corpo dela', () => {
    mount('<p>Uma <b>frase</b> curta.</p>');
    study.start([host], 'pt-BR');
    const words = ['Uma', 'frase', 'curta'];
    expect(boxes().length).toBe(3);
    const text = host.querySelector('p')!;
    boxes().forEach((box, i) => {
      const range = document.createRange();
      const node = i === 1 ? host.querySelector('b')!.firstChild! : text.childNodes[i === 0 ? 0 : 2];
      const at = node.textContent!.indexOf(words[i]);
      range.setStart(node, at);
      range.setEnd(node, at + words[i].length);
      const want = range.getBoundingClientRect();
      const got = box.firstElementChild!.getBoundingClientRect();
      expect(Math.abs(got.left - want.left)).toBeLessThan(0.6);
      expect(Math.abs(got.top - want.top)).toBeLessThan(0.6);
      expect(Math.abs(got.width - want.width)).toBeLessThan(0.6);
      expect(box.style.color).toBe('rgb(29, 35, 64)');
      expect(box.style.fontSize).toBe('20px');
    });
    const drawing = boxes()[0].firstElementChild!;
    expect(getComputedStyle(drawing).maskImage || getComputedStyle(drawing).webkitMaskImage).toContain('svg');
  });

  it('a palavra curta ("o", の) pega o dedo em 24px de largura, e o rabisco continua do tamanho dela', () => {
    mount('<p style="padding-left: 40px">o</p>');
    study.start([host], 'pt-BR');
    const o = boxes()[0];
    const target = o.getBoundingClientRect();
    const drawing = o.firstElementChild!.getBoundingClientRect();
    expect(target.width).toBeCloseTo(24, 0);
    expect(drawing.width).toBeLessThan(15);
    expect(Math.abs(target.left + target.width / 2 - (drawing.left + drawing.width / 2))).toBeLessThan(0.6);
    // tocar na beirada do alvo, fora do desenho, revela
    const edge = document.elementFromPoint(target.left + 1, target.top + target.height / 2)!;
    edge.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(hidden()).not.toContain('o');
  });

  it('a palavra que quebra a linha ganha um rabisco por pedaço; tocar em qualquer um revela a palavra inteira', () => {
    mount('<p style="width: 300px">私のケーキです</p>');
    study.start([host], 'ja-JP');
    const pieces = boxes().filter((b) => b.dataset['p'] === '2');
    expect(pieces.length).withContext('ケーキ é uma palavra só').toBe(1);
    study.stop();
    host.remove();
    const long = mount('<p style="width: 50px; word-break: break-all">Paralelepípedo</p>');
    study.start([long], 'pt-BR');
    expect(boxes().length).toBeGreaterThan(1);
    expect(new Set(boxes().map((b) => b.dataset['p']))).toEqual(new Set(['0']));
    boxes()[1].click();
    expect(hidden()).toEqual([]);
  });

  it('revelar não mexe em nada: o texto fica do mesmo tamanho, no mesmo lugar, e só aquela palavra aparece', async () => {
    mount('<p>Uma frase curta, e outra mais longa que quebra a linha no meio do caminho.</p>');
    study.start([host], 'pt-BR');
    const before = host.querySelector('p')!.getBoundingClientRect();
    const shape = boxes().map((b) => b.getBoundingClientRect().toJSON());
    const frase = boxes().find((b) => b.dataset['p'] === '1')!;
    frase.click();
    expect(hidden()).not.toContain('frase');
    expect(hidden()).toContain('Uma');
    expect(host.querySelector('p')!.getBoundingClientRect().toJSON()).toEqual(before.toJSON());
    // os outros rabiscos ficam onde estavam
    boxes()
      .filter((b) => b.dataset['p'] !== '1')
      .forEach((b) => expect(shape).toContain(b.getBoundingClientRect().toJSON()));
    await new Promise((res) => setTimeout(res, 220));
    expect(boxes().some((b) => b.dataset['p'] === '1')).withContext('o rabisco revelado saiu').toBeFalse();
  });

  it('o clique na palavra escondida só revela: não chega ao link nem ao card que está embaixo', () => {
    mount('<details><summary><a href="#x">Título</a> do card</summary><div>Dentro.</div></details>');
    let clicked = 0;
    host.addEventListener('click', () => clicked++);
    study.start([host], 'pt-BR');
    boxes()[0].click();
    expect(clicked).toBe(0);
    expect(host.querySelector('details')!.open).toBeFalse();
    expect(hidden()).toEqual(['do', 'card']);
  });

  it('duas palavras curtas vizinhas ("e o"): o alvo de cada uma para no meio do vão, sem pegar a outra', () => {
    mount('<p>pão e o vinho</p>');
    study.start([host], 'pt-BR');
    const [e, o] = ['1', '2'].map((p) => boxes().find((b) => b.dataset['p'] === p)!.getBoundingClientRect());
    expect(e.right).toBeLessThanOrEqual(o.left + 0.5);
    const between = (e.right + o.left) / 2;
    expect(indexAt(between - 1, e.top + e.height / 2)).toBe('1');
    expect(indexAt(between + 1, o.top + o.height / 2)).toBe('2');
  });

  it('outra camada que para (a outra anotação aberta ao lado fechou) não apaga o realce desta', () => {
    mount('<p>Um dois.</p>');
    study.start([host], 'pt-BR');
    const other = new VozEstudo();
    other.stop();
    expect(hidden()).toEqual(['Um', 'dois']);
  });

  it('o mouse em cima acende a palavra inteira', () => {
    mount('<p style="width: 50px; word-break: break-all">Paralelepípedo e mais</p>');
    study.start([host], 'pt-BR');
    const first = boxes().filter((b) => b.dataset['p'] === '0');
    first[0].dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
    expect(first.every((b) => b.classList.contains('mao'))).toBeTrue();
    expect(boxes().filter((b) => b.dataset['p'] !== '0').some((b) => b.classList.contains('mao'))).toBeFalse();
    first[0].dispatchEvent(new PointerEvent('pointerout', { bubbles: true, relatedTarget: host }));
    expect(first.some((b) => b.classList.contains('mao'))).toBeFalse();
  });

  it('o mouse parado em cima continua acendendo a palavra depois de os rabiscos se redesenharem', () => {
    mount('<p>Uma frase curta.</p>');
    study.start([host], 'pt-BR');
    const box = boxes()[1].getBoundingClientRect();
    boxes()[1].dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse', clientX: box.left + box.width / 2, clientY: box.top + box.height / 2 }));
    study.refresh();
    expect(boxes().filter((b) => b.classList.contains('mao')).map((b) => b.dataset['p'])).toEqual(['1']);
  });

  it('o texto que muda (refresh): as palavras novas escondidas, a revelada continua revelada', () => {
    mount('<p>Um dois.</p>');
    study.start([host], 'pt-BR');
    boxes()[0].click();
    host.querySelector('p')!.append(' Três.');
    study.refresh();
    expect(hidden()).toEqual(['dois', 'Três']);
  });

  it('a folha que muda de largura leva os rabiscos junto', async () => {
    mount('<p>Uma frase curta.</p>');
    study.start([host], 'pt-BR');
    const tops = () => new Set(boxes().map((b) => Math.round(b.getBoundingClientRect().top)));
    expect(tops().size).toBe(1);
    host.style.width = '60px';
    await frame();
    await frame();
    expect(tops().size).toBeGreaterThan(1);
  });

  it('o bloco que rola de lado recorta o rabisco no que está à mostra', () => {
    mount('<pre style="width: 100px; overflow-x: auto; white-space: pre">curta palavracomprida demais</pre>');
    study.start([host], 'pt-BR');
    const pre = host.querySelector('pre')!.getBoundingClientRect();
    for (const b of boxes()) expect(b.firstElementChild!.getBoundingClientRect().right).toBeLessThanOrEqual(pre.right + 0.5);
    expect(boxes().length).withContext('"demais" está fora da vista').toBe(2);
  });

  it('o que a voz não lê fica como está (o leitor de tela, o spoiler fechado, os botões)', () => {
    mount('<p>Lido <span class="sr-only">só ouvido</span><button>Copiar</button></p>');
    study.start([host], 'pt-BR');
    expect(hidden()).toEqual(['Lido']);
  });

  it('desligar devolve tudo: sem realce, sem camada, sem a marca na raiz', () => {
    mount('<p>Um dois.</p>');
    study.start([host], 'pt-BR');
    study.stop();
    expect(CSS.highlights.has(STUDY_HIGHLIGHT)).toBeFalse();
    expect(host.querySelector(`.${STUDY_LAYER}`)).toBeNull();
    expect(host.hasAttribute('data-voz-estudo')).toBeFalse();
    expect(study.owns(host)).toBeFalse();
  });
});
