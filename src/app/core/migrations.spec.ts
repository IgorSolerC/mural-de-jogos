import { BUILD } from './build';
import { parseBackupSnapshot } from './backup-file';
import { buildOf, migrateReview } from './migrations';
import { MAX_MARKS, PAPERS, DAMAGES, sanitizeDecors, sanitizeStains } from './paper';
import { paperArt } from './paper-art';
import { sanitizeReview } from './review';

const base = { id: 'r-velha', game: { name: 'Hades', coverUrl: null, source: 'manual' }, scores: { historia: 8, diversao: 9, jogabilidade: 9, visual: 8 } };

describe('conversões das fichas de builds antigas', () => {
  it('a build é um número inteiro que só sobe', () => {
    expect(Number.isInteger(BUILD)).toBeTrue();
    expect(BUILD).toBeGreaterThanOrEqual(301);
  });

  it('lê a build de um backup; sem ela (ou estranha), é de antes do campo', () => {
    expect(buildOf({ build: 301 })).toBe(301);
    for (const bad of [undefined, null, 0, -4, 3.5, '301', [301]]) expect(buildOf({ build: bad })).withContext(String(bad)).toBe(0);
    expect(buildOf(null)).toBe(0);
    expect(buildOf([])).toBe(0);
  });

  it('Desbotada no sol e Carregou pela metade saíram dos estragos e viraram papéis, com o mesmo sorteio', () => {
    expect(DAMAGES as readonly string[]).not.toContain('desbotado');
    expect(DAMAGES as readonly string[]).not.toContain('carregando');
    expect(PAPERS).toContain('desbotado');
    expect(PAPERS).toContain('carregando');
    const sol = sanitizeReview({ ...base, damage: 'desbotado', damageSeed: 777 })!;
    expect([sol.paper, sol.paperSeed, sol.damage, sol.damageSeed]).toEqual(['desbotado', 777, undefined, undefined]);
    const meio = sanitizeReview({ ...base, damage: 'carregando' })!;
    expect([meio.paper, meio.damage]).toEqual(['carregando', undefined]);
    expect('paperSeed' in meio).toBeFalse();
  });

  it('o desbotado (ou o carregando) toma o lugar do papel que a ficha tinha', () => {
    const r = sanitizeReview({ ...base, paper: 'perolado', damage: 'carregando', damageSeed: 42 })!;
    expect([r.paper, r.paperSeed, r.damage]).toEqual(['carregando', 42, undefined]);
    // o resto da cartolina continua
    const all = sanitizeReview({ ...base, paper: 'glitter', pattern: 'gatinhos', scribble: 'novelo', damage: 'desbotado', stain: 'cafe', stainSeed: 5, decor: 'selo' })!;
    expect([all.paper, all.pattern, all.scribble, all.stains, all.decors]).toEqual(['desbotado', 'gatinhos', 'novelo', [{ stain: 'cafe', seed: 5 }], [{ decor: 'selo' }]]);
  });

  it('a ficha convertida desenha igualzinho: o papel usa o mesmo sorteio do estrago de antes', () => {
    const r = sanitizeReview({ ...base, damage: 'desbotado', damageSeed: 98765 })!;
    const art = paperArt({ id: r.id, W: 420, H: 300, paper: r.paper, paperSeed: r.paperSeed, uid: 't' });
    // o desenho do estrago de antes sorteava pela chave `id:estrago:desbotado:sorteio`; o do papel também
    expect(art.clareia).toContain("id='t-sol'");
    expect(art).toEqual(paperArt({ id: r.id, W: 420, H: 300, paper: 'desbotado', paperSeed: 98765, uid: 't' }));
    expect(art).not.toEqual(paperArt({ id: r.id, W: 420, H: 300, paper: 'desbotado', paperSeed: 98764, uid: 't' }));
    // o papel de sempre (e os de textura) não desenham nada aqui
    expect(paperArt({ id: r.id, W: 420, H: 300, paper: 'perolado', paperSeed: 5, uid: 't' }).clareia).toBe('');
  });

  it('o sorteio do papel só vai com o papel marcado pelo tempo', () => {
    expect('paperSeed' in sanitizeReview({ ...base, paper: 'canson', paperSeed: 9 })!).toBeFalse();
    expect(sanitizeReview({ ...base, paper: 'desbotado', paperSeed: 9 })!.paperSeed).toBe(9);
    expect('paperSeed' in sanitizeReview({ ...base, paper: 'desbotado', paperSeed: -1 })!).toBeFalse();
  });

  it('passar duas vezes dá o mesmo que passar uma (o que não diz a build passa por todas)', () => {
    const olds = [
      { ...base, damage: 'desbotado', damageSeed: 3, paper: 'linho' },
      { ...base, damage: 'cafe', damageSeed: 8 },
      { ...base, damage: 'rasgado', stain: 'sangue', stainSeed: 2, decor: 'clipe', decorSeed: 7 },
      { ...base, kind: 'anotacoes', damage: 'carregando', decor: 'neve' },
    ];
    for (const old of olds) {
      const once = sanitizeReview(old)!;
      expect(sanitizeReview(once)).withContext(JSON.stringify(old)).toEqual(once);
      expect(sanitizeReview(JSON.parse(JSON.stringify(once)))).withContext(JSON.stringify(old)).toEqual(once);
    }
  });

  it('o que veio de uma build que já grava no formato novo não é convertido', () => {
    const raw = { ...base, damage: 'desbotado' };
    expect(migrateReview(raw, BUILD)).toBe(raw);
    // um estrago que não existe mais, gravado por uma build nova, é só jogado fora
    const r = sanitizeReview(raw, BUILD)!;
    expect([r.paper, r.damage]).toEqual([undefined, undefined]);
  });

  it('a anotação também converte', () => {
    const n = sanitizeReview({ ...base, kind: 'anotacoes', damage: 'desbotado', damageSeed: 11, stain: 'lama', decor: 'postit', decorSeed: 3 })!;
    expect([n.kind, n.paper, n.paperSeed, n.damage, n.stains, n.decors]).toEqual(['anotacoes', 'desbotado', 11, undefined, [{ stain: 'lama' }], [{ decor: 'postit', seed: 3 }]]);
  });

  it('o backup sem build converte; o com a build de agora fica como veio', () => {
    const backup = (build?: number) => JSON.stringify({ app: 'meu-mural', version: 2, ...(build ? { build } : {}), reviews: [{ ...base, damage: 'desbotado', damageSeed: 5 }] });
    const [old] = parseBackupSnapshot(backup()).reviews;
    expect([old.paper, old.paperSeed, old.damage]).toEqual(['desbotado', 5, undefined]);
    const [fresh] = parseBackupSnapshot(backup(BUILD)).reviews;
    expect([fresh.paper, fresh.damage]).toEqual([undefined, undefined]);
  });
});

