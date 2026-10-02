import { hash, rng } from './paper';

const CONSONANTS = 'bcdfghjklmnprstvz';
const VOWELS = 'aeiou';

/**
 * O texto embaralhado do modo sem spoilers: cada letra vira outra, alternando consoante e vogal para
 * parecer palavra, e o resto (espaços, pontuação, quebras de linha) fica onde estava. O texto ocupa
 * o mesmo espaço que o de verdade, e a mesma ficha embaralha sempre do mesmo jeito.
 */
export function scramble(text: string, seed: string): string {
  const next = rng(hash(seed));
  let out = '';
  let vowel = next() < 0.5;
  for (const ch of text) {
    if (/\p{L}/u.test(ch)) {
      const pool = vowel ? VOWELS : CONSONANTS;
      const c = pool[Math.floor(next() * pool.length)];
      out += ch !== ch.toLowerCase() ? c.toUpperCase() : c;
      // de vez em quando duas consoantes ou duas vogais seguidas, para não virar "babababa"
      vowel = next() < 0.82 ? !vowel : vowel;
    } else if (/\d/.test(ch)) {
      out += String(Math.floor(next() * 10));
    } else {
      out += ch;
      vowel = next() < 0.5;
    }
  }
  return out;
}
