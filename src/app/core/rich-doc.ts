/**
 * O tradutor do modo Visual (ver PLANO-EDITOR-VISUAL.md): o texto das anotações em linhas tipadas, e
 * de volta. Sem nada do ProseMirror dentro: o editor do Visual (ui/visual-editor/) converte estas
 * linhas em nós, e este arquivo se testa sozinho, como o core/rich-text.ts.
 *
 * O texto continua sendo a verdade (a string de sempre, as marcas de core/rich-text.ts). Quatro promessas:
 * - I1, abrir e sair sem mexer não muda um byte: cada linha guarda a `fonte` de onde veio e, sem mudança,
 *   sai ela, byte a byte (o "__negrito__", o "* item", o "1. 1. 1.", o "\r\n" de quem escreveu);
 * - I2, mexer numa linha muda só ela: as outras saem pela fonte;
 * - I3, o que está na tela é o que a leitura vai mostrar: a linha mexida é escrita de novo e lida de
 *   volta pelo próprio leitor (a trava); o que não volta igual ganha as barras que faltam ou, se nada
 *   servir, a escrita diz que não é exata e devolve o que o leitor leu;
 * - I4, nada some em silêncio: a linha que não dá para escrever de volta igual vira um trecho `cru`,
 *   guardado como está.
 *
 * Nenhuma regra do leitor é copiada aqui: o papel de cada linha (texto, título, item, corpo de item,
 * tabela…) vem do `parseRich` de verdade; das linhas cruas sai só o que ele não guarda (o recuo, o
 * número escrito, a cerca do código, as células de sobra da tabela).
 */

import { Block, Span, bodyOf, blockLine, closes, fenceOf, indentOf, lineKind, parseInline, parseRich, SYMBOLS, tableCells } from './rich-text';
import { Align, TableLook } from './tables';
import { WidgetSize, widgetLine } from './widgets';

/** De onde a linha veio: o trecho do texto (as quebras de dentro como eram), a quebra depois dele e a chave do que foi lido. */
export interface Fonte {
  texto: string;
  /** A quebra que vinha depois ("\n", "\r\n", "\r"); "" na última linha do texto. */
  fim: string;
  /** A chave (ver `chave`) da linha como foi lida: igual à de agora, a linha sai pela fonte. */
  chave: string;
}

interface Base {
  /** O recuo em colunas, contado como o leitor conta (o tab vai até a próxima parada de 4). */
  recuo: number;
  fonte?: Fonte;
}

/** Uma linha do texto (ou um bloco inteiro, no código e na tabela), com o tipo dela. */
export type LinhaDoc =
  | (Base & { kind: 'linha'; spans: Span[] })
  | (Base & { kind: 'titulo'; nivel: 1 | 2 | 3; spans: Span[] })
  /** `numero`: o escrito no item numerado ("1.2" em "1.2. item"); "" nos outros. */
  | (Base & { kind: 'item'; tipo: 'ul' | 'ol' | 'check'; feita: boolean; numero: string; spans: Span[] })
  | (Base & { kind: 'citacao'; spans: Span[] })
  | (Base & { kind: 'sutil'; spans: Span[] })
  | (Base & { kind: 'divisoria' })
  /** `margem`: o recuo do corpo de item onde o código mora (as linhas dele o têm na frente); `aberto`: sem a cerca que fecha. */
  | (Base & { kind: 'codigo'; cerca: string; texto: string; margem: number; aberto: boolean })
  /** `sobra`: as células escritas além das do cabeçalho em cada fileira (a leitura esconde, a escrita devolve). */
  | (Base & { kind: 'tabela'; jeito: TableLook | null; alinhar: Align[]; cabeca: Span[][]; fileiras: Span[][][]; sobra: string[][] })
  | (Base & { kind: 'widget'; nome: string; args: string[]; tamanho: WidgetSize })
  /** O trecho que o Visual não sabe escrever de volta igual: as linhas como estavam. */
  | (Base & { kind: 'cru'; linhas: string[] });

/** O texto em linhas tipadas; `quebra`, a quebra de linha que o texto mais usa (a das linhas novas). */
export interface Doc {
  linhas: LinhaDoc[];
  quebra: string;
}

/** O que a escrita devolve. */
export interface Escrita {
  texto: string;
  /** O texto, lido de volta, é exatamente o documento (normalizado, ver `normalizarLinha`). */
  exato: boolean;
  /** O documento como o leitor lê o texto escrito, com as fontes novas: a base da próxima escrita. */
  doc: Doc;
  /** Onde cada linha de `doc` começa no texto. */
  inicios: number[];
}

// ===== As marcas na linha =====

const FLAGS = ['bold', 'italic', 'strike', 'mark', 'spoiler', 'subtle'] as const;
type Flag = (typeof FLAGS)[number];

function mascara(s: Span): number {
  let m = 0;
  FLAGS.forEach((f, i) => {
    if (s[f]) m |= 1 << i;
  });
  return m;
}

const ehAtomo = (s: Span) => !!(s.code || s.link || s.href);

