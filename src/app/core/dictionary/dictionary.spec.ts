import { DEFAULT_STATE, DictState, effectiveSort, facetChips, facetGroups, keysOf, matchScore, paramsOf, parseCsv, passes, readWords, sectionsOf, sortWords, stateFromParams, toggleFacet } from './dictionary';
import { foldJa, kanaRow, looseRomaji, romajiToKana } from './kana';
import { dictionaryWords } from './words';

const CSV = `﻿prioridade,id,japones,leitura,romaji,portugues,importancia,frequencia,uso,jlpt,registro,classe,tema,escrita,grupo_verbo,rank_corpus_internet,composicao,notas
1,JP0037,だ,だ,da,é (versão casual de です),10,5,Altíssimo,N5,casual,cópula,gramática,kana,-,29,,Base da fala informal.
2,JP0242,来る,くる,kuru,vir,10,5,Altíssimo,N5,neutro,verbo,ações,kanji+kana,irregular,879,"来ます (kimasu), 来ない (konai)",Um dos 2 verbos irregulares (com する).
3,JP0300,食べる,たべる,taberu,comer,8,4,Alto,N5,neutro,verbo,comida,kanji+kana,ichidan,500,食べ物,"Diz ""itadakimasu"" antes."
4,JP0400,テレビ,てれび,terebi,televisão,5,3,Médio,N4,neutro; TV,substantivo,mídia,katakana,-,,,
5,JP0500,東京,とうきょう,toukyou,Tóquio / capital,4,3,Médio,N3,neutro; escrito,substantivo,lugares,kanji,-,1200,,
6,JP0600,新聞,しんぶん,shinbun,jornal,6,4,Alto,-,neutro,substantivo,mídia,kanji,-,90,,
`;

