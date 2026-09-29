import { DAMAGES, SCRIBBLES, cutsPaper, newSeed, sanitizeDamage, sanitizePaper, sanitizePattern, sanitizeScribble, sanitizeSeed } from './paper';
import { cutMask, paperArt, paperStyle, patternTile } from './paper-art';
import { sanitizeReview } from './review';

describe('papel da ficha', () => {
  it('aceita só o que existe; a cartolina de sempre não vai para o armazenamento', () => {
    expect(sanitizePaper('canson')).toBe('canson');
    expect(sanitizePaper('cartolina')).toBeUndefined();
    expect(sanitizePaper('amassada')).toBeUndefined();
    expect(sanitizePattern('gatinhos')).toBe('gatinhos');
    expect(sanitizePattern('dinossauros')).toBeUndefined();
    expect(sanitizeScribble('novelo')).toBe('novelo');
    expect(sanitizeDamage('furado')).toBe('furado');
    expect(sanitizeDamage(['canto'])).toBeUndefined();
  });

  it('a resenha guarda um de cada, e as antigas continuam sem os campos', () => {
    const base = { game: { name: 'Hades', coverUrl: null, source: 'manual' }, scores: { historia: 8, diversao: 9, jogabilidade: 9, visual: 8 } };
    const r = sanitizeReview({ ...base, paper: 'linho', pattern: 'caveiras', scribble: 'espirais', damage: 'queimado' })!;
    expect([r.paper, r.pattern, r.scribble, r.damage]).toEqual(['linho', 'caveiras', 'espirais', 'queimado']);
    const old = sanitizeReview({ ...base, marks: ['gato'] })!;
    for (const k of ['paper', 'pattern', 'scribble', 'damage', 'marks']) expect(k in old).withContext(k).toBeFalse();
  });

  it('o sorteio do estrago vai com a ficha (e com o backup), só quando há estrago', () => {
    const base = { game: { name: 'Hades', coverUrl: null, source: 'manual' }, scores: { historia: 8, diversao: 9, jogabilidade: 9, visual: 8 } };
    expect(sanitizeReview({ ...base, damage: 'furado', damageSeed: 12345 })!.damageSeed).toBe(12345);
    expect('damageSeed' in sanitizeReview({ ...base, damageSeed: 12345 })!).toBeFalse();
    for (const bad of [0, -3, 1.5, '12', 2 ** 31, null]) expect(sanitizeSeed(bad)).withContext(String(bad)).toBeUndefined();
    for (let i = 0; i < 50; i++) {
      const s = newSeed(7);
      expect(sanitizeSeed(s)).toBe(s);
      expect(s).not.toBe(7);
    }
  });

  it('a Lisa tira a fibra; a estampa vira um ladrilho', () => {
    expect(paperStyle('lisa', undefined)['--grao']).toBe('none');
    expect(paperStyle(undefined, undefined)['--textura']).toBeNull();
    expect(paperStyle('canson', 'gatinhos')['--estampa']).toBe(patternTile('gatinhos'));
    expect(patternTile('gatinhos')).toContain('data:image/svg+xml');
  });

  it('só os estragos que tiram papel recortam a ficha', () => {
    expect(cutsPaper('molhado')).toBeFalse();
    expect(cutsPaper('dobrado')).toBeFalse();
    expect(cutsPaper('furado')).toBeTrue();
    expect(cutsPaper(undefined)).toBeFalse();
  });

  describe('os desenhos', () => {
    const base = { id: 'r1', W: 420, H: 300, uid: 't' };

    it('é a mesma ficha a cada visita', () => {
      expect(paperArt({ ...base, damage: 'canto', scribble: 'novelo' })).toEqual(paperArt({ ...base, damage: 'canto', scribble: 'novelo' }));
    });

    it('cada sorteio rasga de outro jeito, e o mesmo sorteio é sempre o mesmo rasgo', () => {
      for (const d of DAMAGES) {
        const one = paperArt({ ...base, damage: d, seed: 111 });
        expect(paperArt({ ...base, damage: d, seed: 111 })).withContext(d).toEqual(one);
        expect(paperArt({ ...base, damage: d, seed: 222 })).withContext(d).not.toEqual(one);
      }
      // sem sorteio, o jeito de antes: as fichas já salvas não mudam
      expect(paperArt({ ...base, damage: 'canto' })).not.toEqual(paperArt({ ...base, damage: 'canto', seed: 111 }));
    });

    it('cada estrago que recorta tem máscara; os outros não', () => {
      for (const d of DAMAGES) {
        const art = paperArt({ ...base, damage: d });
        expect(!!cutMask(art, 420, 300)).withContext(d).toBe(cutsPaper(d));
      }
    });

    it('cada rabisco desenha algo, atrás do que está escrito', () => {
      for (const s of SCRIBBLES) {
        const art = paperArt({ ...base, scribble: s });
        expect(art.fundo.length).withContext(s).toBeGreaterThan(100);
        expect(art.frente).withContext(s).toBe('');
      }
    });

    it('sem nada escolhido, nada', () => {
      expect(paperArt(base)).toEqual({ cut: [], evenodd: false, core: [], fundo: '', clareia: '', relevo: '', frente: '', fita: '' });
    });
  });
});