/** Os pedaços juntados como o leitor junta (os de mesmas marcas, fora o código e os links), sem os vazios. */
export function juntarSpans(spans: readonly Span[]): Span[] {
  const out: Span[] = [];
  for (const s of spans) {
    if (!s.text) continue;
    const last = out.at(-1);
    if (last && !ehAtomo(s) && !ehAtomo(last) && mascara(last) === mascara(s)) out[out.length - 1] = { ...last, text: last.text + s.text };
    else out.push({ ...s });
  }
  return out;
}

function chaveSpans(spans: readonly Span[]): unknown[] {
  return juntarSpans(spans).map((s) => [s.text, mascara(s), s.code ? 1 : 0, s.link ? 1 : 0, s.ref ?? '', s.href ?? '']);
}

/** A chave de uma linha: o tipo, os atributos e as letras com as marcas, sem a fonte. Duas linhas iguais têm a mesma. */
export function chave(l: LinhaDoc): string {
  switch (l.kind) {
    case 'linha':
    case 'citacao':
    case 'sutil':
      return JSON.stringify([l.kind, l.recuo, chaveSpans(l.spans)]);
    case 'titulo':
      return JSON.stringify([l.kind, l.recuo, l.nivel, chaveSpans(l.spans)]);
    case 'item':
      return JSON.stringify([l.kind, l.recuo, l.tipo, l.tipo === 'check' && l.feita, l.tipo === 'ol' ? l.numero : '', chaveSpans(l.spans)]);
    case 'divisoria':
      return JSON.stringify([l.kind, l.recuo]);
    case 'codigo':
      return JSON.stringify([l.kind, l.recuo, l.texto, l.margem]);
    case 'tabela':
      return JSON.stringify([l.kind, l.recuo, l.jeito, l.alinhar, l.cabeca.map(chaveSpans), l.fileiras.map((f) => f.map(chaveSpans)), l.sobra]);
    case 'widget':
      return JSON.stringify([l.kind, l.recuo, l.nome, l.args, l.tamanho]);
    case 'cru':
      return JSON.stringify([l.kind, l.linhas]);
  }
}

// ===== Ler: do texto para as linhas =====

/** As linhas do texto e a quebra depois de cada uma (como `linesOf` parte: \r\n, \r ou \n). */
function partir(texto: string): { linhas: string[]; quebras: string[] } {
  const linhas: string[] = [];
  const quebras: string[] = [];
  const re = /\r\n|\r|\n/g;
  let at = 0;
  for (let m = re.exec(texto); m; m = re.exec(texto)) {
    linhas.push(texto.slice(at, m.index));
    quebras.push(m[0]);
    at = m.index + m[0].length;
  }
  linhas.push(texto.slice(at));
  quebras.push('');
  return { linhas, quebras };
}

/** Os pedaços sem o espaço do começo (o recuo da linha de texto mora à parte). */
function semRecuo(spans: readonly Span[]): Span[] {
  const out = juntarSpans(spans);
  while (out.length && !ehAtomo(out[0])) {
    const t = out[0].text.replace(/^[ \t]+/, '');
    if (t) {
      out[0] = { ...out[0], text: t };
      break;
    }
    out.shift();
  }
  return out;
}

type Pedaco = { de: number; ate: number; linha: LinhaDoc };

/**
 * Os blocos do leitor em linhas tipadas. `fim`: a última linha do nível (o texto inteiro, ou o corpo do
 * item); `margem`: o recuo do corpo onde os blocos moram (o código o tem na frente de cada linha).
 */
function percorrer(blocks: readonly Block[], cruas: readonly string[], fim: number, margem: number, out: Pedaco[]): void {
  for (const b of blocks) {
    const at = blockLine(b)!;
    const recuo = (i: number) => indentOf(cruas[i]);
    switch (b.kind) {
      case 'p':
        b.lines.forEach((spans, k) => out.push({ de: at + k, ate: at + k, linha: { kind: 'linha', recuo: recuo(at + k), spans: semRecuo(spans) } }));
        break;
      case 'quote':
        b.lines.forEach((spans, k) => out.push({ de: at + k, ate: at + k, linha: { kind: 'citacao', recuo: recuo(at + k), spans: juntarSpans(spans) } }));
        break;
      case 'subtle':
        b.lines.forEach((spans, k) => out.push({ de: at + k, ate: at + k, linha: { kind: 'sutil', recuo: recuo(at + k), spans: juntarSpans(spans) } }));
        break;
      case 'h':
        out.push({ de: at, ate: at, linha: { kind: 'titulo', recuo: recuo(at), nivel: b.level, spans: juntarSpans(b.spans) } });
        break;
      case 'hr':
        out.push({ de: at, ate: at, linha: { kind: 'divisoria', recuo: recuo(at) } });
        break;
      case 'widget':
        out.push({ de: at, ate: at, linha: { kind: 'widget', recuo: recuo(at), nome: b.name, args: [...b.args], tamanho: b.size } });
        break;
      case 'code': {
        const cerca = fenceOf(cruas[at])!;
        let j = at + 1;
        while (j <= fim && !closes(cruas[j], cerca)) j++;
        const aberto = j > fim;
        out.push({ de: at, ate: aberto ? fim : j, linha: { kind: 'codigo', recuo: recuo(at), cerca, texto: b.text, margem, aberto } });
        break;
      }
      case 'table': {
        const topo = at + (b.look ? 1 : 0) + 2;
        const sobra = b.rows.map((_, r) => tableCells(cruas[topo + r]).slice(b.head.length));
        out.push({
          de: at,
          ate: topo + b.rows.length - 1,
          linha: {
            kind: 'tabela',
            recuo: recuo(at),
            jeito: b.look ?? null,
            alinhar: [...b.align],
            cabeca: b.head.map(juntarSpans),
            fileiras: b.rows.map((f) => f.map(juntarSpans)),
            sobra: sobra.every((s) => !s.length) ? [] : sobra,
          },
        });
        break;
      }
      default:
        for (const it of b.items) {
          const k = lineKind(cruas[it.line]);
          out.push({
            de: it.line,
            ate: it.line,
            linha: { kind: 'item', recuo: recuo(it.line), tipo: b.kind, feita: !!it.done, numero: k.kind === 'ol' ? k.pre + k.n : '', spans: juntarSpans(it.spans) },
          });
          // o que vem embaixo do item: o leitor leu à parte, sem o recuo do corpo (o mesmo `bodyOf`)
          const corpo = it.body && bodyOf(cruas, it.line);
          if (it.body && corpo) percorrer(it.body, cruas, corpo.end, corpo.indent, out);
        }
    }
  }
}

