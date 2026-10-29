import { VigiaDoDom } from './vigia-do-dom';

/** Um documento à parte, com o <cofre-root> e o nonce, para a vigia olhar. */
function documento(nonce: string | null) {
  const doc = document.implementation.createHTMLDocument('cofre');
  const raiz = doc.createElement('cofre-root');
  if (nonce) raiz.setAttribute('ngcspnonce', nonce);
  doc.body.appendChild(raiz);
  return { doc, raiz };
}

const esperarMutacoes = () => new Promise((ok) => setTimeout(ok, 0));

describe('a vigia do DOM', () => {
  it('o que o cofre põe não conta: dentro do cofre-root, e os estilos com o nonce', () => {
    const { doc, raiz } = documento('abc');
    const vigia = new VigiaDoDom(doc, () => undefined);
    expect(vigia.estranho(raiz.appendChild(doc.createElement('div')))).toBeNull();
    const estilo = doc.createElement('style');
    estilo.setAttribute('nonce', 'abc');
    expect(vigia.estranho(doc.head.appendChild(estilo))).toBeNull();
    expect(vigia.estranho(doc.createTextNode('x'))).toBeNull();
  });

  it('o resto conta: fora do cofre-root, estilo sem o nonce, e script ou iframe em qualquer lugar', () => {
    const { doc, raiz } = documento('abc');
    const vigia = new VigiaDoDom(doc, () => undefined);
    expect(vigia.estranho(doc.body.appendChild(doc.createElement('div')))).toBe('<div> fora do cofre');
    expect(vigia.estranho(doc.head.appendChild(doc.createElement('style')))).toBe('<style> fora do cofre');
    expect(vigia.estranho(raiz.appendChild(doc.createElement('script')))).toBe('<script> dentro do cofre');
    expect(vigia.estranho(raiz.appendChild(doc.createElement('iframe')))).toBe('<iframe> dentro do cofre');
  });

  it('o que vem dentro de outro elemento também conta: um <div> com um <iframe>, posto de uma vez', () => {
    const { doc, raiz } = documento('abc');
    const vigia = new VigiaDoDom(doc, () => undefined);
    const embrulho = doc.createElement('div');
    embrulho.appendChild(doc.createElement('span')).appendChild(doc.createElement('iframe'));
    expect(vigia.estranho(raiz.appendChild(embrulho))).toBe('<iframe> dentro do cofre');
    const outro = doc.createElement('section');
    outro.appendChild(doc.createElement('p'));
    expect(vigia.estranho(raiz.appendChild(outro))).toBeNull();
  });

  it('ao começar, olha o que já estava na página: o do index.html passa, o de uma extensão não', () => {
    /** O index.html do build: as metas, a base, o estilo e os scripts da origem, e o <cofre-root>. */
    const doBuild = () => {
      const { doc, raiz } = documento('abc');
      const base = doc.head.appendChild(doc.createElement('base'));
      base.setAttribute('href', 'https://cofre.teste/');
      doc.head.appendChild(doc.createElement('meta')).setAttribute('charset', 'utf-8');
      doc.head.appendChild(doc.createElement('title')).textContent = 'Cofre';
      const icone = doc.head.appendChild(doc.createElement('link'));
      icone.setAttribute('rel', 'icon');
      icone.setAttribute('href', 'favicon.svg');
      const css = doc.head.appendChild(doc.createElement('link'));
      css.setAttribute('rel', 'stylesheet');
      css.setAttribute('href', 'styles-ABC.css');
      const estilo = doc.head.appendChild(doc.createElement('style'));
      estilo.setAttribute('nonce', 'abc');
      const pre = doc.body.appendChild(doc.createElement('link'));
      pre.setAttribute('rel', 'modulepreload');
      pre.setAttribute('href', 'chunk-1.js');
      const main = doc.body.appendChild(doc.createElement('script'));
      main.setAttribute('type', 'module');
      main.setAttribute('src', 'main-1.js');
      raiz.appendChild(doc.createElement('cofre-topo'));
      return { doc, raiz };
    };
    expect(new VigiaDoDom(doBuild().doc, () => undefined).varrer()).toBeNull();

    const casos: [string, (d: ReturnType<typeof doBuild>) => void][] = [
      ['<grammarly-extension> fora do cofre', ({ doc }) => doc.body.appendChild(doc.createElement('grammarly-extension'))],
      ['<script> fora do cofre', ({ doc }) => doc.head.appendChild(doc.createElement('script')).setAttribute('src', 'chrome-extension://abc/inject.js')],
      ['<script> fora do cofre', ({ doc }) => (doc.body.appendChild(doc.createElement('script')).textContent = 'window.x = 1')],
      ['<style> fora do cofre', ({ doc }) => doc.head.appendChild(doc.createElement('style'))],
      ['<link> fora do cofre', ({ doc }) => doc.head.appendChild(doc.createElement('link')).setAttribute('href', 'https://outro.site/x.css')],
      ['<iframe> dentro do cofre', ({ doc, raiz }) => raiz.firstElementChild!.appendChild(doc.createElement('div')).appendChild(doc.createElement('iframe'))],
      ['<div> fora do cofre', ({ doc }) => doc.documentElement.appendChild(doc.createElement('div'))],
    ];
    for (const [esperado, mexer] of casos) {
      const pagina = doBuild();
      mexer(pagina);
      const vistos: string[] = [];
      const vigia = new VigiaDoDom(pagina.doc, (o) => vistos.push(o));
      expect(vigia.varrer()).withContext(esperado).toBe(esperado);
      // começar já avisa, sem esperar mudar nada
      vigia.comecar();
      expect(vistos).withContext(esperado).toEqual([esperado]);
      vigia.parar();
    }
  });

  it('sem nonce (desenvolvimento), os estilos do Angular passam', () => {
    const { doc } = documento(null);
    expect(new VigiaDoDom(doc, () => undefined).estranho(doc.head.appendChild(doc.createElement('style')))).toBeNull();
  });

  it('observando, avisa do que uma extensão acrescentar', async () => {
    const { doc, raiz } = documento('abc');
    const vistos: string[] = [];
    const vigia = new VigiaDoDom(doc, (o) => vistos.push(o));
    vigia.comecar();
    raiz.appendChild(doc.createElement('p'));
    await esperarMutacoes();
    expect(vistos).toEqual([]);
    doc.body.appendChild(doc.createElement('extensao-injetada'));
    await esperarMutacoes();
    expect(vistos).toEqual(['<extensao-injetada> fora do cofre']);
    vigia.parar();
    doc.body.appendChild(doc.createElement('div'));
    await esperarMutacoes();
    expect(vistos.length).toBe(1);
  });
});
