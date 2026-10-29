/**
 * As operações nos murais de resenhas (PLANO-API.md, 7.3, 9.2; rodada 9): pôr, mudar e tirar desejos da
 * wishlist, pôr e tirar do Pra depois. Cada escrita da API vira um pedido com uma destas operações,
 * conferida aqui (a API ao receber, o site de novo ao aplicar). O item "como vai ficar" também sai
 * daqui, para a API mostrar o pedido por cima das leituras igual ao que o site vai aplicar. Só tipos e
 * funções puras.
 */

import { textoLimpo } from './escopos';
import { NOME_MAX, POR_MAX, RELEVANCIAS, ehMural, type DesejoV1, type MuralV1, type PraDepoisV1, type RelevanciaV1 } from './murais';

export type OpMural = 'desejo.por' | 'desejo.editar' | 'desejo.tirar' | 'pra-depois.por' | 'pra-depois.tirar';

export const OPS_DOS_MURAIS: readonly OpMural[] = ['desejo.por', 'desejo.editar', 'desejo.tirar', 'pra-depois.por', 'pra-depois.tirar'];

/** O escopo que cada operação pede. */
export const ESCOPO_DA_OP_MURAL: Record<OpMural, string> = {
  'desejo.por': 'desejos:escrever',
  'desejo.editar': 'desejos:escrever',
  'desejo.tirar': 'desejos:escrever',
  'pra-depois.por': 'pra-depois:escrever',
  'pra-depois.tirar': 'pra-depois:escrever',
};

/** Itens num pedido de lote (um pedido por item). */
export const LOTE_DOS_MURAIS_MAX = 50;

/** O item a pôr (na wishlist ou no Pra depois). */
export interface PorItemV1 {
  mural: MuralV1;
  nome: string;
  ano?: string;
  por?: string;
  /** A capa (https); sem ela, o Murall procura no catálogo do mural (a não ser com `buscar_capa: false`). */
  capa?: string;
  /** Só no desejo; sem ela, comum. */
  relevancia?: RelevanciaV1;
  /** false: entra sem capa, sem procurar. */
  buscar_capa?: false;
}

export interface EditarDesejoV1 {
  versao: string;
  relevancia?: RelevanciaV1;
  nome?: string;
  ano?: string | null;
  por?: string | null;
  capa?: string | null;
}

export interface TirarV1 {
  versao: string;
}

export type DadosDaOpMural = PorItemV1 | EditarDesejoV1 | TirarV1;

export type ConferidoMural<T> = { ok: true; dados: T } | { ok: false; campo: string; erro: string };
const falha = (campo: string, erro: string) => ({ ok: false as const, campo, erro });

const isVersao = (v: unknown): v is string => typeof v === 'string' && v.length <= 40 && !Number.isNaN(Date.parse(v));
const ANO = /^\d{4}$/;

/** O nome, o ano, o por e a capa, como o app guarda (o que vier). */
function lerItem(r: Record<string, unknown>, out: Record<string, unknown>, criando: boolean): ConferidoMural<null> {
  if (r['nome'] !== undefined || criando) {
    const n = textoLimpo(r['nome'], NOME_MAX + 1);
    if (!n) return falha('nome', 'O nome é obrigatório (como no catálogo: "Hollow Knight: Silksong").');
    if (n.length > NOME_MAX) return falha('nome', `O nome tem até ${NOME_MAX} letras.`);
    out['nome'] = n;
  }
  if (r['ano'] === null) {
    // ao mudar, null tira o ano; ao pôr, é o mesmo que não dizer
    if (!criando) out['ano'] = null;
  } else if (r['ano'] !== undefined) {
    const a = typeof r['ano'] === 'number' ? String(r['ano']) : r['ano'];
    if (typeof a !== 'string' || !ANO.test(a)) return falha('ano', 'O ano é AAAA (o do lançamento).');
    out['ano'] = a;
  }
  if (r['por'] !== undefined) {
    if (r['por'] === null && !criando) out['por'] = null;
    else {
      const p = textoLimpo(r['por'], POR_MAX + 1);
      if (!p || p.length > POR_MAX) return falha('por', `por é quem escreveu ou quem toca, até ${POR_MAX} letras.`);
      out['por'] = p;
    }
  }
  if (r['capa'] !== undefined) {
    if (r['capa'] === null && !criando) out['capa'] = null;
    else if (typeof r['capa'] !== 'string' || r['capa'].length > 2000 || !/^https:\/\/\S+$/.test(r['capa'])) return falha('capa', 'A capa é um endereço https de uma imagem.');
    else out['capa'] = r['capa'];
  }
  return { ok: true, dados: null };
}