/** O texto em linhas, sem procurar os trechos crus (é o que a trava usa para ler de volta). */
function lerLinhas(texto: string): { linhas: LinhaDoc[]; quebra: string } {
  const { linhas: cruas, quebras } = partir(texto);
  const pedacos: Pedaco[] = [];
  percorrer(parseRich(texto), cruas, cruas.length - 1, 0, pedacos);
  pedacos.sort((a, b) => a.de - b.de);
  // cada linha do texto num pedaço só; a que sobrar (não deve) vira um trecho cru, guardada como está
  const out: Pedaco[] = [];
  let proxima = 0;
  for (const p of pedacos) {
    if (p.de < proxima) continue;
    for (; proxima < p.de; proxima++) out.push({ de: proxima, ate: proxima, linha: { kind: 'cru', recuo: 0, linhas: [cruas[proxima]] } });
    out.push(p);
    proxima = p.ate + 1;
  }
  for (; proxima < cruas.length; proxima++) out.push({ de: proxima, ate: proxima, linha: { kind: 'cru', recuo: 0, linhas: [cruas[proxima]] } });
  const linhas = out.map(({ de, ate, linha }) => {
    let fonte = cruas[de];
    for (let i = de + 1; i <= ate; i++) fonte += quebras[i - 1] + cruas[i];
    return { ...linha, fonte: { texto: fonte, fim: quebras[ate], chave: chave(linha) } } as LinhaDoc;
  });
  return { linhas, quebra: quebraMaisUsada(quebras) };
}

function quebraMaisUsada(quebras: readonly string[]): string {
  const conta = new Map<string, number>();
  for (const q of quebras) if (q) conta.set(q, (conta.get(q) ?? 0) + 1);
  let melhor = '\n';
  let n = 0;
  for (const [q, c] of conta) if (c > n) [melhor, n] = [q, c];
  return melhor;
}

/**
 * O texto em linhas tipadas. A linha que a escrita não consegue reproduzir igual (lida sozinha, sem o
 * recuo) vira um trecho `cru`, guardado como está: o Visual a mostra como a leitura e não deixa mexer.
 */
export function textToDoc(texto: string): Doc {
  const { linhas, quebra } = lerLinhas(texto);
  return {
    linhas: linhas.map((l) => (l.kind === 'cru' || expressavel(l) ? l : ({ kind: 'cru', recuo: 0, linhas: partir(l.fonte!.texto).linhas, fonte: l.fonte } as LinhaDoc))),
    quebra,
  };
}

const EXPRESSAVEL = new Map<string, boolean>();

/** A linha tem um jeito de ser escrita que o leitor lê igual (guardado por chave: a mesma linha, a mesma resposta). */
function expressavel(l: LinhaDoc): boolean {
  const k = chave(l);
  let ok = EXPRESSAVEL.get(k);
  if (ok === undefined) {
    ok = escreverLinha(normalizarLinha(l), 'cheio') !== null;
    if (EXPRESSAVEL.size > 5000) EXPRESSAVEL.clear();
    EXPRESSAVEL.set(k, ok);
  }
  return ok;
}

// ===== Normalizar: o que não cabe no texto, a tela também não guarda =====

/**
 * A linha como ela pode ser escrita: os pedaços juntados; a marca que pega o espaço da ponta o solta
 * ("**x **" não fecha no leitor: vira "**x** "), e a que só cobre espaços some; o espaço do começo da
 * linha de texto vai para o recuo; o do começo do item, do título e do sutil sai (o leitor o come); o
 * título perde o do fim. A tela do Visual aplica o mesmo, para mostrar o que vai ficar (I3).
 */
