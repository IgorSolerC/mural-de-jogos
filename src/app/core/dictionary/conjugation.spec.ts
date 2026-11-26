import { CONJ_TABLE, FORMS, FormId, conjugate, conjugatedKeys, formOf, formParts, groupSaid, isConjugable } from './conjugation';
import { Word } from './dictionary';
import { dictionaryWords } from './words';

function verb(text: string, reading: string, verbGroup: string): Word {
  return {
    order: 1,
    id: `V-${text}`,
    text,
    reading,
    romaji: '',
    meaning: '',
    importance: 5,
    frequency: 3,
    use: 'Médio',
    jlpt: 'N5',
    registers: ['neutro'],
    wordClass: 'verbo',
    theme: 'ação',
    script: 'kanji+kana',
    verbGroup,
    rank: null,
    composition: '',
    notes: '',
    examples: [],
    origin: '',
    learnedOn: null,
  };
}

/** As formas de um verbo, em escrita, na ordem da nota ('—' onde não se usa). */
function texts(w: Word): string[] {
  return [...conjugate(w)!.values()].map((f) => f?.text ?? '—');
}
function form(w: Word, id: FormId): string | undefined {
  return conjugate(w)!.get(id)?.text;
}
function readingOf(w: Word, id: FormId): string | undefined {
  return conjugate(w)!.get(id)?.reading;
}

