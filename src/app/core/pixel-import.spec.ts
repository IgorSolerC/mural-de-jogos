import { readPixelArt, inkOf } from './pixel-art';
import { Rgba, asksScale, fitSide, guessScale, scaleFor, imageArt, imageInks, pixelSized, scaledSize, shrinkRgba, titleOfFile, undoScale } from './pixel-import';

/** Uma imagem de pontos: cada caractere uma cor (o "." é o transparente). */
const PAINT: Record<string, [number, number, number]> = {
  k: [20, 18, 30],
  r: [228, 59, 68],
  y: [254, 231, 97],
  b: [0, 149, 233],
  w: [255, 255, 255],
  g: [62, 137, 72],
};

function art(rows: string[]): Rgba {
  const w = rows[0].length;
  const h = rows.length;
  const data = new Uint8ClampedArray(w * h * 4);
  rows.forEach((r, y) =>
    [...r].forEach((ch, x) => {
      const o = (y * w + x) * 4;
      if (ch === '.') return;
      const [R, G, B] = PAINT[ch];
      data.set([R, G, B, 255], o);
    }),
  );
  return { data, w, h };
}

/** A imagem ampliada: cada ponto vira `kx` × `ky` pixels; `cut` tira tantos pixels do começo (a imagem cortada). */
function upscale(img: Rgba, kx: number, ky: number, cut = { x: 0, y: 0 }): Rgba {
  const W = img.w * kx - cut.x;
  const H = img.h * ky - cut.y;
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const sx = Math.floor((x + cut.x) / kx);
      const sy = Math.floor((y + cut.y) / ky);
      const o = (sy * img.w + sx) * 4;
      data.set([img.data[o], img.data[o + 1], img.data[o + 2], img.data[o + 3]], (y * W + x) * 4);
    }
  return { data, w: W, h: H };
}

/** Os pontos de volta em caracteres, para comparar. */
function back(img: Rgba): string[] {
  const name = (o: number) => (img.data[o + 3] < 128 ? '.' : (Object.entries(PAINT).find(([, c]) => c[0] === img.data[o] && c[1] === img.data[o + 1] && c[2] === img.data[o + 2])?.[0] ?? '?'));
  return Array.from({ length: img.h }, (_, y) => Array.from({ length: img.w }, (_, x) => name((y * img.w + x) * 4)).join(''));
}

const HEART = ['.kk.kk.', 'krrkrrk', 'krryrrk', 'krrrrrk', '.krrrk.', '..krk..', '...k...'];
const SPRITE = ['..kkkk..', '.kyyyyk.', 'kyykkyyk', 'kyyyyyyk', 'kybyybyk', 'kyybbyyk', '.kyyyyk.', '..kkkk..', 'g.g..g.g'];

