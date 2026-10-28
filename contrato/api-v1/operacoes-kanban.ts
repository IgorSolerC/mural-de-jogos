/**
 * As operações no Kanban (PLANO-API.md, 7.4 e 9.2; rodada 8): pôr ou mover um cartão (a coluna, o
 * lugar, a importância, o status, as dependências, o "no mural"), tirar do quadro, e criar, mudar e
 * apagar colunas. Cada escrita da API vira um pedido com uma destas operações, conferida aqui (a API ao
 * receber, o site de novo ao aplicar). O quadro "como vai ficar" também sai daqui, para a API mostrar
 * os pedidos por cima da leitura igual ao que o site vai aplicar. Só tipos e funções puras.
 *
 * Sem versão: mover um cartão é "pôr ali" (o app junta cartão a cartão pela hora da mexida), e uma
 * coluna ou um cartão que sumiram fazem o pedido falhar com o porquê.
 */

import { dobra, textoLimpo } from './escopos';
import { DEPENDENCIAS_MAX, IMPORTANCIAS, NOME_DA_COLUNA_MAX, STATUS_MAX, renumerar, type CartaoV1, type ColunaV1, type QuadroV1 } from './kanban';
import type { ImportanciaV1 } from './notas';

export type OpKanban = 'cartao.mover' | 'cartao.tirar' | 'coluna.criar' | 'coluna.editar' | 'coluna.apagar';

export const OPS_DO_KANBAN: readonly OpKanban[] = ['cartao.mover', 'cartao.tirar', 'coluna.criar', 'coluna.editar', 'coluna.apagar'];

/** O escopo que cada operação pede. */
export const ESCOPO_DA_OP_KANBAN: Record<OpKanban, string> = {
  'cartao.mover': 'kanban:mover',
  'cartao.tirar': 'kanban:mover',
  'coluna.criar': 'kanban:colunas',
  'coluna.editar': 'kanban:colunas',
  'coluna.apagar': 'kanban:colunas',
};

/** Onde a nota fica no quadro: o que se muda num cartão (e o `kanban` de uma nota nova). */
export interface NoQuadroV1 {
  /** A coluna, pelo id ou pelo nome; sem ela, a de agora (ou a primeira, para quem chega). */
  coluna?: string;
  importancia?: ImportanciaV1 | null;
  status?: string | null;
}

export interface MoverCartaoV1 extends NoQuadroV1 {
  /** O id do quadro (a rota põe, pelo grupo do caminho). */
  quadro: string;
  /** O lugar na coluna (0 = em cima); sem ele, em cima também. A coluna que se arruma sozinha ignora. */
  posicao?: number;
  /** As notas que precisam estar finalizadas antes desta (a lista inteira; vazia tira todas). */
  depende_de?: string[];
  /** Aparece também no mural; null volta a seguir o grupo. */
  no_mural?: boolean | null;
}

export interface TirarCartaoV1 {
  quadro: string;
}

export interface CriarColunaV1 {
  quadro: string;
  nome: string;
  /** Depois de qual coluna (id ou nome); sem ela, no fim. */
  depois_de?: string;
  finaliza?: boolean;
  pula?: boolean;
}

export interface EditarColunaV1 {
  quadro: string;
  nome?: string;
  finaliza?: boolean;
  pula?: boolean;
  /** O lugar da coluna (0 = a primeira, à esquerda). */
  posicao?: number;
}

export interface ApagarColunaV1 {
  quadro: string;
  /** Para onde vão os cartões dela (id ou nome); null, saem do quadro; sem o campo, a vizinha da esquerda (ou da direita). */
  para?: string | null;
}

export type DadosDaOpKanban = MoverCartaoV1 | TirarCartaoV1 | CriarColunaV1 | EditarColunaV1 | ApagarColunaV1;

export type ConferidoKanban<T> = { ok: true; dados: T } | { ok: false; campo: string; erro: string };
const falha = (campo: string, erro: string) => ({ ok: false as const, campo, erro });

