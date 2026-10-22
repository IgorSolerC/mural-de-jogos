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
