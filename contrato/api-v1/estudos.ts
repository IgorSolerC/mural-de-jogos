/**
 * Os Estudos como a API das AIs mostra (PLANO-API.md, seção 23, rodada 12): as cartas (cada uma é uma
 * anotação com uma frente; o verso é o texto dela), os baralhos e a fila do dia. Formato público e
 * estável v1: o site monta com as contas da própria tela (o FSRS em core/fsrs.ts, a fila em
 * core/study-queue.ts) e manda ao espelho; a API só serve, e só separa da fila do dia o que é para agora
 * (`filaDeAgora`). Só tipos e funções puras.
 */

import type { CorV1 } from './calendario';

/** O nível da carta, as quatro palavras da tela: nunca respondida, nos passos do dia, aprendendo, 21 dias ou mais. */
export type NivelV1 = 'desconhecida' | 'nova' | 'aprendendo' | 'dominada';
export const NIVEIS: readonly NivelV1[] = ['desconhecida', 'nova', 'aprendendo', 'dominada'];

/** O estado do FSRS: nova (nunca respondida), aprendendo e reaprendendo (nos passos de minutos), revisao (vence num dia). */
export type EstadoDaCartaV1 = 'nova' | 'aprendendo' | 'revisao' | 'reaprendendo';
export const ESTADOS_DA_CARTA: readonly EstadoDaCartaV1[] = ['nova', 'aprendendo', 'revisao', 'reaprendendo'];

/** O desenho da frente das cartas de um baralho (os dez da folha do baralho). */
export type EstiloV1 = 'classica' | 'faixa' | 'cartolina' | 'orelha' | 'antigo' | 'argola' | 'selo' | 'polaroid' | 'ingresso' | 'biblioteca';
export const ESTILOS: readonly EstiloV1[] = ['classica', 'faixa', 'cartolina', 'orelha', 'antigo', 'argola', 'selo', 'polaroid', 'ingresso', 'biblioteca'];

/** Como as novas entram: na ordem em que viraram carta, ou num sorteio do dia. */
export type OrdemDasNovasV1 = 'entrada' | 'sorteio';

/** O que a carta é na fila: nova (a primeira vez), aprender (nos passos de 1 e 10 minutos), revisao. */
export type TipoNaFilaV1 = 'nova' | 'aprender' | 'revisao';

/** Os tamanhos de sempre do app (core/study.ts). */
export const BARALHOS_MAX = 100;
export const CARTAS_MAX = 5000;
export const BARALHOS_POR_CARTA = 20;
export const NOME_DO_BARALHO_MAX = 40;
export const TITULO_DA_FRENTE_MAX = 80;
export const SUBTITULO_MAX = 160;
export const NOVAS_POR_DIA_MAX = 999;
/** As últimas respostas que o boletim guarda. */
export const ULTIMAS_MAX = 20;
/** Quantas cartas, no máximo, a fila de um dia leva ao espelho (as outras ficam para quando estas saírem). */
export const FILA_MAX = 300;
/** Quanto antes a carta nos passos pode aparecer quando não há mais nada (o "aprender adiantado" do app). */
export const ADIANTADO_MS = 20 * 60_000;
/** O dia de estudo vira às 4h da manhã, como no Anki. */
export const DIA_VIRA_AS = 4;

/** O id da linha de contexto dos Estudos. */
export const CONTEXTO_ESTUDOS = 'estudos';

export interface ItemDaFilaV1 {
  /** O id da anotação (a carta). */
  nota: string;
  /** O baralho que traz a carta (na nova, o que conta no limite de novas do dia). */
  baralho: string;
  tipo: TipoNaFilaV1;
  /** Só na de aprender: quando ela volta (a hora exata); null nas outras. */
  volta_em: string | null;
}

/** A fila de um dia de estudo inteiro, como o app monta (as cartas nos passos com a hora em que voltam). */
export interface FilaDoDiaV1 {
  /** O dia de estudo (AAAA-MM-DD; vira às 4h). */
  dia: string;
  /** Na ordem em que o app mostra: as de aprender pela hora, depois revisões e novas intercaladas. */
  itens: ItemDaFilaV1[];
  /** Havia mais cartas que `FILA_MAX`: as que faltam entram quando estas saírem. */
  cortada: boolean;
}

export interface ContagemV1 {
  novas: number;
  aprender: number;
  revisar: number;
}

