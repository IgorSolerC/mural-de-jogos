import { Fragment, Mark, Node as PMNode, Schema, Slice } from 'prosemirror-model';
import { Fonte, LinhaDoc, juntarSpans, textToDoc } from '../../core/rich-doc';
import { Span } from '../../core/rich-text';

/**
 * O esquema do modo Visual (ver PLANO-EDITOR-VISUAL.md, 5.1 e 5.2): uma linha do texto, um nó, na ordem
 * das linhas, sem árvore (o nível de uma linha é o recuo dela, como no texto). Cada nó guarda a `fonte`
 * (a linha como estava escrita): sem mudança, o tradutor (core/rich-doc.ts) a devolve byte a byte.
 *
 * Já são nós editáveis a linha, o título, a citação, o sutil, a divisória e o bloco de código (este
 * desde a rodada 3), com as marcas da linha; o resto (o item, a tabela, o widget e o que o tradutor
 * não escreve igual) é um `cru`: uma peça que mostra o trecho como a leitura e guarda a linha original
 * inteira (com a fonte), então ele sai igual, byte a byte. As listas, os widgets e a tabela ganham nó
 * nas rodadas seguintes; até lá, mudam no Markdown.
 *
 * As classes do desenho são as da leitura (ver ui/_formatado.scss), dentro da folha do Visual.
 */

/** O recuo vira o `text-indent` da primeira linha, como os espaços do começo na leitura. */
const recuo = (n: PMNode): Record<string, string> => (n.attrs['recuo'] ? { style: `--recuo: ${n.attrs['recuo']}` } : {});
const base = { recuo: { default: 0 }, fonte: { default: null } };
/** O recuo de uma linha copiada do próprio Visual (o colado de fora vem sem). */
const recuoDe = (d: HTMLElement | string) => ({ recuo: typeof d === 'string' ? 0 : Math.max(0, Math.min(40, parseInt(d.style.getPropertyValue('--recuo'), 10) || 0)) });
/** Os endereços que viram link (como o leitor: nada de javascript: nem data:). */
const HREF_OK = /^(?:https?:|mailto:)/i;

