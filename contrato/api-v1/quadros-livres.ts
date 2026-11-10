/**
 * O Quadro livre na API das AIs (PLANO-QUADRO-LIVRE.md, 7.8): o que a API lê de um quadro e os pedidos que ela
 * pode fazer. A API nunca abre o quadro guardado (o gzip da nuvem): o site manda para o espelho a versão em texto
 * (o mesmo do "Ver em lista"), um registro por quadro, e aplica os pedidos. Mover e apagar peças ficam fora (fácil
 * de estragar um quadro às cegas); apagar o quadro também. As permissões são as das Anotações: ler o quadro pede
 * `notas:ler`; criar e acrescentar, `notas:criar`; a chave limitada a alguns grupos só vê os quadros deles.
 */

import { textoLimpo } from './escopos';

/** Um quadro como a API mostra (do espelho). */
export interface QuadroLivreV1 {
  id: string;
  nome: string;
  grupo: string;
  /** Quando mudou por último (ISO). */
  em: string;
  pecas: number;
  setas: number;
  publico: boolean;
  /**
   * O quadro em texto: as molduras como títulos, as peças dentro delas na ordem de leitura com o id de cada uma
   * entre colchetes ("- Bilhete: Senha? [k3f9]"), e as setas no fim ("Senha? → Ler email (Precisa da lupa)").
   */
  texto: string;
}

/** O resumo de um quadro na lista (sem o texto). */
export type QuadroLivreResumoV1 = Omit<QuadroLivreV1, 'texto'>;

export const QUADRO_NOME_MAX = 60;
export const QUADRO_TEXTO_MAX = 60_000;
export const BILHETE_MAX = 4_000;
export const ROTULO_DA_SETA_MAX = 120;
export const TITULO_DA_MOLDURA_MAX = 80;
/** Quantas peças e setas um pedido põe de uma vez. */
export const PECAS_POR_PEDIDO = 30;

const ID_QUADRO = /^[A-Za-z0-9_-]{22}$/;
const ID_PECA = /^[A-Za-z0-9_-]{1,24}$/;
const ID_NOTA = /^[\w-]{1,64}$/;

/** Confere um quadro que o site mandou para o espelho (null: não serve). */
export function conferirQuadroLivre(raw: unknown): QuadroLivreV1 | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 10_000 ? v : null);
  if (typeof r['id'] !== 'string' || !ID_QUADRO.test(r['id'])) return null;
  if (typeof r['nome'] !== 'string' || typeof r['grupo'] !== 'string' || typeof r['em'] !== 'string' || typeof r['texto'] !== 'string') return null;
  const pecas = num(r['pecas']);
  const setas = num(r['setas']);
  if (pecas === null || setas === null) return null;
  return {
    id: r['id'],
    nome: r['nome'].slice(0, QUADRO_NOME_MAX),
    grupo: r['grupo'].slice(0, 80),
    em: r['em'].slice(0, 40),
    pecas,
    setas,
    publico: r['publico'] === true,
    texto: r['texto'].slice(0, QUADRO_TEXTO_MAX),
  };
}

// ===== os pedidos =====

export type OpQuadro = 'quadro-livre.criar' | 'quadro-livre.acrescentar';
export const OPS_DO_QUADRO_LIVRE: readonly OpQuadro[] = ['quadro-livre.criar', 'quadro-livre.acrescentar'];

/** A permissão de cada operação (as das Anotações). */
export const ESCOPO_DA_OP_QUADRO: Record<OpQuadro, string> = {
  'quadro-livre.criar': 'notas:criar',
  'quadro-livre.acrescentar': 'notas:criar',
};

export function ehOpQuadro(op: string): op is OpQuadro {
  return (OPS_DO_QUADRO_LIVRE as readonly string[]).includes(op);
}

export interface CriarQuadroV1 {
  nome: string;
  grupo: string;
}

/** Uma peça nova: um bilhete (texto) ou uma anotação (o id dela). `perto`: o id de uma peça do quadro (entra ao lado dela). */
export interface PecaNovaV1 {
  bilhete?: string;
  nota?: string;
  perto?: string;
}

/** Uma seta entre duas peças, pelo id de cada uma (`novaN`: a N-ésima peça nova deste pedido, contando de 1). */
export interface SetaNovaV1 {
  de: string;
  para: string;
  rotulo?: string;
}

export interface AcrescentarNoQuadroV1 {
  pecas?: PecaNovaV1[];
  setas?: SetaNovaV1[];
  /** Uma moldura em volta destas peças (ids do quadro ou `novaN`), com o título. */
  moldura?: { titulo: string; pecas: string[] };
}

