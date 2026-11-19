import { signal } from '@angular/core';
import { IdleDeadlineLike, whenIdle } from '../core/idle';

/**
 * O forno (PLANO-FORNO.md): as camadas do papel de uma ficha (a fibra, a textura, a estampa, o rabisco,
 * o estrago, as manchas, as decorações) assadas em imagens, uma vez, para o navegador não refazer as
 * máscaras e os filtros delas a cada quadro em que a ficha muda ou a página rola.
 *
 * Não é um desenho à parte: o forno copia as próprias camadas vivas, com o estilo calculado delas e as
 * regras de CSS da página que pegam nelas, para dentro de um SVG (`<foreignObject>`), e o mesmo
 * navegador desenha esse SVG num canvas. O que sai é a mesma imagem (só a reamostragem da ficha
 * inclinada muda o grão em meio pixel). A ficha viva continua sendo a verdade: até a imagem ficar
 * pronta, e sempre que algo muda, a ficha mostra as camadas de sempre.
 *
 * As camadas vizinhas que só se misturam entre si viram uma imagem só (tudo o que fica abaixo do texto,
 * por exemplo); a que se mistura com o que está por baixo dela (o relevo, que faz overlay no texto)
 * vira uma imagem própria e continua se misturando ao vivo. Ficam de fora as faíscas da purpurina, que
 * acendem com o mouse.
 */

/** Uma imagem assada, pronta para pôr na ficha. */
export interface Assada {
  /** O endereço da imagem (`blob:`). */
  readonly url: string;
  /** Quanto a imagem passa da caixa da camada, como o `inset` de CSS (negativo é para fora). */
  readonly inset: string;
  /** A mistura e a opacidade das camadas foram assadas junto: a imagem entra por cima, sem misturar. */
  readonly fundida: boolean;
  /** A chave no cache (ver `soltar`). */
  readonly chave: string;
}

/** Um grupo de camadas irmãs assadas juntas, na ordem em que o navegador as pinta. */
export interface Grupo {
  readonly camadas: readonly HTMLElement[];
  /** As misturas e opacidades vão na imagem (as camadas de baixo de tudo, que só se misturam entre si). */
  readonly fundida: boolean;
}

// ===================== Os grupos =====================

/** O que o forno precisa saber de cada camada para juntar (lido do estilo calculado). */
export interface CamadaInfo {
  readonly z: number;
  readonly mistura: string;
  readonly opacidade: number;
  /** Fica viva (as faíscas da purpurina). */
  readonly viva: boolean;
}

/**
 * Junta as camadas (já na ordem de pintura) em grupos que dão a mesma imagem assados juntos:
 *
 * - de baixo para cima, a partir da primeira: tudo o que fica abaixo do texto (z negativo), com as
 *   misturas entre elas, até a primeira camada viva. Elas se misturam com o vazio e entre si, então a
 *   mistura vai junto na imagem;
 * - depois disso, cada camada que mistura (ou tem opacidade) fica sozinha, com a mistura viva: ela se
 *   mistura com o que está por baixo dela, que não está na imagem (o texto, as faíscas);
 * - as que não misturam, vizinhas e na mesma altura (z), viram uma imagem só.
 *
 * Devolve os índices de cada grupo e se a mistura foi assada junto.
 */
export function agrupar(camadas: readonly CamadaInfo[]): { indices: number[]; fundida: boolean }[] {
  const out: { indices: number[]; fundida: boolean }[] = [];
  let i = 0;
  const base: number[] = [];
  while (i < camadas.length && !camadas[i].viva && camadas[i].z < 0) base.push(i++);
  if (base.length) out.push({ indices: base, fundida: true });
  let corrente: number[] = [];
  let z = NaN;
  const fecha = () => {
    if (corrente.length) out.push({ indices: corrente, fundida: false });
    corrente = [];
  };
  for (; i < camadas.length; i++) {
    const c = camadas[i];
    if (c.viva) {
      fecha();
      continue;
    }
    const mistura = c.mistura !== 'normal' || c.opacidade < 1;
    if (mistura) {
      fecha();
      out.push({ indices: [i], fundida: false });
      continue;
    }
    if (corrente.length && c.z !== z) fecha();
    z = c.z;
    corrente.push(i);
  }
  fecha();
  return out;
}

