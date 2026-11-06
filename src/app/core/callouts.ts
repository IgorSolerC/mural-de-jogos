/**
 * Os cards do texto (o "callout" do Obsidian): um bloco de várias linhas num papel à parte, com um
 * título em cima. Escrito como no Obsidian, para a nota ir e vir de lá sem mudar:
 *
 *     > [!aviso] Antes de começar
 *     > A primeira linha do card.
 *     > - uma lista, uma tarefa, um widget: tudo o que o texto tem
 *
 * A linha de cima é a do jeito (`[!aviso]`) e do título (sem título, o nome do jeito; o Vazio não tem
 * nome de reserva, e sem título ele é só o papel); as de baixo, com
 * o "> " na frente, são o que tem dentro, lido como um texto à parte (ver `parseRich`). Um "-" depois
 * do jeito (`[!aviso]-`) faz o card começar fechado, e um "+", começar aberto, com o título para fechar.
 * O card acaba na primeira linha sem o ">" (ou na linha de outro card).
 *
 * Os jeitos têm os nomes daqui e os do Obsidian (`[!warning]` é o Aviso). Um nome que este site não
 * conhece fica escrito como está e tem a cara da Nota, como lá.
 *
 * O jeito dá o desenho, o nome e a cor do papel. A cor pode ser outra, escrita depois de uma barra, no
 * lugar que o Obsidian guarda para isso (`[!aviso|azul]`: lá ela é ignorada e o card continua Aviso). Um
 * dos dez papéis, ou `cartolina`, o papel do mesmo matiz da cartolina em que o card está. Uma palavra que
 * este site não conhece fica escrita como está, e o papel é o do jeito.
 */

export type CalloutLook = 'nota' | 'info' | 'dica' | 'feito' | 'pergunta' | 'aviso' | 'perigo' | 'exemplo' | 'estudo' | 'citacao' | 'vazio';

/** O papel de um card: um dos dez ou o da cartolina (a cor mora no CSS, `[data-jeito]`). O Estudo e o Vazio usam papéis que já existem. */
export type CalloutPaper = Exclude<CalloutLook, 'estudo' | 'vazio'> | 'rosa' | 'cartolina';

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
  /** O papel dele, sem cor própria. */
  paper: CalloutPaper;
}

/** Os jeitos, na ordem do menu. */
export const CALLOUTS: readonly CalloutDef[] = [
  { look: 'nota', name: 'Nota', about: 'Papel pardo, para o que vale guardar', aliases: ['note', 'nota'], paper: 'nota' },
  { look: 'info', name: 'Info', about: 'Azul, para explicar ou listar o que falta', aliases: ['info', 'informacao', 'todo', 'tarefa', 'tarefas'], paper: 'info' },
  { look: 'dica', name: 'Dica', about: 'Verde-água, para um atalho ou um resumo', aliases: ['tip', 'hint', 'important', 'importante', 'dica', 'abstract', 'summary', 'tldr', 'resumo'], paper: 'dica' },
  { look: 'feito', name: 'Feito', about: 'Verde, para o que deu certo', aliases: ['success', 'check', 'done', 'feito', 'ok', 'sucesso', 'certo'], paper: 'feito' },
  { look: 'pergunta', name: 'Pergunta', about: 'Amarelo de recado, para uma dúvida', aliases: ['question', 'help', 'faq', 'pergunta', 'duvida', 'ajuda'], paper: 'pergunta' },
  { look: 'aviso', name: 'Aviso', about: 'Laranja, para tomar cuidado', aliases: ['warning', 'caution', 'attention', 'aviso', 'atencao', 'cuidado'], paper: 'aviso' },
  { look: 'perigo', name: 'Perigo', about: 'Vermelho, para um erro ou um risco', aliases: ['danger', 'error', 'failure', 'fail', 'missing', 'bug', 'perigo', 'erro', 'falha'], paper: 'perigo' },
  { look: 'exemplo', name: 'Exemplo', about: 'Lilás, para mostrar como é', aliases: ['example', 'exemplo'], paper: 'exemplo' },
  { look: 'estudo', name: 'Estudo', about: 'Rosa, com um livro, para o que se estuda', aliases: ['study', 'estudo', 'estudos', 'estudar'], paper: 'rosa' },
  { look: 'citacao', name: 'Citação', about: 'Cinza, para o que alguém disse', aliases: ['quote', 'cite', 'citacao', 'citar'], paper: 'citacao' },
  { look: 'vazio', name: 'Vazio', about: 'Cinza e sem desenho, para o texto sem rótulo', aliases: ['blank', 'vazio', 'empty', 'sem-icone'], paper: 'citacao' },
];