describe('Dicionário Japonês: o núcleo', () => {
  const words = readWords(CSV);
  const keys = new Map(words.map((w) => [w.id, keysOf(w)]));
  const find = (q: string) =>
    sortWords(
      words.filter((w) => matchScore(keys.get(w.id)!, q) > 0),
      'relevance',
      'asc',
      (w) => matchScore(keys.get(w.id)!, q),
    ).map((w) => w.text);

  it('lê o CSV com aspas, aspas dobradas, BOM e linhas em branco', () => {
    expect(parseCsv('a,"b,c","d ""e"""\n\n1,2,3\r\n')).toEqual([
      ['a', 'b,c', 'd "e"'],
      ['1', '2', '3'],
    ]);
    expect(words.length).toBe(6);
    const kuru = words[1];
    expect(kuru.composition).toBe('来ます (kimasu), 来ない (konai)');
    expect(kuru.verbGroup).toBe('irregular');
    expect(words[0].verbGroup).toBeNull();
    expect(words[2].notes).toBe('Diz "itadakimasu" antes.');
    expect(words[3].rank).toBeNull();
    expect(words[3].registers).toEqual(['neutro', 'TV']);
  });

  it('lê a lista inteira do dono: 933 palavras, todas com id único', () => {
    const all = dictionaryWords().words;
    expect(all.length).toBe(933);
    expect(new Set(all.map((w) => w.id)).size).toBe(933);
    expect(all.every((w) => w.text && w.reading && w.meaning)).toBeTrue();
  });

  it('acha pelo português sem acento, pelo romaji, pelo kana e pelo kanji', () => {
    expect(find('televisao')).toEqual(['テレビ']);
    expect(find('kuru')).toEqual(['来る']);
    expect(find('くる')).toEqual(['来る']);
    expect(find('来')).toEqual(['来る']);
    // o katakana e o hiragana se acham
    expect(find('テレビ')).toEqual(['テレビ']);
    expect(find('てれび')).toEqual(['テレビ']);
  });

  it('acha o romaji de outro jeito: sem a vogal longa, com mácron, si/shi', () => {
    expect(find('tokyo')).toEqual(['東京']);
    expect(find('tōkyō')).toEqual(['東京']);
    expect(find('sinbun')).toEqual(['新聞']);
  });

  it('põe o que combina melhor primeiro e não acha pedaço do meio de uma palavra portuguesa', () => {
    // "capital" está no português de Tóquio; "come" começa "comer"
    expect(find('capital')).toEqual(['東京']);
    expect(find('come')).toEqual(['食べる']);
    expect(find('omer')).toEqual([]);
    // cada pedaço precisa achar alguma coisa
    expect(find('kuru vir')).toEqual(['来る']);
    expect(find('kuru comer')).toEqual([]);
  });

  it('acha na composição e nas notas, valendo menos', () => {
    expect(find('来ない')).toEqual(['来る']);
    expect(matchScore(keys.get('JP0242')!, '来ない')).toBeLessThan(matchScore(keys.get('JP0242')!, 'kuru'));
    // uma letra só não procura no meio (está em quase tudo): acha só o que começa com ela; um kanji sozinho, sim
    expect(find('b')).toEqual([]);
    expect(find('t')).toEqual(['食べる', 'テレビ', '東京']);
    expect(find('聞')).toEqual(['新聞']);
  });

  it('filtra com qualquer um dentro de uma linha e todas entre as linhas, contando cada recorte', () => {
    let f = toggleFacet({}, 'jlpt', 'N5');
    f = toggleFacet(f, 'jlpt', 'N4');
    expect(words.filter((w) => passes(w, f)).map((w) => w.text)).toEqual(['だ', '来る', '食べる', 'テレビ']);
    f = toggleFacet(f, 'wordClass', 'verbo');
    expect(words.filter((w) => passes(w, f)).map((w) => w.text)).toEqual(['来る', '食べる']);

    const groups = facetGroups(words, words, f);
    const jlpt = groups.find((g) => g.key === 'jlpt')!;
    // a linha do JLPT conta com a Classe ligada, sem ela mesma
    expect(jlpt.options.map((o) => [o.label, o.n, o.on])).toEqual([
      ['N5', 2, true],
      ['N4', 0, true],
      ['N3', 0, false],
      ['Sem nível', 0, false],
    ]);
    expect(groups.find((g) => g.key === 'importance')!.options.map((o) => o.value)).toEqual(['10', '8', '6', '5', '4']);
    expect(groups.find((g) => g.key === 'use')!.options.map((o) => o.value)).toEqual(['Altíssimo', 'Alto', 'Médio']);
    expect(facetChips(f, words).map((c) => c.label)).toEqual(['JLPT N5', 'JLPT N4', 'Verbo']);
    expect(toggleFacet(toggleFacet({}, 'theme', 'mídia'), 'theme', 'mídia')).toEqual({});
  });

  it('o registro tem vários valores e o grupo do verbo só aparece com verbo à vista', () => {
    expect(words.filter((w) => passes(w, { register: ['escrito'] })).map((w) => w.text)).toEqual(['東京']);
    const nouns = words.filter((w) => w.wordClass === 'substantivo');
    expect(facetGroups(words, nouns, {}).some((g) => g.key === 'verbGroup')).toBeFalse();
    expect(facetGroups(words, words, {}).find((g) => g.key === 'verbGroup')!.options.map((o) => o.value)).toEqual(['ichidan', 'irregular']);
  });

  it('ordena e divide em seções, e a seta inverte as duas coisas', () => {
    const byJlpt = sectionsOf(sortWords(words, 'jlpt', 'asc'), 'jlpt');
    expect(byJlpt.map((s) => [s.key?.label, s.words.length])).toEqual([
      ['N5', 3],
      ['N4', 1],
      ['N3', 1],
      ['Sem nível', 1],
    ]);
    expect(sectionsOf(sortWords(words, 'jlpt', 'desc'), 'jlpt').map((s) => s.key?.label)).toEqual(['Sem nível', 'N3', 'N4', 'N5']);

    const byReading = sortWords(words, 'reading', 'asc');
    expect(byReading.map((w) => w.reading)).toEqual(['くる', 'しんぶん', 'だ', 'たべる', 'てれび', 'とうきょう']);
    expect(sectionsOf(byReading, 'reading').map((s) => s.key?.label)).toEqual(['か行', 'さ行', 'た行']);

    // sem rank vai para o fim; o desempate é a prioridade
    expect(sortWords(words, 'rank', 'asc').map((w) => w.text)).toEqual(['だ', '新聞', '食べる', '来る', '東京', 'テレビ']);
    expect(sortWords(words, 'use', 'asc').map((w) => w.text)).toEqual(['だ', '来る', '新聞', '食べる', '東京', 'テレビ']);
    expect(sectionsOf(sortWords(words, 'priority', 'asc'), 'priority')[0].key?.label).toBe('Importância 10');
    expect(sectionsOf(sortWords(words, 'relevance', 'asc'), 'relevance').length).toBe(1);
  });

  it('guarda tudo no endereço, só o que não é o padrão', () => {
    const s: DictState = { query: 'kuru', filter: { jlpt: ['N5', 'N4'], register: ['anime/mangá'] }, sort: 'reading', dir: 'desc', view: 'tabela' };
    const p = paramsOf(s);
    expect(p).toEqual(jasmine.objectContaining({ q: 'kuru', ordem: 'leitura', dir: 'desc', vista: 'tabela', jlpt: 'N5,N4', registro: 'anime/mangá', tema: null }));
    const back = stateFromParams(Object.fromEntries(Object.entries(p).filter(([, v]) => v !== null)) as Record<string, string>);
    expect(back).toEqual(s);
    expect(stateFromParams({ ordem: 'nada', dir: 'x', vista: 'y' })).toEqual(DEFAULT_STATE);
    expect(Object.values(paramsOf(DEFAULT_STATE)).every((v) => v === null)).toBeTrue();
  });

  it('busca em Relevância e sem busca em Prioridade, a não ser que outra ordem tenha sido escolhida', () => {
    expect(effectiveSort(DEFAULT_STATE)).toBe('priority');
    expect(effectiveSort({ ...DEFAULT_STATE, query: 'kuru' })).toBe('relevance');
    expect(effectiveSort({ ...DEFAULT_STATE, query: 'kuru', sort: 'jlpt' })).toBe('jlpt');
    expect(effectiveSort({ ...DEFAULT_STATE, query: 'kuru', sort: 'priority' })).toBe('priority');
    // a Relevância sem busca não tem o que medir
    expect(effectiveSort({ ...DEFAULT_STATE, sort: 'relevance' })).toBe('priority');
  });
});