/** As camadas de uma ficha, na ordem em que o navegador as pinta, já agrupadas. */
export function grupos(camadas: readonly HTMLElement[]): Grupo[] {
  const lidas = camadas.map((el, ordem) => {
    const cs = getComputedStyle(el);
    const z = Number.parseInt(cs.zIndex, 10);
    return {
      el,
      ordem,
      info: { z: Number.isFinite(z) ? z : 0, mistura: cs.mixBlendMode, opacidade: Number(cs.opacity), viva: el.hasAttribute('data-forno-viva') },
    };
  });
  // a ordem de pintura: pelo z, e no mesmo z pela ordem no documento
  lidas.sort((a, b) => a.info.z - b.info.z || a.ordem - b.ordem);
  return agrupar(lidas.map((l) => l.info)).map((g) => ({ camadas: g.indices.map((k) => lidas[k].el), fundida: g.fundida }));
}

// ===================== A receita: o SVG que o navegador desenha =====================

/** Uma receita pronta: o SVG e a caixa dele em volta da camada (em px de layout). */
export interface Receita {
  readonly svg: string;
  readonly esquerda: number;
  readonly topo: number;
  readonly largura: number;
  readonly altura: number;
  /** A largura e a altura da camada (da ficha). */
  readonly W: number;
  readonly H: number;
}

/** O que o forno copia do estilo calculado de cada camada (o que as regras de fora dão a ela). */
const COPIA = [
  'background-color',
  'background-image',
  'background-size',
  'background-position',
  'background-repeat',
  'background-blend-mode',
  'background-origin',
  'background-clip',
  'mask-image',
  'mask-size',
  'mask-position',
  'mask-repeat',
  'mask-mode',
  'mask-clip',
  'mask-origin',
  'mask-composite',
  'border-top-left-radius',
  'border-top-right-radius',
  'border-bottom-left-radius',
  'border-bottom-right-radius',
  'overflow',
  'color',
  'isolation',
];
/** O que vai junto quando a mistura é assada na imagem. */
const COPIA_MISTURA = ['z-index', 'mix-blend-mode', 'opacity'];

/** A folga em volta do desenho que passa da beirada: a espessura do traço e o filtro do lápis. */
const FOLGA = 16;

// url("..."), url('...') ou url(...): as aspas contam (dentro de um data: há outros url( que não são endereços)
const URL_RE = /url\(\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|([^'")\s]*))\s*\)/g;

const embutidas = new Map<string, Promise<string>>();

/** O arquivo como `data:` (no SVG que vira imagem, nada de fora carrega). */
function embutir(url: string): Promise<string> {
  let p = embutidas.get(url);
  if (!p) {
    p = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`forno: ${r.status} em ${url}`);
        return r.blob();
      })
      .then(
        (b) =>
          new Promise<string>((res, rej) => {
            const fr = new FileReader();
            fr.onload = () => res(fr.result as string);
            fr.onerror = () => rej(fr.error);
            fr.readAsDataURL(b);
          }),
      );
    // o que falhou pode dar certo depois (a rede voltou)
    p.catch(() => embutidas.delete(url));
    embutidas.set(url, p);
  }
  return p;
}

/** Troca os `url(...)` que apontam para arquivos pelo arquivo embutido. */
export async function embutirUrls(valor: string): Promise<string> {
  const achados = [...valor.matchAll(URL_RE)].map((m) => m[1] ?? m[2] ?? m[3]).filter((u) => u && !u.startsWith('data:') && !u.startsWith('#'));
  if (!achados.length) return valor;
  const trocas = new Map(await Promise.all(achados.map(async (u) => [u, await embutir(new URL(u, document.baseURI).href)] as const)));
  return valor.replace(URL_RE, (tudo, a?: string, b?: string, c?: string) => {
    const u = a ?? b ?? c ?? '';
    const t = trocas.get(u);
    return t ? `url("${t}")` : tudo;
  });
}

const regrasPorAtributo = new Map<string, Promise<string>>();

