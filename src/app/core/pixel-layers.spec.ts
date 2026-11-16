import { FIRST_LAYER_NAME, Layer, PIXEL_LAYERS_MAX, PIXEL_REFS_MAX, cleanRef, flattenLayers, nextLayerName, readLayers, refSources, sanitizeLayers, singleLayer, writeLayers } from './pixel-layers';
import { PixelPiece, sanitizePixelPiece, withPixelPatch } from './pixel-gallery';

const IMG = 'murall://imagem/AAAAAAAAAAAAAAAAAAAAAA';

function dots(id: string, rows: string[], extra: Partial<Layer> = {}): Layer {
  return { id, name: id, hidden: false, kind: 'pontos', rows, ...extra } as Layer;
}

describe('as camadas da pixel art (os dados)', () => {
  it('o achatado põe a de cima por cima, deixa ver pelo transparente e pula as escondidas e as referências', () => {
    const layers: Layer[] = [
      dots('baixo', ['1111', '1111']),
      { id: 'ref', name: 'Foto', hidden: false, kind: 'ref', ref: { src: IMG, x: 0, y: 0, w: 4, h: 2, opacity: 0.5 } },
      dots('meio', ['0220', '0000']),
      dots('escondida', ['3333', '3333'], { hidden: true }),
    ];
    expect(flattenLayers(layers, 4, 2)).toEqual(['1221', '1111']);
    expect(flattenLayers([dots('a', ['12'])], 4, 2)).toEqual(['1200', '0000']);
    expect(flattenLayers([dots('a', ['12'], { hidden: true })], 2, 1)).toEqual(['00']);
  });

  it('a pilha de uma camada só, à mostra e com o nome de sempre, não se grava', () => {
    expect(writeLayers(singleLayer(['12', '21']))).toBeUndefined();
    expect(writeLayers([{ ...singleLayer(['12'])[0], name: 'Contorno' }])).toEqual([{ id: 'c1', name: 'Contorno', rows: '12' }]);
    expect(writeLayers([dots('a', ['10', '00']), dots('b', ['00', '01'], { hidden: true })])).toEqual([
      { id: 'a', name: 'a', rows: '1' },
      { id: 'b', name: 'b', hidden: true, rows: '/01' },
    ]);
  });

  it('a conferida refaz os pontos na grade, tira id repetido, limpa o nome e precisa de uma camada de pontos', () => {
    const out = sanitizeLayers(
      [
        { id: 'a', name: '  Contorno   de   cima ', rows: '1111111' },
        { id: 'a', name: 'repetida', rows: '2' },
        { id: 'r', name: 'Foto', ref: { src: IMG, x: -1.234, y: 0, w: 10, h: 5, opacity: 3 } },
        { id: 'x', name: 'Link de fora', ref: { src: 'https://exemplo.com/a.png', x: 0, y: 0, w: 1, h: 1, opacity: 1 } },
        { id: 'b c', rows: '1' },
        'lixo',
      ],
      4,
      2,
    );
    expect(out).toEqual([
      { id: 'a', name: 'Contorno de cima', rows: '1111' },
      { id: 'r', name: 'Foto', ref: { src: IMG, x: -1.23, y: 0, w: 10, h: 5, opacity: 1 } },
    ]);
    expect(sanitizeLayers([{ id: 'r', name: 'Foto', ref: { src: IMG, x: 0, y: 0, w: 1, h: 1, opacity: 1 } }], 4, 2)).toBeNull();
    expect(sanitizeLayers('nada', 4, 2)).toBeNull();
  });

  it('o teto das camadas e das referências', () => {
    const many = Array.from({ length: PIXEL_LAYERS_MAX + 3 }, (_, i) => ({ id: 'p' + i, name: 'P', rows: '1' }));
    const refs = Array.from({ length: PIXEL_REFS_MAX + 2 }, (_, i) => ({ id: 'r' + i, name: 'R', ref: { src: IMG, x: 0, y: 0, w: 1, h: 1, opacity: 1 } }));
    const out = sanitizeLayers([...many, ...refs], 2, 2)!;
    expect(out.filter((l) => l.rows !== undefined).length).toBe(PIXEL_LAYERS_MAX);
    expect(out.filter((l) => l.ref).length).toBe(PIXEL_REFS_MAX);
  });

  it('a referência: só imagem do Murall, tamanho positivo, opacidade entre 10% e 100%', () => {
    expect(cleanRef({ src: IMG, x: 0, y: 0, w: 0, h: 1, opacity: 1 })).toBeNull();
    expect(cleanRef({ src: IMG, x: 0, y: 0, w: 1, h: 1, opacity: 0 })?.opacity).toBe(0.1);
    expect(cleanRef({ src: IMG, x: 0, y: 0, w: 1, h: 1 })?.opacity).toBe(0.5);
    expect(cleanRef({ src: IMG, x: 99999, y: 0, w: 1, h: 1, opacity: 1 })).toBeNull();
    expect(refSources([{ id: 'a', name: 'a', rows: '1' }, { id: 'r', name: 'r', ref: cleanRef({ src: IMG, x: 0, y: 0, w: 1, h: 1, opacity: 1 })! }])).toEqual([IMG]);
  });

  it('as guardadas viram as do ateliê (sem camadas, uma só com o desenho)', () => {
    expect(readLayers(undefined, { w: 2, h: 1, rows: ['12'] })).toEqual(singleLayer(['12']));
    expect(readLayers([{ id: 'a', name: 'A', hidden: true, rows: '1' }], { w: 3, h: 2, rows: [] })).toEqual([{ id: 'a', name: 'A', hidden: true, kind: 'pontos', rows: ['100', '000'] }]);
  });

  it('o nome da próxima camada não repete', () => {
    expect(nextLayerName([{ name: FIRST_LAYER_NAME }])).toBe('Camada 2');
    expect(nextLayerName([{ name: 'Camada 1' }, { name: 'Camada 3' }, { name: 'Camada 2' }])).toBe('Camada 4');
    expect(nextLayerName([{ name: 'Camada 2' }])).toBe('Camada 3');
  });
});

