import { InputRule } from 'prosemirror-inputrules';
import { Mark, MarkType, Node as PMNode, ResolvedPos } from 'prosemirror-model';
import { AddMarkStep, RemoveMarkStep } from 'prosemirror-transform';
import { EditorState, Plugin, Transaction } from 'prosemirror-state';
import { EditorView, MarkViewConstructor } from 'prosemirror-view';
import { faixasMudadas, linhasMexidas } from './ajustes';
import { schema } from './schema';

/**
 * Os links no Visual (PLANO-EDITOR-VISUAL.md, 5.2, 5.2.1, 5.10 e 5.11): o trecho de um link, o "[["
 * antes do cursor (a lista das anotações), o endereço solto que vira link no espaço ou no Enter, os
 * ajustes que deixam cada link escrevível (o colchete sai do link, a ponta de espaço sai, as marcas
 * valem no link inteiro, o título da anotação guardado) e o desenho do link de anotação, tracejado
 * quando ela não existe.
 */

const M = schema.marks;

/** O trecho do link (de `tipo`) onde está a posição: de dentro dele ou colada no fim. */
export function faixaDaMarca($p: ResolvedPos, tipo: MarkType): { from: number; to: number; mark: Mark } | null {
  const pai = $p.parent;
  if (!pai.inlineContent) return null;
  const off = $p.parentOffset;
  const filhos: { de: number; ate: number; n: PMNode }[] = [];
  pai.forEach((n, o) => filhos.push({ de: o, ate: o + n.nodeSize, n }));
  let i = filhos.findIndex((f) => f.de <= off && off < f.ate && tipo.isInSet(f.n.marks));
  if (i < 0) i = filhos.findIndex((f) => f.ate === off && tipo.isInSet(f.n.marks));
  if (i < 0) return null;
  const mark = tipo.isInSet(filhos[i].n.marks)!;
  let [a, b] = [i, i];
  while (a > 0 && mark.isInSet(filhos[a - 1].n.marks)) a--;
  while (b < filhos.length - 1 && mark.isInSet(filhos[b + 1].n.marks)) b++;
  return { from: $p.start() + filhos[a].de, to: $p.start() + filhos[b].ate, mark };
}

/** O link (para fora ou de anotação) onde está a posição. */
export function linkEm($p: ResolvedPos): { from: number; to: number; mark: Mark } | null {
  return faixaDaMarca($p, M['link']) ?? faixaDaMarca($p, M['elo']);
}

/** Onde não cabe link nem marca de texto: o bloco de código, o código na linha. */
const semLink = (state: EditorState, de: number, ate: number) =>
  !!state.doc.resolve(de).parent.type.spec.code || state.doc.rangeHasMark(de, ate, M['codigo']) || state.doc.rangeHasMark(de, ate, M['link']) || state.doc.rangeHasMark(de, ate, M['elo']);

/**
 * O "[[" aberto antes do cursor (sem fechar, sem "|", na mesma linha), fora do código e dos links: a
 * posição dele e o que vem depois (a busca da lista das anotações). Como o `watchLink` do Markdown.
 */