export interface CartaV1 {
  /** O id da anotação: a carta é a própria anotação. */
  nota: string;
  /** O título que a frente mostra: o da frente, ou o nome da anotação. */
  titulo: string;
  /** O título próprio da frente (null: usa o nome da anotação). */
  titulo_da_frente: string | null;
  subtitulo: string | null;
  /** A imagem da frente: um link https, ou murall://imagem/ID (guardada pelo Murall). */
  imagem: string | null;
  /** O nome da anotação. */
  nota_titulo: string;
  /** O verso: o texto da anotação, no markdown do Murall. */
  verso: string;
  /** O grupo da anotação. */
  grupo: string | null;
  /** Os ids dos baralhos, na ordem em que a carta entrou neles. */
  baralhos: string[];
  /** A escolha da carta: true aparece também no mural, false só nos Estudos, null segue os baralhos. */
  no_mural: boolean | null;
  /** O que vale agora pelos Estudos (a escolha da carta, ou a dos baralhos). O Kanban também vota. */
  fica_no_mural: boolean;
  nivel: NivelV1;
  estado: EstadoDaCartaV1;
  /** Quando volta (a hora exata nos passos; o começo do dia na revisão); null na nova. */
  volta_em: string | null;
  vistas: number;
  acertos: number;
  erros: number;
  /** As últimas respostas, da mais antiga para a mais nova: "1" acertou, "0" errou. */
  ultimas: string;
  /** Quando virou carta. */
  entrou_em: string;
  /** A última mudança da carta (a hora da resposta, da frente, dos baralhos). */
  versao: string;
}

export interface BaralhoV1 {
  id: string;
  nome: string;
  cor: CorV1;
  /** O desenho da cartela escolhido na tela; null sem ele. Só se escolhe no app. */
  icone: string | null;
  novas_por_dia: number;
  /** As cartas do baralho aparecem também no mural (a carta pode dizer outra coisa). */
  no_mural: boolean;
  estilo: EstiloV1;
  /** O lugar na fileira das abas (0 é a primeira). */
  posicao: number;
  /** Quantas cartas (de anotações que existem). */
  cartas: number;
  por_nivel: Record<NivelV1, number>;
  /** A fila deste baralho (o Estudar do baralho): a de hoje e a de amanhã. */
  filas: FilaDoDiaV1[];
  versao: string;
}

export interface ConfigDosEstudosV1 {
  /** A retenção desejada do FSRS (0,80 a 0,95). */
  retencao: number;
  /** O teto de revisões por dia, somando os baralhos. */
  revisoes_por_dia: number;
  ordem_das_novas: OrdemDasNovasV1;
}

export interface ContextoEstudosV1 {
  config: ConfigDosEstudosV1;
  /** Quantas cartas ao todo. */
  cartas: number;
  /** A fila de todos os baralhos juntos (o Estudar tudo, a carta de dois baralhos uma vez só): hoje e amanhã. */
  filas: FilaDoDiaV1[];
}

/** O dia de estudo de agora no fuso da conta (`hojeNoFuso` dá o dia do calendário de um instante). */
export function diaDeEstudo(agora: Date, hojeNoFuso: (d: Date) => string): string {
  return hojeNoFuso(new Date(agora.getTime() - DIA_VIRA_AS * 3_600_000));
}

/** A fila de hoje entre as que vieram (null: nenhuma é de hoje; o Murall ficou fechado mais de um dia). */
export function filaDoDia(filas: readonly FilaDoDiaV1[], dia: string): FilaDoDiaV1 | null {
  return filas.find((f) => f.dia === dia) ?? null;
}

export interface FilaDeAgoraV1 {
  /** O que o Estudar mostraria agora, na ordem: as de aprender que já voltaram, revisões e novas, as de aprender dos próximos 20 minutos. */
  agora: ItemDaFilaV1[];
  /** As de aprender que voltam mais tarde hoje. */
  mais_tarde: ItemDaFilaV1[];
  contagem: ContagemV1;
}

/**
 * Da fila do dia, o que é para agora (como o `nextUp` do app pergunta a cada carta), sem as de `fora` (as
 * respondidas ou tiradas por um pedido que ainda não entrou).
 */
export function filaDeAgora(fila: FilaDoDiaV1, agora: Date, fora: ReadonlySet<string> = new Set()): FilaDeAgoraV1 {
  const t = agora.getTime();
  const itens = fila.itens.filter((i) => !fora.has(i.nota));
  const quando = (i: ItemDaFilaV1) => (i.volta_em ? Date.parse(i.volta_em) : 0);
  const aprender = itens.filter((i) => i.tipo === 'aprender').sort((a, b) => quando(a) - quando(b) || a.nota.localeCompare(b.nota));
  const resto = itens.filter((i) => i.tipo !== 'aprender');
  const ja = aprender.filter((i) => quando(i) <= t);
  const logo = aprender.filter((i) => quando(i) > t && quando(i) <= t + ADIANTADO_MS);
  const depois = aprender.filter((i) => quando(i) > t + ADIANTADO_MS);
  return {
    agora: [...ja, ...resto, ...logo],
    mais_tarde: depois,
    contagem: {
      novas: resto.filter((i) => i.tipo === 'nova').length,
      aprender: ja.length + logo.length,
      revisar: resto.filter((i) => i.tipo === 'revisao').length,
    },
  };
}