export const schema = new Schema({
  nodes: {
    doc: { content: 'bloco+' },
    linha: {
      group: 'bloco',
      content: 'inline*',
      attrs: base,
      parseDOM: [{ tag: 'p', getAttrs: recuoDe }, { tag: 'div.linha.paragrafo', getAttrs: recuoDe }],
      toDOM: (n) => ['div', { class: 'linha paragrafo', ...recuo(n) }, 0],
    },
    titulo: {
      group: 'bloco',
      content: 'inline*',
      defining: true,
      attrs: { ...base, nivel: { default: 1 } },
      parseDOM: [
        ...[1, 2, 3, 4, 5, 6].map((i) => ({ tag: 'h' + i, attrs: { nivel: Math.min(i, 3) } })),
        { tag: 'div.titulo', priority: 60, getAttrs: (d) => ({ ...recuoDe(d), nivel: +(/(?:^| )t([123])(?: |$)/.exec((d as HTMLElement).className)?.[1] ?? 1) }) },
      ],
      // um dos níveis abaixo do título da ficha (4, 5, 6), como a leitura
      toDOM: (n) => ['div', { class: `linha titulo t${n.attrs['nivel']}`, role: 'heading', 'aria-level': String(3 + n.attrs['nivel']), ...recuo(n) }, 0],
    },
    citacao: {
      group: 'bloco',
      content: 'inline*',
      defining: true,
      attrs: base,
      parseDOM: [{ tag: 'div.citacao', priority: 60, getAttrs: recuoDe }],
      toDOM: (n) => ['div', { class: 'linha paragrafo citacao', ...recuo(n) }, 0],
    },
    sutil: {
      group: 'bloco',
      content: 'inline*',
      defining: true,
      attrs: base,
      parseDOM: [{ tag: 'div.linha.sutil', priority: 60, contentElement: '.sutil-texto', getAttrs: recuoDe }],
      toDOM: (n) => ['div', { class: 'linha paragrafo sutil', ...recuo(n) }, ['span', { class: 'sutil-texto' }, 0]],
    },
    divisoria: {
      group: 'bloco',
      atom: true,
      selectable: true,
      attrs: base,
      parseDOM: [{ tag: 'hr' }, { tag: 'div.divisoria', priority: 60, getAttrs: recuoDe }],
      toDOM: (n) => ['div', { class: 'linha divisoria', role: 'separator', ...recuo(n) }],
    },
    /**
     * O bloco de código: as linhas entre as cercas, em letra de máquina, sem marcas, com as quebras
     * dentro (um nó só, como a leitura o mostra). `cerca` é a escrita (o "```" ou o "~~~~"), `margem` o
     * recuo do corpo de item onde ele mora, `aberto` sem a cerca que fecha (o fim do texto). O recuo
     * empurra o bloco inteiro (não só a primeira linha).
     */
    blocoCodigo: {
      group: 'bloco',
      content: 'text*',
      marks: '',
      code: true,
      defining: true,
      attrs: { ...base, cerca: { default: '```' }, margem: { default: 0 }, aberto: { default: false } },
      parseDOM: [{ tag: 'pre', preserveWhitespace: 'full', getAttrs: recuoDe }],
      toDOM: (n) => ['pre', { class: 'linha codigo', spellcheck: 'false', ...recuo(n) }, ['code', 0]],
    },
    /**
     * O trecho que o Visual ainda não sabe mudar: a linha (ou o bloco) inteira, com a fonte. Na tela,
     * como a leitura (ver CruView); no texto, sai como estava. Copiado, leva o próprio texto.
     */
    cru: {
      group: 'bloco',
      atom: true,
      selectable: true,
      attrs: { linha: {} },
      parseDOM: [{ tag: 'div.vis-cru[data-texto]', getAttrs: (d) => ({ linha: linhaDoTexto((d as HTMLElement).getAttribute('data-texto') ?? '') }) }],
      toDOM: (n) => ['div', { class: 'vis-cru', 'data-texto': textoDoCru(n) }, textoDoCru(n)],
    },
    text: { group: 'inline' },
  },
  marks: {
    // os links por fora (a ordem é a do desenho: o de fora primeiro)
    link: {
      attrs: { href: {} },
      inclusive: false,
      excludes: 'link elo',
      parseDOM: [{ tag: 'a[href]', getAttrs: (d) => (HREF_OK.test((d as HTMLElement).getAttribute('href') ?? '') ? { href: (d as HTMLElement).getAttribute('href') } : false) }],
      toDOM: (m) => ['a', { class: 'elo url', href: m.attrs['href'], title: m.attrs['href'], rel: 'noopener noreferrer', target: '_blank' }, 0],
    },
    elo: {
      attrs: { ref: { default: null } },
      inclusive: false,
      excludes: 'elo link',
      parseDOM: [{ tag: 'span[data-elo]', getAttrs: (d) => ({ ref: (d as HTMLElement).getAttribute('data-ref') || (d as HTMLElement).textContent?.trim() || null }) }],
      toDOM: (m) => ['span', { class: 'elo', 'data-elo': '', ...(m.attrs['ref'] ? { 'data-ref': m.attrs['ref'], title: m.attrs['ref'] } : {}) }, 0],
    },
    // na escrita, a tarja do spoiler é translúcida e listrada: quem escreve precisa ler o que escreve
    spoiler: {
      parseDOM: [{ tag: 'span.vis-spoiler' }],
      toDOM: () => ['span', { class: 'vis-spoiler', title: 'Spoiler', 'aria-description': 'spoiler' }, 0],
    },
    negrito: {
      parseDOM: [
        { tag: 'strong' },
        // o Docs embrulha tudo num <b style="font-weight:normal">: não é negrito
        { tag: 'b', getAttrs: (d) => (d as HTMLElement).style.fontWeight !== 'normal' && null },
        { style: 'font-weight', getAttrs: (v) => /^(bold(er)?|[6-9]\d\d)$/.test(v as string) && null },
      ],
      toDOM: () => ['strong', { class: 'negrito' }, 0],
    },
    italico: {
      parseDOM: [{ tag: 'i' }, { tag: 'em' }, { style: 'font-style=italic' }],
      toDOM: () => ['em', { class: 'italico' }, 0],
    },
    riscado: {
      parseDOM: [{ tag: 's' }, { tag: 'del' }, { tag: 'strike' }, { style: 'text-decoration=line-through' }],
      toDOM: () => ['s', { class: 'riscado' }, 0],
    },
    marca: {
      parseDOM: [{ tag: 'mark' }],
      toDOM: () => ['mark', { class: 'marca' }, 0],
    },
    // o trecho sutil ("((assim))"); a linha sutil ("-# ") é o nó `sutil`
    trechoSutil: {
      parseDOM: [{ tag: 'span.sutil' }],
      toDOM: () => ['span', { class: 'sutil' }, 0],
    },
    // inclusivo como as outras (Ctrl+E e o que se escreve continua código, até o Ctrl+E de novo); o
    // plano dizia "não inclusiva", mas assim só a primeira letra virava código
    codigo: {
      excludes: 'codigo link elo',
      parseDOM: [{ tag: 'code' }],
      toDOM: () => ['code', { class: 'cod' }, 0],
    },
  },
});

