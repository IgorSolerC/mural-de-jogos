import { fold } from '../text';

/**
 * O que a busca do Dicionário Japonês (PLANO-DICIONARIO.md) faz com a escrita japonesa: dobrar katakana em hiragana
 * (テレビ acha てれび), e ler romaji como kana (`sinbun` e `shinbun` acham しんぶん). Puro, sem nada da página.
 */

/** O texto pronto para comparar: sem acento e minúsculo no latim, e o katakana virado hiragana. */
export function foldJa(s: string): string {
  // o fold separa o acento (NFD) e tira; o NFC junta de novo o dakuten do kana (か + ゛ = が)
  return toHiragana(fold(s).normalize('NFC'));
}

/** O katakana (ァ a ヶ) virado hiragana; o resto (ー, kanji, latim) fica como está. */
export function toHiragana(s: string): string {
  return s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

/**
 * O romaji solto, para achar com ou sem a vogal longa: o do dicionário dobra a vogal (`toukyou`, `oishii`) e quem
 * procura às vezes não (`tokyo`) ou usa o mácron (`tōkyō`). As duas pontas passam por aqui.
 */
export function looseRomaji(s: string): string {
  return fold(s.replace(/[āâ]/g, 'aa').replace(/[īî]/g, 'ii').replace(/[ūû]/g, 'uu').replace(/[ēê]/g, 'ee').replace(/[ōô]/g, 'ou'))
    .replace(/ou/g, 'o')
    .replace(/([aeiou])\1/g, '$1')
    .replace(/[^a-z]/g, '');
}

/** As sílabas do romaji (Hepburn e o jeito do teclado japonês), da mais comprida para a mais curta. */
const SILABAS: Record<string, string> = {
  a: 'あ', i: 'い', u: 'う', e: 'え', o: 'お',
  ka: 'か', ki: 'き', ku: 'く', ke: 'け', ko: 'こ', kya: 'きゃ', kyu: 'きゅ', kyo: 'きょ',
  ga: 'が', gi: 'ぎ', gu: 'ぐ', ge: 'げ', go: 'ご', gya: 'ぎゃ', gyu: 'ぎゅ', gyo: 'ぎょ',
  sa: 'さ', shi: 'し', si: 'し', su: 'す', se: 'せ', so: 'そ', sha: 'しゃ', shu: 'しゅ', she: 'しぇ', sho: 'しょ', sya: 'しゃ', syu: 'しゅ', syo: 'しょ',
  za: 'ざ', ji: 'じ', zi: 'じ', zu: 'ず', ze: 'ぜ', zo: 'ぞ', ja: 'じゃ', ju: 'じゅ', je: 'じぇ', jo: 'じょ', zya: 'じゃ', zyu: 'じゅ', zyo: 'じょ', jya: 'じゃ', jyu: 'じゅ', jyo: 'じょ',
  ta: 'た', chi: 'ち', ti: 'ち', tsu: 'つ', tu: 'つ', te: 'て', to: 'と', cha: 'ちゃ', chu: 'ちゅ', che: 'ちぇ', cho: 'ちょ', tya: 'ちゃ', tyu: 'ちゅ', tyo: 'ちょ',
  da: 'だ', di: 'ぢ', du: 'づ', de: 'で', do: 'ど',
  na: 'な', ni: 'に', nu: 'ぬ', ne: 'ね', no: 'の', nya: 'にゃ', nyu: 'にゅ', nyo: 'にょ',
  ha: 'は', hi: 'ひ', fu: 'ふ', hu: 'ふ', he: 'へ', ho: 'ほ', hya: 'ひゃ', hyu: 'ひゅ', hyo: 'ひょ', fa: 'ふぁ', fi: 'ふぃ', fe: 'ふぇ', fo: 'ふぉ',
  ba: 'ば', bi: 'び', bu: 'ぶ', be: 'べ', bo: 'ぼ', bya: 'びゃ', byu: 'びゅ', byo: 'びょ',
  pa: 'ぱ', pi: 'ぴ', pu: 'ぷ', pe: 'ぺ', po: 'ぽ', pya: 'ぴゃ', pyu: 'ぴゅ', pyo: 'ぴょ',
  ma: 'ま', mi: 'み', mu: 'む', me: 'め', mo: 'も', mya: 'みゃ', myu: 'みゅ', myo: 'みょ',
  ya: 'や', yu: 'ゆ', yo: 'よ',
  ra: 'ら', ri: 'り', ru: 'る', re: 'れ', ro: 'ろ', rya: 'りゃ', ryu: 'りゅ', ryo: 'りょ',
  wa: 'わ', wo: 'を', vu: 'ゔ',
};

/**
 * O romaji lido como hiragana (`taberu` → たべる, `kitte` → きって, `konnichiha` → こんにちは), ou `null` quando não é
 * romaji (tem acento que não é mácron, número, kana) ou sobra uma letra que não fecha sílaba (`tab`). O `n` antes
 * de consoante ou no fim é ん; `n'` separa (`kin'en`); consoante dobrada é っ; o mácron vira a vogal dobrada.
 */
export function romajiToKana(raw: string): string | null {
  const s = raw
    .toLowerCase()
    .replace(/[āâ]/g, 'aa')
    .replace(/[īî]/g, 'ii')
    .replace(/[ūû]/g, 'uu')
    .replace(/[ēê]/g, 'ee')
    .replace(/[ōô]/g, 'ou')
    .replace(/[\s-]+/g, '');
  if (!s || /[^a-z']/.test(s)) return null;
  let out = '';
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === "'") {
      i++;
      continue;
    }
    // ん: o n no fim, antes de consoante (menos o y, que faz にゃ), ou com o apóstrofo
    if (c === 'n' && (i === s.length - 1 || s[i + 1] === "'" || (!'aeiouy'.includes(s[i + 1]) && s[i + 1] !== 'n'))) {
      out += 'ん';
      i++;
      continue;
    }
    if (c === 'n' && s[i + 1] === 'n') {
      // nn: ん, e o segundo n começa a próxima sílaba quando vem vogal (`konna` → こんな)
      out += 'ん';
      i += 'aeiouy'.includes(s[i + 2] ?? '') ? 1 : 2;
      continue;
    }
    // a consoante dobrada (kk, tt, tch) é o っ pequeno
    if (c === s[i + 1] && !'aeioun'.includes(c)) {
      out += 'っ';
      i++;
      continue;
    }
    if (c === 't' && s.startsWith('ch', i + 1)) {
      out += 'っ';
      i++;
      continue;
    }
    const hit = [3, 2, 1].map((n) => s.slice(i, i + n)).find((p) => SILABAS[p]);
    if (!hit) return null;
    out += SILABAS[hit];
    i += hit.length;
  }
  return out;
}

/** As linhas do silabário (あ行, か行…), pela primeira letra da leitura: a seção da ordem por leitura. */
const LINHAS: readonly { kana: string; romaji: string; de: string }[] = [
  { kana: 'あ', romaji: 'a', de: 'あいうえおぁぃぅぇぉゔ' },
  { kana: 'か', romaji: 'ka', de: 'かきくけこがぎぐげごゕゖ' },
  { kana: 'さ', romaji: 'sa', de: 'さしすせそざじずぜぞ' },
  { kana: 'た', romaji: 'ta', de: 'たちつてとだぢづでどっ' },
  { kana: 'な', romaji: 'na', de: 'なにぬねの' },
  { kana: 'は', romaji: 'ha', de: 'はひふへほばびぶべぼぱぴぷぺぽ' },
  { kana: 'ま', romaji: 'ma', de: 'まみむめも' },
  { kana: 'や', romaji: 'ya', de: 'やゆよゃゅょ' },
  { kana: 'ら', romaji: 'ra', de: 'らりるれろ' },
  { kana: 'わ', romaji: 'wa', de: 'わゐゑをんゎ' },
];

/** A linha do silabário da leitura (pulando o 〜 e o que não é kana); `null` sem kana nenhum. */
export function kanaRow(reading: string): { kana: string; romaji: string; index: number } | null {
  for (const ch of toHiragana(reading)) {
    const index = LINHAS.findIndex((l) => l.de.includes(ch));
    if (index >= 0) return { kana: LINHAS[index].kana, romaji: LINHAS[index].romaji, index };
  }
  return null;
}

/** As dez linhas do silabário, na ordem: o índice da ordem por leitura. */
export const KANA_ROWS = LINHAS.map((l) => ({ kana: l.kana, romaji: l.romaji }));

/** Há kanji no texto (o furigana só vai por cima de quem tem). */
export function hasKanji(s: string): boolean {
  return /[㐀-鿿豈-﫿々]/.test(s);
}
