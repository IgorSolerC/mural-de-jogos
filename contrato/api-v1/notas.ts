/**
 * A nota (anotação) e o contexto como a API das AIs mostra (PLANO-API.md, 7.2 e 8): o formato público
 * e estável v1, que não muda quando o formato interno do Murall muda. O site monta (a partir das
 * fichas) e manda para o espelho; a API serve. Só tipos e funções puras.
 */

export type VisibilidadeV1 = 'privada' | 'publica';
export type ImportanciaV1 = 'critico' | 'importante' | 'medio' | 'baixo' | 'baixissimo';

export interface NotaV1 {
  id: string;
  titulo: string;
  /** O markdown do Murall, com os widgets de uma linha (`{{contador: 25/12 | Natal}}`). */
  texto: string;
  grupo: string | null;
  assunto: string | null;
  tags: string[];
  /** A data da anotação: `AAAA`, `AAAA-MM` ou `AAAA-MM-DD`. */
  data: string | null;
  /** Quando foi finalizada (ISO); null = aberta. */
  finalizada_em: string | null;
  fixada: boolean;
  visibilidade: VisibilidadeV1;
  capa: string | null;
  /** As tarefas (`- [ ]` / `- [x]`) do texto. */
  tarefas: { feitas: number; total: number };
  /** O cartão no Kanban do grupo, se a nota está num quadro. */
  kanban: { coluna: string; importancia: ImportanciaV1 | null; status: string | null; no_mural: boolean } | null;
  criada_em: string;
  /** A versão que se manda de volta ao editar: muda a cada mudança da nota. */
  versao: string;
}

/** A nota na lista: o texto vira um resumo, a não ser que se peça inteiro. */
export interface NotaResumoV1 extends Omit<NotaV1, 'texto'> {
  resumo: string;
  texto?: string;
}

/** O vocabulário de um grupo das Anotações. */
export interface GrupoV1 {
  nome: string;
  notas: number;
  assuntos: string[];
  /** As tags usadas nas notas do grupo, da mais usada para a menos. */
  tags: { nome: string; notas: number }[];
}

/** O vocabulário da conta nas Anotações: o que a AI deve usar em vez de inventar (`ver_contexto`). */
export interface ContextoNotasV1 {
  grupos: GrupoV1[];
  /** As notas sem grupo. */
  sem_grupo: { notas: number; tags: { nome: string; notas: number }[] };
  /** As tags fixas (Ajustes): ficam à mão mesmo sem nota usando. */
  tags_fixas: string[];
}

/** O tamanho do resumo na lista. */
export const RESUMO_MAX = 280;

/** As primeiras letras do texto, numa linha só, sem cortar palavra no meio. */
export function resumo(texto: string, max = RESUMO_MAX): string {
  const linha = texto.replace(/\s+/g, ' ').trim();
  if (linha.length <= max) return linha;
  const corte = linha.slice(0, max);
  const espaco = corte.lastIndexOf(' ');
  return `${(espaco > max * 0.6 ? corte.slice(0, espaco) : corte).trimEnd()}…`;
}

/**
 * Os tipos de linha que o espelho guarda: os das Anotações (`nota`, `contexto`) e os dos Gastos
 * (`lancamento`, `visao` de cada mês, `contexto-gastos`; ver contrato/api-v1/gastos.ts).
 */
export const TIPOS_DO_ESPELHO = ['nota', 'contexto', 'lancamento', 'visao', 'contexto-gastos'] as const;
export type TipoDoEspelho = (typeof TIPOS_DO_ESPELHO)[number];

/** O id da linha de contexto das Anotações. */
export const CONTEXTO_NOTAS = 'notas';

/** Os itens por envio ao espelho (a CPU de 10 ms do Worker grátis; PLANO-API.md, seção 23). */
export const ESPELHO_POR_ENVIO = 50;
