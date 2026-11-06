import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import c from 'highlight.js/lib/languages/c';
import cpp from 'highlight.js/lib/languages/cpp';
import csharp from 'highlight.js/lib/languages/csharp';
import css from 'highlight.js/lib/languages/css';
import dart from 'highlight.js/lib/languages/dart';
import diff from 'highlight.js/lib/languages/diff';
import dockerfile from 'highlight.js/lib/languages/dockerfile';
import go from 'highlight.js/lib/languages/go';
import ini from 'highlight.js/lib/languages/ini';
import java from 'highlight.js/lib/languages/java';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import kotlin from 'highlight.js/lib/languages/kotlin';
import markdown from 'highlight.js/lib/languages/markdown';
import php from 'highlight.js/lib/languages/php';
import powershell from 'highlight.js/lib/languages/powershell';
import python from 'highlight.js/lib/languages/python';
import ruby from 'highlight.js/lib/languages/ruby';
import rust from 'highlight.js/lib/languages/rust';
import scss from 'highlight.js/lib/languages/scss';
import sql from 'highlight.js/lib/languages/sql';
import swift from 'highlight.js/lib/languages/swift';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';
import type { CodeRange } from './code-highlight';

/**
 * O colorir do bloco de código (só chega quando um bloco com linguagem aparece, ver core/code-highlight.ts):
 * o highlight.js com as gramáticas da lista de core/code-langs.ts. Ele devolve o texto em HTML (com as
 * letras escapadas); aqui ele vira pedaços (do índice tal ao tal, com a classe da tinta), e quem desenha
 * monta os elementos: nenhum HTML vai para a página.
 */

const GRAMMARS = { bash, c, cpp, csharp, css, dart, diff, dockerfile, go, ini, java, javascript, json, kotlin, markdown, php, powershell, python, ruby, rust, scss, sql, swift, typescript, xml, yaml };
for (const [name, fn] of Object.entries(GRAMMARS)) hljs.registerLanguage(name, fn);

/**
 * Cada nome do highlight.js numa das tintas da papelaria (ui/_formatado.scss): a palavra da linguagem
 * (roxo), o texto entre aspas (verde), o número e o verdadeiro/falso (vermelho), a função (azul), o tipo
 * e o atributo (ocre), o comentário (lápis), o que vem antes do código (cinza). "" é a tinta de sempre (o
 * de dentro de um texto com `${}` volta a ela); o nome que não está aqui fica com a tinta de quem está em volta.
 */
const TOKEN_CLASS: Record<string, string> = {
  keyword: 'tk-pal',
  'selector-tag': 'tk-pal',
  doctag: 'tk-pal',
  'template-tag': 'tk-pal',
  name: 'tk-pal',
  bullet: 'tk-pal',
  operator: '',
  punctuation: '',
  subst: '',
  params: '',
  tag: '',
  string: 'tk-txt',
  regexp: 'tk-txt',
  symbol: 'tk-txt',
  char: 'tk-txt',
  link: 'tk-txt',
  code: 'tk-txt',
  'selector-attr': 'tk-txt',
  'template-variable': 'tk-txt',
  number: 'tk-num',
  literal: 'tk-num',
  'variable.constant': 'tk-num',
  title: 'tk-fun',
  'title.function': 'tk-fun',
  'title.function.invoke': 'tk-fun',
  function: 'tk-fun',
  section: 'tk-fun',
  'selector-id': 'tk-fun',
  'selector-class': 'tk-fun',
  'title.class': 'tk-tip',
  'title.class.inherited': 'tk-tip',
  type: 'tk-tip',
  built_in: 'tk-tip',
  class: 'tk-tip',
  'variable.language': 'tk-tip',
  'selector-pseudo': 'tk-tip',
  attr: 'tk-atr',
  attribute: 'tk-atr',
  property: 'tk-atr',
  variable: 'tk-atr',
  comment: 'tk-com',
  quote: 'tk-com',
  meta: 'tk-met',
  'meta.keyword': 'tk-pal',
  'meta.string': 'tk-txt',
  'meta.prompt': 'tk-met',
  deletion: 'tk-del',
  addition: 'tk-add',
  emphasis: 'tk-it',
  strong: 'tk-ng',
};