const ID_RE = /^[\w-]{1,64}$/;
const isRef = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= 64;
const isPos = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 1000;

/** A coluna, a importância e o status de um cartão (também o `kanban` de uma nota nova). */
export function lerNoQuadro(r: Record<string, unknown>): ConferidoKanban<NoQuadroV1> {
  const out: NoQuadroV1 = {};
  if (r['coluna'] !== undefined) {
    if (!isRef(r['coluna'])) return falha('coluna', 'A coluna é o nome ou o id de uma coluna do quadro (veja ver_contexto ou ver_kanban).');
    out.coluna = r['coluna'].trim();
  }
  if (r['importancia'] !== undefined) {
    if (r['importancia'] !== null && !(IMPORTANCIAS as readonly unknown[]).includes(r['importancia'])) {
      return falha('importancia', `A importância é ${IMPORTANCIAS.join(', ')} (ou null para tirar).`);
    }
    out.importancia = r['importancia'] as ImportanciaV1 | null;
  }
  if (r['status'] !== undefined) {
    if (r['status'] !== null && typeof r['status'] !== 'string') return falha('status', 'O status é um texto curto (ou null para tirar).');
    const s = textoLimpo(r['status'], STATUS_MAX + 1);
    if (s.length > STATUS_MAX) return falha('status', `O status tem até ${STATUS_MAX} letras ("Em revisão", "Com o Sérgio").`);
    out.status = s || null;
  }
  return { ok: true, dados: out };
}

const lerQuadro = (r: Record<string, unknown>) => (typeof r['quadro'] === 'string' && ID_RE.test(r['quadro']) ? r['quadro'] : null);

function lerNome(r: Record<string, unknown>): string | { erro: string } {
  const nome = textoLimpo(r['nome'], NOME_DA_COLUNA_MAX + 1);
  if (!nome || nome.length > NOME_DA_COLUNA_MAX) return { erro: `O nome da coluna tem de 1 a ${NOME_DA_COLUNA_MAX} letras.` };
  return nome;
}

/** Confere os dados de uma operação (vale na API, ao receber, e no site, ao aplicar). */
export function conferirOpKanban(op: OpKanban, raw: unknown): ConferidoKanban<DadosDaOpKanban> {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const quadro = lerQuadro(r);
  if (!quadro) return falha('quadro', 'Faltou o quadro.');
  const flags = (out: { finaliza?: boolean; pula?: boolean }) => {
    for (const k of ['finaliza', 'pula'] as const) {
      if (r[k] === undefined) continue;
      if (typeof r[k] !== 'boolean') return falha(k, `${k} é true ou false.`);
      out[k] = r[k];
    }
    return null;
  };
  switch (op) {
    case 'cartao.mover': {
      const lugar = lerNoQuadro(r);
      if (!lugar.ok) return lugar;
      const out: MoverCartaoV1 = { quadro, ...lugar.dados };
      if (r['posicao'] !== undefined) {
        if (!isPos(r['posicao'])) return falha('posicao', 'A posicao é o lugar na coluna: 0 é o de cima.');
        out.posicao = r['posicao'];
      }
      if (r['depende_de'] !== undefined) {
        const list = r['depende_de'];
        if (!Array.isArray(list) || list.length > DEPENDENCIAS_MAX || !list.every((d) => typeof d === 'string' && ID_RE.test(d))) {
          return falha('depende_de', `depende_de é a lista dos ids das notas (até ${DEPENDENCIAS_MAX}) que precisam estar finalizadas antes desta.`);
        }
        out.depende_de = [...new Set(list as string[])];
      }
      if (r['no_mural'] !== undefined) {
        if (r['no_mural'] !== null && typeof r['no_mural'] !== 'boolean') return falha('no_mural', 'no_mural é true, false ou null (seguir o grupo).');
        out.no_mural = r['no_mural'];
      }
      return { ok: true, dados: out };
    }
    case 'cartao.tirar':
      return { ok: true, dados: { quadro } };
    case 'coluna.criar': {
      const nome = lerNome(r);
      if (typeof nome !== 'string') return falha('nome', nome.erro);
      const out: CriarColunaV1 = { quadro, nome };
      if (r['depois_de'] !== undefined && r['depois_de'] !== null) {
        if (!isRef(r['depois_de'])) return falha('depois_de', 'depois_de é o nome ou o id de uma coluna do quadro.');
        out.depois_de = r['depois_de'].trim();
      }
      const bad = flags(out);
      return bad ?? { ok: true, dados: out };
    }
    case 'coluna.editar': {
      const out: EditarColunaV1 = { quadro };
      if (r['nome'] !== undefined) {
        const nome = lerNome(r);
        if (typeof nome !== 'string') return falha('nome', nome.erro);
        out.nome = nome;
      }
      const bad = flags(out);
      if (bad) return bad;
      if (r['posicao'] !== undefined) {
        if (!isPos(r['posicao'])) return falha('posicao', 'A posicao é o lugar da coluna: 0 é a primeira, à esquerda.');
        out.posicao = r['posicao'];
      }
      if (Object.keys(out).length === 1) return falha('campos', 'Nada para mudar: mande o nome, finaliza, pula ou posicao.');
      return { ok: true, dados: out };
    }
    case 'coluna.apagar': {
      const out: ApagarColunaV1 = { quadro };
      if (r['para'] !== undefined) {
        if (r['para'] !== null && !isRef(r['para'])) return falha('para', 'para é a coluna que recebe os cartões (nome ou id), ou null para tirá-los do quadro.');
        out.para = r['para'] === null ? null : r['para'].trim();
      }
      return { ok: true, dados: out };
    }
  }
}