export function normalizarLinha(l: LinhaDoc): LinhaDoc {
  switch (l.kind) {
    case 'linha': {
      const spans = soltarPontas(l.spans);
      let recuo = l.recuo;
      if (spans.length && !ehAtomo(spans[0])) {
        const lead = /^[ \t]*/.exec(spans[0].text)![0];
        for (const ch of lead) recuo += ch === '\t' ? 4 - (recuo % 4) : 1;
        if (lead) spans[0] = { ...spans[0], text: spans[0].text.slice(lead.length) };
      }
      return { ...l, recuo, spans: juntarSpans(spans) };
    }
    // o espaço que cada marca de bloco come, como o leitor (o título e a célula, os das duas pontas)
    case 'titulo':
      return { ...l, spans: aparar(soltarPontas(l.spans), /\s/, true) };
    case 'sutil':
      return { ...l, spans: aparar(soltarPontas(l.spans), /[ \t]/, false) };
    case 'item':
      return { ...l, spans: l.tipo === 'check' ? soltarPontas(l.spans) : aparar(soltarPontas(l.spans), /\s/, false) };
    case 'citacao':
      return { ...l, spans: soltarPontas(l.spans) };
    case 'tabela':
      return { ...l, cabeca: l.cabeca.map((c) => aparar(soltarPontas(c), /\s/, true)), fileiras: l.fileiras.map((f) => f.map((c) => aparar(soltarPontas(c), /\s/, true))) };
    default:
      return l;
  }
}

/** Sem os espaços (`espaco`) do começo e, com `fim`, os do fim, que não são de um código ou link. */
function aparar(spans: Span[], espaco: RegExp, fim: boolean): Span[] {
  const out = juntarSpans(spans);
  const lead = new RegExp(`^(?:${espaco.source})+`);
  const tail = new RegExp(`(?:${espaco.source})+$`);
  while (out.length && !ehAtomo(out[0]) && lead.test(out[0].text)) {
    const t = out[0].text.replace(lead, '');
    if (t) out[0] = { ...out[0], text: t };
    else out.shift();
  }
  while (fim && out.length && !ehAtomo(out.at(-1)!) && tail.test(out.at(-1)!.text)) {
    const t = out.at(-1)!.text.replace(tail, '');
    if (t) out[out.length - 1] = { ...out.at(-1)!, text: t };
    else out.pop();
  }
  return out;
}

/** A marca que começa ou termina num espaço o solta, e a que só cobre espaços some (o leitor pede uma letra nas pontas). */
function soltarPontas(spans: readonly Span[]): Span[] {
  const pecas = pecasDe(juntarSpans(spans));
  FLAGS.forEach((_, bit) => {
    const b = 1 << bit;
    let i = 0;
    while (i < pecas.length) {
      if (!(pecas[i].f & b)) {
        i++;
        continue;
      }
      let j = i;
      while (j < pecas.length && pecas[j].f & b) j++;
      let a = i;
      let z = j - 1;
      while (a <= z && ehEspaco(pecas[a])) pecas[a++].f &= ~b;
      while (z >= a && ehEspaco(pecas[z])) pecas[z--].f &= ~b;
      i = j;
    }
  });
  // dois códigos colados não têm escrita (o leitor lê "``" como uma cerca só): viram um código só
  const out: Span[] = [];
  for (const s of spansDe(pecas)) {
    const last = out.at(-1);
    if (last?.code && s.code && mascara(last) === mascara(s)) out[out.length - 1] = { ...last, text: last.text + s.text };
    else out.push(s);
  }
  return out;
}

// ===== Escrever a linha de volta =====

/** Um pedaço do que se escreve: uma letra, um código, um link de anotação ou um link para fora, com as marcas (`f`). */
type Peca =
  | { t: 'letra'; ch: string; f: number }
  | { t: 'codigo'; texto: string; f: number }
  | { t: 'nota'; texto: string; ref?: string; f: number }
  | { t: 'url'; texto: string; href: string; f: number };

const ehEspaco = (p: Peca) => p.t === 'letra' && /\s/.test(p.ch);

function pecasDe(spans: readonly Span[]): Peca[] {
  const out: Peca[] = [];
  for (const s of spans) {
    const f = mascara(s);
    if (s.code) out.push({ t: 'codigo', texto: s.text, f });
    else if (s.link) out.push({ t: 'nota', texto: s.text, ...(s.ref !== undefined && s.ref !== s.text ? { ref: s.ref } : {}), f });
    else if (s.href !== undefined) out.push({ t: 'url', texto: s.text, href: s.href, f });
    else for (const ch of s.text) out.push({ t: 'letra', ch, f });
  }
  return out;
}

