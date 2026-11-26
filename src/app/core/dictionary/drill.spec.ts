import { MarkLookup, Word } from './dictionary';
import {
  DEFAULT_SETUP,
  DRILL_SETUP_KEY,
  DrillSetup,
  checkJa,
  checkPt,
  drawDrill,
  drillPool,
  drillScore,
  drillText,
  needCounts,
  readSetup,
  sanitizeSetup,
  scriptsOf,
  sourceCounts,
  sourceWords,
  trainable,
  usableHints,
  writeSetup,
} from './drill';
import { dictionaryWords } from './words';

let n = 0;
function word(over: Partial<Word>): Word {
  n++;
  return {
    order: n,
    id: `T${String(n).padStart(4, '0')}`,
    text: 'x',
    reading: 'x',
    romaji: 'x',
    meaning: 'x',
    importance: 5,
    frequency: 3,
    use: 'Médio',
    jlpt: 'N5',
    registers: [],
    wordClass: 'nome',
    theme: '',
    script: 'kana',
    verbGroup: null,
    rank: null,
    composition: '',
    notes: '',
    examples: [],
    origin: '',
    learnedOn: null,
    ...over,
  };
}

const taberu = word({ text: '食べる', reading: 'たべる', romaji: 'taberu', meaning: 'comer', script: 'kanji+kana' });
const terebi = word({ text: 'テレビ', reading: 'テレビ', romaji: 'terebi', meaning: 'televisão / TV', script: 'katakana' });
const tokyo = word({ text: '東京', reading: 'とうきょう', romaji: 'toukyou', meaning: 'Tóquio', script: 'kanji' });
const sore = word({ text: 'それ', reading: 'それ', romaji: 'sore', meaning: 'isso (perto de quem ouve) / isso (o que acabou de ser dito)', script: 'kana' });
const koohii = word({ text: 'コーヒー', reading: 'コーヒー', romaji: 'koohii', meaning: 'café (bebida)', script: 'katakana' });
const hontou = word({ text: '本当？', reading: 'ほんとう？', romaji: 'hontou?', meaning: '"sério?" / é mesmo?', script: 'kanji' });
const masu = word({ text: '〜ます', reading: 'ます', romaji: 'masu', meaning: 'forma educada dos verbos', wordClass: 'auxiliar' });
const naa = word({ text: 'な / なあ', reading: 'なあ', romaji: 'naa', meaning: 'né', wordClass: 'partícula' });
const sou = word({ text: '〜そうだ (ouvi dizer)', reading: 'そうだ', romaji: 'souda', meaning: 'dizem que' });
const chuu = word({ text: '〜中', reading: 'ちゅう / じゅう', romaji: 'chuu / juu', meaning: 'durante' });
const sese = word({ text: 'esse', reading: 'それ', romaji: 'sore', meaning: 'esse(a) (antes de substantivo) / tornar-se' });
const ALL = [taberu, terebi, tokyo, sore, koohii, hontou, masu, naa, sou, chuu];

const marks = (learned: Word[], fav: Word[] = []): MarkLookup => ({
  learned: (w) => learned.includes(w),
  favorite: (id) => fav.some((f) => f.id === id),
});

const setup = (over: Partial<DrillSetup> = {}): DrillSetup => ({ ...DEFAULT_SETUP, needs: { ...DEFAULT_SETUP.needs }, ...over });

describe('Treino do dicionário: as palavras que se treinam', () => {
  it('ficam de fora os pedaços de gramática com 〜, as alternativas e as explicações; o ？ sai da resposta', () => {
    expect(trainable(taberu)).toBeTrue();
    expect(trainable(hontou)).toBeTrue();
    expect(drillText(hontou)).toBe('本当');
    for (const w of [masu, naa, sou, chuu]) expect(trainable(w)).withContext(w.text).toBeFalse();
  });

  it('as escritas de cada palavra', () => {
    expect(scriptsOf('食べる')).toEqual({ kanji: true, hiragana: true, katakana: false });
    expect(scriptsOf('コーヒー')).toEqual({ kanji: false, hiragana: false, katakana: true });
    expect(scriptsOf('東京')).toEqual({ kanji: true, hiragana: false, katakana: false });
  });

  it('no dicionário de verdade, quase todas se treinam, e nenhuma que se treina tem 〜', () => {
    const words = dictionaryWords().words;
    const ok = words.filter(trainable);
    expect(ok.length).toBeGreaterThan(words.length * 0.9);
    expect(ok.some((w) => /[〜/()]/.test(w.text))).toBeFalse();
  });
});