/** A coluna pelo id ou pelo nome (sem ligar para acento e caixa), ou null. */
export function acharColuna(q: Pick<QuadroV1, 'colunas'>, ref: string): ColunaV1 | null {
  return q.colunas.find((c) => c.id === ref) ?? q.colunas.find((c) => dobra(c.nome.trim()) === dobra(ref.trim())) ?? null;
}

/** A vizinha que recebe os cartões de uma coluna apagada: a da esquerda, ou a da direita na primeira. */
export function vizinha(q: Pick<QuadroV1, 'colunas'>, id: string): ColunaV1 | null {
  const i = q.colunas.findIndex((c) => c.id === id);
  if (i < 0) return null;
  return q.colunas[i - 1] ?? q.colunas[i + 1] ?? null;
}

/** O que a prévia precisa saber de uma nota que ainda não está no quadro. */
export interface NotaParaOQuadro {
  titulo: string;
  finalizada: boolean;
  tags: string[];
}

/**
 * O cartão no lugar pedido: na coluna `para`, na posição `pos` entre os dela (sem ela, ou na coluna que
 * se arruma sozinha, em cima, como no site). Puro: devolve a lista nova.
 */
function porNoLugar(cartoes: readonly CartaoV1[], card: CartaoV1, para: ColunaV1, pos: number | undefined): CartaoV1[] {
  const others = cartoes.filter((c) => c.nota !== card.nota);
  const inCol = others.filter((c) => c.coluna === para.id);
  const i = para.ordem !== null || pos === undefined ? 0 : Math.min(pos, inCol.length);
  // (só a ordem dentro da coluna conta: `renumerar` arruma as colunas)
  const at = i < inCol.length ? others.indexOf(inCol[i]!) : inCol.length ? others.indexOf(inCol[inCol.length - 1]!) + 1 : others.length;
  const out = [...others];
  out.splice(at, 0, { ...card, coluna: para.id });
  return out;
}

/**
 * O quadro como vai ficar depois do pedido (a API mostra por cima do espelho; o site aplica de
 * verdade). `alvo` é a nota (cartão) ou a coluna; `nota` diz o que mostrar de uma nota que chega ao
 * quadro (sem ela, a nota que ainda não está no quadro não aparece). O que não dá para fazer (uma
 * coluna que sumiu) deixa o quadro como estava.
 */