function spansDe(pecas: readonly Peca[]): Span[] {
  const out: Span[] = [];
  for (const p of pecas) {
    const marcas: Partial<Record<Flag, true>> = {};
    FLAGS.forEach((k, i) => {
      if (p.f & (1 << i)) marcas[k] = true;
    });
    if (p.t === 'letra') out.push({ text: p.ch, ...marcas });
    else if (p.t === 'codigo') out.push({ text: p.texto, ...marcas, code: true });
    else if (p.t === 'nota') out.push({ text: p.texto, ...marcas, link: true, ...(p.ref !== undefined ? { ref: p.ref } : {}) });
    else out.push({ text: p.texto, ...marcas, href: p.href });
  }
  return juntarSpans(out);
}

/** O sinal que a barra escapa no leitor (o `\` de `ATOMS`: toda a pontuação do ASCII). */
const ESCAPAVEL = /^[!-/:-@[-`{-~]$/;
const HREF = /^(?:https?:\/\/|mailto:)(?:[^\s()]|\([^\s()]*\))+$/;
const AUTO = /^(?:https?:\/\/|mailto:)[^\s<>]+$/;

/** As marcas que abrem e fecham, num dos jeitos de escrever cada uma (a trava escolhe o que o leitor lê igual). */
interface Jeito {
  bold: string;
  italic: string;
  spoiler: readonly [string, string];
  /**
   * `reordenar`: a cada troca de marcas, a que dura mais fica por fora, mesmo que outra já estivesse
   * aberta (fecha e reabre); sem ele, a aberta fica. Cada um escreve casos que o outro não escreve.
   */
  reordenar: boolean;
}
const ABRE: Record<Flag, (j: Jeito) => readonly [string, string]> = {
  bold: (j) => [j.bold, j.bold],
  italic: (j) => [j.italic, j.italic],
  strike: () => ['~~', '~~'],
  mark: () => ['==', '=='],
  spoiler: (j) => j.spoiler,
  subtle: () => ['((', '))'],
};

function jeitos(celula: boolean): Jeito[] {
  const out: Jeito[] = [];
  const spoilers: (readonly [string, string])[] = celula ? [['>!', '!<']] : [['||', '||'], ['>!', '!<']];
  for (const reordenar of [false, true]) for (const sp of spoilers) for (const bold of ['**', '__']) for (const italic of ['*', '_']) out.push({ bold, italic, spoiler: sp, reordenar });
  return out;
}

/** Quantas barras a escrita deixa: o mínimo, o mínimo mais a do sinal do começo, ou todas. */
type Modo = 'enxuto' | 'primeira' | 'cheio';

/** Um pedaço da linha escrita, com os jeitos de escrevê-lo: do mais seguro (o primeiro) ao mais curto (o último). */
type Ficha = { opcoes: string[] };

/**
 * As fichas da linha num jeito de escrever as marcas, ou null se algum pedaço não tem como ser escrito
 * (um código com "|" numa célula, um link com espaço no endereço). Com `forcar`, esses pedaços saem como
 * letras (a escrita não será exata, e diz).
 */
function fichas(pecas: readonly Peca[], j: Jeito, celula: boolean, forcar: boolean): Ficha[] | null {
  const out: Ficha[] = [];
  const pilha: Flag[] = [];
  const corrida = (i: number, k: Flag) => {
    const b = 1 << FLAGS.indexOf(k);
    let n = 0;
    while (i + n < pecas.length && pecas[i + n].f & b) n++;
    return n;
  };
  const fechar = (ate: number) => {
    while (pilha.length > ate) out.push({ opcoes: [ABRE[pilha.pop()!](j)[1]] });
  };
  const letras = (texto: string) => {
    for (const ch of texto) out.push(letra(ch, celula));
  };
  for (let i = 0; i < pecas.length; i++) {
    const p = pecas[i];
    // a marca que dura mais abre primeiro (fica por fora)
    const ordem = FLAGS.filter((_, b) => p.f & (1 << b)).sort((a, b) => corrida(i, b) - corrida(i, a) || FLAGS.indexOf(a) - FLAGS.indexOf(b));
    let k = 0;
    if (j.reordenar) while (k < pilha.length && pilha[k] === ordem[k]) k++;
    else while (k < pilha.length && ordem.includes(pilha[k])) k++;
    fechar(k);
    const abrir = ordem.filter((f) => !pilha.includes(f));
    for (const f of abrir) {
      out.push({ opcoes: [ABRE[f](j)[0]] });
      pilha.push(f);
    }
    if (p.t === 'letra') {
      if (/[\n\r\u2028\u2029]/.test(p.ch)) {
        if (!forcar) return null;
        out.push({ opcoes: [' '] });
      } else out.push(letra(p.ch, celula));
      continue;
    }
    const opcoes = atomo(p, celula);
    if (opcoes) out.push({ opcoes });
    else if (forcar) letras(p.texto);
    else return null;
  }
  fechar(0);
  return out;
}

function letra(ch: string, celula: boolean): Ficha {
  if (!ESCAPAVEL.test(ch)) return { opcoes: [ch] };
  // na célula, o "|" sem a barra divide a tabela
  return { opcoes: celula && ch === '|' ? ['\\|'] : ['\\' + ch, ch] };
}

/** Os jeitos de escrever um código ou um link (do mais seguro ao mais curto); null se não tem jeito. */
function atomo(p: Exclude<Peca, { t: 'letra' }>, celula: boolean): string[] | null {
  const linha = /[\n\r\u2028\u2029]/;
  if (p.t === 'codigo') {
    if (!p.texto || linha.test(p.texto) || (celula && p.texto.includes('|'))) return null;
    const crases = '`'.repeat(Math.max(0, ...[...p.texto.matchAll(/`+/g)].map((m) => m[0].length)) + 1);
    // o leitor tira um espaço de cada ponta (para escrever "`` `x` ``"), se as duas têm
    const ponta = p.texto.startsWith('`') || p.texto.endsWith('`') || (p.texto.startsWith(' ') && p.texto.endsWith(' ') && !!p.texto.trim());
    const pad = ponta ? ' ' : '';
    return [crases + pad + p.texto + pad + crases];
  }
  if (p.t === 'nota') {
    const ok = (s: string) => !!s.trim() && s === s.trim() && !/[[\]\n\r]/.test(s);
    if (!ok(p.texto) || (p.ref !== undefined && (!ok(p.ref) || p.ref.includes('|')))) return null;
    if (p.ref === undefined && p.texto.includes('|')) return null;
    const dentro = (p.ref !== undefined ? p.ref + '|' : '') + p.texto;
    if (celula && dentro.includes('|')) return null;
    return ['[[' + dentro + ']]'];
  }
  if (celula && (p.texto.includes('|') || p.href.includes('|'))) return null;
  const out: string[] = [];
  if (p.texto && !/[[\]\n\r]/.test(p.texto) && HREF.test(p.href)) out.push(`[${p.texto}](${p.href})`);
  if (p.texto === p.href && AUTO.test(p.href)) out.push(`<${p.href}>`);
  if (p.texto === p.href || (/^www\./i.test(p.texto) && 'https://' + p.texto === p.href)) out.push(p.texto);
  return out.length ? out : null;
}

