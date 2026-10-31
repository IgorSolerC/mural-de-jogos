import { LinhaDoc, juntarSpans } from '../../core/rich-doc';
import { Span } from '../../core/rich-text';
import { Align, MAX_TABLE_COLS, MAX_TABLE_ROWS } from '../../core/tables';

/**
 * O HTML colado de fora (o Docs, o Word, um site, o e-mail, uma planilha) traduzido para o que o Murall
 * tem, e só isso (PLANO-EDITOR-VISUAL.md, 5.16 e 5.24): negrito, itálico, riscado, marca-texto, código,
 * link (só https, http e mailto), títulos (h4–h6 como o 3), listas e as listas de tarefas, citação,
 * bloco de código, divisória, tabela (a primeira fileira é o cabeçalho; a célula mesclada, desfeita) e
 * imagens. O resto (a fonte, a cor, o tamanho, as caixas sem sentido) vira só letras.
 *
 * Lido num documento à parte (`DOMParser`): nada roda e nenhuma imagem carrega. Sai a lista de linhas do
 * tradutor (core/rich-doc.ts), sem fonte: quem escreve o markdown é ele, com as barras que precisar.
 *
 * Os casos sabidos:
 * - o Docs embrulha tudo num `<b style="font-weight:normal" id="docs-internal-guid-…">`: não é negrito
 *   (o estilo vale sobre a etiqueta), e as marcas dele vêm no estilo de cada pedaço (`font-weight:700`);
 * - o Word manda as listas como parágrafos com `mso-list` e um "·" (ou o número) na frente: viram itens;
 * - imagem com `https:` vira o widget de imagem pelo link; com `data:`, a imagem guardada como colada
 *   (quem cola a encolhe e guarda); `file:` e `cid:` (do Word), e o resto, não vêm (são contadas, para o
 *   aviso "1 imagem não veio").
 */

/** O marcador da imagem `data:` no lugar dela (o widget de mentira que quem cola troca pela guardada). */
export const IMAGEM_COLADA = 'murall-colando:';

export interface HtmlLido {
  linhas: LinhaDoc[];
  /** As imagens que vieram dentro do HTML (`data:`), na ordem dos marcadores (`IMAGEM_COLADA` + índice). */
  imagens: string[];
  /** As imagens que não vieram (do Word, de um endereço sem https, de dentro de uma célula). */
  faltaram: number;
}

/** No máximo tantas imagens `data:` por colar (cada uma é encolhida e guardada; o resto não vem). */
const MAX_IMAGENS = 20;
/** O que não é texto nem forma: não entra. */
const FORA = new Set(['script', 'style', 'head', 'title', 'meta', 'link', 'template', 'noscript', 'iframe', 'object', 'embed', 'svg', 'math', 'canvas', 'audio', 'video', 'button', 'select', 'textarea', 'input', 'option', 'datalist', 'map', 'area', 'xml']);
/** As caixas que partem linha (a lista, a citação, o título, o código, a tabela têm regra própria). */
const BLOCOS = new Set(['p', 'div', 'section', 'article', 'header', 'footer', 'main', 'aside', 'nav', 'figure', 'figcaption', 'dl', 'dt', 'dd', 'address', 'center', 'details', 'summary', 'caption', 'form', 'fieldset', 'legend', 'body', 'html']);
const MONO = /mono|courier|consolas|menlo|monaco|inconsolata|fira code|source code/i;
const HREF_OK = /^(?:https?:|mailto:)/i;
const BULLET = /^[\s ]*\(?[0-9a-zA-Z]{1,4}[.)]/;

interface Marcas {
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
  mark?: boolean;
  code?: boolean;
  href?: string;
  /** Os espaços valem como estão (o `<pre>` e o `white-space: pre` do Docs). */
  espacos?: boolean;
  /** No título: o negrito não conta (o título já é forte). */
  titulo?: boolean;
}

/** A linha aberta (a que recebe as letras agora). */
type Aberta =
  | { kind: 'linha' | 'citacao'; recuo: number; spans: Span[] }
  | { kind: 'titulo'; recuo: number; nivel: 1 | 2 | 3; spans: Span[] }
  | { kind: 'item'; recuo: number; tipo: 'ul' | 'ol' | 'check'; feita: boolean; numero: string; spans: Span[] };