export function aplicarNoQuadroV1(q: QuadroV1, op: OpKanban, alvo: string, dados: DadosDaOpKanban, nota?: NotaParaOQuadro | null): QuadroV1 {
  switch (op) {
    case 'cartao.mover': {
      const d = dados as MoverCartaoV1;
      const cur = q.cartoes.find((c) => c.nota === alvo);
      if (!cur && !nota) return q;
      const de = cur ? q.colunas.find((c) => c.id === cur.coluna) : undefined;
      const para = d.coluna ? acharColuna(q, d.coluna) : (de ?? q.colunas[0]);
      if (!para) return q;
      let finalizada = cur?.finalizada ?? nota!.finalizada;
      if (para.finaliza && !de?.finaliza) finalizada = true;
      else if (!para.finaliza && de?.finaliza) finalizada = false;
      const card: CartaoV1 = {
        ...(cur ?? { nota: alvo, titulo: nota!.titulo, coluna: para.id, posicao: 0, finalizada, importancia: null, status: null, depende_de: [], no_mural: !q.so_no_kanban, tags: nota!.tags }),
        finalizada,
        ...(d.importancia !== undefined ? { importancia: d.importancia } : {}),
        ...(d.status !== undefined ? { status: d.status } : {}),
        ...(d.depende_de !== undefined ? { depende_de: d.depende_de.filter((x) => x !== alvo) } : {}),
        ...(d.no_mural !== undefined ? { no_mural: d.no_mural ?? !q.so_no_kanban } : {}),
      };
      // sem coluna nova e sem lugar: fica onde está
      const moves = !cur || para.id !== cur.coluna || d.posicao !== undefined;
      const cartoes = moves ? porNoLugar(q.cartoes, card, para, d.posicao) : q.cartoes.map((c) => (c.nota === alvo ? card : c));
      return renumerar({ ...q, cartoes });
    }
    case 'cartao.tirar':
      return renumerar({ ...q, cartoes: q.cartoes.filter((c) => c.nota !== alvo) });
    case 'coluna.criar': {
      const d = dados as CriarColunaV1;
      if (q.colunas.some((c) => c.id === alvo)) return q;
      const col: ColunaV1 = { id: alvo, nome: d.nome, finaliza: d.finaliza ?? false, pula: d.pula ?? false, ordem: null, cartoes: 0 };
      const depois = d.depois_de ? acharColuna(q, d.depois_de) : null;
      const colunas = [...q.colunas];
      colunas.splice(depois ? colunas.indexOf(depois) + 1 : colunas.length, 0, col);
      return renumerar({ ...q, colunas });
    }
    case 'coluna.editar': {
      const d = dados as EditarColunaV1;
      const col = q.colunas.find((c) => c.id === alvo);
      if (!col) return q;
      const next: ColunaV1 = { ...col, ...(d.nome !== undefined ? { nome: d.nome } : {}), ...(d.finaliza !== undefined ? { finaliza: d.finaliza } : {}), ...(d.pula !== undefined ? { pula: d.pula } : {}) };
      const colunas = q.colunas.filter((c) => c.id !== alvo);
      colunas.splice(d.posicao !== undefined ? Math.min(d.posicao, colunas.length) : q.colunas.indexOf(col), 0, next);
      return renumerar({ ...q, colunas });
    }
    case 'coluna.apagar': {
      const d = dados as ApagarColunaV1;
      if (q.colunas.length <= 1 || !q.colunas.some((c) => c.id === alvo)) return q;
      const para = d.para === null ? null : d.para !== undefined ? acharColuna(q, d.para) : vizinha(q, alvo);
      const target = para && para.id !== alvo ? para.id : null;
      const moved = q.cartoes.filter((c) => c.coluna === alvo);
      const rest = q.cartoes.filter((c) => c.coluna !== alvo);
      return renumerar({ ...q, colunas: q.colunas.filter((c) => c.id !== alvo), cartoes: target ? [...rest, ...moved.map((c) => ({ ...c, coluna: target }))] : rest });
    }
  }
}