describe('As conjugações dos verbos (core/dictionary/conjugation.ts)', () => {
  it('行く tem exatamente as formas da nota 行く→ Ir, na ordem dela', () => {
    expect(texts(verb('行く', 'いく', 'godan'))).toEqual([
      '行く', '行きます', '行かない', '行きません', '行った', '行きました', '行かなかった', '行きませんでした',
      '行って', '行かなくて', '行かないで',
      '行きたい', '行きたくない', '行きたかった',
      '行こう', '行きましょう', '行ける', '行けます', '行けない', '行けません', '行かれる', '行かれます',
      '行かせる', '行かせます', '行かせられる', '行かされる', '行かせられます', '行け', '行きなさい',
      '行けば', '行かなければ', '行ったら', '行かなかったら',
    ]);
  });

  it('cada forma tem a etiqueta da nota, o uso e um exemplo com ela marcada', () => {
    expect(FORMS.length).toBe(33);
    for (const f of FORMS) {
      expect(f.tags.split(' • ').length).withContext(f.id).toBe(3);
      expect(f.use.length).withContext(f.id).toBeGreaterThan(20);
      expect(f.example.ja).withContext(f.id).toMatch(/\[[^\]]+\]/);
      expect(f.example.pt).withContext(f.id).toBeTruthy();
      // impessoal, como as notas do dicionário (a tradução de uma frase pode ter "você")
      expect(f.use).withContext(f.id).not.toMatch(/\bvocê\b/i);
    }
    // o exemplo do pedido do dono
    expect(FORMS.find((f) => f.id === 'ou')!.example.ja).toBe('みんな、[食べよう]！');
  });

  it('a tabela tem cada forma uma vez só, nos grupos da nota', () => {
    const cells = CONJ_TABLE.flatMap((g) => g.rows.flatMap((r) => r.cells)).filter(Boolean);
    expect(cells.length).toBe(FORMS.length);
    expect(new Set(cells).size).toBe(FORMS.length);
    expect(CONJ_TABLE.map((g) => g.title)).toEqual(['Tempos básicos', 'Forma -te', 'Desejativa', 'Formas modais e vozes', 'Condicionais']);
    for (const g of CONJ_TABLE) for (const r of g.rows) expect(r.cells.length).withContext(`${g.id} ${r.label}`).toBe(Math.max(1, g.cols.length));
    // cada forma está no grupo dela
    for (const g of CONJ_TABLE) for (const id of g.rows.flatMap((r) => r.cells)) if (id) expect(FORMS.find((f) => f.id === id)!.group).toBe(g.id);
  });

  it('os godan, pela última sílaba', () => {
    const cases: [string, string, Partial<Record<FormId, string>>][] = [
      ['飲む', 'のむ', { nai: '飲まない', te: '飲んで', ta: '飲んだ', eru: '飲める', ou: '飲もう', meirei: '飲め', asareru: '飲まされる' }],
      ['話す', 'はなす', { te: '話して', ta: '話した', masu: '話します', aseru: '話させる', ba: '話せば' }],
      ['待つ', 'まつ', { te: '待って', nai: '待たない', masu: '待ちます', ou: '待とう' }],
      ['死ぬ', 'しぬ', { te: '死んで', tara: '死んだら', nai: '死なない' }],
      ['遊ぶ', 'あそぶ', { te: '遊んで', nakatta: '遊ばなかった', eru: '遊べる' }],
      ['泳ぐ', 'およぐ', { te: '泳いで', ta: '泳いだ', emasen: '泳げません' }],
      ['書く', 'かく', { te: '書いて', ta: '書いた', areru: '書かれる' }],
      ['買う', 'かう', { nai: '買わない', te: '買って', aseru: '買わせる', asareru: '買わされる', nakereba: '買わなければ' }],
      ['帰る', 'かえる', { nai: '帰らない', te: '帰って', masu: '帰ります', meirei: '帰れ' }],
    ];
    for (const [text, reading, want] of cases) {
      const w = verb(text, reading, 'godan');
      for (const [id, v] of Object.entries(want)) expect(form(w, id as FormId)).withContext(`${text} ${id}`).toBe(v);
    }
    // a leitura acompanha
    expect(readingOf(verb('飲む', 'のむ', 'godan'), 'te')).toBe('のんで');
    // a contraída não existe nos que terminam em す
    expect(conjugate(verb('話す', 'はなす', 'godan'))!.get('asareru')).toBeNull();
  });

  it('os ichidan, tirando o る', () => {
    const w = verb('食べる', 'たべる', 'ichidan');
    expect(form(w, 'nai')).toBe('食べない');
    expect(form(w, 'te')).toBe('食べて');
    expect(form(w, 'ou')).toBe('食べよう');
    expect(form(w, 'eru')).toBe('食べられる');
    expect(form(w, 'areru')).toBe('食べられる');
    expect(form(w, 'aseru')).toBe('食べさせる');
    expect(form(w, 'aserareru')).toBe('食べさせられる');
    expect(form(w, 'meirei')).toBe('食べろ');
    expect(form(w, 'ba')).toBe('食べれば');
    expect(conjugate(w)!.get('asareru')).toBeNull();
    expect(readingOf(w, 'masendeshita')).toBe('たべませんでした');
  });

  it('する, os verbos com する e 来る', () => {
    const suru = verb('する', 'する', 'irregular');
    expect(form(suru, 'nai')).toBe('しない');
    expect(form(suru, 'eru')).toBe('できる');
    expect(form(suru, 'meirei')).toBe('しろ');
    expect(form(suru, 'ba')).toBe('すれば');
    const study = verb('勉強する', 'べんきょうする', 'irregular (する)');
    expect(form(study, 'masu')).toBe('勉強します');
    expect(readingOf(study, 'aserareru')).toBe('べんきょうさせられる');
    expect(form(study, 'enai')).toBe('勉強できない');
    const kuru = verb('来る', 'くる', 'irregular');
    expect(form(kuru, 'nai')).toBe('来ない');
    expect(readingOf(kuru, 'nai')).toBe('こない');
    expect(readingOf(kuru, 'masu')).toBe('きます');
    expect(readingOf(kuru, 'eru')).toBe('こられる');
    expect(readingOf(kuru, 'meirei')).toBe('こい');
    expect(form(kuru, 'meirei')).toBe('来い');
    expect(readingOf(kuru, 'ba')).toBe('くれば');
  });

  it('as exceções: ある, os honoríficos, くれる e o que não se usa', () => {
    const aru = verb('ある', 'ある', 'godan');
    expect(form(aru, 'nai')).toBe('ない');
    expect(form(aru, 'nakatta')).toBe('なかった');
    expect(form(aru, 'masu')).toBe('あります');
    expect(form(aru, 'te')).toBe('あって');
    expect(conjugate(aru)!.get('eru')).toBeNull();
    expect(conjugate(aru)!.get('areru')).toBeNull();
    const irassharu = verb('いらっしゃる', 'いらっしゃる', 'godan');
    expect(form(irassharu, 'masu')).toBe('いらっしゃいます');
    expect(form(irassharu, 'meirei')).toBe('いらっしゃい');
    expect(form(irassharu, 'nai')).toBe('いらっしゃらない');
    expect(form(verb('くださる', 'くださる', 'godan'), 'meirei')).toBe('ください');
    expect(form(verb('ござる', 'ござる', 'godan'), 'masu')).toBe('ございます');
    expect(conjugate(verb('ござる', 'ござる', 'godan'))!.get('nai')).toBeNull();
    expect(form(verb('くれる', 'くれる', 'ichidan'), 'meirei')).toBe('くれ');
    expect(conjugate(verb('できる', 'できる', 'ichidan'))!.get('eru')).toBeNull();
    expect(conjugate(verb('分かる', 'わかる', 'godan'))!.get('emasu')).toBeNull();
    // o いる "precisar" (要る, godan) não tem potencial; o いる "estar" (ichidan) tem
    expect(conjugate(verb('要る', 'いる', 'godan'))!.get('eru')).toBeNull();
    expect(form(verb('要る', 'いる', 'godan'), 'nai')).toBe('要らない');
    expect(form(verb('いる', 'いる', 'ichidan'), 'nai')).toBe('いない');
  });

  it('só os verbos conjugam', () => {
    expect(conjugate({ ...verb('だ', 'だ', 'godan'), wordClass: 'cópula' } as Word)).toBeNull();
    expect(conjugate({ ...verb('〜ます', '〜ます', '-'), verbGroup: null } as Word)).toBeNull();
    expect(isConjugable(verb('行く', 'いく', 'godan'))).toBeTrue();
  });

  it('todos os verbos do dicionário conjugam, sem forma vazia e com a escrita e a leitura de mesmo fim', () => {
    const verbs = dictionaryWords().words.filter((w) => w.wordClass === 'verbo');
    expect(verbs.length).toBeGreaterThanOrEqual(282);
    for (const w of verbs) {
      const c = conjugate(w);
      expect(c).withContext(w.text).not.toBeNull();
      if (!c) continue;
      expect(c.get('dic')?.text).withContext(w.text).toBe(w.text);
      for (const f of c.values()) {
        if (!f) continue;
        expect(f.text).withContext(`${w.text} ${f.form.id}`).toBeTruthy();
        expect(f.reading).withContext(`${w.text} ${f.form.id}`).toMatch(/^[ぁ-ゖー]+$/);
      }
    }
  });

  it('a forma que um texto é, e as chaves da busca', () => {
    const iku = verb('行く', 'いく', 'godan');
    expect(formOf(iku, '行かなかった')?.form.id).toBe('nakatta');
    expect(formOf(iku, 'いかなかった')?.form.id).toBe('nakatta');
    expect(formOf(iku, 'イカナカッタ')?.form.id).toBe('nakatta');
    expect(formOf(iku, ' 行って ')?.text).toBe('行って');
    expect(formOf(iku, '行く')).toBeNull();
    expect(formOf(iku, '行')).toBeNull();
    // das que se escrevem igual, a primeira da nota (o potencial vem antes da passiva)
    expect(formOf(verb('食べる', 'たべる', 'ichidan'), '食べられる')?.form.id).toBe('eru');
    const keys = conjugatedKeys(iku);
    expect(keys).toContain('いかない');
    expect(keys).toContain('行かない');
    expect(keys).not.toContain('いく');
  });

  it('o radical e o que muda, e o grupo dito', () => {
    expect(formParts('行く', '行かない')).toEqual(['行', 'かない']);
    expect(formParts('食べる', '食べさせる')).toEqual(['食べ', 'させる']);
    expect(formParts('勉強する', '勉強しない')).toEqual(['勉強', 'しない']);
    expect(formParts('ある', 'ない')).toEqual(['', 'ない']);
    expect(groupSaid('godan')).toBe('Grupo 1 · godan');
    expect(groupSaid('ichidan')).toBe('Grupo 2 · ichidan');
    expect(groupSaid('irregular (する)')).toBe('Grupo 3 · irregular');
  });
});
