import { DAMAGES, DECORS, DEFAULT_LOOK, DEFAULT_PATTERN_INK, DEFAULT_SCRIBBLE_INK, PATTERNS, PATTERN_GROUPS, PATTERN_LABEL, groupOfPattern, SCRIBBLES, STAINS, cutsPaper, lookOf, decorCuts, newSeed, sanitizeDamage, sanitizeDecor, sanitizeLookStep, sanitizePaper, sanitizePattern, sanitizePatternInk, sanitizeScribble, sanitizeSeed } from './paper';
import { cutMask, lightPattern, motifIcon, paperArt, paperStyle, paperVars, patternTile } from './paper-art';
import { decorArt } from './decor-art';
import { sanitizeReview } from './review';

describe('papel da ficha', () => {
  it('aceita só o que existe; a cartolina de sempre não vai para o armazenamento', () => {
    expect(sanitizePaper('canson')).toBe('canson');
    expect(sanitizePaper('cartolina')).toBeUndefined();
    expect(sanitizePaper('amassada')).toBeUndefined();
    expect(sanitizePattern('gatinhos')).toBe('gatinhos');
    expect(sanitizePattern('unicornios')).toBeUndefined();
    expect(sanitizeScribble('novelo')).toBe('novelo');
    expect(sanitizeDamage('furado')).toBe('furado');
    expect(sanitizeDamage('arrancado')).toBe('rasgado');
    expect(sanitizeDamage('canto')).toBe('rasgado');
    expect(sanitizeDamage(['canto'])).toBeUndefined();
  });

  it('a resenha guarda um de cada, e as antigas continuam sem os campos', () => {
    const base = { game: { name: 'Hades', coverUrl: null, source: 'manual' }, scores: { historia: 8, diversao: 9, jogabilidade: 9, visual: 8 } };
    const r = sanitizeReview({ ...base, paper: 'linho', pattern: 'caveiras', scribble: 'hachura', damage: 'queimado' })!;
    expect([r.paper, r.pattern, r.scribble, r.damage]).toEqual(['linho', 'caveiras', 'hachura', 'queimado']);
    const old = sanitizeReview({ ...base, marks: ['gato'] })!;
    for (const k of ['paper', 'pattern', 'scribble', 'damage', 'marks']) expect(k in old).withContext(k).toBeFalse();
    for (const damage of ['arrancado', 'canto']) {
      const migrated = sanitizeReview({ ...base, damage, damageSeed: 12345 })!;
      expect([migrated.damage, migrated.damageSeed]).toEqual(['rasgado', 12345]);
    }
  });

  it('as manchas saíram dos estragos: a ficha de antes muda de campo com o mesmo sorteio', () => {
    const base = { game: { name: 'Hades', coverUrl: null, source: 'manual' }, scores: { historia: 8, diversao: 9, jogabilidade: 9, visual: 8 } };
    for (const stain of STAINS) {
      const old = sanitizeReview({ ...base, damage: stain, damageSeed: 4321 })!;
      expect([old.damage, old.damageSeed, old.stain, old.stainSeed]).withContext(stain).toEqual([undefined, undefined, stain, 4321]);
    }
    // agora vão juntos: uma ficha rasgada com café
    const both = sanitizeReview({ ...base, damage: 'rasgado', damageSeed: 1, stain: 'cafe', stainSeed: 2 })!;
    expect([both.damage, both.damageSeed, both.stain, both.stainSeed]).toEqual(['rasgado', 1, 'cafe', 2]);
    expect('stainSeed' in sanitizeReview({ ...base, stainSeed: 2 })!).toBeFalse();
    expect(sanitizeReview({ ...base, stain: 'rasgado' })!.stain).toBeUndefined();
    // Espirais e Teste de caneta saíram: a ficha fica sem rabisco
    expect(sanitizeReview({ ...base, scribble: 'espirais', scribbleSeed: 3 })!.scribble).toBeUndefined();
  });

  it('a mancha sai igual à de quando era estrago, e vai por cima do estrago', () => {
    const b = { id: 'r1', W: 420, H: 300, uid: 't' };
    const cafe = paperArt({ ...b, stain: 'cafe', stainSeed: 9 });
    const torn = paperArt({ ...b, damage: 'rasgado', seed: 5 });
    const both = paperArt({ ...b, damage: 'rasgado', seed: 5, stain: 'cafe', stainSeed: 9 });
    expect(both.cut).toEqual(torn.cut);
    expect(both.fundo).toBe(torn.fundo + cafe.fundo);
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

  it('a decoração e o sorteio dela vão com a ficha, só quando há decoração', () => {
    const base = { game: { name: 'Hades', coverUrl: null, source: 'manual' }, scores: { historia: 8, diversao: 9, jogabilidade: 9, visual: 8 } };
    expect(sanitizeDecor('argolas')).toBe('argolas');
    expect(sanitizeDecor('serpentina')).toBeUndefined();
    const r = sanitizeReview({ ...base, decor: 'selo', decorSeed: 4242 })!;
    expect([r.decor, r.decorSeed]).toEqual(['selo', 4242]);
    expect('decorSeed' in sanitizeReview({ ...base, decorSeed: 4242 })!).toBeFalse();
    expect('decor' in sanitizeReview({ ...base, decor: 'serpentina' })!).toBeFalse();
  });

  it('o sorteio do rabisco vai com a ficha, só quando há rabisco', () => {
    const base = { game: { name: 'Hades', coverUrl: null, source: 'manual' }, scores: { historia: 8, diversao: 9, jogabilidade: 9, visual: 8 } };
    expect(sanitizeReview({ ...base, scribble: 'novelo', scribbleSeed: 777 })!.scribbleSeed).toBe(777);
    expect('scribbleSeed' in sanitizeReview({ ...base, scribbleSeed: 777 })!).toBeFalse();
  });

  it('a força do lápis vai com a ficha, só fora do Normal e só quando há rabisco', () => {
    const base = { game: { name: 'Hades', coverUrl: null, source: 'manual' }, scores: { historia: 8, diversao: 9, jogabilidade: 9, visual: 8 } };
    expect(sanitizeReview({ ...base, scribble: 'novelo', scribbleInk: 6 })!.scribbleInk).toBe(6);
    expect('scribbleInk' in sanitizeReview({ ...base, scribble: 'novelo', scribbleInk: DEFAULT_SCRIBBLE_INK })!).toBeFalse();
    expect('scribbleInk' in sanitizeReview({ ...base, scribbleInk: 6 })!).toBeFalse();
    for (const bad of [-1, 7, 1.5, '3', null]) expect('scribbleInk' in sanitizeReview({ ...base, scribble: 'novelo', scribbleInk: bad })!).withContext(String(bad)).toBeFalse();
  });

  it('a força da tinta da estampa vai com a ficha, só fora da Normal e só quando há estampa', () => {
    const base = { game: { name: 'Hades', coverUrl: null, source: 'manual' }, scores: { historia: 8, diversao: 9, jogabilidade: 9, visual: 8 } };
    const r = sanitizeReview({ ...base, pattern: 'gatinhos', patternInk: 0 })!;
    expect(r.patternInk).toBe(0);
    expect(lookOf(r)).toEqual({ ...DEFAULT_LOOK, ink: 0 });
    const normal = sanitizeReview({ ...base, pattern: 'gatinhos', patternInk: DEFAULT_PATTERN_INK })!;
    expect('patternInk' in normal).toBeFalse();
    // a ficha de antes (sem o campo) e a Normal leem o mesmo ajuste de sempre, sem a tinta
    expect(lookOf(normal)).toEqual(DEFAULT_LOOK);
    expect(lookOf({ patternInk: DEFAULT_PATTERN_INK })).toEqual(DEFAULT_LOOK);
    expect('patternInk' in sanitizeReview({ ...base, patternInk: 0 })!).toBeFalse();
    for (const bad of [-1, 7, 1.5, '3', null]) expect(sanitizePatternInk(bad)).withContext(String(bad)).toBeUndefined();
  });

  it('os ajustes da estampa vão com a ficha; o de sempre e os sem estampa não', () => {
    const base = { game: { name: 'Hades', coverUrl: null, source: 'manual' }, scores: { historia: 8, diversao: 9, jogabilidade: 9, visual: 8 } };
    const r = sanitizeReview({ ...base, pattern: 'gatinhos', patternSpacing: 0, patternSize: 8, patternJitter: DEFAULT_LOOK.jitter, patternSeed: 99 })!;
    expect([r.patternSpacing, r.patternSize, r.patternSeed]).toEqual([0, 8, 99]);
    expect('patternJitter' in r).toBeFalse();
    expect(lookOf(r)).toEqual({ spacing: 0, size: 8, jitter: DEFAULT_LOOK.jitter });
    const plain = sanitizeReview({ ...base, patternSpacing: 0, patternSeed: 99 })!;
    expect('patternSpacing' in plain || 'patternSeed' in plain).toBeFalse();
    for (const bad of [-1, 7, 1.5, '3', null]) expect(sanitizeLookStep(bad, 'spacing')).withContext(String(bad)).toBeUndefined();
    // o tamanho vai além: até um desenho maior que a ficha
    expect(sanitizeLookStep(8, 'size')).toBe(8);
    expect(sanitizeLookStep(9, 'size')).toBeUndefined();
  });

  it('a Lisa tira a fibra; a estampa vira um ladrilho do tamanho dos ajustes', () => {
    expect(paperStyle('lisa', undefined)['--grao']).toBe('none');
    expect(paperStyle(undefined, undefined)['--textura']).toBeNull();
    expect(paperStyle(undefined, undefined)['--estampa-lado']).toBeNull();
    const tile = patternTile('gatinhos');
    expect(paperStyle('canson', 'gatinhos')['--estampa']).toBe(tile.url);
    expect(paperStyle('canson', 'gatinhos')['--estampa-lado']).toBe(`${tile.side}px`);
    expect(tile.url).toContain('data:image/svg+xml');
    // mais espaço e desenhos maiores pedem um ladrilho maior; a bagunça não muda o tamanho
    expect(patternTile('gatinhos', { ...DEFAULT_LOOK, spacing: 6 }).side).toBeGreaterThan(tile.side);
    // amontoados: a casa fica menor que o desenho (38px), e eles entram um no outro
    expect(patternTile('gatinhos', { ...DEFAULT_LOOK, spacing: 0 }).side / 4).toBeLessThan(38);
    // cada sorteio é outra estampa, do mesmo tamanho; o mesmo sorteio, a mesma
    expect(patternTile('gatinhos', DEFAULT_LOOK, 5).url).not.toBe(patternTile('gatinhos', DEFAULT_LOOK, 6).url);
    expect(patternTile('gatinhos', DEFAULT_LOOK, 5).side).toBe(tile.side);
    expect(patternTile('gatinhos', DEFAULT_LOOK, 5)).toEqual(patternTile('gatinhos', DEFAULT_LOOK, 5));
    expect(patternTile('gatinhos', { ...DEFAULT_LOOK, size: 4 }).side).toBeGreaterThan(tile.side);
    // o maior: cada desenho passa da largura da ficha completa (420px), com o ladrilho de duas casas
    expect(patternTile('gatinhos', { ...DEFAULT_LOOK, size: 8 }).side / 2).toBeGreaterThan(420);
    expect(patternTile('gatinhos', { ...DEFAULT_LOOK, jitter: 4 }).side).toBe(tile.side);
    expect(patternTile('gatinhos', { ...DEFAULT_LOOK, jitter: 4 }).url).not.toBe(tile.url);
  });

  it('só os estragos que tiram papel recortam a ficha', () => {
    expect(cutsPaper('molhado')).toBeFalse();
    expect(cutsPaper('dobrado')).toBeFalse();
    expect(cutsPaper('furado')).toBeTrue();
    expect(cutsPaper(undefined)).toBeFalse();
  });

  it('cada estampa tem nome, desenho de amostra e ladrilho; as temáticas revezam os desenhos', () => {
    expect(new Set(PATTERNS).size).toBe(PATTERNS.length);
    expect(Object.keys(PATTERN_LABEL).sort()).toEqual([...PATTERNS].sort());
    for (const p of PATTERNS) {
      expect(motifIcon(p)).withContext(p).toMatch(/^<svg [^>]*><g class='l'>.+<\/g><\/svg>$/);
      expect(patternTile(p).url).withContext(p).toContain('data:image/svg+xml');
      expect(sanitizePattern(p)).withContext(p).toBe(p);
    }
    // a cozinha: a frigideira, a espátula, o batedor e a colher aparecem todos no ladrilho
    const kitchen = decodeURIComponent(patternTile('cozinha').url);
    for (const ref of ['#o', '#s', '#o1', '#s1', '#o2', '#s2', '#o3', '#s3']) expect(kitchen).withContext(ref).toContain(`href='${ref}'`);
    // os assuntos: cada estampa num só, e nenhum vazio
    for (const g of PATTERN_GROUPS) expect(g.patterns.length).withContext(g.id).toBeGreaterThan(0);
    expect(PATTERN_GROUPS.flatMap((g) => g.patterns).length).toBe(PATTERNS.length);
    for (const p of PATTERNS) expect(groupOfPattern(p)).withContext(p).toBeDefined();
    // as de um desenho só não ganham ids novos
    expect(decodeURIComponent(patternTile('gatinhos').url)).not.toContain("id='o1'");
  });

  describe('os desenhos', () => {
    const base = { id: 'r1', W: 420, H: 300, uid: 't' };

    it('é a mesma ficha a cada visita', () => {
      expect(paperArt({ ...base, damage: 'rasgado', scribble: 'novelo' })).toEqual(paperArt({ ...base, damage: 'rasgado', scribble: 'novelo' }));
    });

    it('cada sorteio rasga de outro jeito, e o mesmo sorteio é sempre o mesmo rasgo', () => {
      for (const d of DAMAGES) {
        const one = paperArt({ ...base, damage: d, seed: 111 });
        expect(paperArt({ ...base, damage: d, seed: 111 })).withContext(d).toEqual(one);
        expect(paperArt({ ...base, damage: d, seed: 222 })).withContext(d).not.toEqual(one);
      }
      for (const m of STAINS) {
        const one = paperArt({ ...base, stain: m, stainSeed: 111 });
        expect(paperArt({ ...base, stain: m, stainSeed: 111 })).withContext(m).toEqual(one);
        expect(paperArt({ ...base, stain: m, stainSeed: 222 })).withContext(m).not.toEqual(one);
      }
      // sem sorteio explícito, o id ainda determina uma forma estável
      expect(paperArt({ ...base, damage: 'rasgado' })).not.toEqual(paperArt({ ...base, damage: 'rasgado', seed: 111 }));
    });

    it('o sangue alterna uma poça grande e duas ou três menores, com um só nível de transparência', () => {
      const counts = [0, 0, 0, 0];
      for (let seed = 1; seed <= 1000; seed++) {
        const art = paperArt({ ...base, stain: 'sangue', stainSeed: seed });
        const svg = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${art.clareia}</svg>`, 'image/svg+xml');
        const paths = svg.querySelectorAll('path');
        expect(paths.length).withContext(String(seed)).toBeGreaterThanOrEqual(1);
        expect(paths.length).withContext(String(seed)).toBeLessThanOrEqual(3);
        counts[paths.length]++;
        // As bolsas não têm transparência individual: nem um overlap engrossa a tinta.
        expect(svg.querySelectorAll('[opacity], [fill-opacity]').length).withContext(String(seed)).toBe(1);
        for (const path of paths) {
          const scale = path.getAttribute('transform')?.match(/scale\(([\d.]+)\)/)?.[1];
          if (paths.length === 1) expect(scale).toBeUndefined();
          else expect(Number(scale)).withContext(String(seed)).toBeLessThan(0.51);
        }
      }
      expect(counts[1]).toBeGreaterThan(450);
      expect(counts[1]).toBeLessThan(550);
      for (const n of [2, 3]) {
        expect(counts[n]).withContext(`${n} bolsas`).toBeGreaterThan(200);
        expect(counts[n]).withContext(`${n} bolsas`).toBeLessThan(300);
      }
    });

    it('a Rasgada sorteia canto ou borda nas quatro orientações', () => {
      const corners = new Set<string>(), sides = new Set<string>();
      for (let seed = 1; seed <= 250; seed++) {
        const path = paperArt({ ...base, damage: 'rasgado', seed }).cut[0];
        const points = [...path.matchAll(/[ML](-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g)]
          .map((m) => [Number(m[1]), Number(m[2])]);
        const [a, b] = [points[0], points[points.length - 1]];
        if (Math.hypot(a[0] - b[0], a[1] - b[1]) > 250) {
          sides.add(a[1] < 0 && b[1] < 0 ? 'topo' : a[1] > 300 && b[1] > 300 ? 'baixo' : a[0] < 0 && b[0] < 0 ? 'esquerda' : 'direita');
        } else {
          corners.add(`${a[0] < 0 ? 'e' : 'd'}${a[1] < 0 ? 'c' : 'b'}`);
        }
      }
      expect(sides.size).toBe(4);
      expect(corners.size).toBe(4);
    });

    it('cada sorteio rabisca de outro jeito, e o mesmo sorteio é sempre o mesmo rabisco', () => {
      for (const s of SCRIBBLES) {
        const one = paperArt({ ...base, scribble: s, scribbleSeed: 111 });
        expect(paperArt({ ...base, scribble: s, scribbleSeed: 111 })).withContext(s).toEqual(one);
        expect(paperArt({ ...base, scribble: s, scribbleSeed: 222 })).withContext(s).not.toEqual(one);
      }
    });

    it('cada estrago que recorta tem máscara; os outros não', () => {
      for (const d of DAMAGES) {
        const art = paperArt({ ...base, damage: d });
        expect(!!cutMask(art, 420, 300, 'miolo')).withContext(d).toBe(cutsPaper(d));
        // onde a cor soltou (o miolo aparecendo), a cor e o que está escrito também são recortados
        if (art.core.length) expect(cutMask(art, 420, 300)).withContext(d).not.toBeNull();
      }
    });

    it('a Fita arrancada tira só a cor: sem furo, sem sombra recortada', () => {
      for (let seed = 1; seed <= 20; seed++) {
        const art = paperArt({ ...base, damage: 'descascado', seed });
        expect(art.cut).withContext(String(seed)).toEqual([]);
        expect(art.core.length).withContext(String(seed)).toBeGreaterThan(0);
        expect(cutMask(art, 420, 300)).not.toBeNull();
        expect(cutMask(art, 420, 300, 'queima')).toBeNull();
      }
    });

    it('cada estrago desenha alguma coisa, em qualquer sorteio e tamanho', () => {
      for (const d of [...DAMAGES, ...STAINS])
        for (const s of [{ W: 420, H: 300 }, { W: 340, H: 150 }, { W: 150, H: 107, plain: true }])
          for (let seed = 1; seed <= 12; seed++) {
            const art = paperArt({ ...base, ...s, ...((STAINS as readonly string[]).includes(d) ? { stain: d as (typeof STAINS)[number], stainSeed: seed } : { damage: d as (typeof DAMAGES)[number], seed }) });
            const drawn = art.cut.length + art.core.length + art.fundo.length + art.clareia.length + art.relevo.length + art.frente.length + art.fita.length + (art.topo?.length ?? 0);
            expect(drawn).withContext(`${d} ${s.W}x${s.H} ${seed}`).toBeGreaterThan(0);
            expect(JSON.stringify(art)).withContext(`${d} ${s.W}x${s.H} ${seed}`).not.toMatch(/NaN|Infinity|undefined/);
          }
    });

    it('a Colada em pedaços pica a ficha em muitos pedaços, sem cola', () => {
      for (let seed = 1; seed <= 20; seed++) {
        const art = paperArt({ ...base, damage: 'colado', seed });
        // três ou quatro rasgos de beirada a beirada, e os trechos de beirada fora do lugar
        expect(art.cut.length).withContext(String(seed)).toBeGreaterThanOrEqual(3);
        expect(art.fita).withContext(String(seed)).toBe('');
      }
    });

    it('a força da tinta clareia e escurece a estampa sem mexer no desenho; a Normal é a de sempre', () => {
      for (const seed of [undefined, 5]) {
        const normal = patternTile('gatinhos', DEFAULT_LOOK, seed);
        expect(patternTile('gatinhos', { ...DEFAULT_LOOK, ink: DEFAULT_PATTERN_INK }, seed)).toEqual(normal);
        // a tinta é o último grupo, o dos desenhos
        const alpha = (t: { url: string }) => Number([...decodeURIComponent(t.url).matchAll(/<g opacity='([\d.]+)'>/g)].pop()![1]);
        const light = patternTile('gatinhos', { ...DEFAULT_LOOK, ink: 0 }, seed);
        const dark = patternTile('gatinhos', { ...DEFAULT_LOOK, ink: 6 }, seed);
        expect(alpha(light)).toBeLessThan(alpha(normal));
        expect(alpha(dark)).toBeGreaterThan(alpha(normal));
        expect(alpha(dark)).toBeLessThanOrEqual(1);
        // o mesmo desenho, no mesmo lugar: só a opacidade muda
        const body = (t: { url: string }) => decodeURIComponent(t.url).replace(/<g opacity='[\d.]+'>(?!.*<g opacity=)/, '');
        expect(body(dark)).toBe(body(normal));
        expect(dark.side).toBe(normal.side);
      }
    });

    it('a força do lápis clareia e escurece o rabisco; o Normal é o rabisco de sempre', () => {
      const alphas = (ink?: number) => [...paperArt({ ...base, scribble: 'novelo', scribbleInk: ink }).fundo.matchAll(/opacity:([\d.]+)/g)].map((m) => Number(m[1]));
      expect(paperArt({ ...base, scribble: 'novelo', scribbleInk: DEFAULT_SCRIBBLE_INK })).toEqual(paperArt({ ...base, scribble: 'novelo' }));
      const normal = alphas();
      alphas(0).forEach((a, i) => expect(a).toBeLessThan(normal[i]));
      alphas(6).forEach((a, i) => expect(a).toBeGreaterThan(normal[i]));
      alphas(6).forEach((a) => expect(a).toBeLessThanOrEqual(1));
    });

    it('as Pegadas de gato atravessam a ficha ou cortam caminho por uma quina (nunca a da foto)', () => {
      let corners = 0;
      for (let seed = 1; seed <= 80; seed++) {
        const prints = [...paperArt({ ...base, stain: 'pegadas', stainSeed: seed }).fundo.matchAll(/translate\((-?[\d.]+) (-?[\d.]+)\) rotate/g)].map((m) => [Number(m[1]), Number(m[2])]);
        expect(prints.length).withContext(String(seed)).toBeGreaterThan(0);
        // todas as patas perto de uma quina só: a trilha cortou caminho
        const near = (cx: number, cy: number) => prints.every(([x, y]) => Math.abs(x - cx) < 230 && Math.abs(y - cy) < 190);
        if (near(420, 0) || near(420, 300) || near(0, 300)) corners++;
        expect(prints.length > 0 && prints.every(([x, y]) => x < 150 && y < 130)).withContext(`${seed}: quina da foto`).toBeFalse();
      }
      expect(corners).toBeGreaterThan(15);
      expect(corners).toBeLessThan(65);
    });

    it('a Costurada rasga em pé, deitada ou atravessando uma quina (nunca a da foto)', () => {
      const ways = new Set<string>();
      for (let seed = 1; seed <= 150; seed++) {
        const cut = paperArt({ ...base, damage: 'costurado', seed }).cut[0];
        const pts = [...cut.matchAll(/[ML](-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g)].map((m) => [Number(m[1]), Number(m[2])]);
        const ends = [pts[0], pts[Math.floor(pts.length / 2) - 1]];
        const onTopBottom = ends.map(([, y]) => y < 0 || y > 300);
        if (onTopBottom[0] && onTopBottom[1]) ways.add('em pé');
        else if (!onTopBottom[0] && !onTopBottom[1]) ways.add('deitada');
        else {
          const [h, v] = onTopBottom[0] ? ends : [ends[1], ends[0]];
          const corner = `${h[1] < 0 ? 'alto' : 'pé'}-${v[0] < 0 ? 'esquerda' : 'direita'}`;
          expect(corner).withContext(String(seed)).not.toBe('alto-esquerda');
          ways.add(corner);
        }
      }
      expect([...ways].sort()).toEqual(['alto-direita', 'deitada', 'em pé', 'pé-direita', 'pé-esquerda']);
    });

    it('no Quebra-cabeça nunca falta a peça da foto nem a da nota', () => {
      for (const s of [{ W: 420, H: 300 }, { W: 340, H: 150 }])
        for (let seed = 1; seed <= 60; seed++) {
          const pts = [...paperArt({ ...base, ...s, damage: 'quebracabeca', seed }).cut[0].matchAll(/[ML](-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g)].map((m) => [Number(m[1]), Number(m[2])]);
          const u = pts.reduce((a, p) => a + p[0], 0) / pts.length / s.W,
            v = pts.reduce((a, p) => a + p[1], 0) / pts.length / s.H;
          const hidden = s.H / s.W < 0.55 ? u < 0.3 || (u < 0.8 && v > 0.52) : (u < 0.34 && v < 0.6) || (u > 0.32 && u < 0.93 && v > 0.26 && v < 0.56);
          expect(hidden).withContext(`${s.W}x${s.H} ${seed}: ${u.toFixed(2)} ${v.toFixed(2)}`).toBeFalse();
        }
    });

    it('a lata de refri deixa o anel onde ele aparece: embaixo da frase, ou na coluna da direita da tira', () => {
      for (const s of [{ W: 420, H: 300 }, { W: 340, H: 150 }])
        for (let seed = 1; seed <= 40; seed++) {
          const m = paperArt({ ...base, ...s, stain: 'refri', stainSeed: seed }).fundo.match(/<circle cx='([\d.]+)' cy='([\d.]+)'/)!;
          const u = Number(m[1]) / s.W,
            v = Number(m[2]) / s.H;
          if (s.H / s.W < 0.55) expect(u).withContext(`tira ${seed}`).toBeGreaterThanOrEqual(0.8);
          else expect(v).withContext(`completa ${seed}`).toBeGreaterThanOrEqual(0.66);
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

  describe('as decorações', () => {
    const base = { id: 'r1', W: 420, H: 300, uid: 't' };

    it('cada uma desenha algo, e o mesmo sorteio é sempre a mesma; outro sorteio, outra', () => {
      for (const decor of DECORS) {
        const one = decorArt({ ...base, decor, seed: 111 });
        expect(one.front.length + (one.under?.length ?? 0)).withContext(decor).toBeGreaterThan(100);
        expect(decorArt({ ...base, decor, seed: 111 })).withContext(decor).toEqual(one);
        expect(decorArt({ ...base, decor, seed: 222 })).withContext(decor).not.toEqual(one);
      }
    });

    it('só as argolas, os ilhoses e o alfinete furam o papel', () => {
      for (const decor of DECORS) {
        const holes = decorArt({ ...base, decor }).cut.length;
        expect(holes > 0).withContext(decor).toBe(decorCuts(decor));
      }
    });

    it('não mexem nos desenhos do papel', () => {
      const plain = paperArt({ ...base, damage: 'rasgado' });
      expect(JSON.stringify(plain)).not.toContain('enfeite');
      expect(Object.keys(plain).sort()).toEqual(['clareia', 'core', 'cut', 'evenodd', 'fita', 'frente', 'fundo', 'relevo']);
    });
  });

  it('na cartolina escura a estampa sai em branco, com os furos intactos', () => {
    const dark = decodeURIComponent(lightPattern('gatinhos'));
    const light = decodeURIComponent(patternTile('gatinhos').url);
    expect(dark).not.toBe(light);
    // a tinta vira branca, a máscara dos furos continua preta
    expect(dark).toContain('.s *{fill:#fff}');
    expect(dark).toContain('.m *{fill:none;stroke:#000');
    expect(dark.replace(/#fff/g, '#000')).toBe(light.replace(/#fff/g, '#000'));
    expect(paperVars('cartolina', 'gatinhos')['--estampa-clara']).toBeNull();
    expect(paperVars('cartolina', 'gatinhos', undefined, undefined, true)['--estampa-clara']).toBe(lightPattern('gatinhos'));
  });
});