/**
 * Os pedaços escritos de modo que `confere` aceite: cada jeito das marcas, com todos os sinais escapados;
 * o primeiro que passa é enxugado (cada barra que sobra sai, se o leitor ainda lê igual sem ela). No
 * modo `cheio`, sai com as barras todas (é o que a trava usa para saber se dá para escrever). Null, se
 * nenhum jeito passa.
 */
function escreverPecas(spans: readonly Span[], confere: (s: string) => boolean, celula: boolean, modo: Modo): string | null {
  const pecas = pecasDe(spans);
  const usa = pecas.reduce((m, p) => m | p.f, 0);
  const vistos = new Set<string>();
  for (const j of jeitos(celula)) {
    // os jeitos que só mudam marcas que a linha não usa dão a mesma escrita
    const id = [usa & 1 ? j.bold : '', usa & 2 ? j.italic : '', usa & 16 ? j.spoiler[0] : '', usa & (usa - 1) ? j.reordenar : ''].join();
    if (vistos.has(id)) continue;
    vistos.add(id);
    const fs = fichas(pecas, j, celula, false);
    if (!fs) return null;
    const escolha = fs.map(() => 0);
    const monta = () => fs.map((f, i) => f.opcoes[escolha[i]]).join('');
    if (!confere(monta())) continue;
    if (modo !== 'cheio')
      // no modo 'primeira', o sinal do começo fica com a barra (a linha de traços embaixo de uma com "|")
      for (let i = modo === 'primeira' && fs[0]?.opcoes.length > 1 ? 1 : 0; i < fs.length; i++)
        for (let o = fs[i].opcoes.length - 1; o > 0; o--) {
          const antes = escolha[i];
          escolha[i] = o;
          if (confere(monta())) break;
          escolha[i] = antes;
        }
    return monta();
  }
  return null;
}

/** A melhor tentativa, quando nada passa: o primeiro jeito, com tudo escapado e o que não cabe como letras. */
function escreverForcado(spans: readonly Span[], celula: boolean): string {
  return fichas(pecasDe(spans), jeitos(celula)[0], celula, true)!
    .map((f) => f.opcoes[0])
    .join('');
}

/** Lida sozinha, a linha escrita dá exatamente `alvo`. */
function lidaComo(texto: string, alvo: LinhaDoc): boolean {
  const lidas = lerLinhas(texto).linhas;
  return lidas.length === 1 && chave(lidas[0]) === chave(alvo);
}

/** A célula escrita, lida pelo leitor, dá os pedaços dela (e não tem "|" que divida a tabela nem espaço nas pontas). */
function celulaComo(texto: string, spans: readonly Span[]): boolean {
  return texto === texto.trim() && tableCells(`| ${texto} |`).length === 1 && JSON.stringify(chaveSpans(parseInline(texto))) === JSON.stringify(chaveSpans(spans));
}

const SEPARADOR: Record<Exclude<Align, null> | 'nenhum', string> = { left: ':---', center: ':---:', right: '---:', nenhum: '---' };

/**
 * A linha (já normalizada) escrita do jeito de sempre: as marcas de bloco e as da linha, com a trava
 * conferindo cada uma pelo leitor. Null se não tem jeito (com `forcar`, a melhor tentativa).
 */