/** As regras da página que pegam nas camadas: as do componente do papel e as globais que falam dele. */
function regras(atributos: readonly string[]): Promise<string> {
  // (as páginas que carregam depois trazem folhas novas: com outra folha, a lista é lida de novo)
  const chave = `${atributos.join(' ')}|${document.styleSheets.length}`;
  let p = regrasPorAtributo.get(chave);
  if (!p) {
    const out: string[] = [];
    const andar = (lista: CSSRuleList) => {
      for (const r of Array.from(lista)) {
        if (r instanceof CSSStyleRule) {
          if (r.selectorText.includes('app-paper-art') || atributos.some((a) => a && r.selectorText.includes(a))) out.push(r.cssText);
        } else if ('cssRules' in r && !(r instanceof CSSFontFaceRule)) andar((r as CSSGroupingRule).cssRules);
      }
    };
    for (const s of Array.from(document.styleSheets)) {
      try {
        andar(s.cssRules);
      } catch {
        /* folha de outro endereço: não tem regra do papel */
      }
    }
    p = embutirUrls(out.join('\n'));
    regrasPorAtributo.set(chave, p);
  }
  return p;
}

const fontesPorFamilia = new Map<string, Promise<string>>();

/** As @font-face de uma família, com os arquivos embutidos (os rabiscos com letra: a régua, o "S2"). */
function fonte(familia: string): Promise<string> {
  let p = fontesPorFamilia.get(familia);
  if (!p) {
    const achadas: CSSFontFaceRule[] = [];
    const andar = (lista: CSSRuleList) => {
      for (const r of Array.from(lista)) {
        if (r instanceof CSSFontFaceRule) {
          if (r.style.getPropertyValue('font-family').replace(/['"]/g, '').trim() === familia) achadas.push(r);
        } else if ('cssRules' in r) andar((r as CSSGroupingRule).cssRules);
      }
    };
    for (const s of Array.from(document.styleSheets)) {
      try {
        andar(s.cssRules);
      } catch {
        /* idem */
      }
    }
    p = Promise.all(achadas.map((r) => embutirUrls(r.cssText))).then((l) => l.join('\n'));
    fontesPorFamilia.set(familia, p);
  }
  return p;
}

/** O atributo do Angular que marca o elemento como de um componente (`_ngcontent-…`, `_nghost-…`). */
function atributoNg(el: Element, prefixo: '_ngcontent' | '_nghost'): string {
  return Array.from(el.attributes).find((a) => a.name.startsWith(prefixo))?.name ?? '';
}

/**
 * A receita de um grupo de camadas de uma ficha de W×H: cada camada copiada com o estilo calculado
 * (as regras de fora: o papel, a cor, a máscara) e as regras do componente, dentro do mesmo tipo de
 * elemento e das mesmas classes da página (`.lapis-liso`, a textura fotográfica), mais os filtros
 * do lápis e as fontes dos rabiscos com letra.
 */
export async function receita(grupo: Grupo, W: number, H: number): Promise<Receita> {
  const [primeira] = grupo.camadas;
  const host = primeira.parentElement!;
  // o que passa da beirada (as camadas com overflow visível, como as decorações)
  let l = 0,
    t = 0,
    r = W,
    b = H;
  for (const el of grupo.camadas) {
    if (getComputedStyle(el).overflow !== 'visible') continue;
    for (const svg of Array.from(el.querySelectorAll<SVGGraphicsElement>(':scope > svg'))) {
      const bb = svg.getBBox();
      if (!bb.width && !bb.height) continue;
      l = Math.min(l, bb.x - FOLGA);
      t = Math.min(t, bb.y - FOLGA);
      r = Math.max(r, bb.x + bb.width + FOLGA);
      b = Math.max(b, bb.y + bb.height + FOLGA);
    }
  }
  l = Math.floor(l);
  t = Math.floor(t);
  r = Math.ceil(r);
  b = Math.ceil(b);
  const largura = r - l,
    altura = b - t;

  const conteudo = atributoNg(primeira, '_ngcontent');
  const hospede = atributoNg(host, '_nghost');
  const css = await regras([conteudo, hospede]);
  const falso = document.createElement('app-paper-art');
  if (hospede) falso.setAttribute(hospede, '');
  const familias = new Set<string>();
  for (const el of grupo.camadas) {
    const cs = getComputedStyle(el);
    const copia = el.cloneNode(true) as HTMLElement;
    // tudo lido de uma vez (o estilo calculado é ao vivo: depois de um await ele já poderia ser outro)
    const lidas: [string, string][] = COPIA.map((p) => [p, cs.getPropertyValue(p)]);
    // as variáveis que o desenho e as regras usam (o lápis claro da cartolina escura, a cor)
    for (const m of new Set([...`${el.innerHTML}\n${css}`.matchAll(/var\((--[\w-]+)/g)].map((x) => x[1]))) {
      const v = cs.getPropertyValue(m);
      if (v) lidas.push([m, v]);
    }
    const mistura = grupo.fundida ? COPIA_MISTURA.map((p) => `${p}:${cs.getPropertyValue(p)};`).join('') : 'mix-blend-mode:normal;opacity:1;';
    const valores = await Promise.all(lidas.map(([, v]) => embutirUrls(v)));
    const style =
      `position:absolute;inset:auto;left:${-l}px;top:${-t}px;width:${W}px;height:${H}px;margin:0;` +
      lidas.map(([p], i) => `${p}:${valores[i]};`).join('') +
      mistura;
    copia.setAttribute('style', style);
    copia.classList.remove('assada', 'assada-junto');
    copia.removeAttribute('data-fantasma');
    falso.append(copia);
    for (const tx of Array.from(el.querySelectorAll('text'))) for (const f of getComputedStyle(tx).fontFamily.split(',')) familias.add(f.replace(/['"]/g, '').trim());
  }
  const fontes = (await Promise.all([...familias].map(fonte))).join('\n');
  // as mesmas classes da página e do corpo em volta (as regras como `.lapis-liso app-paper-art …` pegam)
  const pagina = document.createElement('div');
  pagina.setAttribute('class', document.documentElement.className);
  const corpo = document.createElement('div');
  corpo.setAttribute('class', document.body.className);
  corpo.append(falso);
  pagina.append(corpo);
  const ser = new XMLSerializer();
  const defs = document.querySelector('app-paper-defs svg');
  // `<` dentro do <style> quebraria o XML: o escape de CSS diz a mesma coisa
  const estilo = `${fontes}\n${css}`.replace(/</g, '\\3c ');
  const html =
    `<div xmlns="http://www.w3.org/1999/xhtml" style="position:relative;width:${largura}px;height:${altura}px;margin:0;padding:0;isolation:isolate">` +
    `<style>${estilo}</style>${defs ? ser.serializeToString(defs) : ''}${ser.serializeToString(pagina)}</div>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${largura}" height="${altura}" viewBox="0 0 ${largura} ${altura}"><foreignObject x="0" y="0" width="${largura}" height="${altura}">${html}</foreignObject></svg>`;
  return { svg, esquerda: l, topo: t, largura, altura, W, H };
}

// ===================== Assar =====================

/**
 * Desenha a receita num canvas, em `escala` pixels por px (o devicePixelRatio), e devolve o PNG.
 * O desenho do SVG acontece aqui, de uma vez (é o pedaço caro: os filtros, a turbulência).
 */
export async function assar(r: Receita, escala: number): Promise<Blob> {
  // Por data:, e não por blob: (que pouparia codificar o texto): com o <foreignObject>, o Chrome suja o
  // canvas de um SVG vindo de blob: e não deixa ler a imagem (o forno.spec confere)
  const img = new Image();
  img.decoding = 'sync';
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(r.svg)}`;
  await img.decode();
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(r.largura * escala));
  cv.height = Math.max(1, Math.round(r.altura * escala));
  const ctx = cv.getContext('2d');
  if (!ctx) throw new Error('forno: sem canvas');
  ctx.drawImage(img, 0, 0, cv.width, cv.height);
  // num navegador que suja o canvas com o <foreignObject> (o Safari), isto falha: o forno desliga
  const blob = await new Promise<Blob | null>((res) => cv.toBlob(res, 'image/png'));
  if (!blob) throw new Error('forno: o canvas não deu imagem');
  return blob;
}

// ===================== O cache =====================

interface Entrada {
  readonly pronta: Promise<{ url: string; bytes: number }>;
  url: string | null;
  bytes: number;
  usos: number;
  usada: number;
}

const cache = new Map<string, Entrada>();
/** Quanto o forno guarda de imagens que nenhuma ficha está usando (as que voltam com a rolagem). */
export const SOBRA_BYTES = 24 * 1024 * 1024;
/** O tempo em que a imagem recém-solta não sai do cache (mais que o fade do papel velho). */
const RECENTE = 2000;

async function resumo(texto: string): Promise<string> {
  const sutil = globalThis.crypto?.subtle;
  if (sutil) {
    const h = new Uint8Array(await sutil.digest('SHA-1', new TextEncoder().encode(texto)));
    return Array.from(h, (x) => x.toString(16).padStart(2, '0')).join('');
  }
  // sem crypto.subtle (página sem https): FNV-1a de 32 bits, mais o tamanho
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) h = Math.imul(h ^ texto.charCodeAt(i), 0x01000193);
  return `${(h >>> 0).toString(16)}-${texto.length}`;
}

/**
 * A imagem da receita, do cache ou assada agora. Quem pega segura a imagem até `soltar`: a mesma
 * receita (a mesma ficha montada de novo, a cópia arrastada) usa a mesma imagem.
 */
export async function pegar(r: Receita, escala: number, fundida: boolean): Promise<Assada> {
  const chave = `${escala}|${await resumo(r.svg)}`;
  let e = cache.get(chave);
  if (!e) {
    const pronta = assar(r, escala).then((blob) => ({ url: URL.createObjectURL(blob), bytes: blob.size }));
    const nova: Entrada = { pronta, url: null, bytes: 0, usos: 0, usada: performance.now() };
    pronta.then(
      (v) => {
        nova.url = v.url;
        nova.bytes = v.bytes;
      },
      () => cache.delete(chave),
    );
    cache.set(chave, nova);
    e = nova;
  }
  e.usos++;
  e.usada = performance.now();
  try {
    const { url } = await e.pronta;
    return { url, inset: `${r.topo}px ${r.W - r.esquerda - r.largura}px ${r.H - r.topo - r.altura}px ${r.esquerda}px`, fundida, chave };
  } catch (err) {
    e.usos--;
    throw err;
  }
}

/**
 * A imagem de uma chave que a ficha já assou, se ainda estiver no cache (a ficha que dormiu e acordou
 * pega de volta sem refazer a receita). Quem pega segura, como em `pegar`.
 */
export function retomar(a: Assada): Assada | null {
  const e = cache.get(a.chave);
  if (!e?.url || e.url !== a.url) return null;
  e.usos++;
  e.usada = performance.now();
  return a;
}

/** A ficha largou a imagem: fica no cache, até o teto das que ninguém usa. */
export function soltar(a: Assada): void {
  const e = cache.get(a.chave);
  if (!e) return;
  e.usos = Math.max(0, e.usos - 1);
  e.usada = performance.now();
  aparar();
}

/** Tira as imagens que ninguém usa, das mais antigas, até caber no teto. */
function aparar(): void {
  // (a que acabou de ser solta fica um instante: a cópia do papel velho ainda some com ela, ver ghost)
  const agora = performance.now();
  const livres = [...cache.entries()].filter(([, e]) => !e.usos && e.url && agora - e.usada > RECENTE).sort((a, b) => a[1].usada - b[1].usada);
  let total = livres.reduce((s, [, e]) => s + e.bytes, 0);
  for (const [chave, e] of livres) {
    if (total <= SOBRA_BYTES) break;
    URL.revokeObjectURL(e.url!);
    cache.delete(chave);
    total -= e.bytes;
  }
}

/** Para os testes: quantas imagens o forno guarda e quantas estão em uso. */
export function fornoCache(): { imagens: number; emUso: number; bytes: number } {
  const l = [...cache.values()];
  return { imagens: l.length, emUso: l.filter((e) => e.usos).length, bytes: l.reduce((s, e) => s + e.bytes, 0) };
}

// ===================== A época: o que muda o papel por fora =====================

/**
 * Muda quando algo de fora das fichas muda o desenho delas: as classes e o estilo da página (o lápis
 * liso, a textura fotográfica que chegou, o tema) e a densidade da tela (o zoom do navegador, outro
 * monitor). As fichas soltam as imagens e assam de novo.
 */
export const fornoEpoca = signal(0);

/** O forno falhou neste navegador (o canvas sujo do Safari): as fichas ficam vivas, como antes. */
let desligado = false;
export function fornoLigado(): boolean {
  return !desligado && typeof document !== 'undefined' && typeof XMLSerializer !== 'undefined';
}
export function desligarForno(): void {
  desligado = true;
}

/** As variáveis que os desenhos usam no próprio SVG (a letra dos rabiscos com texto), fora das regras. */
const VARIAVEIS_DOS_DESENHOS = ['--f-label', '--f-hand'];

let doPapel: { folhas: number; variaveis: string[]; classes: Set<string> } | null = null;

/**
 * O que, na página, chega ao papel: as variáveis que as regras do papel usam (a fibra, a textura
 * fotográfica, o lápis) e as classes que aparecem nos seletores delas (o lápis liso). Lido das folhas
 * de estilo, de novo quando chega uma folha nova.
 */
function lidoPeloPapel(): { variaveis: string[]; classes: Set<string> } {
  const folhas = document.styleSheets.length;
  if (doPapel?.folhas === folhas) return doPapel;
  const variaveis = new Set(VARIAVEIS_DOS_DESENHOS);
  const classes = new Set<string>();
  const andar = (lista: CSSRuleList) => {
    for (const r of Array.from(lista)) {
      if (r instanceof CSSStyleRule) {
        const sel = r.selectorText;
        if (!/app-paper-art|\.papel\b|\.cartolina\b|\.camada\b/.test(sel)) continue;
        for (const m of r.cssText.matchAll(/var\((--[\w-]+)/g)) variaveis.add(m[1]);
        for (const m of sel.matchAll(/\.([\w-]+)/g)) classes.add(m[1]);
      } else if ('cssRules' in r && !(r instanceof CSSFontFaceRule)) andar((r as CSSGroupingRule).cssRules);
    }
  };
  for (const s of Array.from(document.styleSheets)) {
    try {
      andar(s.cssRules);
    } catch {
      /* folha de outro endereço */
    }
  }
  doPapel = { folhas, variaveis: [...variaveis].sort(), classes };
  return doPapel;
}

/** A página do jeito que o papel a enxerga: muda só quando o desenho das fichas mudaria. */
export function assinaturaDaPagina(): string {
  const { variaveis, classes } = lidoPeloPapel();
  const cs = getComputedStyle(document.body);
  const nossas = (el: Element) => Array.from(el.classList).filter((c) => classes.has(c)).sort().join(' ');
  return [nossas(document.documentElement), nossas(document.body), ...variaveis.map((v) => `${v}:${cs.getPropertyValue(v)}`)].join('|');
}

let vigiando = false;
function vigiar(): void {
  if (vigiando || typeof document === 'undefined') return;
  vigiando = true;
  const mudou = () => fornoEpoca.update((n) => n + 1);
  // A página muda de classe e de estilo o tempo todo (o arrasto, a bandeja da seleção, a parede, o
  // teclado do celular): só o que chega ao papel faz as fichas assarem de novo.
  let antes = assinaturaDaPagina();
  let marcada = false;
  const conferir = () => {
    marcada = false;
    const agora = assinaturaDaPagina();
    if (agora === antes) return;
    antes = agora;
    mudou();
  };
  if (typeof MutationObserver !== 'undefined') {
    const mo = new MutationObserver(() => {
      if (marcada) return;
      marcada = true;
      requestAnimationFrame(conferir);
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] });
    if (document.body) mo.observe(document.body, { attributes: true, attributeFilter: ['class', 'style'] });
  }
  const densidade = () => {
    if (typeof matchMedia !== 'function') return;
    const mq = matchMedia(`(resolution: ${devicePixelRatio}dppx)`);
    mq.addEventListener('change', function troca() {
      mq.removeEventListener('change', troca);
      mudou();
      densidade();
    });
  };
  densidade();
  addEventListener('scroll', () => (rolouEm = performance.now()), { passive: true, capture: true });
}

// ===================== A fila =====================

/** Uma ficha esperando o forno. */
export interface Fornada {
  /** Dá para assar agora (a ficha está na página, acordada, à vista, sem o papel velho sumindo). */
  pronta(): boolean;
  /** A distância da ficha até a tela, em px (0 na tela): as de perto primeiro. */
  distancia(): number;
  /** Assa (e põe as imagens na ficha). */
  assar(): Promise<void>;
}

const fila = new Set<Fornada>();
let marcado = false;
let trabalhando = false;
let rolouEm = -Infinity;
let ultimoErro: unknown = null;
/** As vezes que cada ficha falhou no forno (ela fica viva entre uma e outra). */
const tentativas = new WeakMap<Fornada, number>();
const TENTATIVAS = 3;
const DE_NOVO = 10_000;
/** A última falha do forno (a ficha que falhou fica viva): para os testes e para quem depura. */
export function fornoErro(): unknown {
  return ultimoErro;
}
/** A rolagem precisa de um respiro antes de o forno voltar: assar é um pedaço de trabalho de uma vez só. */
const DEPOIS_DA_ROLAGEM = 400;

export function enfornar(f: Fornada): void {
  if (!fornoLigado()) return;
  vigiar();
  fila.add(f);
  agendar();
}

export function desenfornar(f: Fornada): void {
  fila.delete(f);
}

function agendar(): void {
  if (marcado || trabalhando || !fila.size) return;
  marcado = true;
  whenIdle(rodar, 3000, { after: 120, deadline: { timeRemaining: () => 10 } });
}

async function rodar(prazo: IdleDeadlineLike): Promise<void> {
  marcado = false;
  if (!fila.size || trabalhando) return;
  const desde = performance.now() - rolouEm;
  // rolando, ou o navegador sem folga: depois (com o prazo vencido, vai assim mesmo, uma ficha)
  if (desde < DEPOIS_DA_ROLAGEM || (!prazo.didTimeout && prazo.timeRemaining() < 8)) {
    setTimeout(agendar, desde < DEPOIS_DA_ROLAGEM ? DEPOIS_DA_ROLAGEM - desde : 50);
    return;
  }
  let melhor: Fornada | null = null;
  let perto = Infinity;
  for (const f of fila) {
    if (!f.pronta()) continue;
    const d = f.distancia();
    if (d < perto) {
      perto = d;
      melhor = f;
    }
  }
  if (!melhor) return;
  fila.delete(melhor);
  trabalhando = true;
  try {
    await melhor.assar();
  } catch (err) {
    ultimoErro = err;
    // o canvas sujo (o Safari não deixa ler o <foreignObject>): o forno não funciona neste navegador, e
    // tudo fica vivo, como antes. Outra falha (uma textura que não veio, sem rede) deixa só esta ficha viva.
    if (err instanceof DOMException && err.name === 'SecurityError') {
      desligado = true;
      fila.clear();
    } else {
      // passageira (sem rede, uma textura que não veio): tenta de novo daqui a pouco, poucas vezes
      const n = (tentativas.get(melhor) ?? 0) + 1;
      tentativas.set(melhor, n);
      const f = melhor;
      if (n <= TENTATIVAS) setTimeout(() => enfornar(f), DE_NOVO * n);
    }
  } finally {
    trabalhando = false;
  }
  agendar();
}

/** Para os testes: a fila vazia e o forno parado, ligado de novo. */
export function resetForno(): void {
  fila.clear();
  marcado = false;
  trabalhando = false;
  desligado = false;
  rolouEm = -Infinity;
  ultimoErro = null;
  for (const e of cache.values()) if (e.url) URL.revokeObjectURL(e.url);
  cache.clear();
}

/** Para os testes: quantas fichas esperam o forno. */
export function filaDoForno(): number {
  return fila.size;
}