/** Onde as linhas abertas pelas letras soltas moram: na citação, no corpo de um item, ou no texto. */
interface Lugar {
  kind: 'linha' | 'citacao';
  recuo: number;
}

interface Lista {
  tipo: 'ul' | 'ol';
  nivel: number;
  n: number;
}

/** Lê o HTML colado. */
export function lerHtml(html: string): HtmlLido {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const escritorio = !!doc.querySelector('[id^="docs-internal-guid"], google-sheets-html-origin') || /mso-|urn:schemas-microsoft-com|class="?Mso/i.test(html);
  const m = new Montador(escritorio);
  m.anda(doc.body ?? doc.documentElement, {});
  m.fecha();
  return { linhas: aparaVazias(m.linhas), imagens: m.imagens, faltaram: m.faltaram };
}

/** Sem as linhas vazias do começo e do fim. */
function aparaVazias(linhas: LinhaDoc[]): LinhaDoc[] {
  const vazia = (l: LinhaDoc) => l.kind === 'linha' && !l.spans.some((s) => s.text.trim());
  let a = 0;
  let b = linhas.length;
  while (a < b && vazia(linhas[a])) a++;
  while (b > a && vazia(linhas[b - 1])) b--;
  return linhas.slice(a, b);
}

class Montador {
  readonly linhas: LinhaDoc[] = [];
  readonly imagens: string[] = [];
  faltaram = 0;
  private atual: Aberta | null = null;
  private lugar: Lugar = { kind: 'linha', recuo: 0 };
  private readonly listas: Lista[] = [];
  /** O Word numera as listas pelo nível: o número de cada um, na lista de agora (o `lN` do `mso-list`). */
  private readonly word: number[] = [];
  private listaWord = '';

  /** `celula`: as letras de uma célula de tabela (tudo numa linha só, os blocos separados por espaço). */
  constructor(
    private readonly escritorio: boolean,
    private readonly celula = false,
  ) {}

  // ===== As linhas =====

  /** Abre uma linha do tipo dado (a vazia aberta antes dá o lugar a ela; o item vazio fica: é o `<p>` dele). */
  private abre(l: Aberta): void {
    if (this.celula) return this.separa();
    if (this.atual && temLetras(this.atual)) this.fecha();
    if (this.atual?.kind === 'item' && l.kind === 'linha') return;
    this.atual = l;
  }

  /** Fecha a linha aberta. `vazia`: entra mesmo sem letras (a quebra `<br>`, o parágrafo vazio). */
  fecha(vazia = false): void {
    if (this.celula) return this.separa();
    const a = this.atual;
    this.atual = null;
    if (!a) {
      if (vazia) this.linhas.push({ kind: 'linha', recuo: 0, spans: [] });
      return;
    }
    const spans = apara(a.spans);
    if (!spans.length) {
      if (vazia) this.linhas.push({ kind: 'linha', recuo: 0, spans: [] });
      return;
    }
    this.linhas.push({ ...a, spans } as LinhaDoc);
  }

  /** Na célula, o que partiria a linha vira um espaço. */
  private separa(): void {
    const a = this.atual;
    if (a && a.spans.length && !/\s$/.test(a.spans[a.spans.length - 1].text)) a.spans.push({ text: ' ' });
  }

  /** As letras na linha aberta (sem ela, uma nova no lugar de agora). */
  private letras(texto: string, m: Marcas): void {
    let t = texto.replace(/[​﻿]/g, '');
    if (!m.espacos) t = t.replace(/[\s ]+/g, ' ');
    else t = t.replace(/ /g, ' ').replace(/[\r\n\t]+/g, ' ');
    if (!t) return;
    if (!this.atual) {
      if (!t.trim()) return;
      this.atual = { kind: this.lugar.kind, recuo: this.lugar.kind === 'citacao' ? 0 : this.lugar.recuo, spans: [] };
    }
    const spans = this.atual.spans;
    const ultima = spans[spans.length - 1]?.text ?? '';
    // o espaço do começo da linha e o espaço repetido saem (fora do `pre`)
    if (!m.espacos && (!ultima || /\s$/.test(ultima))) t = t.replace(/^ +/, '');
    if (!t) return;
    const s: Span = { text: t };
    if (m.bold && !m.titulo) s.bold = true;
    if (m.italic) s.italic = true;
    if (m.strike) s.strike = true;
    if (m.mark) s.mark = true;
    if (m.code) s.code = true;
    else if (m.href) s.href = m.href;
    spans.push(s);
  }