describe('as camadas na obra da galeria', () => {
  const base: PixelPiece = { id: 'r1', title: 'Gato', art: ['2x2', '12/21', 'pastel'], createdAt: '2026-11-16T10:00:00.000Z', at: '2026-11-16T10:00:00.000Z' };

  it('com as camadas, o desenho do art sai delas (a paleta e o jeito ficam)', () => {
    const p = withPixelPatch(base, { layers: [{ id: 'a', name: 'Fundo', rows: '11/11' }, { id: 'b', name: 'Olho', rows: '/02' }] })!;
    expect(p.art).toEqual(['2x2', '11/12', 'pastel']);
    expect(p.layers?.map((l) => l.name)).toEqual(['Fundo', 'Olho']);
  });

  it('camadas que não dão ponto à mostra não valem', () => {
    expect(withPixelPatch(base, { layers: [{ id: 'a', name: 'A', hidden: true, rows: '11' }] })).toBeNull();
  });

  it('a camada única padrão sai (a obra fica como antes)', () => {
    const p = withPixelPatch(base, { layers: [{ id: 'c1', name: FIRST_LAYER_NAME, rows: '12/21' }] })!;
    expect(p).toEqual(withPixelPatch(base, {})!);
    expect('layers' in p).toBeFalse();
  });

  it('mudar o jeito não mexe nas camadas; mudar os pontos por fora delas as tira', () => {
    const layered = withPixelPatch(base, { layers: [{ id: 'a', name: 'Fundo', rows: '12/2' }, { id: 'b', name: 'Ponto', rows: '/01' }] })!;
    expect(layered.art).toEqual(['2x2', '12/21', 'pastel']);
    const look = withPixelPatch(layered, { art: ['2x2', '12/21', 'pastel', 'figurinha'] })!;
    expect(look.layers).toEqual(layered.layers);
    const drawn = withPixelPatch(layered, { art: ['2x2', '11/11', 'pastel'] })!;
    expect(drawn.layers).toBeUndefined();
    expect(drawn.art).toEqual(['2x2', '11/11', 'pastel']);
  });

  it('a obra guardada com camadas que não batem com o desenho fica, sem as camadas', () => {
    const raw = { ...base, layers: [{ id: 'a', name: 'A', rows: '33/33' }, { id: 'b', name: 'B', rows: '1' }] };
    const p = sanitizePixelPiece(raw)!;
    expect(p.art).toEqual(base.art);
    expect(p.layers).toBeUndefined();
    const ok = sanitizePixelPiece({ ...base, layers: [{ id: 'a', name: 'A', rows: '12/2' }, { id: 'b', name: 'B', rows: '/01' }] })!;
    expect(ok.layers?.length).toBe(2);
  });
});
