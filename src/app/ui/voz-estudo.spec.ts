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
    // preso no alto da tela, por cima de tudo: o que outros testes deixam na página não cobre o ponto que se toca
    host.style.cssText = 'position: fixed; top: 0; left: 0; z-index: 2147483647; background: #fff; width: 420px; font: 20px/1.6 sans-serif; color: rgb(29, 35, 64)';
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

  it('a palavra que quebra a linha ganha um rabisco por pedaço; tocar em qualquer um revela a frase inteira', () => {
    mount('<p style="width: 300px">私のケーキです</p>');
    study.start([host], 'ja-JP');
    expect(boxes().length).withContext('私|の|ケーキ|です: ケーキ é uma palavra só, um rabisco').toBe(4);
    study.stop();
    host.remove();
    const long = mount('<p style="width: 50px; word-break: break-all">Paralelepípedo</p>');
    study.start([long], 'pt-BR');
    expect(boxes().length).toBeGreaterThan(1);
    expect(new Set(boxes().map((b) => b.dataset['p']))).toEqual(new Set(['0']));
    boxes()[1].click();
    expect(hidden()).toEqual([]);
  });

  it('tocar numa palavra revela a frase inteira dela, e só ela (o 。 e a linha acabam a frase)', () => {
    mount('<p>私のケーキです。あなたは？</p><p>Cadê o café</p><p>Aqui</p>');
    study.start([host], 'ja-JP');
    expect(boxes().map((b) => b.dataset['p'])).toEqual(['0', '0', '0', '0', '1', '1', '2', '2', '2', '3']);
    boxes()[1].click();
    expect(hidden()).toEqual(['あなた', 'は', 'Cadê', 'o', 'café', 'Aqui']);
    expect(boxes().filter((b) => b.classList.contains('aberta')).length).toBe(4);
    boxes()[7].click();
    expect(hidden()).toEqual(['あなた', 'は', 'Aqui']);
  });

  it('revelar não mexe em nada: o texto fica do mesmo tamanho, no mesmo lugar, e só aquela frase aparece', async () => {
    mount('<p>Uma frase curta. E outra mais longa que quebra a linha no meio do caminho.</p>');
    study.start([host], 'pt-BR');
    const before = host.querySelector('p')!.getBoundingClientRect();
    const shape = boxes().map((b) => b.getBoundingClientRect().toJSON());
    boxes()[1].click();
    expect(hidden()).not.toContain('Uma');
    expect(hidden()).not.toContain('frase');
    expect(hidden()).not.toContain('curta');
    expect(hidden()).toContain('outra');
    expect(host.querySelector('p')!.getBoundingClientRect().toJSON()).toEqual(before.toJSON());
    // os rabiscos ficam onde estavam
    boxes().forEach((b) => expect(shape).toContain(b.getBoundingClientRect().toJSON()));
    await new Promise((res) => setTimeout(res, 220));
    const open = boxes().filter((b) => b.dataset['p'] === '0');
    expect(open.length).withContext('os alvos do toque ficam, para esconder de novo').toBe(3);
    for (const box of open) {
      expect(box.classList).toContain('aberta');
      expect(getComputedStyle(box.firstElementChild!).opacity).withContext('o rabisco sumiu').toBe('0');
    }
    expect(boxes().filter((b) => b.dataset['p'] === '1').some((b) => b.classList.contains('aberta'))).toBeFalse();
  });

  it('tocar de novo na revelada a esconde outra vez, no mesmo lugar; e assim fica depois de redesenhar', () => {
    mount('<p>Uma frase. Outra curta.</p>');
    study.start([host], 'pt-BR');
    const frase = () => boxes()[1];
    const shape = host.querySelector('p')!.getBoundingClientRect().toJSON();
    frase().click();
    expect(hidden()).toEqual(['Outra', 'curta']);
    frase().click();
    expect(hidden()).toEqual(['Outra', 'curta', 'Uma', 'frase']);
    expect(frase().classList).not.toContain('aberta');
    expect(host.querySelector('p')!.getBoundingClientRect().toJSON()).toEqual(shape);
    study.refresh();
    expect(hidden()).toEqual(['Uma', 'frase', 'Outra', 'curta']);
    frase().click();
    study.refresh();
    expect(hidden()).toEqual(['Outra', 'curta']);
    expect(boxes()[0].classList).withContext('a revelada, redesenhada, continua um alvo').toContain('aberta');
    expect(frase().classList).toContain('aberta');
  });

  it('no modo estudo, o clique na palavra só revela ou esconde: não chega ao link nem ao card que está embaixo', () => {
    mount('<details><summary><a href="#x">Título</a> do card</summary><div>Dentro.</div></details>');
    let clicked = 0;
    host.addEventListener('click', () => clicked++);
    study.start([host], 'pt-BR');
    boxes()[0].click();
    expect(clicked).toBe(0);
    expect(host.querySelector('details')!.open).toBeFalse();
    expect(hidden()).toEqual([]);
    boxes()[0].click();
    expect(clicked).withContext('a revelada também não abre o link').toBe(0);
    expect(host.querySelector('details')!.open).toBeFalse();
    expect(hidden()).toEqual(['Título', 'do', 'card']);
  });

  it('as palavras da mesma frase: o vão entre elas (o espaço, a vírgula) também pega o toque', () => {
    mount('<p>pão, e o vinho</p>');
    study.start([host], 'pt-BR');
    const rects = boxes().map((b) => b.getBoundingClientRect());
    for (let k = 1; k < rects.length; k++) expect(Math.abs(rects[k].left - rects[k - 1].right)).withContext('entre ' + (k - 1) + ' e ' + k).toBeLessThan(0.6);
    const [pao, e] = rects;
    expect(indexAt((pao.right + e.left) / 2, pao.top + pao.height / 2)).toBe('0');
    expect(boxes()[0].style.getPropertyValue('--pad-r')).withContext('o desenho continua do tamanho da palavra').not.toBe('0px');
  });

  it('o vão seguido passa pelo negrito e pelo código no meio da frase (que começa um pouco acima ou abaixo)', () => {
    mount('<p>Use <b>o</b> <code style="font: 15px monospace; padding: 3px 4px">npm</code> agora</p>');
    study.start([host], 'pt-BR');
    const rects = boxes().map((b) => b.getBoundingClientRect());
    expect(rects.length).toBe(4);
    for (let k = 1; k < rects.length; k++) expect(Math.abs(rects[k].left - rects[k - 1].right)).withContext('entre ' + (k - 1) + ' e ' + k).toBeLessThan(0.6);
  });

  it('o spoiler fechado no meio da frase continua pegando o próprio toque (o alvo da frase não passa por cima dele)', () => {
    mount('<p>Antes <span class="spoiler-texto" inert style="display: inline-block; width: 80px">segredo</span> depois</p>');
    study.start([host], 'pt-BR');
    expect(hidden()).toEqual(['Antes', 'depois']);
    const spoiler = host.querySelector('.spoiler-texto')!.getBoundingClientRect();
    const [antes, depois] = boxes().map((b) => b.getBoundingClientRect());
    expect(antes.right).toBeLessThanOrEqual(spoiler.left + 0.5);
    expect(depois.left).toBeGreaterThanOrEqual(spoiler.right - 0.5);
  });

  it('a frase revelada continua revelada quando o texto antes dela, no mesmo nó, muda; a que muda volta a se esconder', () => {
    mount('<p>Um. Dois três.</p>');
    study.start([host], 'pt-BR');
    boxes()[1].click();
    expect(hidden()).toEqual(['Um']);
    const text = host.querySelector('p')!.firstChild as Text;
    text.data = 'Um, ok. Dois três.';
    study.refresh();
    expect(hidden()).toEqual(['Um', 'ok']);
    text.data = 'Um, ok. Dois quatro.';
    study.refresh();
    expect(hidden()).toEqual(['Um', 'ok', 'Dois', 'quatro']);
  });

  it('frases iguais no mesmo nó ("Sim. Não. Sim."): cada uma se revela sozinha; e a pontuação que muda também esconde de novo', () => {
    mount('<p>Sim. Não. Sim.</p>');
    study.start([host], 'pt-BR');
    boxes()[0].click();
    expect(hidden()).toEqual(['Não', 'Sim']);
    boxes()[2].click();
    expect(hidden()).toEqual(['Não']);
    boxes()[2].click();
    study.refresh();
    expect(hidden()).withContext('redesenhada, só a primeira continua revelada').toEqual(['Não', 'Sim']);
    expect(boxes().map((b) => b.classList.contains('aberta'))).toEqual([true, false, false]);
    const text = host.querySelector('p')!.firstChild as Text;
    text.data = 'Sim. Não!';
    boxes()[1].click();
    study.refresh();
    expect(hidden()).withContext('"Não." virou "Não!": escondida de novo').toEqual(['Não']);
  });

  it('o expoente no meio da frase é da mesma linha; o vão largo (o texto justificado) não vira alvo', () => {
    mount('<p>Vale 10<sup>2</sup>. Depois</p><p style="word-spacing: 80px">Um dois</p>');
    study.start([host], 'pt-BR');
    const sup = host.querySelector('sup')!.getBoundingClientRect();
    expect(boxes().length).withContext('Vale, 10 e o 2 (a mesma palavra), Depois, Um, dois').toBe(6);
    const [dez, dois2, depois] = boxes().slice(1, 4).map((b) => b.getBoundingClientRect());
    expect(Math.abs(dois2.left - dez.right)).withContext('o 10 e o 2 em cima, a mesma palavra na mesma linha: colados').toBeLessThan(0.6);
    expect(depois.left).withContext('a folga do expoente não passa por cima de "Depois", de outra frase').toBeGreaterThanOrEqual(sup.right - 0.5);
    const [um, dois] = boxes().slice(-2).map((b) => b.getBoundingClientRect());
    expect(dois.left - um.right).toBeGreaterThan(40);
  });

  it('duas palavras curtas vizinhas de frases diferentes ("Oi. E"): o alvo de cada uma para no meio do vão, sem pegar a outra', () => {
    mount('<p>Oi. E o vinho?</p>');
    study.start([host], 'pt-BR');
    const [oi, e] = boxes().map((b) => b.getBoundingClientRect());
    expect(oi.right).toBeLessThanOrEqual(e.left + 0.5);
    const text = host.querySelector('p')!.firstChild!;
    const range = document.createRange();
    range.setStart(text, 4);
    range.setEnd(text, 5);
    const e0 = range.getBoundingClientRect();
    expect(e.left).withContext('o alvo do "E" cresce para a esquerda, mas só até o meio do vão').toBeLessThan(e0.left - 0.5);
    const oiText = boxes()[0].firstElementChild!.getBoundingClientRect();
    expect(e.left).toBeGreaterThanOrEqual((oiText.right + e0.left) / 2 - 0.5);
    expect(indexAt(oi.right - 1, oi.top + oi.height / 2)).toBe('0');
    expect(indexAt(e.left + 1, e.top + e.height / 2)).toBe('1');
  });

  it('outra camada que para (a outra anotação aberta ao lado fechou) não apaga o realce desta', () => {
    mount('<p>Um dois.</p>');
    study.start([host], 'pt-BR');
    const other = new VozEstudo();
    other.stop();
    expect(hidden()).toEqual(['Um', 'dois']);
  });

  it('o mouse em cima de uma palavra acende a frase inteira (o que o toque vai abrir), e só ela', () => {
    mount('<p style="width: 50px; word-break: break-all">Paralelepípedo e mais. Outra.</p>');
    study.start([host], 'pt-BR');
    const first = boxes().filter((b) => b.dataset['p'] === '0');
    expect(first.length).toBeGreaterThan(3);
    first[first.length - 1].dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
    expect(first.every((b) => b.classList.contains('mao'))).toBeTrue();
    expect(boxes().filter((b) => b.dataset['p'] !== '0').some((b) => b.classList.contains('mao'))).toBeFalse();
    // passar de uma palavra para a outra da mesma frase não apaga
    first[first.length - 1].dispatchEvent(new PointerEvent('pointerout', { bubbles: true, relatedTarget: first[0] }));
    expect(first.every((b) => b.classList.contains('mao'))).toBeTrue();
    first[0].dispatchEvent(new PointerEvent('pointerout', { bubbles: true, relatedTarget: host }));
    expect(first.some((b) => b.classList.contains('mao'))).toBeFalse();
  });

  it('o mouse parado em cima continua acendendo a frase depois de os rabiscos se redesenharem', () => {
    mount('<p>Uma. Frase curta.</p>');
    study.start([host], 'pt-BR');
    const box = boxes()[1].getBoundingClientRect();
    boxes()[1].dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse', clientX: box.left + box.width / 2, clientY: box.top + box.height / 2 }));
    study.refresh();
    expect(boxes().filter((b) => b.classList.contains('mao')).map((b) => b.dataset['p'])).toEqual(['1', '1']);
  });

  it('a letra que sai do transparente devagar (o spoiler revelado): o rabisco pega a cor de chegada, nunca a transparente', async () => {
    mount('<p>Antes <span class="sp" style="color: transparent; transition: color 60ms linear">segredo</span>.</p>');
    study.start([host], 'pt-BR');
    const sp = () => boxes()[1];
    expect(sp().style.color).withContext('transparente: a tinta de fora').toBe('rgb(29, 35, 64)');
    host.querySelector<HTMLElement>('.sp')!.style.color = 'rgb(200, 0, 0)';
    study.refresh();
    await new Promise((res) => setTimeout(res, 150));
    await frame();
    expect(sp().style.color).withContext('depois da transição, a cor dela').toBe('rgb(200, 0, 0)');
  });

  it('as transições dos próprios rabiscos (o laranja do mouse) não redesenham a camada', async () => {
    mount('<p>Uma frase curta.</p>');
    study.start([host], 'pt-BR');
    const first = boxes()[1];
    first.firstElementChild!.dispatchEvent(new TransitionEvent('transitionend', { bubbles: true, propertyName: 'background-color' }));
    first.firstElementChild!.dispatchEvent(new TransitionEvent('transitionend', { bubbles: true, propertyName: 'color' }));
    await frame();
    expect(boxes()[1]).withContext('os mesmos rabiscos, sem redesenhar').toBe(first);
    host.querySelector('p')!.dispatchEvent(new TransitionEvent('transitionend', { bubbles: true, propertyName: 'color' }));
    await frame();
    expect(boxes()[1]).withContext('a cor do texto que mudou redesenha').not.toBe(first);
  });

  it('a letra preta continua preta (rgb(0, 0, 0) não é transparente)', () => {
    mount('<p style="color: rgb(0, 0, 0)">Preto.</p>');
    study.start([host], 'pt-BR');
    expect(boxes()[0].style.color).toBe('rgb(0, 0, 0)');
  });

  it('o texto que muda (refresh): a frase nova escondida, a revelada continua revelada', () => {
    mount('<p>Um dois.</p>');
    study.start([host], 'pt-BR');
    boxes()[0].click();
    host.querySelector('p')!.append(' Três.');
    study.refresh();
    expect(hidden()).toEqual(['Três']);
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