  // ===== Andar pelo HTML =====

  anda(no: Node, m: Marcas): void {
    for (let c = no.firstChild; c; c = c.nextSibling) {
      if (c.nodeType === Node.TEXT_NODE) this.letras((c as Text).data, m);
      else if (c.nodeType === Node.ELEMENT_NODE) this.elemento(c as HTMLElement, m);
    }
  }

  private elemento(el: HTMLElement, fora: Marcas): void {
    const tag = el.localName.toLowerCase();
    if (FORA.has(tag) || el.hidden || el.style?.display === 'none') return;
    const cru = el.getAttribute('style') ?? '';
    // o marcador da lista do Word ("·", "1.") já virou o item
    if (/mso-list:\s*ignore/i.test(cru)) return;
    const m = this.marcas(el, tag, fora);
    if (tag === 'br') return this.quebra(el);
    if (tag === 'hr') {
      if (this.celula) return this.separa();
      this.fecha();
      this.linhas.push({ kind: 'divisoria', recuo: 0 });
      return;
    }
    if (tag === 'img') return this.imagem(el as HTMLImageElement, m);
    if (this.celula) {
      if (tag === 'table' || tag === 'tr' || tag === 'td' || tag === 'th' || tag === 'li' || tag === 'pre' || BLOCOS.has(tag) || /^h[1-6]$/.test(tag)) {
        this.separa();
        this.anda(el, m);
        this.separa();
        return;
      }
      return this.anda(el, m);
    }
    if (/^h[1-6]$/.test(tag)) {
      this.abre({ kind: 'titulo', recuo: 0, nivel: Math.min(3, +tag[1]) as 1 | 2 | 3, spans: [] });
      this.anda(el, { ...m, titulo: true });
      this.fecha();
      return;
    }
    // o Word: o título do documento, e os itens de lista escritos como parágrafos
    if (tag === 'p' && /(?:^| )MsoTitle(?: |$)/.test(el.className)) {
      this.abre({ kind: 'titulo', recuo: 0, nivel: 1, spans: [] });
      this.anda(el, { ...m, titulo: true });
      this.fecha();
      return;
    }
    const nivelWord = /mso-list:\s*(l\d+)\s+level(\d+)/i.exec(cru);
    if (tag === 'p' && nivelWord) return this.itemDoWord(el, nivelWord[1], +nivelWord[2], m);
    if (tag === 'p') this.word.length = 0;
    if (tag === 'ul' || tag === 'ol') return this.lista(el, tag, m);
    if (tag === 'li') return this.item(el, m);
    if (tag === 'blockquote') {
      this.fecha();
      const antes = this.lugar;
      this.lugar = { kind: 'citacao', recuo: 0 };
      this.anda(el, m);
      this.fecha();
      this.lugar = antes;
      return;
    }
    if (tag === 'pre') return this.codigo(el);
    if (tag === 'table') return this.tabela(el as HTMLTableElement, m);
    if (BLOCOS.has(tag) || tag === 'tr' || tag === 'td' || tag === 'th') {
      const antes = this.linhas.length;
      if (this.atual && temLetras(this.atual)) this.fecha();
      else if (this.atual && this.atual.kind !== 'item') this.atual = null;
      const tinhaItem = this.atual?.kind === 'item';
      this.anda(el, m);
      // o parágrafo vazio é uma linha vazia (a caixa vazia de um site, não; a com um <br>, sim)
      const nada = this.linhas.length === antes && !(this.atual && temLetras(this.atual));
      if (nada && !tinhaItem && (tag === 'p' || el.querySelector(':scope > br'))) this.fecha(true);
      else this.fecha();
      return;
    }
    this.anda(el, m);
  }