describe('Treino do dicionário: com quais palavras', () => {
  it('De onde: aprendidas, favoritas ou todas', () => {
    const m = marks([taberu, terebi], [tokyo]);
    expect(drillPool(ALL, setup({ source: 'aprendidas' }), m)).toEqual([taberu, terebi]);
    expect(drillPool(ALL, setup({ source: 'favoritas' }), m)).toEqual([tokyo]);
    expect(drillPool(ALL, setup({ source: 'todas' }), m)).toEqual([taberu, terebi, tokyo, sore, koohii, hontou]);
  });

  it('Escolher: só as escolhidas que servem ao De onde e aos filtros', () => {
    const m = marks([taberu, terebi]);
    const s = setup({ source: 'aprendidas', pick: 'escolher', chosen: [terebi.id, tokyo.id] });
    expect(drillPool(ALL, s, m)).toEqual([terebi]);
    // a lista do Escolher mostra todas as do De onde
    expect(sourceWords(ALL, s, m)).toEqual([taberu, terebi]);
  });

  it('os filtros de escrita: precisa ter, tanto faz, não pode ter; o exemplo de só katakana', () => {
    const m = marks([]);
    const all = setup({ source: 'todas' });
    expect(drillPool(ALL, setup({ source: 'todas', needs: { kanji: 'precisa', hiragana: 'tanto', katakana: 'tanto' } }), m)).toEqual([taberu, tokyo, hontou]);
    expect(drillPool(ALL, setup({ source: 'todas', needs: { kanji: 'sem', hiragana: 'tanto', katakana: 'tanto' } }), m)).toEqual([terebi, sore, koohii]);
    expect(drillPool(ALL, setup({ source: 'todas', needs: { kanji: 'precisa', hiragana: 'precisa', katakana: 'tanto' } }), m)).toEqual([taberu]);
    expect(drillPool(ALL, setup({ source: 'todas', needs: { kanji: 'sem', hiragana: 'sem', katakana: 'precisa' } }), m)).toEqual([terebi, koohii]);
    expect(drillPool(ALL, all, m).length).toBe(6);
  });

  it('as contas de cada recorte', () => {
    const m = marks([taberu, terebi], [tokyo]);
    const s = setup({ source: 'todas' });
    expect(sourceCounts(ALL, s, m)).toEqual({ aprendidas: 2, favoritas: 1, todas: 6 });
    expect(needCounts(ALL, s, m, 'kanji')).toEqual({ precisa: 3, tanto: 6, sem: 3 });
    expect(needCounts(ALL, setup({ source: 'aprendidas' }), m, 'katakana')).toEqual({ precisa: 1, tanto: 2, sem: 1 });
  });
});

describe('Treino do dicionário: o sorteio', () => {
  const pool = [taberu, terebi, tokyo, sore, koohii, hontou];

  it('embaralha pela semente, no tamanho pedido, sem repetir', () => {
    const a = drawDrill(pool, setup({ size: 10 }), 's1', true);
    expect(a.length).toBe(6);
    expect(new Set(a.map((i) => i.word.id)).size).toBe(6);
    expect(drawDrill(pool, setup({ size: 10 }), 's1', true).map((i) => i.word.id)).toEqual(a.map((i) => i.word.id));
    const many = Array.from({ length: 30 }, (_, i) => word({ text: `語${i}`, reading: 'ご', romaji: 'go' }));
    expect(drawDrill(many, setup({ size: 20 }), 's1', true).length).toBe(20);
    expect(drawDrill(many, setup({ size: 0 }), 's1', true).length).toBe(30);
  });

  it('o jeito e a dica de cada palavra saem só dos marcados', () => {
    const many = Array.from({ length: 60 }, (_, i) => word({ text: `語${i}`, reading: 'ご', romaji: 'go' }));
    const items = drawDrill(many, setup({ ways: ['escrever', 'jp-pt'], hints: ['romaji', 'som'], show: ['falado'], size: 0 }), 'x', true);
    expect(new Set(items.map((i) => i.way))).toEqual(new Set(['escrever', 'jp-pt']));
    expect(new Set(items.filter((i) => i.way === 'escrever').map((i) => i.hint))).toEqual(new Set(['romaji', 'som']));
    expect(items.filter((i) => i.way === 'jp-pt').every((i) => i.show === 'falado')).toBeTrue();
    expect(items.filter((i) => i.way === 'jp-pt').every((i) => i.hint === undefined)).toBeTrue();
  });

  it('sem voz japonesa, o som e o falado não saem', () => {
    expect(usableHints(setup({ hints: ['som', 'romaji'], show: ['falado', 'escrito'] }), false)).toEqual({ hints: ['romaji'], show: ['escrito'] });
    // só com o que precisa de voz: as que não precisam
    expect(usableHints(setup({ hints: ['som'], show: ['falado'] }), false)).toEqual({ hints: ['romaji', 'traducao'], show: ['escrito'] });
    const items = drawDrill(pool, setup({ ways: ['escrever'], hints: ['som'] }), 'x', false);
    expect(items.every((i) => i.hint !== 'som')).toBeTrue();
  });
});

