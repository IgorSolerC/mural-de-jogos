/**
 * As máscaras do papel (o recorte do rasgo, da queimadura, do furo) como regras de CSS, uma por
 * recorte, em vez de irem escritas no `style` de cada camada e de cada texto.
 *
 * O recorte é um SVG inteiro dentro de um `url("data:…")`: de alguns KB até centenas, e a mesma ficha
 * o repete em sete ou oito elementos. Escrito no `style`, o navegador refazia a conta desse endereço
 * enorme em cada elemento a cada recálculo de estilo: uma ficha enfeitada custava cinco vezes mais
 * que uma lisa para recalcular (ao abrir um diálogo, ao montar, ao acordar). Numa regra com classe,
 * o endereço é lido uma vez e todos os elementos usam o mesmo. A imagem é a mesma, pixel a pixel.
 */

interface Held {
  cls: string;
  rule: CSSRule | null;
  refs: number;
  /** A regra sem ninguém segurando sai daqui a pouco (ver `LINGER`). */
  leaving: ReturnType<typeof setTimeout> | undefined;
}

/**
 * Quanto a regra fica depois que o último dono a soltou: a cópia do papel antigo que some num fade
 * (ver PaperArtLayer.ghost) ainda usa a classe por um instante.
 */
const LINGER = 3000;

const byValue = new Map<string, Held>();
let sheet: CSSStyleSheet | null = null;
let count = 0;

function ensureSheet(): CSSStyleSheet | null {
  if (sheet || typeof document === 'undefined') return sheet;
  const el = document.createElement('style');
  el.setAttribute('data-mascaras', '');
  document.head.append(el);
  sheet = el.sheet;
  return sheet;
}

/**
 * A classe do recorte (`value` é o `url("data:…")` que iria no `mask-image`), criando a regra se ainda
 * não existe. Não segura a regra: quem usa a classe por mais de um instante chama `holdMask`.
 */
export function maskClass(value: string): string {
  let held = byValue.get(value);
  if (!held) {
    held = { cls: `mascara-${++count}`, rule: null, refs: 0, leaving: undefined };
    byValue.set(value, held);
    const s = ensureSheet();
    if (s) {
      try {
        // !important: no `style` do elemento, a máscara valia acima de qualquer regra; aqui também
        const at = s.insertRule(`.${held.cls}{-webkit-mask-image:${value} !important;mask-image:${value} !important}`, s.cssRules.length);
        held.rule = s.cssRules[at];
      } catch {
        /* um recorte que o navegador não aceita como regra não aceitaria no style também */
      }
    }
    // criada e ainda sem dono: se ninguém segurar, sai sozinha
    release(value, held);
  }
  return held.cls;
}

/** Segura a regra do recorte enquanto houver elemento com a classe dela. */
export function holdMask(value: string): void {
  maskClass(value);
  const held = byValue.get(value)!;
  held.refs++;
  clearTimeout(held.leaving);
  held.leaving = undefined;
}

/** Solta a regra; sem mais ninguém, ela sai daqui a pouco. */
export function dropMask(value: string): void {
  const held = byValue.get(value);
  if (!held) return;
  held.refs = Math.max(0, held.refs - 1);
  if (!held.refs) release(value, held);
}

function release(value: string, held: Held): void {
  clearTimeout(held.leaving);
  held.leaving = setTimeout(() => {
    if (held.refs || byValue.get(value) !== held) return;
    byValue.delete(value);
    if (!sheet || !held.rule) return;
    const at = Array.prototype.indexOf.call(sheet.cssRules, held.rule);
    if (at >= 0) sheet.deleteRule(at);
  }, LINGER);
}

/** Quantas regras de recorte existem agora (para os testes). */
export function maskRuleCount(): number {
  return byValue.size;
}