const N = schema.nodes;
const M = schema.marks;

/** As marcas de ênfase do leitor e as do esquema. */
const FLAG_MARK: readonly (readonly [keyof Span, string])[] = [
  ['bold', 'negrito'],
  ['italic', 'italico'],
  ['strike', 'riscado'],
  ['mark', 'marca'],
  ['spoiler', 'spoiler'],
  ['subtle', 'trechoSutil'],
];

/** As letras com as marcas, como o leitor as dá (`Span`), em nós de texto. */
export function inlineDe(spans: readonly Span[]): PMNode[] {
  return spans
    .filter((s) => s.text)
    .map((s) => {
      const marks: Mark[] = [];
      for (const [f, m] of FLAG_MARK) if (s[f]) marks.push(schema.marks[m].create());
      if (s.code) marks.push(M['codigo'].create());
      // o link de anotação guarda sempre o título: escrever no texto dele muda só o rótulo (o K8 do plano)
      else if (s.link) marks.push(M['elo'].create({ ref: s.ref ?? s.text.trim() }));
      else if (s.href !== undefined) marks.push(M['link'].create({ href: s.href }));
      return schema.text(s.text, Mark.setFrom(marks));
    });
}

/**
 * As letras de um nó de texto em pedaços (`Span`), como o leitor os daria. Um link partido em vários
 * pedaços de texto (com marcas diferentes no meio, enquanto o ajuste não os iguala) continua um link só;
 * o link de anotação só leva o título (`ref`) quando o texto mostra outro.
 */
export function spansDe(node: PMNode): Span[] {
  const out: Span[] = [];
  let ultimo: Mark | null = null;
  node.forEach((ch) => {
    if (!ch.isText || !ch.text) return;
    const link = ch.marks.find((m) => m.type === M['link'] || m.type === M['elo']) ?? null;
    if (link && ultimo && link.eq(ultimo)) {
      out[out.length - 1].text += ch.text;
      return;
    }
    ultimo = link;
    const s: Span = { text: ch.text };
    for (const m of ch.marks) {
      const flag = FLAG_MARK.find(([, nome]) => nome === m.type.name)?.[0];
      if (flag) (s as unknown as Record<string, unknown>)[flag] = true;
      else if (m.type === M['codigo']) s.code = true;
      else if (m.type === M['elo']) {
        s.link = true;
        if (m.attrs['ref'] != null) s.ref = m.attrs['ref'];
      } else if (m.type === M['link']) s.href = m.attrs['href'];
    }
    out.push(s);
  });
  for (const s of out) if (s.link && (s.ref == null || s.ref === s.text)) delete s.ref;
  return juntarSpans(out);
}

/** O nó de uma linha do tradutor. */
export function noDe(l: LinhaDoc): PMNode {
  const fonte = l.fonte ?? null;
  switch (l.kind) {
    case 'linha':
      return N['linha'].create({ recuo: l.recuo, fonte }, inlineDe(l.spans));
    case 'titulo':
      return N['titulo'].create({ recuo: l.recuo, fonte, nivel: l.nivel }, inlineDe(l.spans));
    case 'citacao':
      return N['citacao'].create({ recuo: l.recuo, fonte }, inlineDe(l.spans));
    case 'sutil':
      return N['sutil'].create({ recuo: l.recuo, fonte }, inlineDe(l.spans));
    case 'divisoria':
      return N['divisoria'].create({ recuo: l.recuo, fonte });
    case 'codigo':
      return N['blocoCodigo'].create({ recuo: l.recuo, fonte, cerca: l.cerca, margem: l.margem, aberto: l.aberto }, l.texto ? schema.text(l.texto) : []);
    default:
      return N['cru'].create({ linha: l });
  }
}

