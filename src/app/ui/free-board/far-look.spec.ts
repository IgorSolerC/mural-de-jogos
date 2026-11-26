import { FbNode, FbWidget } from '../../core/free-board';
import { CardOf, frameLook, pieceLook } from './far-look';
import { jeitoInks, lightness, mix, resetFarPalette, stockColor } from './far-palette';

/** A aparência de cada peça em ponto pequeno (PLANO-MINIATURA-CANVAS.md, D1–D3). */

const w = (src: string, extra: Partial<FbWidget> = {}): FbNode => ({ i: 'w1', t: 'w', x: 0, y: 0, w: 300, h: 200, src, ...extra });
const cards: CardOf = (id) => (id === 'n-roteiro' ? { stock: 'amarelo', name: 'Roteiro de Lisboa', folder: true } : id === 'n-escura' ? { stock: 'azul-escuro', name: 'Noite', folder: false } : null);

describe('as cores do quadro em ponto pequeno (far-palette.ts)', () => {
  beforeEach(() => resetFarPalette());

  it('lê as cartolinas e os jeitos do CSS (styles.scss é a verdade)', () => {
    expect(stockColor('azul')).toBe(getComputedStyle(document.documentElement).getPropertyValue('--stock-azul').trim());
    expect(stockColor('azul')).toBe('#70cdff');
    expect(stockColor('marrom')).toBe('#b99372');
    const dica = jeitoInks('dica');
    expect(dica.papel).toBe('#d6efe6');
    expect(dica.tinta).toBe('#0f6658');
    // a folha clara: 22% do papel no creme, como o cartao-miolo-cor de ui/_formatado.scss
    expect(dica.miolo).toBe(mix('#d6efe6', '#fffdf8', 0.22));
    // a cartolina fora de uma ficha: o cinza
    expect(jeitoInks('cartolina').papel).toBe('#e7e4de');
  });

  it('mistura e mede a clareza', () => {
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(mix('rgb(0 0 0)', '#ffffff', 0.5)).toBe('#ffffff');
    expect(lightness('#000000')).toBe(0);
    expect(lightness('#ffffff')).toBe(1);
  });
});

describe('a aparência de cada peça (far-look.ts)', () => {
  it('o card do texto: a faixa do jeito com o título, a folha clara com o resto', () => {
    const look = pieceLook({ i: 'x1', t: 'x', x: 0, y: 0, w: 300, h: 200, k: 'dica', txt: 'Viva Viagem\nCarregar no **aeroporto**.' }, null);
    const dica = jeitoInks('dica');
    expect(look.band).toEqual({ color: dica.papel, frac: 0.24 });
    expect(look.paper).toBe(dica.miolo);
    expect(look.ink).toBe(dica.tinta);
    expect(look.title).toBe('Viva Viagem');
    expect(look.body).toBe('Carregar no aeroporto.');
  });

  it('o card só com o título: o papel do jeito inteiro, sem faixa; sem título, o nome do jeito', () => {
    const one = pieceLook({ i: 'x1', t: 'x', x: 0, y: 0, w: 300, h: 100, kc: 'rosa', txt: 'Pastéis de Belém' }, null);
    expect(one.band).toBeNull();
    expect(one.paper).toBe(jeitoInks('rosa').papel);
    expect(pieceLook({ i: 'x2', t: 'x', x: 0, y: 0, w: 300, h: 100, k: 'aviso', txt: '' }, null).title).toBe('Aviso');
  });

  it('a nota colada: a cartolina e o nome da ficha achada, a orelhinha da pasta, a tinta clara na escura', () => {
    const found = pieceLook(w('{{nota: #n-roteiro | Roteiro}}'), cards);
    expect(found.paper).toBe(stockColor('amarelo'));
    expect(found.title).toBe('Roteiro de Lisboa');
    expect(found.tab).not.toBeNull();
    const dark = pieceLook(w('{{nota: #n-escura | Noite}}'), cards);
    expect(dark.tab).toBeNull();
    expect(lightness(dark.ink)).toBeGreaterThan(0.7);
  });

  it('a nota colada que não se acha (a privada, na visita) fica sem nome: nunca o título escrito na linha', () => {
    const look = pieceLook(w('{{nota: #n-privada | Meu diário secreto}}'), cards);
    expect(look.title).toBe('');
    expect(pieceLook(w('{{nota: #n-roteiro | Roteiro}}'), null).title).toBe('');
  });

  it('o contador no jeito dele: o calendário de faixa vermelha, o neon com o aro', () => {
    const cal = pieceLook(w('{{contador: 2026-12-20 | Embarque}}'), null);
    expect(cal.band?.color).toBe('#a51c1b');
    expect(cal.title).toBe('Embarque');
    expect(cal.inner?.kind).toBe('days');
    const neon = pieceLook(w('{{contador: 2026-12-20 | Embarque | neon}}'), null);
    expect(neon.band).toBeNull();
    expect(neon.edge?.color).toBe('#b8f6ff');
  });

  it('a tabela: as fileiras e o cabeçalho do jeito; a caneta sem papel', () => {
    const t = pieceLook(w('{{tabela: listrada}}\n| Dia | Cidade |\n| - | - |\n| 1 | Lisboa |\n| 2 | Sintra |'), null);
    expect(t.inner).toEqual(jasmine.objectContaining({ kind: 'rows', look: 'listrada', rows: 2, cols: 2, head: '#22201d' }));
    expect(t.title).toBe('Dia · Cidade');
    expect(pieceLook(w('{{tabela: caneta}}\n| a |\n| - |\n| 1 |'), null).paper).toBe('');
  });

  it('a pixel art traz os pontos; a imagem, a foto e a beirada da moldura dela', () => {
    const px = pieceLook(w('{{pixel: 2x2 | 12/21 | Gato}}'), null);
    expect(px.inner?.kind).toBe('pixels');
    if (px.inner?.kind === 'pixels') expect(px.inner.art.rows).toEqual(['12', '21']);
    const img = pieceLook(w('{{imagem: murall://imagem/kkdxDJwYDycpsMExjuKjNQ | polaroid}}'), null);
    expect(img.inner).toEqual({ kind: 'image', id: 'kkdxDJwYDycpsMExjuKjNQ', frame: 'polaroid' });
    expect(img.edge?.frac).toBeGreaterThan(0.05);
    expect(pieceLook(w('{{imagem: murall://imagem/kkdxDJwYDycpsMExjuKjNQ | recorte}}'), null).edge).toBeNull();
  });

  it('o vídeo e o som: o escuro com o ícone', () => {
    expect(pieceLook(w('{{video: https://www.youtube.com/watch?v=abc | Lisboa}}'), null).inner).toEqual({ kind: 'play', icon: 'video' });
  });

  it('a moldura: o feltro escuro, o pesponto da cartolina e o nome', () => {
    const f = frameLook({ i: 'm1', t: 'm', x: 0, y: 0, w: 900, h: 600, c: 'azul', nome: ' Lisboa ' });
    expect(f).toEqual(jasmine.objectContaining({ felt: '#0a334b', stitch: '#70cdff', name: 'Lisboa' }));
  });
});