describe('Dicionário Japonês: kana e romaji', () => {
  it('lê romaji como hiragana', () => {
    expect(romajiToKana('taberu')).toBe('たべる');
    expect(romajiToKana('kitte')).toBe('きって');
    expect(romajiToKana('konnichiha')).toBe('こんにちは');
    expect(romajiToKana('konna')).toBe('こんな');
    expect(romajiToKana('sinbun')).toBe('しんぶん');
    expect(romajiToKana("kin'en")).toBe('きんえん');
    expect(romajiToKana('kyou')).toBe('きょう');
    expect(romajiToKana('matcha')).toBe('まっちゃ');
    expect(romajiToKana('tōkyō')).toBe('とうきょう');
    expect(romajiToKana('tab')).toBeNull();
    expect(romajiToKana('televisão')).toBeNull();
    expect(romajiToKana('来る')).toBeNull();
  });

  it('dobra katakana em hiragana e junta o dakuten', () => {
    expect(foldJa('テレビ')).toBe('てれび');
    expect(foldJa('ガ')).toBe('が');
    expect(foldJa('Tóquio')).toBe('toquio');
  });

  it('solta a vogal longa do romaji', () => {
    expect(looseRomaji('toukyou')).toBe(looseRomaji('tokyo'));
    expect(looseRomaji('oishii')).toBe('oishi');
  });

  it('diz a linha do silabário pela leitura', () => {
    expect(kanaRow('〜ます')?.kana).toBe('ま');
    expect(kanaRow('がっこう')?.kana).toBe('か');
    expect(kanaRow('ゃ')?.kana).toBe('や');
    expect(kanaRow('ABC')).toBeNull();
  });
});
