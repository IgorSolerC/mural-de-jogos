import { DEFAULT_STATE, DictState, MarkLookup, effectiveSort, lookupWords, facetChips, facetGroups, keysOf, matchScore, paramsOf, parseCsv, passes, readWords, sectionsOf, sortWords, spokenOf, stateFromParams, toggleFacet, compositionParts, relatedWords, classFamily, CLASS_FAMILIES, kanjiIn, wordsWithKanji, exampleParts, examplePlain, readExamples } from './dictionary';
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

  it('lê o dia em que a palavra foi aprendida pela coluna, e só um dia que existe', () => {
    const csv = (dia: string) => `id,japones,leitura,portugues,aprendida
JP1,犬,いぬ,cachorro,${dia}
`;
    expect(readWords(csv('2026-11-14'))[0].learnedOn).toBe('2026-11-14');
    expect(readWords(csv(''))[0].learnedOn).toBeNull();
    expect(readWords(csv('2026-11-31'))[0].learnedOn).toBeNull();
    expect(readWords(csv('ontem'))[0].learnedOn).toBeNull();
    // sem a coluna (o CSV de antes), ninguém está aprendido
    expect(words.every((w) => w.learnedOn === null)).toBeTrue();
  });

  it('lê as frases de exemplo (uma por linha, japonês → tradução) e a origem', () => {
    const csv = `id,japones,leitura,portugues,exemplos,origem
JP1,ヒーロー,ヒーロー,herói,"子どものころ、[ヒーロー]になりたかった。 → Quando criança, eu queria ser um herói.
彼は試合の[ヒーロー]だ。→Ele é o herói da partida.

sem seta nenhuma",Do inglês hero.
`;
    const [w] = readWords(csv);
    expect(w.examples).toEqual([
      { ja: '子どものころ、[ヒーロー]になりたかった。', pt: 'Quando criança, eu queria ser um herói.' },
      { ja: '彼は試合の[ヒーロー]だ。', pt: 'Ele é o herói da partida.' },
    ]);
    expect(w.origin).toBe('Do inglês hero.');
    // sem as colunas (o CSV de antes), nada de frases nem origem
    expect(words.every((x) => x.examples.length === 0 && x.origin === '')).toBeTrue();
    expect(readExamples('')).toEqual([]);
  });

  it('nas notas e nas relacionadas, o romaji só acha do começo de uma palavra', () => {
    const all = dictionaryWords().words;
    const hits = (q: string) => all.filter((w) => matchScore(keysOf(w), q) > 0).map((w) => w.text);
    // "kutsushita" (靴下, nas relacionadas de 下 e de 靴) não acha "sushi" nelas; o próprio 靴下 e as notas que
    // dizem "sushi" em português (皿, 醤油) acham
    const sushi = hits('sushi');
    expect(sushi).toContain('寿司');
    expect(sushi).not.toContain('下');
    expect(sushi).not.toContain('靴');
    // o japonês nas notas continua achando em qualquer lugar
    expect(hits('靴下')).toContain('下');
  });

  it('a frase em pedaços: a palavra entre colchetes vem marcada', () => {
    expect(exampleParts('毎朝パンを[食べます]。')).toEqual([
      { text: '毎朝パンを', mark: false },
      { text: '食べます', mark: true },
      { text: '。', mark: false },
    ]);
    expect(exampleParts('[まじ]でおいしい！')).toEqual([
      { text: 'まじ', mark: true },
      { text: 'でおいしい！', mark: false },
    ]);
    expect(exampleParts('なにもない。')).toEqual([{ text: 'なにもない。', mark: false }]);
    expect(examplePlain('私[は]学生です。')).toBe('私は学生です。');
  });

  it('todas as palavras do dicionário seguem o padrão: sentidos com barra, descrição, três frases marcadas', () => {
    const bad: string[] = [];
    for (const w of dictionaryWords().words) {
      const why = [
        /;/.test(w.meaning) && 'sentidos com ;',
        !w.notes && 'sem descrição',
        /(^|[^\p{L}])você(?![\p{L}])/iu.test(w.notes) && !/você/.test(w.meaning) && 'descrição fala com o leitor',
        (w.examples.length < 3 || w.examples.length > 4) && `${w.examples.length} frases`,
        w.examples.some((e) => exampleParts(e.ja).filter((p) => p.mark).length !== 1 || /[[\]]/.test(examplePlain(e.ja))) && 'frase sem a palavra marcada uma vez',
        w.origin && !w.origin.endsWith('.') && 'origem sem ponto',
      ].filter(Boolean);
      if (why.length) bad.push(`${w.id} ${w.text}: ${why.join(', ')}`);
    }
    expect(bad).toEqual([]);
  });

  it('o que a voz diz: a leitura em kana, sem o 〜, as alternativas com pausa e as partículas como se falam', () => {
    const by = (id: string) => dictionaryWords().words.find((w) => w.id === id)!;
    const find = (text: string) => dictionaryWords().words.find((w) => w.text === text)!;
    expect(spokenOf(find('食べる'))).toBe('たべる');
    expect(spokenOf(by('JP0957'))).toBe('わ');
    expect(spokenOf(by('JP0001'))).toBe('え');
    // o 歯 (は) continua は
    expect(spokenOf(by('JP0706'))).toBe('は');
    expect(spokenOf(find('〜中'))).toBe('ちゅう、じゅう');
    expect(spokenOf(find('〜ます'))).toBe('ます');
  });

  it('os kanji da palavra: as outras palavras com cada um, e a composição em links', () => {
    const { words, byText } = dictionaryWords();
    const find = (text: string) => words.find((w) => w.text === text)!;
    expect(kanjiIn('食べ物')).toEqual(['食', '物']);
    expect(kanjiIn('日曜日')).toEqual(['日', '曜']);
    expect(kanjiIn('たべる')).toEqual([]);
    // na ordem de estudo, sem a própria
    const sen = wordsWithKanji(words, '先', find('先生').id);
    expect(sen.map((w) => w.text)).not.toContain('先生');
    expect(sen.map((w) => w.text)).toContain('先週');
    expect(sen.map((w) => w.order)).toEqual([...sen.map((w) => w.order)].sort((a, b) => a - b));
    // cada trecho que é uma palavra vira link; o resto fica texto, com a pontuação e o português
    const parts = compositionParts('先週, 先月, 先生', byText, find('先〜').id);
    expect(parts.map((p) => [p.text, p.word?.text ?? null])).toEqual([
      ['先週', '先週'],
      [', ', null],
      ['先月', '先月'],
      [', ', null],
      ['先生', '先生'],
    ]);
    const eat = compositionParts(find('食べる').composition, byText, find('食べる').id);
    expect(eat.filter((p) => p.word).map((p) => p.text)).toEqual(['食べ物']);
    expect(eat.map((p) => p.text).join('')).toBe(find('食べる').composition);
    // a própria palavra não vira link para ela mesma
    expect(compositionParts('先週', byText, find('先週').id)).toEqual([{ text: '先週' }]);
    expect(compositionParts('', byText)).toEqual([]);
    // um kana sozinho não vira link (o と de 猫 と 犬 pode não ser a partícula da lista)
    expect(compositionParts('猫 と 犬', byText).filter((p) => p.word && p.text === 'と')).toEqual([]);
  });

  it('as palavras ligadas em itens: o japonês, o sentido (com a vírgula de dentro) e a palavra quando está no dicionário', () => {
    const { words, byText } = dictionaryWords();
    const find = (text: string) => words.find((w) => w.text === text)!;
    const paper = relatedWords(find('紙').composition, byText, find('紙').id);
    expect(paper.map((r) => [r.text, r.gloss])).toEqual([
      ['手紙', 'tegami, carta'],
      ['紙コップ', 'copo de papel'],
    ]);
    expect(paper[0].word?.text).toBe('手紙');
    expect(paper[1].word).toBeUndefined();
    // a própria palavra não vira link para ela mesma, e um kana sozinho não vira link
    expect(relatedWords('先週 (semana passada)', byText, find('先週').id)[0].word).toBeUndefined();
    expect(relatedWords('と (e)', byText)[0].word).toBeUndefined();
    expect(relatedWords('', byText)).toEqual([]);
    // sem parêntese, o sentido fica vazio
    expect(relatedWords('先週', byText)).toEqual([{ text: '先週', gloss: '', word: find('先週') }]);
    // toda composição do dicionário vira itens que remontam o texto (nada se perde no corte)
    for (const w of words.filter((x) => x.composition)) {
      const items = relatedWords(w.composition, byText, w.id);
      expect(items.map((r) => (r.gloss ? `${r.text} (${r.gloss})` : r.text)).join(', ')).withContext(w.text).toBe(w.composition);
    }
  });

  it('cada classe tem a sua família de cor, e toda classe do dicionário está no mapa', () => {
    expect(classFamily('substantivo')).toBe('nome');
    expect(classFamily('verbo')).toBe('verbo');
    expect(classFamily('adjetivo-na')).toBe('adjetivo');
    expect(classFamily('advérbio')).toBe('adverbio');
    expect(classFamily('expressão')).toBe('expressao');
    expect(classFamily('partícula')).toBe('gramatica');
    expect(classFamily('classe que não existe')).toBe('gramatica');
    const classes = new Set(dictionaryWords().words.map((w) => w.wordClass));
    expect([...classes].filter((c) => !(c in CLASS_FAMILIES))).toEqual([]);
  });

  it('lê a lista inteira do dono: 1449 palavras, todas com id único', () => {
    const all = dictionaryWords().words;
    expect(all.length).toBe(1449);
    expect(new Set(all.map((w) => w.id)).size).toBe(1449);
    expect(all.every((w) => w.text && w.reading && w.meaning)).toBeTrue();
  });

  it('as 417 palavras de 25/nov entram por aprender, no fim do bloco delas, e as homógrafas novas são verbetes próprios', () => {
    const all = dictionaryWords().words;
    const added = all.filter((w) => Number(w.id.slice(2)) > 1032);
    expect(added.length).toBe(417);
    expect(added.every((w) => w.learnedOn === null)).toBeTrue();
    // cada uma depois de todas as antigas do mesmo bloco (importância, frequência): a ordem de antes não muda
    for (const w of added) {
      const older = all.filter((o) => Number(o.id.slice(2)) <= 1032 && o.importance === w.importance && o.frequency === w.frequency);
      expect(older.every((o) => o.order < w.order)).withContext(w.text).toBeTrue();
    }
    const find = (text: string) => all.find((w) => w.text === text)!;
    // 時 (toki) não é o 〜時 das horas, e 亡くなる (falecer) não é 無くなる (acabar)
    expect(find('時').reading).toBe('とき');
    expect(find('〜時').reading).toBe('じ');
    expect(find('亡くなる').meaning).toBe('falecer');
    expect(find('無くなる').meaning).toContain('acabar');
    // os dias do mês com a leitura nativa
    expect(['二日', '三日', '四日', '五日', '六日', '七日', '八日', '九日', '十日', '二十日'].map((t) => find(t).reading)).toEqual([
      'ふつか', 'みっか', 'よっか', 'いつか', 'むいか', 'なのか', 'ようか', 'ここのか', 'とおか', 'はつか',
    ]);
    expect(find('ポルトガル語').examples.length).toBe(3);
  });

  it('as palavras que o dono já aprendeu (14 a 23/nov) vêm com o dia, e as homógrafas são verbetes próprios', () => {
    const all = dictionaryWords().words;
    const learned = all.filter((w) => w.learnedOn);
    expect(learned.length).toBe(108);
    const on = (text: string, meaning: string) => all.find((w) => w.text === text && w.meaning.startsWith(meaning))!;
    expect(on('です', 'é').learnedOn).toBe('2026-11-14');
    expect(on('好き', 'gostar').learnedOn).toBe('2026-11-23');
    expect(on('〜様', 'sr. / sra.').learnedOn).toBe('2026-11-19');
    // と "e/com" é outra palavra que o と de citação, que continua por aprender
    expect(on('と', 'e (entre substantivos)').learnedOn).toBe('2026-11-14');
    expect(on('と', 'que').learnedOn).toBeNull();
    // o rank vem da lista da internet: 二 não pega o da partícula に
    expect(on('二', '2').rank).toBe(166);
    expect(on('〜時', 'horas').notes).toContain('四時 (yoji)');
    // as de 23/nov que faltavam entraram com o dia, e o 〜人 de contar pessoas também ficou aprendido
    for (const text of ['パスタ', 'ハンバーガー', 'ホットドッグ', 'チーズ', 'アイスクリーム', 'トマト', 'ポテト', 'ワイン', 'そば']) {
      expect(all.find((w) => w.text === text)?.learnedOn).withContext(text).toBe('2026-11-23');
    }
    expect(on('〜人', 'contador de pessoas').learnedOn).toBe('2026-11-23');
    expect(on('〜人', 'pessoa de').learnedOn).toBeNull();
    // as prioridades seguem uma por uma, sem buraco nem repetição
    expect(all.map((w) => w.order)).toEqual(all.map((_, i) => i + 1));
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

  it('diz que palavras um trecho selecionado é: inteiro, na escrita, na leitura, no romaji ou num sentido', () => {
    const is = (t: string) => lookupWords(words, keys, t).map((w) => w.text);
    expect(is('来る')).toEqual(['来る']);
    expect(is('くる')).toEqual(['来る']);
    expect(is(' テレビ ')).toEqual(['テレビ']);
    expect(is('Televisão')).toEqual(['テレビ']);
    expect(is('capital')).toEqual(['東京']);
    expect(is('kuru')).toEqual(['来る']);
    // pedaço não conta
    expect(is('来')).toEqual([]);
    expect(is('vir algo')).toEqual([]);
    expect(is('')).toEqual([]);
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

  it('filtra pelas marcas do dono: aprendidas, para aprender e favoritas', () => {
    const marks: MarkLookup = { learned: (w) => w.id === 'JP0242', favorite: (id) => id === 'JP0300' };
    const show = (f: Parameters<typeof passes>[1]) => words.filter((w) => passes(w, f, undefined, marks)).map((w) => w.text);
    expect(show({ learned: ['sim'] })).toEqual(['来る']);
    expect(show({ learned: ['nao'] }).length).toBe(5);
    expect(show({ favorite: ['sim'] })).toEqual(['食べる']);
    const groups = facetGroups(words, words, {}, marks);
    expect(groups.slice(0, 2).map((g) => [g.title, g.options.map((o) => `${o.label} ${o.n}`)])).toEqual([
      ['Aprendidas', ['Aprendidas 1', 'Para aprender 5']],
      ['Favoritas', ['Favoritas 1']],
    ]);
    // sem nenhuma favorita, a linha continua lá (com zero)
    expect(facetGroups(words, words, {}).find((g) => g.key === 'favorite')!.options.map((o) => o.n)).toEqual([0]);
    expect(facetChips({ favorite: ['sim'], learned: ['nao'] }, words).map((c) => c.label)).toEqual(['Para aprender', 'Favoritas']);
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
    const s: DictState = { query: 'kuru', filter: { jlpt: ['N5', 'N4'], register: ['anime/mangá'] }, sort: 'reading', dir: 'desc', view: 'tabela', word: 'JP0242' };
    const p = paramsOf(s);
    expect(p).toEqual(jasmine.objectContaining({ q: 'kuru', ordem: 'leitura', dir: 'desc', vista: 'tabela', palavra: 'JP0242', jlpt: 'N5,N4', registro: 'anime/mangá', tema: null }));
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