function escreverLinha(l: LinhaDoc, modo: Modo, forcar = false): string[] | null {
  const recuo = ' '.repeat(l.recuo);
  // o que só vale no corpo de um item (o título recuado) é conferido sem o recuo
  const semRecuo = { ...l, recuo: 0 } as LinhaDoc;
  const inline = (spans: readonly Span[], confere: (s: string) => boolean) => {
    const s = escreverPecas(spans, confere, false, modo);
    return s !== null ? s : forcar ? escreverForcado(spans, false) : null;
  };
  switch (l.kind) {
    case 'linha': {
      const s = inline(l.spans, (s) => lidaComo(recuo + s, l));
      return s === null ? null : [recuo + s];
    }
    case 'titulo': {
      const marca = '#'.repeat(l.nivel) + ' ';
      const s = inline(l.spans, (s) => lidaComo(marca + s, semRecuo));
      return s === null ? null : [recuo + marca + s];
    }
    case 'item': {
      const marca = l.tipo === 'ul' ? '- ' : l.tipo === 'check' ? (l.feita ? '- [x] ' : '- [ ] ') : (l.numero || '1') + '. ';
      const s = inline(l.spans, (s) => lidaComo(recuo + marca + s, l));
      return s === null ? null : [recuo + marca + s];
    }
    case 'citacao': {
      const s = inline(l.spans, (s) => lidaComo('> ' + s, semRecuo));
      return s === null ? null : [recuo + '> ' + s];
    }
    case 'sutil': {
      const s = inline(l.spans, (s) => lidaComo('-# ' + s, semRecuo));
      return s === null ? null : [recuo + (s ? '-# ' + s : '-#')];
    }
    case 'divisoria':
      return [recuo + '---'];
    case 'widget': {
      const linha = recuo + widgetLine(l.nome, l.args, l.tamanho);
      return lidaComo(linha.trimStart(), semRecuo) || forcar ? [linha] : null;
    }
    case 'codigo': {
      const corpo = l.texto ? l.texto.split('\n') : [];
      const sinal = l.cerca[0] === '~' ? '~' : '`';
      // a cerca maior que qualquer fila do mesmo sinal no começo de uma linha de dentro (senão ela fecharia antes)
      const maior = Math.max(0, ...corpo.map((c) => new RegExp(`^\\s*(\\${sinal}+)`).exec(c)?.[1].length ?? 0));
      const cerca = sinal.repeat(Math.max(3, maior + 1));
      const margem = ' '.repeat(l.margem);
      return [recuo + cerca, ...corpo.map((c) => (c ? margem + c : '')), recuo + cerca];
    }
    case 'tabela': {
      const cols = Math.max(1, l.cabeca.length);
      const celula = (spans: readonly Span[] | undefined) => {
        if (!spans?.length) return '';
        const s = escreverPecas(spans, (s) => celulaComo(s, spans), true, modo);
        return s !== null ? s : forcar ? escreverForcado(spans, true) : null;
      };
      const fileira = (cells: readonly (readonly Span[])[], sobra: readonly string[] = []) => {
        const escritas = Array.from({ length: cols }, (_, c) => celula(cells[c]));
        if (escritas.some((c) => c === null)) return null;
        return recuo + '| ' + [...escritas, ...sobra].join(' | ') + ' |';
      };
      const cabeca = fileira(l.cabeca);
      const fileiras = l.fileiras.map((f, r) => fileira(f, l.sobra[r]));
      if (cabeca === null || fileiras.some((f) => f === null)) return null;
      const sep = recuo + '| ' + Array.from({ length: cols }, (_, c) => SEPARADOR[l.alinhar[c] ?? 'nenhum']).join(' | ') + ' |';
      return [...(l.jeito ? [recuo + widgetLine('tabela', [l.jeito])] : []), cabeca, sep, ...(fileiras as string[])];
    }
    case 'cru':
      return l.linhas;
  }
}

// ===== Escrever o documento =====

/**
 * O documento de volta em texto. A linha sem mudança sai pela fonte; a mexida, escrita de novo (com o
 * mínimo de barras). O texto inteiro é lido de volta (a trava): uma linha muda a de baixo (uma linha
 * de traços embaixo de uma com "|" vira tabela), um recuo vira corpo de item. Se o que volta não é o
 * documento, as linhas escritas de novo saem com as barras todas; se ainda assim não volta, a escrita
 * diz que não é exata, e `doc` é o que o leitor leu (a tela se ajusta a ele).
 */