  /** As marcas que o elemento põe (pela etiqueta e, por cima, pelo estilo). */
  private marcas(el: HTMLElement, tag: string, fora: Marcas): Marcas {
    const m: Marcas = { ...fora };
    if (tag === 'b' || tag === 'strong') m.bold = true;
    if (tag === 'i' || tag === 'em') m.italic = true;
    if (tag === 's' || tag === 'strike' || tag === 'del') m.strike = true;
    if (tag === 'mark') m.mark = true;
    if (tag === 'code' || tag === 'kbd' || tag === 'samp' || tag === 'tt') m.code = true;
    if (tag === 'a') {
      const href = (el.getAttribute('href') ?? '').trim();
      if (HREF_OK.test(href)) m.href = href;
    }
    const st = el.style;
    if (!st) return m;
    const peso = st.fontWeight;
    if (peso) {
      const n = parseInt(peso, 10);
      if (peso === 'bold' || peso === 'bolder' || n >= 600) m.bold = true;
      else if (peso === 'normal' || peso === 'lighter' || (n && n < 600)) m.bold = false;
    }
    if (st.fontStyle === 'italic' || st.fontStyle === 'oblique') m.italic = true;
    else if (st.fontStyle === 'normal') m.italic = false;
    if (/line-through/.test(`${st.textDecoration} ${st.textDecorationLine}`)) m.strike = true;
    if (MONO.test(st.fontFamily)) m.code = true;
    // o marca-texto do Docs e do Word vem na cor do fundo (num site, a cor do fundo é enfeite)
    if (this.escritorio && fundoMarcado(st.backgroundColor, el.getAttribute('style') ?? '')) m.mark = true;
    if (/^(pre|pre-wrap|break-spaces)$/.test(st.whiteSpace)) m.espacos = true;
    return m;
  }

  /** A quebra de linha (`<br>`): a última de uma caixa não conta (a caixa já parte a linha). */
  private quebra(el: HTMLElement): void {
    if (el.classList.contains('Apple-interchange-newline')) return;
    if (this.celula) return this.separa();
    let depois = el.nextSibling;
    while (depois && depois.nodeType === Node.TEXT_NODE && !(depois as Text).data.trim()) depois = depois.nextSibling;
    const pai = el.parentElement?.localName.toLowerCase() ?? '';
    if (!depois && (BLOCOS.has(pai) || /^(h[1-6]|li|blockquote|td|th)$/.test(pai))) return;
    this.fecha(true);
  }

  private imagem(el: HTMLImageElement, m: Marcas): void {
    const src = (el.getAttribute('src') ?? '').trim();
    const alt = (el.getAttribute('alt') ?? '').trim();
    const w = tamanho(el, 'width');
    const h = tamanho(el, 'height');
    // o pixel de contagem e a caixinha da tarefa do Docs (que é uma imagem) não são imagens
    if ((w !== null && w <= 2) || (h !== null && h <= 2)) return;
    if (el.getAttribute('aria-roledescription') === 'checkbox' || el.closest('li[role="checkbox"]')) return;
    // a imagem pequena no meio das letras (um ícone, um emoji, uma fórmula) é o texto dela; a grande (a
    // do Word vem no parágrafo) parte a linha e entra numa só dela
    const bloco = el.closest('p, div, li, td, th, figure, h1, h2, h3, h4, h5, h6, blockquote, body');
    const sozinha = !bloco || !(bloco.textContent ?? '').trim();
    const pequena = (w !== null && w <= 32 && (h === null || h <= 32)) || (h !== null && h <= 32 && w === null);
    if (this.celula || pequena || (!sozinha && w === null && h === null)) {
      if (alt && !/^(image|imagem|img|\s)*$/i.test(alt)) this.letras(alt, m);
      else if (sozinha && this.celula) this.faltaram++;
      return;
    }
    const recuo = this.atual?.kind === 'item' ? this.atual.recuo + 2 : this.lugar.recuo;
    if (/^https:\/\//i.test(src)) {
      this.fecha();
      this.linhas.push({ kind: 'widget', recuo, nome: 'imagem', args: [src], tamanho: 'medio' });
      return;
    }
    if (/^data:image\/(png|jpe?g|gif|webp|bmp);base64,/i.test(src) && this.imagens.length < MAX_IMAGENS) {
      this.fecha();
      this.linhas.push({ kind: 'widget', recuo, nome: 'imagem', args: [IMAGEM_COLADA + this.imagens.length], tamanho: 'medio' });
      this.imagens.push(src);
      return;
    }
    this.faltaram++;
  }

  private lista(el: HTMLElement, tag: string, m: Marcas): void {
    this.fecha();
    const inicio = parseInt(el.getAttribute('start') ?? '', 10);
    this.listas.push({ tipo: tag === 'ol' ? 'ol' : 'ul', nivel: this.listas.length, n: Number.isFinite(inicio) && inicio >= 0 ? inicio : 1 });
    this.anda(el, m);
    this.fecha();
    this.listas.pop();
  }

