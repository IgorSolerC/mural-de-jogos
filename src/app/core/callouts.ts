/**
 * Os cards do texto (o "callout" do Obsidian): um bloco de várias linhas num papel à parte, com um
 * título em cima. Escrito como no Obsidian, para a nota ir e vir de lá sem mudar:
 *
 *     > [!aviso] Antes de começar
 *     > A primeira linha do card.
 *     > - uma lista, uma tarefa, um widget: tudo o que o texto tem
 *
 * A linha de cima é a do jeito (`[!aviso]`) e do título (sem título, o nome do jeito); as de baixo, com
 * o "> " na frente, são o que tem dentro, lido como um texto à parte (ver `parseRich`). Um "-" depois
 * do jeito (`[!aviso]-`) faz o card começar fechado, e um "+", começar aberto, com o título para fechar.
 * O card acaba na primeira linha sem o ">" (ou na linha de outro card).
 *
 * Os jeitos têm os nomes daqui e os do Obsidian (`[!warning]` é o Aviso). Um nome que este site não
 * conhece fica escrito como está e tem a cara da Nota, como lá.
 */

export type CalloutLook = 'nota' | 'info' | 'dica' | 'feito' | 'pergunta' | 'aviso' | 'perigo' | 'exemplo' | 'citacao';

/** "-": começa fechado; "+": começa aberto, com o título para fechar; "": sempre aberto. */
export type CalloutFold = '' | '+' | '-';

export interface CalloutDef {
  look: CalloutLook;
  /** O nome que aparece (e o título do card escrito sem título). */
  name: string;
  /** Do que ele serve, numa linha (o menu do card). */
  about: string;
  /** Os outros nomes que dão nele: os do Obsidian e os jeitos de escrever daqui. */
  aliases: readonly string[];
}

/** Os jeitos, na ordem do menu. */
export const CALLOUTS: readonly CalloutDef[] = [
  { look: 'nota', name: 'Nota', about: 'Papel pardo, para o que vale guardar', aliases: ['note', 'nota'] },
  { look: 'info', name: 'Info', about: 'Azul, para explicar ou listar o que falta', aliases: ['info', 'informacao', 'todo', 'tarefa', 'tarefas'] },
  { look: 'dica', name: 'Dica', about: 'Verde-água, para um atalho ou um resumo', aliases: ['tip', 'hint', 'important', 'importante', 'dica', 'abstract', 'summary', 'tldr', 'resumo'] },
  { look: 'feito', name: 'Feito', about: 'Verde, para o que deu certo', aliases: ['success', 'check', 'done', 'feito', 'ok', 'sucesso', 'certo'] },
  { look: 'pergunta', name: 'Pergunta', about: 'Amarelo de recado, para uma dúvida', aliases: ['question', 'help', 'faq', 'pergunta', 'duvida', 'ajuda'] },
  { look: 'aviso', name: 'Aviso', about: 'Laranja, para tomar cuidado', aliases: ['warning', 'caution', 'attention', 'aviso', 'atencao', 'cuidado'] },
  { look: 'perigo', name: 'Perigo', about: 'Vermelho, para um erro ou um risco', aliases: ['danger', 'error', 'failure', 'fail', 'missing', 'bug', 'perigo', 'erro', 'falha'] },
  { look: 'exemplo', name: 'Exemplo', about: 'Lilás, para mostrar como é', aliases: ['example', 'exemplo'] },
  { look: 'citacao', name: 'Citação', about: 'Cinza, para o que alguém disse', aliases: ['quote', 'cite', 'citacao', 'citar'] },
];

/** O jeito novo do Inserir › Card (cada jeito se escreve com o próprio nome: `[!aviso]`). */
export const DEFAULT_CALLOUT: CalloutLook = 'nota';

/** O nome sem maiúsculas nem acentos ("Atenção" → "atencao"). */
function fold(word: string): string {
  return word
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
}

const BY_ALIAS = new Map(CALLOUTS.flatMap((d) => d.aliases.map((a) => [a, d] as const)));

/** O jeito escrito no card ("warning", "Aviso"); o que este site não conhece é null (tem a cara da Nota). */
export function calloutDef(type: string): CalloutDef | null {
  return BY_ALIAS.get(fold(type)) ?? null;
}

/** A cara do card do jeito escrito (o desconhecido, a da Nota). */
export function calloutLook(type: string): CalloutLook {
  return calloutDef(type)?.look ?? 'nota';
}

/**
 * O título que aparece no card escrito sem título: o nome do jeito ("Aviso"), ou a palavra escrita com a
 * primeira letra grande ("[!jogo]" é "Jogo"), como no Obsidian.
 */
export function calloutName(type: string): string {
  const def = calloutDef(type);
  if (def) return def.name;
  const t = type.replace(/[-_]+/g, ' ').trim();
  return t ? t[0].toLocaleUpperCase('pt-BR') + t.slice(1) : 'Nota';
}

/** A linha de cima do card: o jeito, o "-"/"+" e o título (sem marcas: o título já vem escrito). */
export function calloutHead(type: string, foldMark: CalloutFold, title: string): string {
  return `> [!${type}]${foldMark}${title ? ' ' + title : ''}`;
}
