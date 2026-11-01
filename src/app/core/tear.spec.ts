import { collage, stickerFor, titleFor } from './clipping';
import { TEAR_KINDS, stickerEdge, tearFor } from './tear';

describe('tearFor', () => {
  const ids = Array.from({ length: 300 }, (_, i) => `r${i.toString(36)}xyz`);

  it('é o mesmo rasgo para o mesmo id', () => {
    expect(tearFor('rabc123')).toEqual(tearFor('rabc123'));
  });

  it('varia de um recorte para o outro, em todos os tipos de corte', () => {
    const kinds = new Set(ids.map((id) => tearFor(id).kind));
    expect(kinds.size).toBe(TEAR_KINDS.length);
    expect(new Set(ids.map((id) => tearFor(id).paper)).size).toBe(ids.length);
    expect(ids.some((id) => tearFor(id).fold)).toBeTrue();
  });

  it('sai como máscara SVG, com o contorno dentro da caixa', () => {
    for (const id of ids.slice(0, 40)) {
      const t = tearFor(id);
      expect(t.paper.startsWith('url("data:image/svg+xml,')).toBeTrue();
      const d = decodeURIComponent(t.paper).match(/d='([^']+)'/)![1];
      const nums = d.match(/-?\d+(\.\d+)?/g)!.map(Number);
      expect(nums.every((n) => n >= -0.5 && n <= 100.5)).toBeTrue();
    }
  });

  it('dobra a quina de quatro jeitos, em qualquer canto, com a linha da dobra dentro do papel', () => {
    const folds = ids.map((id) => tearFor(id).fold).filter((f) => f !== null);
    expect(new Set(folds.map((f) => f!.style)).size).toBe(4);
    expect(new Set(folds.map((f) => f!.corner)).size).toBe(4);
    for (const f of folds) {
      expect(f!.line.every((v) => v >= -0.5 && v <= 100.5)).toBeTrue();
      if (f!.style === 'orelha' || f!.style === 'curva') expect(f!.flap.length).toBeGreaterThan(0);
    }
  });

  it('a tesoura corta a foto junto com o papel: a foto não tem máscara própria', () => {
    const cut = ids.map(tearFor).filter((t) => t.kind === 'tesoura' || t.kind === 'picote' || t.kind === 'destacavel');
    expect(cut.length).toBeGreaterThan(0);
    expect(cut.every((t) => t.photo === 'none')).toBeTrue();
  });
});

describe('titleFor', () => {
  it('nome de uma palavra no bilhete de resgate vira pedaços de três letras ou mais, sem perder letra', () => {
    const found = Array.from({ length: 400 }, (_, i) => `t${i}`)
      .map((id) => titleFor(id, 'Inscryption', tearFor(id)))
      .filter((t) => t.kind === 'resgate');
    expect(found.length).toBeGreaterThan(0);
    for (const t of found) {
      expect(t.words.map((w) => w.text).join('')).toBe('Inscryption');
      expect(t.words.every((w) => w.text.length >= 3)).toBeTrue();
      expect(t.words.slice(1).every((w) => w.joined)).toBeTrue();
    }
  });

  it('nome de várias palavras fica com as palavras inteiras', () => {
    const t = Array.from({ length: 400 }, (_, i) => `t${i}`)
      .map((id) => titleFor(id, 'Hollow Knight', tearFor(id)))
      .find((x) => x.kind === 'resgate')!;
    expect(t.words.map((w) => w.text)).toEqual(['Hollow', 'Knight']);
  });

  it('nome comprido demais não vira bilhete', () => {
    const long = 'The Legend of Zelda: Breath of the Wild';
    expect(Array.from({ length: 100 }, (_, i) => titleFor(`t${i}`, long, tearFor(`t${i}`)).kind)).not.toContain('resgate');
  });
});

describe('stickerFor', () => {
  it('o adesivo nunca vai na quina dobrada, na arrancada nem na do nome', () => {
    const corners = new Set<number>();
    for (let i = 0; i < 300; i++) {
      const id = `s${i.toString(36)}q`;
      const tear = tearFor(id);
      const look = titleFor(id, 'Hollow Knight', tear);
      const { corner } = stickerFor(id, tear, look);
      corners.add(corner);
      const title = look.place === 'topo' ? (look.side === 'esq' ? 0 : 1) : look.side === 'esq' ? 3 : 2;
      expect(corner).not.toBe(title);
      if (tear.fold) expect(corner).not.toBe(tear.fold.corner);
      if (tear.rip !== null) expect(corner).not.toBe(tear.rip);
    }
    expect(corners.has(0) && corners.has(1)).toBeTrue();
  });
});

describe('collage', () => {
  it('a primeira fileira vai da esquerda para a direita, e ninguém some', () => {
    const items = Array.from({ length: 20 }, (_, i) => ({ id: `c${i}` }));
    const cols = collage(items, 5);
    expect(cols.map((c) => c[0].id)).toEqual(['c0', 'c1', 'c2', 'c3', 'c4']);
    expect(cols.flat().length).toBe(20);
  });
});

describe('stickerEdge (o adesivo picotado da imagem colada)', () => {
  const box = (m: string) => decodeURIComponent(m).match(/viewBox='([^']+)'/)![1].split(' ').map(Number);
  const nums = (m: string) => decodeURIComponent(m).match(/d='([^']+)'/)![1].match(/-?\d+(\.\d+)?/g)!.map(Number);

  it('é o mesmo corte para o mesmo link e o mesmo tamanho, e outro para outro link', () => {
    expect(stickerEdge('https://x.com/a.jpg', 300, 200)).toBe(stickerEdge('https://x.com/a.jpg', 300, 200));
    expect(stickerEdge('https://x.com/a.jpg', 300, 200)).not.toBe(stickerEdge('https://x.com/b.jpg', 300, 200));
    // não mexe no sorteio do recorte da wishlist (o mesmo id)
    const before = tearFor('https://x.com/a.jpg');
    stickerEdge('https://x.com/a.jpg', 300, 200);
    expect(tearFor('https://x.com/a.jpg')).toEqual(before);
  });

  it('a caixa é a da peça em px (dividida pela escala dos dentes), com o zigue-zague dentro dela', () => {
    const m = stickerEdge('s', 300, 200);
    expect(m.startsWith('url("data:image/svg+xml,')).toBeTrue();
    expect(box(m)).toEqual([0, 0, 300, 200]);
    const pts = nums(m);
    expect(pts.every((n) => n >= -0.6 && n <= 300.6)).toBeTrue();
    // uns 6px por dente: (300 + 200) * 2 / 6 dentes, cada um com a ponta e o vale (dois pontos de x e y)
    const teeth = pts.length / 4;
    expect(teeth).toBeGreaterThan(140);
    expect(teeth).toBeLessThan(190);
    // a letra maior: dentes maiores (a mesma peça, metade dos dentes)
    const big = stickerEdge('s', 300, 200, 2);
    expect(box(big)).toEqual([0, 0, 150, 100]);
    expect(nums(big).length).toBeLessThan(pts.length * 0.6);
  });
});