/** A tinta de um `class="hljs-title function_"`: o nome com o sub-nome primeiro, depois só o nome; undefined, herda. */
function classOf(attr: string): string | undefined {
  const parts = attr.split(/\s+/);
  const scope = parts.find((p) => p.startsWith('hljs-'))?.slice(5);
  if (!scope) return undefined;
  const subs = parts.filter((p) => /_+$/.test(p)).map((p) => p.replace(/_+$/, ''));
  for (let k = subs.length; k >= 0; k--) {
    const key = [scope, ...subs.slice(0, k)].join('.');
    if (key in TOKEN_CLASS) return TOKEN_CLASS[key];
  }
  return undefined;
}

const ENTITY: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#x27': "'", '#39': "'" };
const PIECE = /<span class="([^"]*)">|<\/span>|&(amp|lt|gt|quot|#x27|#39);|[^<&]+|[<&]/g;

/** O HTML do highlight.js em pedaços do texto: cada trecho com a tinta do nome mais de dentro que tem uma. */
export function rangesOfHtml(html: string): CodeRange[] {
  const out: CodeRange[] = [];
  const stack: (string | undefined)[] = [];
  let at = 0;
  const now = () => {
    for (let k = stack.length - 1; k >= 0; k--) if (stack[k] !== undefined) return stack[k]!;
    return '';
  };
  const push = (len: number) => {
    const c = now();
    if (c && len) {
      const last = out.at(-1);
      if (last && last.c === c && last.ate === at) last.ate += len;
      else out.push({ de: at, ate: at + len, c });
    }
    at += len;
  };
  for (const m of html.matchAll(PIECE)) {
    if (m[1] !== undefined) {
      // a palavra dentro de um literal ("true" no JSON vem como literal › keyword) fica com a tinta do literal
      const own = classOf(m[1]);
      stack.push(own === 'tk-pal' && stack.at(-1) === 'tk-num' ? 'tk-num' : own);
    }
    else if (m[0] === '</span>') stack.pop();
    else if (m[2] !== undefined) push(ENTITY[m[2]].length);
    else push(m[0].length);
  }
  return out;
}

/** O colorir tem a gramática `id` (a lista de core/code-langs.ts e as daqui têm de bater: o spec confere). */
export function hasGrammar(id: string): boolean {
  return !!hljs.getLanguage(id);
}

/**
 * As palavras de controle, que o highlight.js não separa das outras palavras da linguagem: o tema do VS Code
 * as pinta à parte (a classe `tk-ctl` só muda a tinta de quem a define). No SQL, "from" e "case" não são isso.
 */
const CONTROL = new Set(['if', 'else', 'elif', 'elsif', 'unless', 'switch', 'case', 'default', 'match', 'when', 'for', 'foreach', 'while', 'do', 'loop', 'break', 'continue', 'return', 'throw', 'throws', 'rethrow', 'raise', 'try', 'catch', 'except', 'finally', 'guard', 'defer', 'yield', 'await', 'import', 'export', 'from', 'using', 'package', 'include', 'require', 'pass', 'goto']);

/** Os pedaços coloridos do texto na gramática `id` (um nome que ela não conhece: nenhum). */
export function colorir(text: string, id: string): CodeRange[] {
  if (!hljs.getLanguage(id)) return [];
  const out = rangesOfHtml(hljs.highlight(text, { language: id, ignoreIllegals: true }).value);
  if (id !== 'sql') for (const r of out) if (r.c === 'tk-pal' && CONTROL.has(text.slice(r.de, r.ate))) r.c = 'tk-pal tk-ctl';
  return out;
}