describe('da imagem à pixel art', () => {
  it('acha a ampliação de uma pixel art, com o passo de cada eixo, e volta ao tamanho de verdade', () => {
    for (const k of [2, 3, 4, 8, 10]) {
      const big = upscale(art(SPRITE), k, k);
      const s = guessScale(big)!;
      expect([s.kx, s.ky]).withContext(`ampliada ${k}×`).toEqual([k, k]);
      expect(back(undoScale(big, s))).toEqual(SPRITE);
    }
  });

  it('os pontos que não são quadrados: cada eixo com o passo dele, e a proporção certa', () => {
    const big = upscale(art(SPRITE), 4, 6);
    const s = guessScale(big)!;
    expect([s.kx, s.ky]).toEqual([4, 6]);
    expect(scaledSize(big.w, big.h, s)).toEqual({ w: 8, h: 9 });
    expect(back(undoScale(big, s))).toEqual(SPRITE);
  });

  it('a imagem cortada no meio de um ponto: a grade começa onde ele acaba, e o pedaço da beirada também vira ponto', () => {
    const big = upscale(art(SPRITE), 5, 5, { x: 2, y: 3 });
    const s = guessScale(big)!;
    expect([s.kx, s.ky, s.ox, s.oy]).toEqual([5, 5, 3, 2]);
    expect(back(undoScale(big, s))).toEqual(SPRITE);
  });

  it('a beirada borrada (o JPEG) não pinta o ponto: conta o miolo de cada quadradinho, e sem cor repetida, a média dele', () => {
    const big = upscale(art(SPRITE), 8, 8);
    const d = big.data as Uint8ClampedArray;
    // a beirada de cada quadradinho com outra cor, e o miolo com um ruído que não repete
    for (let y = 0; y < big.h; y++)
      for (let x = 0; x < big.w; x++) {
        const o = (y * big.w + x) * 4;
        if (!d[o + 3]) continue;
        if (x % 8 === 0 || y % 8 === 0) d.set([128, 128, 128], o);
        else d[o + 2] = Math.min(255, d[o + 2] + ((x * 3 + y * 5) % 9));
      }
    const back8 = undoScale(big, { kx: 8, ky: 8, ox: 0, oy: 0 });
    // o amarelo (254, 231, 97) do miolo, com o azul do ruído na média: nunca o cinza da beirada
    const o = (1 * 8 + 2) * 4;
    expect([back8.data[o], back8.data[o + 1]]).toEqual([254, 231]);
    expect(back8.data[o + 2]).toBeGreaterThanOrEqual(97);
    expect(back8.data[o + 2]).toBeLessThan(110);
  });

  it('uma imagem grande desfaz a ampliação depressa (só o miolo de cada quadradinho entra na conta)', () => {
    const big = upscale(art(SPRITE), 400, 400);
    const t = performance.now();
    const s = guessScale(big)!;
    const back = undoScale(big, s);
    expect([back.w, back.h]).toEqual([8, 9]);
    expect(performance.now() - t).toBeLessThan(2500);
    // o passo escolhido de novo não refaz a passada pela imagem
    const t2 = performance.now();
    scaleFor(big, 200);
    expect(performance.now() - t2).toBeLessThan(300);
  });

  it('um pouco de sujeira (outro perfil de cor, um pixel trocado) não esconde a grade', () => {
    const big = upscale(art(SPRITE), 6, 6);
    const d = big.data as Uint8ClampedArray;
    for (let o = 0; o < d.length; o += 4) if (d[o + 3]) d[o] = Math.min(255, d[o] + ((o / 4) % 7));
    // um pixel trocado no meio de um ponto: a cor que mais aparece no quadradinho continua a dele
    d.set([0, 149, 233, 255], (13 * big.w + 20) * 4);
    const s = guessScale(big)!;
    expect([s.kx, s.ky]).toEqual([6, 6]);
    expect(undoScale(big, s).w).toBe(8);
  });

  it('a imagem sem ampliação (cada pixel um ponto, ou uma foto) não tem grade', () => {
    const one = art(SPRITE.concat(SPRITE));
    expect(guessScale(one)).toBeNull();
    let seed = 1;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const photo = new Uint8ClampedArray(120 * 90 * 4).map((_, i) => (i % 4 === 3 ? 255 : Math.floor(rnd() * 256)));
    expect(guessScale({ data: photo, w: 120, h: 90 })).toBeNull();
    // uma cor só: nada para medir
    expect(guessScale(upscale(art(['rrrr', 'rrrr', 'rrrr', 'rrrr', 'rrrr', 'rrrr', 'rrrr', 'rrrr']), 4, 4))).toBeNull();
  });

  it('listras só num sentido: o passo de um eixo vale para os dois', () => {
    const stripes = upscale(art(Array.from({ length: 8 }, () => 'rbrbrbrb')), 3, 3);
    expect(guessScale(stripes)).toEqual({ kx: 3, ky: 3, ox: 0, oy: 0 });
  });

  it('o teto: a maior que 256 encolhe até caber, sem deformar', () => {
    expect(fitSide(64, 32)).toEqual({ w: 64, h: 32 });
    expect(fitSide(512, 256)).toEqual({ w: 256, h: 128 });
    expect(fitSide(300, 1200)).toEqual({ w: 64, h: 256 });
    expect(fitSide(3000, 1)).toEqual({ w: 256, h: 1 });
    const big = upscale(art(SPRITE), 40, 40);
    expect([big.w, big.h]).toEqual([320, 360]);
    const sized = pixelSized(big);
    expect([sized.w, sized.h]).toEqual([228, 256]);
    // desfeita a ampliação, nem precisa encolher
    const plain = pixelSized(big, guessScale(big)!);
    expect(back(plain)).toEqual(SPRITE);
  });

  it('encolher faz a média de cada caixa, e o transparente não escurece a beirada', () => {
    const img = art(['rr..', 'rr..', 'ww..', 'ww..']);
    const small = shrinkRgba(img, 2, 2);
    expect(Array.from(small.data).slice(0, 4)).toEqual([228, 59, 68, 255]);
    expect(Array.from(small.data).slice(4, 8)).toEqual([0, 0, 0, 0]);
    const half = shrinkRgba(art(['r.', 'r.']), 1, 1);
    expect(Array.from(half.data)).toEqual([228, 59, 68, 128]);
  });

  it('a paleta é a da imagem: as cores exatas, da mais escura para a mais clara', () => {
    expect(imageInks(art(HEART))).toEqual(['#14121e', '#e43b44', '#fee761']);
    const piece = readPixelArt(imageArt(art(HEART))!);
    expect([piece.w, piece.h, piece.palette]).toEqual([7, 7, 'propria']);
    expect(inkOf(piece.palette, piece.colors).slice(1, 4)).toEqual(['#14121e', '#e43b44', '#fee761']);
    expect(piece.rows[0]).toBe('0110110');
    expect(piece.rows[2]).toBe('1223221');
  });

  it('com mais de 61 cores, as 61 do corte na mediana, e cada ponto na mais perto', () => {
    const data = new Uint8ClampedArray(20 * 20 * 4);
    for (let i = 0; i < 400; i++) data.set([i % 256, (i * 7) % 256, (i * 13) % 256, 255], i * 4);
    const inks = imageInks({ data, w: 20, h: 20 });
    expect(inks.length).toBeLessThanOrEqual(61);
    expect(inks.length).toBeGreaterThan(40);
    const piece = readPixelArt(imageArt({ data, w: 20, h: 20 })!);
    expect(piece.rows.every((r) => !r.includes('0'))).toBeTrue();
  });

  it('toda transparente não vira obra', () => {
    expect(imageArt(art(['..', '..']))).toBeNull();
  });

  it('o nome é o do arquivo, sem a extensão; o "image.png" do colado fica sem título', () => {
    expect(titleOfFile('Mario   pulando.png')).toBe('Mario pulando');
    expect(titleOfFile('sprite_01.final.webp')).toBe('sprite_01.final');
    expect(titleOfFile('image.png')).toBe('');
    expect(titleOfFile('sem-extensao')).toBe('sem-extensao');
  });

  it('o passo escolhido à mão acha onde a grade começa; 1 é sem ampliação', () => {
    const big = upscale(art(SPRITE), 5, 5, { x: 2, y: 3 });
    expect(scaleFor(big, 5)).toEqual({ kx: 5, ky: 5, ox: 3, oy: 2 });
    expect(scaleFor(big, 1)).toEqual({ kx: 1, ky: 1, ox: 0, oy: 0 });
    // o adivinhado, quando é o mesmo passo, fica como veio (os pontos que não são quadrados também)
    const tall = upscale(art(SPRITE), 4, 6);
    const guess = guessScale(tall)!;
    expect(scaleFor(tall, 6, { ...guess, kx: 6 })).toEqual({ ...guess, kx: 6 });
    expect([scaleFor(tall, 4, guess).kx, scaleFor(tall, 4, guess).ky]).toEqual([4, 4]);
    expect(scaledSize(tall.w, tall.h, scaleFor(tall, 4, guess))).toEqual({ w: 8, h: 14 });
  });

  it('pergunta da ampliação só quando algum lado passa de 64', () => {
    expect(asksScale(64, 64)).toBeFalse();
    expect(asksScale(65, 10)).toBeTrue();
    expect(asksScale(10, 300)).toBeTrue();
  });
});
