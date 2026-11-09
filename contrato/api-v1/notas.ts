/**
 * A nota (anotação) e o contexto como a API das AIs mostra (PLANO-API.md, 7.2 e 8): o formato público
 * e estável v1, que não muda quando o formato interno do Murall muda. O site monta (a partir das
 * fichas) e manda para o espelho; a API serve. Só tipos e funções puras.
 */

import { dobra } from './escopos';

export type VisibilidadeV1 = 'privada' | 'publica';
export type ImportanciaV1 = 'critico' | 'importante' | 'medio' | 'baixo' | 'baixissimo';

export interface NotaV1 {
  id: string;
  titulo: string;
  /** O markdown do Murall, com os widgets de uma linha (`{{contador: 25/12 | Natal}}`). */
  texto: string;
  grupo: string | null;
  /** A pasta da nota, dentro do grupo: o id e o caminho, da de cima até ela; null, solta na raiz do grupo. */
  pasta: PastaDaNotaV1 | null;
  /** Obsoleto (o nome da pasta de cima, `pasta.caminho[0]`): fica para quem já usava. */
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

/**
 * A pasta de uma nota: o id e o caminho ("Programação", "Funcional"). O id é null enquanto a pasta só
 * existe num pedido que o Murall ainda não aplicou (ele cria a que falta).
 */
export interface PastaDaNotaV1 {
  id: string | null;
  caminho: string[];
}

/** Uma pasta do vocabulário: o id, o nome, a de cima (null: na raiz do grupo) e quantas notas tem, com as de dentro. */
export interface PastaV1 {
  id: string;
  nome: string;
  pai: string | null;
  notas: number;
}

/**
 * A nota como o espelho guarda: a pasta só pelo id. O nome e o caminho moram no contexto (uma linha só), e
 * a API monta `pasta` e `assunto` ao responder: renomear ou mover uma pasta não regrava nenhuma nota.
 */
export type NotaNoEspelhoV1 = Omit<NotaV1, 'pasta' | 'assunto'> & { pasta_id: string | null };

/** A nota na lista: o texto vira um resumo, a não ser que se peça inteiro. */
export interface NotaResumoV1 extends Omit<NotaV1, 'texto'> {
  resumo: string;
  texto?: string;
}

/** O vocabulário de um grupo das Anotações. */
export interface GrupoV1 {
  nome: string;
  notas: number;
  /** As pastas do grupo, todas (de qualquer nível), cada uma com a de cima. */
  pastas: PastaV1[];
  /** Obsoleto: os nomes das pastas de cima. */
  assuntos: string[];
  /** As tags usadas nas notas do grupo, da mais usada para a menos. */
  tags: { nome: string; notas: number }[];
}

/** O vocabulário da conta nas Anotações: o que a AI deve usar em vez de inventar (`ver_contexto`). */
export interface ContextoNotasV1 {
  grupos: GrupoV1[];
  /** As notas sem grupo. */
  sem_grupo: { notas: number; tags: { nome: string; notas: number }[]; pastas?: PastaV1[] };
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
 * Os tipos de linha que o espelho guarda: os das Anotações (`nota`, `contexto`), os dos Gastos
 * (`lancamento`, `visao` de cada mês, `contexto-gastos`; ver contrato/api-v1/gastos.ts), o do Kanban
 * (`quadro`, um por grupo; ver contrato/api-v1/kanban.ts) e os do Calendário (`lembrete`, `agenda` de
 * cada mês; ver contrato/api-v1/calendario.ts) e os dos murais de resenhas (`desejo`, `pra-depois`, `ficha`,
 * `contexto-fichas`; ver contrato/api-v1/murais.ts) e os dos Estudos (`carta`, `baralho`, `contexto-estudos`; ver
 * contrato/api-v1/estudos.ts).
 */
export const TIPOS_DO_ESPELHO = ['nota', 'contexto', 'lancamento', 'visao', 'contexto-gastos', 'quadro', 'lembrete', 'agenda', 'desejo', 'pra-depois', 'ficha', 'contexto-fichas', 'carta', 'baralho', 'contexto-estudos'] as const;
export type TipoDoEspelho = (typeof TIPOS_DO_ESPELHO)[number];

/** O id da linha de contexto das Anotações. */
export const CONTEXTO_NOTAS = 'notas';

/** Os itens por envio ao espelho (a CPU de 10 ms do Worker grátis; PLANO-API.md, seção 23). */
export const ESPELHO_POR_ENVIO = 50;

// ===== As pastas (PLANO-PASTAS.md, seção 5) =====

/** Uma pasta no índice do contexto, com o grupo dela (null: as sem grupo). */
export interface PastaNoIndiceV1 {
  nome: string;
  pai: string | null;
  grupo: string | null;
}

/** As pastas do contexto pelo id (sem o contexto, nenhuma). */
export function indiceDasPastas(ctx: Pick<ContextoNotasV1, 'grupos' | 'sem_grupo'> | null): Map<string, PastaNoIndiceV1> {
  const out = new Map<string, PastaNoIndiceV1>();
  if (!ctx) return out;
  for (const g of ctx.grupos) for (const p of g.pastas ?? []) out.set(p.id, { nome: p.nome, pai: p.pai, grupo: g.nome });
  for (const p of ctx.sem_grupo.pastas ?? []) out.set(p.id, { nome: p.nome, pai: p.pai, grupo: null });
  return out;
}

/** O caminho da pasta, da de cima até ela (null: a pasta não está no contexto). */
export function caminhoDaPasta(indice: ReadonlyMap<string, PastaNoIndiceV1>, id: string | null): string[] | null {
  if (!id) return null;
  const out: string[] = [];
  let cur: string | null = id;
  // (o pai que voltaria para trás é cortado: o caminho tem no máximo 32 níveis)
  for (let i = 0; cur && i < 32; i++) {
    const p = indice.get(cur);
    if (!p) return out.length ? out : null;
    out.unshift(p.nome);
    cur = p.pai;
  }
  return out;
}

/** A nota do espelho como a v1 mostra: a pasta e o assunto montados pelo contexto (a de antes das pastas passa como está). */
export function notaDoEspelho(raw: NotaNoEspelhoV1 | NotaV1, indice: ReadonlyMap<string, PastaNoIndiceV1>): NotaV1 {
  if (!('pasta_id' in raw)) return { ...raw, pasta: raw.pasta ?? null } as NotaV1;
  const { pasta_id, ...rest } = raw;
  const caminho = caminhoDaPasta(indice, pasta_id);
  const pasta = caminho?.length ? { id: pasta_id, caminho } : null;
  // na ordem da v1
  return {
    id: rest.id,
    titulo: rest.titulo,
    texto: rest.texto,
    grupo: rest.grupo,
    pasta,
    assunto: pasta?.caminho[0] ?? null,
    tags: rest.tags,
    data: rest.data,
    finalizada_em: rest.finalizada_em,
    fixada: rest.fixada,
    visibilidade: rest.visibilidade,
    capa: rest.capa,
    tarefas: rest.tarefas,
    kanban: rest.kanban,
    criada_em: rest.criada_em,
    versao: rest.versao,
  };
}

/** A nota v1 como o espelho guarda (o site manda assim): a pasta só pelo id. */
export function notaParaOEspelho(n: NotaV1): NotaNoEspelhoV1 {
  const { pasta, assunto: _a, ...rest } = n;
  return {
    id: rest.id,
    titulo: rest.titulo,
    texto: rest.texto,
    grupo: rest.grupo,
    pasta_id: pasta?.id ?? null,
    tags: rest.tags,
    data: rest.data,
    finalizada_em: rest.finalizada_em,
    fixada: rest.fixada,
    visibilidade: rest.visibilidade,
    capa: rest.capa,
    tarefas: rest.tarefas,
    kanban: rest.kanban,
    criada_em: rest.criada_em,
    versao: rest.versao,
  };
}

/** Os pedaços de um caminho de pasta ("Programação/Funcional", "Programação › Funcional"). */
export function pedacosDoCaminho(caminho: string): string[] {
  return caminho
    .split(/\s*[/›>]\s*/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/**
 * As pastas que um filtro pede, com as de dentro de cada uma (os ids): pelo id, ou pelo caminho a partir da
 * raiz do grupo ("Programação/Funcional", sem caixa nem acento). Sem `grupo`, vale em todos.
 */
export function pastasDoFiltro(indice: ReadonlyMap<string, PastaNoIndiceV1>, pedido: string, grupo?: string | null): Set<string> {
  const achadas = new Set<string>();
  const dentro = (g: string | null) => grupo === undefined || (grupo === null ? g === null : g !== null && dobra(g) === dobra(grupo));
  if (indice.has(pedido) && dentro(indice.get(pedido)!.grupo)) achadas.add(pedido);
  else {
    const pedacos = pedacosDoCaminho(pedido).map(dobra);
    if (!pedacos.length) return achadas;
    for (const [id, p] of indice) {
      if (!dentro(p.grupo)) continue;
      const caminho = caminhoDaPasta(indice, id);
      if (caminho && caminho.length === pedacos.length && caminho.every((c, i) => dobra(c) === pedacos[i])) achadas.add(id);
    }
  }
  // e as de dentro
  const filhas = new Map<string, string[]>();
  for (const [id, p] of indice) if (p.pai) filhas.set(p.pai, [...(filhas.get(p.pai) ?? []), id]);
  const fila = [...achadas];
  while (fila.length) {
    for (const f of filhas.get(fila.pop()!) ?? []) {
      if (achadas.has(f)) continue;
      achadas.add(f);
      fila.push(f);
    }
  }
  return achadas;
}