export type DadosDoQuadro = CriarQuadroV1 | AcrescentarNoQuadroV1;

type Conferido<T> = { ok: true; dados: T } | { ok: false; campo: string; erro: string };
const erro = (campo: string, e: string): Conferido<never> => ({ ok: false, campo, erro: e });

/** Uma referência a peça: o id de uma peça do quadro, ou `novaN`. */
const refOk = (v: unknown): v is string => typeof v === 'string' && (ID_PECA.test(v) || /^nova\d{1,2}$/.test(v));

export function conferirOpQuadro(op: OpQuadro, raw: unknown): Conferido<DadosDoQuadro> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return erro('corpo', 'O corpo precisa ser um objeto.');
  const r = raw as Record<string, unknown>;
  if (op === 'quadro-livre.criar') {
    const nome = typeof r['nome'] === 'string' ? textoLimpo(r['nome'], QUADRO_NOME_MAX) : '';
    const grupo = typeof r['grupo'] === 'string' ? textoLimpo(r['grupo'], 80) : '';
    if (!nome) return erro('nome', 'Falta o nome do quadro.');
    if (!grupo) return erro('grupo', 'Falta o grupo do quadro (um dos grupos das Anotações).');
    return { ok: true, dados: { nome, grupo } };
  }
  const out: AcrescentarNoQuadroV1 = {};
  if (r['pecas'] !== undefined) {
    if (!Array.isArray(r['pecas']) || r['pecas'].length > PECAS_POR_PEDIDO) return erro('pecas', `Uma lista de até ${PECAS_POR_PEDIDO} peças.`);
    const pecas: PecaNovaV1[] = [];
    for (const [k, p] of (r['pecas'] as unknown[]).entries()) {
      if (!p || typeof p !== 'object') return erro(`pecas[${k}]`, 'Cada peça é um objeto com bilhete ou nota.');
      const x = p as Record<string, unknown>;
      const bilhete = typeof x['bilhete'] === 'string' ? x['bilhete'].replace(/\r\n?/g, '\n').slice(0, BILHETE_MAX) : undefined;
      const nota = typeof x['nota'] === 'string' && ID_NOTA.test(x['nota']) ? x['nota'] : undefined;
      if (!!bilhete?.trim() === !!nota) return erro(`pecas[${k}]`, 'Cada peça tem um bilhete (texto) ou uma nota (o id dela), um só.');
      if (x['perto'] !== undefined && !refOk(x['perto'])) return erro(`pecas[${k}].perto`, 'O id de uma peça do quadro.');
      pecas.push({ ...(bilhete ? { bilhete } : {}), ...(nota ? { nota } : {}), ...(typeof x['perto'] === 'string' ? { perto: x['perto'] } : {}) });
    }
    out.pecas = pecas;
  }
  if (r['setas'] !== undefined) {
    if (!Array.isArray(r['setas']) || r['setas'].length > PECAS_POR_PEDIDO) return erro('setas', `Uma lista de até ${PECAS_POR_PEDIDO} setas.`);
    const setas: SetaNovaV1[] = [];
    for (const [k, s] of (r['setas'] as unknown[]).entries()) {
      const x = (s ?? {}) as Record<string, unknown>;
      if (!refOk(x['de']) || !refOk(x['para']) || x['de'] === x['para']) return erro(`setas[${k}]`, 'Cada seta tem de e para: os ids de duas peças diferentes.');
      const rotulo = typeof x['rotulo'] === 'string' ? textoLimpo(x['rotulo'], ROTULO_DA_SETA_MAX) : '';
      setas.push({ de: x['de'], para: x['para'], ...(rotulo ? { rotulo } : {}) });
    }
    out.setas = setas;
  }
  if (r['moldura'] !== undefined) {
    const m = (r['moldura'] ?? {}) as Record<string, unknown>;
    const titulo = typeof m['titulo'] === 'string' ? textoLimpo(m['titulo'], TITULO_DA_MOLDURA_MAX) : '';
    const pecas = Array.isArray(m['pecas']) ? (m['pecas'] as unknown[]) : [];
    if (!pecas.length || pecas.length > 200 || !pecas.every(refOk)) return erro('moldura.pecas', 'Os ids das peças que a moldura cerca.');
    out.moldura = { titulo, pecas: pecas as string[] };
  }
  if (!out.pecas?.length && !out.setas?.length && !out.moldura) return erro('corpo', 'Diga o que acrescentar: pecas, setas ou moldura.');
  return { ok: true, dados: out };
}