  private item(el: HTMLElement, m: Marcas): void {
    this.fecha();
    const lista = this.listas[this.listas.length - 1] ?? { tipo: 'ul' as const, nivel: 0, n: 1 };
    const caixa = el.querySelector<HTMLInputElement>(':scope > input[type="checkbox"], :scope > p > input[type="checkbox"], :scope > label > input[type="checkbox"]');
    const tarefa = el.getAttribute('role') === 'checkbox' || !!caixa;
    const feita = el.getAttribute('aria-checked') === 'true' || !!caixa?.hasAttribute('checked');
    let numero = '';
    if (!tarefa && lista.tipo === 'ol') {
      const valor = parseInt(el.getAttribute('value') ?? '', 10);
      if (Number.isFinite(valor) && valor >= 0) lista.n = valor;
      numero = String(lista.n++);
    }
    const recuo = lista.nivel * 2;
    this.atual = { kind: 'item', recuo, tipo: tarefa ? 'check' : lista.tipo, feita: tarefa && feita, numero, spans: [] };
    const antes = this.lugar;
    // o que vem embaixo do item (outro parágrafo, as letras depois da lista de dentro) é o corpo dele
    this.lugar = { kind: 'linha', recuo: recuo + 2 };
    this.anda(el, m);
    this.fecha();
    this.lugar = antes;
  }

  /** O item de lista do Word: o parágrafo com `mso-list`, o nível e o marcador ("·" ou o número). */
  private itemDoWord(el: HTMLElement, lista: string, nivel: number, m: Marcas): void {
    this.fecha();
    // outra lista (a numerada depois da de marcadores) começa a contar de novo
    if (lista !== this.listaWord) this.word.length = 0;
    this.listaWord = lista;
    const ignora = el.querySelector('[style*="mso-list:Ignore" i], [style*="mso-list: Ignore" i]');
    const marcador = (ignora?.textContent ?? '').trim();
    const ol = BULLET.test(marcador);
    const i = Math.max(0, Math.min(8, nivel - 1));
    this.word.length = i + 1;
    this.word[i] = (this.word[i] ?? 0) + 1;
    this.atual = { kind: 'item', recuo: i * 2, tipo: ol ? 'ol' : 'ul', feita: false, numero: ol ? String(this.word[i]) : '', spans: [] };
    this.anda(el, m);
    this.fecha();
  }

  /** O bloco de código: as letras como estão, as quebras do `<br>` e das caixas de dentro. */
  private codigo(el: HTMLElement): void {
    this.fecha();
    const partes: string[] = [];
    const vai = (no: Node) => {
      for (let c = no.firstChild; c; c = c.nextSibling) {
        if (c.nodeType === Node.TEXT_NODE) partes.push((c as Text).data);
        else if (c.nodeType === Node.ELEMENT_NODE) {
          const t = (c as Element).localName.toLowerCase();
          if (FORA.has(t)) continue;
          if (t === 'br') partes.push('\n');
          else {
            const bloco = BLOCOS.has(t);
            if (bloco && partes.length && !partes[partes.length - 1].endsWith('\n')) partes.push('\n');
            vai(c);
          }
        }
      }
    };
    vai(el);
    const texto = partes.join('').replace(/\r\n?/g, '\n').replace(/ /g, ' ').replace(/^\n+|\n+$/g, '');
    if (!texto.trim()) return;
    this.linhas.push({ kind: 'codigo', recuo: 0, cerca: '```', texto, margem: 0, aberto: false });
  }