export function colchetesAntes(state: EditorState): { de: number; busca: string } | null {
  const sel = state.selection;
  if (!sel.empty) return null;
  const $c = sel.$from;
  if (!$c.parent.inlineContent || $c.parent.type.spec.code) return null;
  const antes = $c.parent.textBetween(Math.max(0, $c.parentOffset - 84), $c.parentOffset, undefined, '￼');
  const m = /\[\[([^[\]\n|]{0,80})$/.exec(antes);
  if (!m) return null;
  const de = $c.pos - m[0].length;
  return semLink(state, de, $c.pos) ? null : { de, busca: m[1] };
}

/** O endereço solto como a leitura o lê (o fim sem a pontuação, os parênteses só com par). */
const SOLTO = /^(?:https?:\/\/|www\.)(?:[^\s<>()[\]]|\([^\s<>()[\]]*\))*(?:[^\s<>()[\].,;:!?'"’”]|\([^\s<>()[\]]*\))/i;

/**
 * O endereço solto que termina logo antes de `pos` (https://… ou www.…, depois de um espaço ou no
 * começo da linha), fora do código e dos links: o trecho e o endereço do link. A pontuação do fim fica
 * de fora, como na leitura ("veja https://x.com." não leva o ponto).
 */
export function enderecoAntes(state: EditorState, pos: number): { from: number; to: number; href: string } | null {
  const $p = state.doc.resolve(pos);
  if (!$p.parent.inlineContent || $p.parent.type.spec.code) return null;
  const antes = $p.parent.textBetween(Math.max(0, $p.parentOffset - 2000), $p.parentOffset, undefined, '￼');
  const m = /(^|[\s(])((?:https?:\/\/|www\.)\S+)$/i.exec(antes);
  if (!m) return null;
  const achado = SOLTO.exec(m[2]);
  if (!achado) return null;
  const url = achado[0];
  const from = pos - m[2].length;
  const to = from + url.length;
  // "www." sozinho não é endereço; e o que já é link (ou código) fica como está
  if (/^(?:https?:\/\/|www\.)$/i.test(url) || semLink(state, from, to)) return null;
  return { from, to, href: /^www\./i.test(url) ? 'https://' + url : url };
}

/** Põe a marca do link no endereço solto que termina em `pos` (na transação dada). Devolve se pôs. */
export function linkarEndereco(tr: Transaction, pos: number, state: EditorState): boolean {
  const e = enderecoAntes(state, pos);
  if (!e) return false;
  tr.addMark(e.from, e.to, M['link'].create({ href: e.href }));
  return true;
}

/** O endereço solto vira link no espaço (o Backspace logo depois desfaz, e fica o texto). */
export const enderecoNoEspaco = (): InputRule =>
  new InputRule(/(?:https?:\/\/|www\.)\S+\s$/i, (state, match, start, end) => {
    const tr = state.tr;
    if (!linkarEndereco(tr, end, state)) return null;
    return tr.insertText(match[0].slice(-1), end);
  });

// ===== Os ajustes (5.2.1) =====

const ENFASES = ['negrito', 'italico', 'riscado', 'marca', 'spoiler', 'trechoSutil'] as const;

/** Os trechos e os tipos de marca que as transações tiraram (para o "tirar" valer no link inteiro). */
function marcasTiradas(trs: readonly Transaction[]): { from: number; to: number; tipo: MarkType }[] {
  const out: { from: number; to: number; tipo: MarkType }[] = [];
  for (const tr of trs) {
    for (const r of out) [r.from, r.to] = [tr.mapping.map(r.from, 1), tr.mapping.map(r.to, -1)];
    tr.steps.forEach((s, k) => {
      if (!(s instanceof RemoveMarkStep)) return;
      const depois = tr.mapping.slice(k + 1);
      out.push({ from: depois.map(s.from, 1), to: depois.map(s.to, -1), tipo: s.mark.type });
    });
  }
  return out;
}

/** Os trechos de marca postos ou tirados (que não mudam o conteúdo, e por isso não aparecem no mapa). */
function faixasDeMarca(trs: readonly Transaction[]): [number, number][] {
  const out: [number, number][] = [];
  for (const tr of trs) {
    for (let i = 0; i < out.length; i++) out[i] = [tr.mapping.map(out[i][0], -1), tr.mapping.map(out[i][1], 1)];
    tr.steps.forEach((s, k) => {
      if (!(s instanceof AddMarkStep) && !(s instanceof RemoveMarkStep)) return;
      const depois = tr.mapping.slice(k + 1);
      out.push([depois.map(s.from, -1), depois.map(s.to, 1)]);
    });
  }
  return out;
}

/**
 * Cada link na tela como o texto pode guardar (5.2.1): o colchete digitado dentro de um link sai dele
 * (o rótulo de um link não tem "[" nem "]"); os espaços das pontas saem do link; as marcas de texto
 * valem no link inteiro (pôr numa parte põe no link todo, tirar de uma parte tira do todo); o link de
 * anotação guarda o título (escrever no texto dele muda só o rótulo). Na linha mexida, fora da composição.
 */
export function ajustarLinks(tr: Transaction, linhas: readonly [PMNode, number][], tiradas: readonly { from: number; to: number; tipo: MarkType }[]): void {
  for (const [linha, pos] of linhas) {
    if (!linha.inlineContent || linha.type.spec.code) continue;
    const inicio = pos + 1;
    // os trechos de cada link (o mesmo link: a mesma marca, com os mesmos atributos)
    const trechos: { from: number; to: number; mark: Mark; filhos: { de: number; ate: number; n: PMNode }[] }[] = [];
    linha.forEach((n, o) => {
      const mark = n.marks.find((m) => m.type === M['link'] || m.type === M['elo']);
      const ultimo = trechos.at(-1);
      if (!mark) return;
      const f = { de: inicio + o, ate: inicio + o + n.nodeSize, n };
      if (ultimo && ultimo.to === f.de && mark.eq(ultimo.mark)) {
        ultimo.to = f.ate;
        ultimo.filhos.push(f);
      } else trechos.push({ from: f.de, to: f.ate, mark, filhos: [f] });
    });
    for (const t of trechos) {
      const texto = t.filhos.map((f) => f.n.text ?? '').join('');
      // o título guardado no link de anotação (o que veio sem ele, de um colar, fica com o texto)
      if (t.mark.type === M['elo'] && !t.mark.attrs['ref']) {
        const comTitulo = M['elo'].create({ ref: texto.trim() });
        tr.removeMark(t.from, t.to, M['elo']).addMark(t.from, t.to, comTitulo);
        t.mark = comTitulo;
      }
      // as marcas de texto no link inteiro
      for (const nome of ENFASES) {
        const tipo = M[nome];
        const com = t.filhos.filter((f) => tipo.isInSet(f.n.marks));
        if (!com.length || com.length === t.filhos.length) continue;
        const tirou = tiradas.some((r) => r.tipo === tipo && r.from < t.to && r.to > t.from);
        if (tirou) tr.removeMark(t.from, t.to, tipo);
        else tr.addMark(t.from, t.to, tipo.create());
      }
      // o colchete e as pontas de espaço saem do link
      const fora: [number, number][] = [];
      const lead = /^\s+/.exec(texto)?.[0].length ?? 0;
      const tail = /\s+$/.exec(texto)?.[0].length ?? 0;
      if (lead) fora.push([t.from, t.from + Math.min(lead, texto.length)]);
      if (tail && lead < texto.length) fora.push([t.to - tail, t.to]);
      for (let i = 0; i < texto.length; i++) if (texto[i] === '[' || texto[i] === ']') fora.push([t.from + i, t.from + i + 1]);
      for (const [a, b] of fora) tr.removeMark(a, b, t.mark.type);
    }
  }
}

/** O plugin dos ajustes dos links: espera a composição acabar (nada mexe no documento enquanto se compõe). */
export const linksInteiros = (): Plugin => {
  let vista: EditorView | null = null;
  return new Plugin({
    view(v) {
      vista = v;
      return { destroy: () => (vista = null) };
    },
    appendTransaction(trs, _velho, state) {
      if (vista?.composing || !trs.some((t) => t.docChanged || t.steps.some((s) => s instanceof AddMarkStep || s instanceof RemoveMarkStep))) return null;
      const linhas = linhasMexidas(state.doc, [...faixasMudadas(trs), ...faixasDeMarca(trs)]);
      if (!linhas.length) return null;
      const tr = state.tr;
      ajustarLinks(tr, linhas, marcasTiradas(trs));
      return tr.docChanged ? tr : null;
    },
  });
};

/**
 * O desenho do link de anotação: o mesmo da leitura (a caneta azul), e tracejado quando a anotação não
 * existe (`existe` diz; sem como saber, ele aparece como existe). O nome dela no `title`.
 */
export function eloView(existe: (titulo: string) => boolean | null): MarkViewConstructor {
  return (mark) => {
    const dom = document.createElement('span');
    const titulo: string = mark.attrs['ref'] ?? '';
    const ok = titulo ? existe(titulo) : null;
    dom.className = ok === false ? 'elo quebrado' : 'elo';
    dom.setAttribute('data-elo', '');
    if (titulo) dom.setAttribute('data-ref', titulo);
    dom.title = ok === false ? `A anotação “${titulo}” ainda não existe` : titulo ? `Link para a anotação “${titulo}”` : '';
    return { dom };
  };
}