/** Confere os dados de uma operação (vale na API, ao receber, e no site, ao aplicar). */
export function conferirOpMural(op: OpMural, raw: unknown): ConferidoMural<DadosDaOpMural> {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  switch (op) {
    case 'desejo.por':
    case 'pra-depois.por': {
      if (!ehMural(r['mural'])) return falha('mural', 'O mural é jogos, livros, filmes, series, animes ou musicas.');
      const out: Record<string, unknown> = { mural: r['mural'] };
      const item = lerItem(r, out, true);
      if (!item.ok) return item;
      if (r['relevancia'] !== undefined) {
        if (op !== 'desejo.por') return falha('relevancia', 'Só o desejo da wishlist tem relevância.');
        if (!(RELEVANCIAS as readonly unknown[]).includes(r['relevancia'])) return falha('relevancia', 'A relevância é must, comum ou later.');
        if (r['relevancia'] !== 'comum') out['relevancia'] = r['relevancia'];
      }
      if (r['buscar_capa'] !== undefined && typeof r['buscar_capa'] !== 'boolean') return falha('buscar_capa', 'buscar_capa é true ou false.');
      if (r['buscar_capa'] === false && !out['capa']) out['buscar_capa'] = false;
      return { ok: true, dados: out as unknown as PorItemV1 };
    }
    case 'desejo.editar': {
      if (!isVersao(r['versao'])) return falha('versao', 'Mande a versao do desejo que você leu (o campo versao).');
      const out: Record<string, unknown> = {};
      const item = lerItem(r, out, false);
      if (!item.ok) return item;
      if (r['relevancia'] !== undefined) {
        if (!(RELEVANCIAS as readonly unknown[]).includes(r['relevancia'])) return falha('relevancia', 'A relevância é must, comum ou later.');
        out['relevancia'] = r['relevancia'];
      }
      if (!Object.keys(out).length) return falha('campos', 'Nada para mudar: mande a relevancia, o nome, o ano, o por ou a capa.');
      return { ok: true, dados: { ...out, versao: r['versao'] } as EditarDesejoV1 };
    }
    case 'desejo.tirar':
    case 'pra-depois.tirar':
      if (!isVersao(r['versao'])) return falha('versao', 'Mande a versao que você leu (o campo versao).');
      return { ok: true, dados: { versao: r['versao'] } };
  }
}

/** O item de um pedido de pôr, antes de o site aplicar (sem capa dada, o Murall ainda vai procurar: null). */
export function itemDoPedido(id: string, d: PorItemV1, agora: string): PraDepoisV1 {
  return { id, mural: d.mural, nome: d.nome, ano: d.ano ?? null, por: d.por ?? null, capa: d.capa ?? null, criado_em: agora, versao: agora };
}

export function desejoDoPedido(id: string, d: PorItemV1, agora: string): DesejoV1 {
  const { criado_em, versao, ...rest } = itemDoPedido(id, d, agora);
  return { ...rest, relevancia: d.relevancia ?? 'comum', criado_em, versao };
}

/** O desejo com uma mudança por cima (a prévia de `desejo.editar`). */
export function editarDesejoV1(w: DesejoV1, d: EditarDesejoV1, agora: string): DesejoV1 {
  const { versao: _v, ...campos } = d;
  return { ...w, ...campos, versao: agora } as DesejoV1;
}