  /**
   * A tabela: a primeira fileira é o cabeçalho; a célula mesclada fica na de cima à esquerda, e as outras
   * que ela cobria vazias; o que tem bloco dentro da célula vira uma linha só. Uma célula só são as
   * letras dela (como o Docs faz com uma célula de planilha).
   */
  private tabela(el: HTMLTableElement, m: Marcas): void {
    this.fecha();
    const grade: Span[][][] = [];
    const alinhar: Align[][] = [];
    const ocupada: boolean[][] = [];
    const fileiras = Array.from(el.rows ?? []);
    fileiras.forEach((tr, f) => {
      grade[f] ??= [];
      alinhar[f] ??= [];
      ocupada[f] ??= [];
      let c = 0;
      for (const td of Array.from(tr.cells)) {
        while (ocupada[f][c]) c++;
        const cs = Math.max(1, Math.min(50, td.colSpan || 1));
        const rs = Math.max(1, Math.min(50, td.rowSpan || 1));
        const cel = new Montador(this.escritorio, true);
        cel.atual = { kind: 'linha', recuo: 0, spans: [] };
        cel.anda(td, m);
        grade[f][c] = apara(cel.atual.spans);
        this.faltaram += cel.faltaram;
        alinhar[f][c] = alinhamento(td);
        for (let i = 0; i < rs; i++)
          for (let j = 0; j < cs; j++) {
            (ocupada[f + i] ??= [])[c + j] = true;
            (grade[f + i] ??= [])[c + j] ??= [];
          }
        c += cs;
      }
    });
    // sem as fileiras e as colunas vazias do fim (a planilha manda as de sobra)
    const vaziaCel = (s: Span[] | undefined) => !s || !s.some((x) => x.text.trim());
    while (grade.length && grade[grade.length - 1].every(vaziaCel)) grade.pop();
    let cols = Math.max(0, ...grade.map((f) => f.length));
    while (cols > 0 && grade.every((f) => vaziaCel(f[cols - 1]))) cols--;
    if (!grade.length || !cols) return;
    if (grade.length === 1 && cols === 1) {
      this.atual = { kind: this.lugar.kind, recuo: this.lugar.recuo, spans: [...(grade[0][0] ?? [])] };
      this.fecha();
      return;
    }
    cols = Math.min(cols, MAX_TABLE_COLS);
    const linhas = grade.slice(0, MAX_TABLE_ROWS + 1).map((f) => Array.from({ length: cols }, (_, c) => f[c] ?? []));
    // o alinhamento da coluna: o que todas as células de baixo dizem (os números à direita do Excel)
    const al: Align[] = Array.from({ length: cols }, (_, c) => {
      const ditos = linhas.slice(1).flatMap((f, r) => (vaziaCel(f[c]) ? [] : [alinhar[r + 1]?.[c] ?? null]));
      const a = ditos[0] ?? null;
      return a && ditos.every((x) => x === a) ? a : null;
    });
    this.linhas.push({ kind: 'tabela', recuo: 0, jeito: null, alinhar: al, cabeca: linhas[0], fileiras: linhas.slice(1), sobra: [] });
  }
}

function temLetras(a: Aberta): boolean {
  return a.spans.some((s) => s.text.trim());
}

/** Os pedaços sem os espaços das pontas (e os vazios), juntos quando têm as mesmas marcas. */
function apara(spans: Span[]): Span[] {
  const out = spans.map((s) => ({ ...s }));
  while (out.length && !out[0].text.trim()) out.shift();
  while (out.length && !out[out.length - 1].text.trim()) out.pop();
  if (!out.length) return [];
  out[0].text = out[0].text.replace(/^\s+/, '');
  out[out.length - 1].text = out[out.length - 1].text.replace(/\s+$/, '');
  return juntarSpans(out.filter((s) => s.text));
}

/** A largura ou a altura da imagem, em px, pelo atributo ou pelo estilo (null: não diz). */
function tamanho(el: HTMLImageElement, lado: 'width' | 'height'): number | null {
  const a = parseFloat(el.getAttribute(lado) ?? '');
  if (Number.isFinite(a)) return a;
  const s = el.style?.[lado] ?? '';
  return /px$/.test(s) ? parseFloat(s) : null;
}

/** O alinhamento escrito na célula (o `align` do Excel ou o `text-align`). */
function alinhamento(td: HTMLTableCellElement): Align {
  const a = (td.style?.textAlign || td.getAttribute('align') || '').toLowerCase();
  return a === 'right' || a === 'end' ? 'right' : a === 'center' ? 'center' : null;
}

/** A cor do fundo (ou o `mso-highlight` do Word) é um marca-texto: nem transparente, nem branca. */
function fundoMarcado(cor: string, cru: string): boolean {
  if (/mso-highlight:\s*(?!none)\w/i.test(cru)) return true;
  const c = cor.replace(/\s+/g, '').toLowerCase();
  if (!c || c === 'transparent' || c === 'initial' || c === 'inherit' || c === 'white' || c === '#fff' || c === '#ffffff' || c === 'rgb(255,255,255)') return false;
  if (/^rgba\(.*,0\)$/.test(c)) return false;
  return true;
}