describe('várias manchas e decorações', () => {
  it('até três, sem repetir, na ordem em que vieram; o que não existe sai', () => {
    expect(MAX_MARKS).toBe(3);
    expect(sanitizeStains([{ stain: 'sangue', seed: 2 }, { stain: 'cafe' }, { stain: 'sangue', seed: 9 }, { stain: 'xixi' }, { stain: 'lama', seed: 0 }, { stain: 'refri' }])).toEqual([
      { stain: 'sangue', seed: 2 },
      { stain: 'cafe' },
      { stain: 'lama' },
    ]);
    expect(sanitizeDecors([{ decor: 'neve' }, null, 'selo', { decor: 'clipe', seed: 4 }])).toEqual([{ decor: 'neve' }, { decor: 'clipe', seed: 4 }]);
    for (const bad of [undefined, null, 'cafe', {}, [], [{ stain: 'nada' }]]) expect(sanitizeStains(bad)).withContext(JSON.stringify(bad)).toBeUndefined();
  });

  it('a ficha guarda as listas, e sem nada não leva a chave', () => {
    const r = sanitizeReview({ ...base, stains: [{ stain: 'cafe', seed: 1 }, { stain: 'mofado' }], decors: [{ decor: 'neve' }, { decor: 'selo', seed: 6 }, { decor: 'clipe' }, { decor: 'pena' }] })!;
    expect(r.stains).toEqual([{ stain: 'cafe', seed: 1 }, { stain: 'mofado' }]);
    expect(r.decors).toEqual([{ decor: 'neve' }, { decor: 'selo', seed: 6 }, { decor: 'clipe' }]);
    const plain = sanitizeReview({ ...base, stains: [], decors: [{ decor: 'nada' }] })!;
    expect('stains' in plain).toBeFalse();
    expect('decors' in plain).toBeFalse();
  });

  it('as manchas são desenhadas na ordem da escolha: a primeira sai igual a quando era a única', () => {
    const b = { id: 'r1', W: 420, H: 300, uid: 't' };
    const cafe = paperArt({ ...b, stains: [{ stain: 'cafe', seed: 3 }] });
    const lama = paperArt({ ...b, stains: [{ stain: 'lama', seed: 4 }] });
    const both = paperArt({ ...b, stains: [{ stain: 'cafe', seed: 3 }, { stain: 'lama', seed: 4 }] });
    const flipped = paperArt({ ...b, stains: [{ stain: 'lama', seed: 4 }, { stain: 'cafe', seed: 3 }] });
    expect(both.fundo).toBe(cafe.fundo + lama.fundo);
    expect(flipped.fundo).toBe(lama.fundo + cafe.fundo);
  });

  it('da segunda mancha em diante os ids do SVG ganham outro nome, sem colidir com os da primeira', () => {
    const b = { id: 'r1', W: 420, H: 300, uid: 't' };
    const art = paperArt({ ...b, stains: [{ stain: 'gosma', seed: 1 }, { stain: 'mao', seed: 2 }, { stain: 'pneu', seed: 3 }] });
    const ids = [...JSON.stringify(art).matchAll(/id='([^']+)'/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.some((id) => id.startsWith('tm1-'))).toBeTrue();
    expect(ids.some((id) => id.startsWith('tm2-'))).toBeTrue();
  });
});