describe('Treino do dicionário: a conferência', () => {
  it('o japonês: a escrita, a leitura (katakana = hiragana) e o romaji', () => {
    expect(checkJa(taberu, '食べる')).toBe('escrita');
    expect(checkJa(taberu, 'たべる')).toBe('leitura');
    expect(checkJa(taberu, 'タベル')).toBe('leitura');
    expect(checkJa(taberu, 'taberu')).toBe('romaji');
    expect(checkJa(taberu, ' Taberu ')).toBe('romaji');
    expect(checkJa(terebi, 'てれび')).toBe('leitura');
    expect(checkJa(tokyo, 'tokyo')).toBe('romaji');
    expect(checkJa(tokyo, 'tōkyō')).toBe('romaji');
    expect(checkJa(koohii, 'koohii')).toBe('romaji');
    expect(checkJa(koohii, 'kohi')).toBe('romaji');
    expect(checkJa(hontou, '本当')).toBe('escrita');
    expect(checkJa(hontou, 'ほんとう？')).toBe('leitura');
    expect(checkJa(taberu, 'nomu')).toBeNull();
    expect(checkJa(taberu, '')).toBeNull();
    expect(checkJa(taberu, '食')).toBeNull();
  });

  it('o português: um dos sentidos, sem acento, sem caixa, sem parênteses e sem artigo', () => {
    expect(checkPt(terebi, 'televisao')).toBe('televisão');
    expect(checkPt(terebi, 'a TV')).toBe('TV');
    expect(checkPt(koohii, 'Café')).toBe('café (bebida)');
    expect(checkPt(sore, 'isso')).toBe('isso (perto de quem ouve)');
    expect(checkPt(hontou, 'sério')).toBe('"sério?"');
    expect(checkPt(hontou, 'é mesmo')).toBe('é mesmo?');
    expect(checkPt(sese, 'esse')).toBe('esse(a) (antes de substantivo)');
    expect(checkPt(sese, 'tornar se')).toBe('tornar-se');
    expect(checkPt(terebi, 'rádio')).toBeNull();
    expect(checkPt(terebi, '  ')).toBeNull();
  });
});

describe('Treino do dicionário: a montagem guardada', () => {
  afterEach(() => localStorage.removeItem(DRILL_SETUP_KEY));

  it('lida de lixo volta ao padrão; o que não serve sai', () => {
    expect(sanitizeSetup(null)).toEqual(DEFAULT_SETUP);
    expect(sanitizeSetup('x')).toEqual(DEFAULT_SETUP);
    const s = sanitizeSetup({ ways: ['pt-jp', 'voar'], source: 'nada', pick: 'escolher', chosen: ['JP0001', 'JP0001', 3, '../x'], needs: { kanji: 'sem', katakana: 'talvez' }, hints: [], show: ['falado'], size: 7 });
    expect(s).toEqual({ ...DEFAULT_SETUP, ways: ['pt-jp'], pick: 'escolher', chosen: ['JP0001'], needs: { kanji: 'sem', hiragana: 'tanto', katakana: 'tanto' }, show: ['falado'] });
  });

  it('guarda e lê de volta, na chave que a limpeza do logout apaga', () => {
    expect(DRILL_SETUP_KEY.startsWith('meu-mural:')).toBeTrue();
    const s = setup({ ways: ['jp-pt', 'escrever'], source: 'favoritas', size: 50 });
    writeSetup(s);
    expect(readSetup()).toEqual({ ...s, ways: ['escrever', 'jp-pt'] });
  });
});

describe('Treino do dicionário: as contas do fim', () => {
  it('acertos no total e por jeito, só os jeitos que saíram', () => {
    const score = drillScore([
      { item: { word: taberu, way: 'escrever', hint: 'som' }, ok: true },
      { item: { word: terebi, way: 'escrever', hint: 'romaji' }, ok: false },
      { item: { word: tokyo, way: 'jp-pt', show: 'escrito' }, ok: true },
    ]);
    expect(score).toEqual({
      right: 2,
      total: 3,
      byWay: [
        { way: 'escrever', right: 1, total: 2 },
        { way: 'jp-pt', right: 1, total: 1 },
      ],
    });
  });
});
