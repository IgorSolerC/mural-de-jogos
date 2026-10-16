import { fold } from './review';

/**
 * Onde a busca aparece num texto: os pedaços [início, fim) do texto como está escrito, achados do
 * mesmo jeito que a busca acha (sem acento nem caixa, ver `fold`), sem sobrepor. `needle` já vem
 * dobrado. O acento solto (o texto em NFD, "e" + "´") fica junto da letra dele.
 */
export function foundSpans(text: string, needle: string): [number, number][] {
  if (!needle || !text) return [];
  // cada unidade do texto dobrado sabe de que pedaço do original veio
  let folded = '';
  const starts: number[] = [];
  const ends: number[] = [];
  for (let i = 0; i < text.length; ) {
    const cp = text.codePointAt(i)!;
    const size = cp > 0xffff ? 2 : 1;
    const f = fold(text.slice(i, i + size));
    if (f) {
      for (let k = 0; k < f.length; k++) {
        starts.push(i);
        ends.push(i + size);
      }
      folded += f;
    } else if (ends.length) {
      // sumiu ao dobrar (o acento solto): vai com a letra de antes
      ends[ends.length - 1] = i + size;
    }
    i += size;
  }
  const spans: [number, number][] = [];
  for (let at = folded.indexOf(needle); at !== -1; at = folded.indexOf(needle, at + needle.length)) {
    spans.push([starts[at], ends[at + needle.length - 1]]);
  }
  return spans;
}