export function docToText(doc: Doc): Escrita {
  const dadas = doc.linhas.length ? doc.linhas : [{ kind: 'linha', recuo: 0, spans: [] } as LinhaDoc];
  // sem mudança desde a leitura (comparada antes de normalizar), a linha sai pela fonte
  const pelaFonte = dadas.map((l) => !!l.fonte && l.fonte.chave === chave(l));
  const linhas = dadas.map((l, i) => (pelaFonte[i] ? l : normalizarLinha(l)));
  const monta = (modo: Modo) => {
    const partes = linhas.map((l, i) => (pelaFonte[i] ? l.fonte!.texto : (escreverLinha(l, modo) ?? escreverLinha(l, 'cheio', true)!).join(doc.quebra)));
    let texto = '';
    partes.forEach((p, i) => {
      texto += p;
      if (i < partes.length - 1) texto += linhas[i].fonte?.fim || doc.quebra;
    });
    return texto;
  };
  const alvo = linhas.map(chave);
  let texto = '';
  let lido: Doc = { linhas: [], quebra: doc.quebra };
  let exato = false;
  // o mínimo de barras; senão, a barra no sinal do começo de cada linha escrita; senão, todas
  for (const modo of pelaFonte.every(Boolean) ? (['enxuto'] as const) : (['enxuto', 'primeira', 'cheio'] as const)) {
    texto = monta(modo);
    lido = textToDoc(texto);
    exato = mesmo(lido, alvo);
    if (exato) break;
  }
  return { texto, exato, doc: lido, inicios: iniciosDe(lido) };
}

function mesmo(lido: Doc, alvo: readonly string[]): boolean {
  return lido.linhas.length === alvo.length && lido.linhas.every((l, i) => chave(l) === alvo[i]);
}

function iniciosDe(doc: Doc): number[] {
  const out: number[] = [];
  let at = 0;
  for (const l of doc.linhas) {
    out.push(at);
    at += l.fonte!.texto.length + l.fonte!.fim.length;
  }
  return out;
}

// ===== O cursor: a posição na tela e no texto =====

/** As letras que a linha mostra (as de texto; as peças inteiras, como a tabela e o widget, não têm). */
export function textoVisivel(l: LinhaDoc): string {
  return 'spans' in l ? l.spans.map((s) => s.text).join('') : '';
}

/** Cada símbolo e os sinais que o escrevem ("→" e "->"). */
const SINAIS_DE = new Map(Object.entries(SYMBOLS).map(([sinais, simbolo]) => [simbolo, sinais]));

/**
 * Onde cada letra da tela cai no texto escrito (o índice `i` de `visivel` → o índice no `escrito`; o
 * último, o fim): as letras aparecem na mesma ordem, com as marcas e as barras no meio, e o símbolo
 * casa com os sinais que o escrevem. Aproximado onde uma letra é igual a um sinal de marca por perto.
 */
export function alinhar(escrito: string, visivel: string): number[] {
  const mapa: number[] = [];
  let j = 0;
  for (let i = 0; i < visivel.length; i++) {
    const ch = visivel[i];
    const sinais = SINAIS_DE.get(ch);
    let k = j;
    while (k < escrito.length && escrito[k] !== ch && !(sinais && escrito.startsWith(sinais, k))) k++;
    if (k >= escrito.length) {
      while (mapa.length <= visivel.length) mapa.push(escrito.length);
      return mapa;
    }
    mapa.push(k);
    j = k + (escrito[k] === ch ? 1 : sinais!.length);
  }
  mapa.push(j);
  return mapa;
}

/** Onde termina, no texto escrito, a letra `k` da tela (o símbolo ocupa os sinais que o escrevem). */
function fimDaLetra(escrito: string, visivel: string, mapa: readonly number[], k: number): number {
  return mapa[k] + (escrito[mapa[k]] === visivel[k] ? 1 : (SINAIS_DE.get(visivel[k])?.length ?? 1));
}

/**
 * A posição no texto da letra `col` da linha `i` do documento escrito (logo antes dela). Com `fim`,
 * o fim da letra de antes: o fim de uma seleção fica colado na última letra, antes da marca que fecha
 * ("**negrito**" selecionado só até o "o").
 */
export function posicaoNoTexto(e: Escrita, i: number, col: number, fim = false): number {
  const l = e.doc.linhas[i];
  const inicio = e.inicios[i];
  const visivel = textoVisivel(l);
  if (!visivel) return inicio;
  const primeira = partir(l.fonte!.texto).linhas[0];
  const mapa = alinhar(primeira, visivel);
  const c = Math.max(0, Math.min(col, visivel.length));
  return inicio + (fim && c > 0 && mapa[c - 1] < primeira.length ? fimDaLetra(primeira, visivel, mapa, c - 1) : mapa[c]);
}

/** A linha do documento e a letra dela onde cai a posição `at` do texto. */
export function posicaoNoDoc(e: Escrita, at: number): { linha: number; col: number } {
  let i = 0;
  while (i + 1 < e.inicios.length && e.inicios[i + 1] <= at) i++;
  const l = e.doc.linhas[i];
  const visivel = textoVisivel(l);
  if (!visivel) return { linha: i, col: 0 };
  const escrito = partir(l.fonte!.texto).linhas[0];
  const mapa = alinhar(escrito, visivel);
  const rel = at - e.inicios[i];
  // as letras que já acabaram antes da posição: dentro de uma marca, depois da letra, o cursor fica depois dela
  let col = 0;
  while (col < visivel.length && mapa[col] < escrito.length && fimDaLetra(escrito, visivel, mapa, col) <= rel) col++;
  return { linha: i, col };
}