/** O documento das linhas (vazio, uma linha vazia). */
export function docDe(linhas: readonly LinhaDoc[]): PMNode {
  const nos = linhas.map(noDe);
  return N['doc'].create(null, nos.length ? nos : [N['linha'].create()]);
}

const LINHAS = new WeakMap<PMNode, LinhaDoc>();

/** Os tipos de linha que o Visual já edita (o resto é um trecho cru). */
const EDITAVEIS: readonly LinhaDoc['kind'][] = ['linha', 'titulo', 'citacao', 'sutil', 'divisoria', 'codigo'];

/** A linha do tradutor de um nó (guardada por nó: os nós são imutáveis, o que não mudou não se refaz). */
export function linhaDe(n: PMNode): LinhaDoc {
  let l = LINHAS.get(n);
  if (l) return l;
  const fonte: Fonte | undefined = n.attrs['fonte'] ?? undefined;
  const r: number = n.attrs['recuo'] ?? 0;
  switch (n.type.name) {
    case 'titulo': {
      const spans = spansDe(n);
      // o título sem letra não tem escrita ("# " é texto na leitura): fica guardado como a linha vazia,
      // e a tela continua com o título, esperando a primeira letra
      l = spans.some((s) => s.text.trim()) ? { kind: 'titulo', recuo: r, nivel: n.attrs['nivel'], spans, fonte } : { kind: 'linha', recuo: 0, spans: [], fonte };
      break;
    }
    case 'citacao':
      l = { kind: 'citacao', recuo: r, spans: spansDe(n), fonte };
      break;
    case 'sutil':
      l = { kind: 'sutil', recuo: r, spans: spansDe(n), fonte };
      break;
    case 'divisoria':
      l = { kind: 'divisoria', recuo: r, fonte };
      break;
    case 'blocoCodigo':
      l = { kind: 'codigo', recuo: r, cerca: n.attrs['cerca'], texto: n.textContent, margem: n.attrs['margem'], aberto: n.attrs['aberto'], fonte };
      break;
    case 'cru':
      l = n.attrs['linha'] as LinhaDoc;
      LINHAS.set(n, l);
      return l;
    default:
      l = { kind: 'linha', recuo: r, spans: spansDe(n), fonte };
  }
  if (!fonte) delete (l as { fonte?: Fonte }).fonte;
  LINHAS.set(n, l);
  return l;
}

/** O texto que um trecho cru guarda (as linhas como estavam). */
export function textoDoCru(n: PMNode): string {
  const l = n.attrs['linha'] as LinhaDoc;
  return l.fonte?.texto ?? (l.kind === 'cru' ? l.linhas.join('\n') : '');
}

/**
 * A linha de um trecho cru colado (o texto que ele levou): o que o tradutor lê dele, se for uma linha
 * só que o Visual ainda não edita; senão, o trecho cru como veio (a trava da escrita confere depois).
 */
function linhaDoTexto(texto: string): LinhaDoc {
  const lidas = textToDoc(texto).linhas;
  if (lidas.length === 1 && !EDITAVEIS.includes(lidas[0].kind)) return lidas[0];
  return { kind: 'cru', recuo: 0, linhas: texto.split(/\r\n|\r|\n/) };
}

/** O texto colado lido como o texto das anotações (P5: as marcas valem), ou como letras (Ctrl+Shift+V). */
export function sliceDoTexto(texto: string, comoLetras: boolean): Slice {
  const nos = comoLetras ? texto.split(/\r\n|\r|\n/).map((t) => N['linha'].create(null, t ? schema.text(t) : [])) : textToDoc(texto).linhas.map(noDe);
  if (!nos.length) return Slice.empty;
  return new Slice(Fragment.from(nos), nos[0].isTextblock ? 1 : 0, nos[nos.length - 1].isTextblock ? 1 : 0);
}