/** O jeito novo do Inserir › Card (cada jeito se escreve com o próprio nome: `[!aviso]`). */
export const DEFAULT_CALLOUT: CalloutLook = 'nota';

/** Uma cor que se escolhe para o card: a palavra escrita depois da barra, o nome e o papel dela. */
export interface CalloutColorDef {
  word: string;
  name: string;
  paper: CalloutPaper;
}

/** Os dez papéis, na ordem dos jeitos: a cor de cada um, com o nome da cor (o Vazio divide o cinza com a Citação). */
export const CALLOUT_PAPERS: readonly CalloutColorDef[] = [
  { word: 'pardo', name: 'Pardo', paper: 'nota' },
  { word: 'azul', name: 'Azul', paper: 'info' },
  { word: 'verde-agua', name: 'Verde-água', paper: 'dica' },
  { word: 'verde', name: 'Verde', paper: 'feito' },
  { word: 'amarelo', name: 'Amarelo', paper: 'pergunta' },
  { word: 'laranja', name: 'Laranja', paper: 'aviso' },
  { word: 'vermelho', name: 'Vermelho', paper: 'perigo' },
  { word: 'lilas', name: 'Lilás', paper: 'exemplo' },
  { word: 'rosa', name: 'Rosa', paper: 'rosa' },
  { word: 'cinza', name: 'Cinza', paper: 'citacao' },
];

/** A cor do mesmo matiz da cartolina em que o card está. */
export const CALLOUT_CARTOLINA: CalloutColorDef = { word: 'cartolina', name: 'Cor da cartolina', paper: 'cartolina' };

/** O nome dela onde a palavra "cor" já está dita (o botão do Visual, o título da seção do menu). */
export const CALLOUT_CARTOLINA_SHORT = 'Cartolina';

/** O nome do "sem cor própria" (a palavra é vazia: a linha de cima fica sem a barra). */
export const CALLOUT_DEFAULT_COLOR_NAME = 'Padrão';

/** A cor do card novo do Inserir › Card (o escrito à mão sem a barra fica com a do jeito). */
export const NEW_CALLOUT_COLOR = CALLOUT_CARTOLINA.word;

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

/**
 * O que aparece no lugar do título, no card escrito sem ele: o nome do jeito. O Vazio não tem nada: a
 * palavra "Vazio" em cima do texto de um card estaria mentindo, e ele fica só com o papel.
 */
export function calloutFallbackTitle(type: string): string {
  return calloutLook(type) === 'vazio' ? '' : calloutName(type);
}

/**
 * A cor escrita depois da barra, como este site a chama ("Lilás" → "lilas"); o nome de um jeito também
 * vale ("[!nota|perigo]" é o vermelho). "": sem cor própria, ou uma palavra que este site não conhece.
 */
export function calloutColorWord(written: string): string {
  const w = fold(written);
  if (w === CALLOUT_CARTOLINA.word) return w;
  if (CALLOUT_PAPERS.some((c) => c.word === w)) return w;
  const paper = calloutDef(w)?.paper;
  return CALLOUT_PAPERS.find((c) => c.paper === paper)?.word ?? '';
}

/** O nome curto da cor, pela palavra dela (`calloutColorWord`); sem cor própria, "Padrão". */
export function calloutColorName(word: string): string {
  if (word === CALLOUT_CARTOLINA.word) return CALLOUT_CARTOLINA_SHORT;
  return CALLOUT_PAPERS.find((c) => c.word === word)?.name ?? CALLOUT_DEFAULT_COLOR_NAME;
}

/** O papel do card: o da cor escrita ou, sem ela, o do jeito. */
export function calloutPaper(type: string, color: string): CalloutPaper {
  const word = calloutColorWord(color);
  if (word === CALLOUT_CARTOLINA.word) return CALLOUT_CARTOLINA.paper;
  return CALLOUT_PAPERS.find((c) => c.word === word)?.paper ?? calloutDef(type)?.paper ?? 'nota';
}

/** O "[!jeito|cor]-" da linha de cima, sem o "> " nem o título. */
export function calloutMark(type: string, foldMark: CalloutFold, color = ''): string {
  return `[!${type}${color ? '|' + color : ''}]${foldMark}`;
}

/** A linha de cima do card: o jeito, a cor, o "-"/"+" e o título (sem marcas: o título já vem escrito). */
export function calloutHead(type: string, foldMark: CalloutFold, title: string, color = ''): string {
  return `> ${calloutMark(type, foldMark, color)}${title ? ' ' + title : ''}`;
}
