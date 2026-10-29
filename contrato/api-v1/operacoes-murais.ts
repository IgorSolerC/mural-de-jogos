/**
 * As operações nos murais de resenhas (PLANO-API.md, 7.3, 9.2; rodada 9): pôr, mudar e tirar desejos da
 * wishlist, pôr e tirar do Pra depois, criar e mudar fichas. Cada escrita da API vira um pedido com uma destas operações,
 * conferida aqui (a API ao receber, o site de novo ao aplicar). O item "como vai ficar" também sai
 * daqui, para a API mostrar o pedido por cima das leituras igual ao que o site vai aplicar. Só tipos e
 * funções puras.
 */

import { textoLimpo } from './escopos';
import {
  ARTISTA_MAX,
  DIFICULDADES,
  NOME_MAX,
  NOTAS,
  POR_MAX,
  QUANTIDADE_MAX,
  RELEVANCIAS,
  STATUS,
  TEXTO_DA_FICHA_MAX,
  VEREDITOS,
  ehMural,
  type DesejoV1,
  type DificuldadeV1,
  type FichaV1,
  type MuralV1,
  type PerfilDoMuralV1,
  type PraDepoisV1,
  type RelevanciaV1,
  type StatusV1,
  type VereditoV1,
} from './murais';

export type OpMural = 'desejo.por' | 'desejo.editar' | 'desejo.tirar' | 'pra-depois.por' | 'pra-depois.tirar' | 'ficha.criar' | 'ficha.editar';

export const OPS_DOS_MURAIS: readonly OpMural[] = ['desejo.por', 'desejo.editar', 'desejo.tirar', 'pra-depois.por', 'pra-depois.tirar', 'ficha.criar', 'ficha.editar'];

/** O escopo que cada operação pede. */
export const ESCOPO_DA_OP_MURAL: Record<OpMural, string> = {
  'desejo.por': 'desejos:escrever',
  'desejo.editar': 'desejos:escrever',
  'desejo.tirar': 'desejos:escrever',
  'pra-depois.por': 'pra-depois:escrever',
  'pra-depois.tirar': 'pra-depois:escrever',
  'ficha.criar': 'fichas:escrever',
  'ficha.editar': 'fichas:escrever',
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

/** Os campos de uma ficha que se escrevem (a nota final nunca: o Murall calcula). */
export interface CamposDaFicha {
  nome?: string;
  por?: string | null;
  ano?: string | null;
  capa?: string | null;
  /** As notas de 0 a 10 (inteiras), pelo id (as do mural, em ver_contexto); null tira uma. Mudando, só as mandadas. */
  notas?: Record<string, number | null>;
  status?: StatusV1;
  dificuldade?: DificuldadeV1;
  veredito?: VereditoV1 | null;
  quantidade?: number | null;
  texto?: string;
  concluida_em?: string | null;
  visibilidade?: 'privada' | 'publica';
  /** Só nas músicas. */
  forma?: 'album' | 'faixa';
  artista?: string | null;
}

export type CriarFichaV1 = CamposDaFicha & { mural: MuralV1; nome: string; notas: Record<string, number | null>; buscar_capa?: false };
export type EditarFichaV1 = CamposDaFicha & { versao: string };

export type DadosDaOpMural = PorItemV1 | EditarDesejoV1 | TirarV1 | CriarFichaV1 | EditarFichaV1;

export type ConferidoMural<T> = { ok: true; dados: T } | { ok: false; campo: string; erro: string };
const falha = (campo: string, erro: string) => ({ ok: false as const, campo, erro });

const isVersao = (v: unknown): v is string => typeof v === 'string' && v.length <= 40 && !Number.isNaN(Date.parse(v));
const ANO = /^\d{4}$/;
const DIA_DA_FICHA = /^\d{4}(-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01]))?$/;

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

/** Os campos da ficha, como o app guarda (o que vier). */
function lerFicha(r: Record<string, unknown>, criando: boolean): ConferidoMural<CamposDaFicha> {
  const out: Record<string, unknown> = {};
  const item = lerItem(r, out, criando);
  if (!item.ok) return item;
  if (r['notas'] !== undefined || criando) {
    const n = r['notas'];
    if (!n || typeof n !== 'object' || Array.isArray(n)) return falha('notas', 'notas é {"historia": 9, "diversao": 10, ...}, com as notas do mural (ver_contexto).');
    const notas: Record<string, number | null> = {};
    for (const [k, v] of Object.entries(n)) {
      if (!NOTAS.includes(k)) return falha(`notas.${k}`, `Não existe a nota "${k}". As de cada mural estão em ver_contexto (fichas).`);
      if (v !== null && (!Number.isInteger(v) || (v as number) < 0 || (v as number) > 10)) return falha(`notas.${k}`, 'Cada nota vai de 0 a 10, inteira (ou null, sem nota).');
      notas[k] = v as number | null;
    }
    if (criando && !Object.values(notas).some((v) => v !== null)) return falha('notas', 'Dê pelo menos uma nota: a média sai delas.');
    if (!Object.keys(notas).length) return falha('notas', 'notas veio vazio.');
    out['notas'] = notas;
  }
  const pick = (k: string, list: readonly unknown[], nullable: boolean, erro: string) => {
    if (r[k] === undefined) return null;
    if (r[k] === null && nullable) {
      out[k] = null;
      return null;
    }
    if (!list.includes(r[k])) return falha(k, erro);
    out[k] = r[k];
    return null;
  };
  const bad =
    pick('status', STATUS, false, `O status é ${STATUS.join(', ')} (os nomes de cada mural estão em ver_contexto).`) ??
    pick('dificuldade', DIFICULDADES, false, `A dificuldade é ${DIFICULDADES.join(', ')}.`) ??
    pick('veredito', VEREDITOS, true, `O veredito é ${VEREDITOS.join(', ')} (ou null).`) ??
    pick('visibilidade', ['privada', 'publica'], false, 'A visibilidade é privada ou publica.') ??
    pick('forma', ['album', 'faixa'], false, 'A forma é album ou faixa (só nas músicas).');
  if (bad) return bad;
  if (r['quantidade'] !== undefined) {
    const q = r['quantidade'];
    if (q !== null && (typeof q !== 'number' || !Number.isFinite(q) || q < 0 || q > QUANTIDADE_MAX)) return falha('quantidade', `A quantidade (horas, páginas) vai de 0 a ${QUANTIDADE_MAX} (ou null).`);
    out['quantidade'] = q;
  }
  if (r['texto'] !== undefined) {
    if (typeof r['texto'] !== 'string') return falha('texto', 'O texto é um texto (o markdown do Murall).');
    const t = r['texto'].replace(/\r\n?/g, '\n').trim();
    if (t.length > TEXTO_DA_FICHA_MAX) return falha('texto', `O texto tem até ${TEXTO_DA_FICHA_MAX} letras.`);
    out['texto'] = t;
  }
  if (r['concluida_em'] !== undefined) {
    const d = r['concluida_em'];
    if (d !== null && (typeof d !== 'string' || !DIA_DA_FICHA.test(d))) return falha('concluida_em', 'concluida_em é AAAA-MM-DD, só o ano (AAAA) ou null (não lembra).');
    out['concluida_em'] = d;
  }
  if (r['artista'] !== undefined) {
    if (r['artista'] === null) out['artista'] = null;
    else {
      const a = textoLimpo(r['artista'], ARTISTA_MAX + 1);
      if (!a || a.length > ARTISTA_MAX) return falha('artista', `O artista tem até ${ARTISTA_MAX} letras.`);
      out['artista'] = a;
    }
  }
  return { ok: true, dados: out as CamposDaFicha };
}

/**
 * O que a ficha não pode ter no mural dela (vale na API, com o contexto, e no site, com o perfil):
 * as notas de outro mural, a dificuldade e a quantidade onde não há, a forma e o artista fora das
 * músicas, a quantidade com fração em páginas. Null: está tudo certo.
 */
export function regrasDaFicha(d: CamposDaFicha, perfil: PerfilDoMuralV1): { campo: string; erro: string } | null {
  const ids = perfil.notas.map((n) => n.id);
  for (const k of Object.keys(d.notas ?? {})) {
    if (!ids.includes(k)) return { campo: `notas.${k}`, erro: `O mural de ${perfil.nome} não tem a nota "${k}"; as dele são ${ids.join(', ')}.` };
  }
  if (d.dificuldade !== undefined && d.dificuldade !== 'nenhuma' && !perfil.dificuldade) return { campo: 'dificuldade', erro: `O mural de ${perfil.nome} não tem dificuldade.` };
  if (d.quantidade !== undefined && d.quantidade !== null) {
    if (!perfil.quantidade) return { campo: 'quantidade', erro: `O mural de ${perfil.nome} não anota quantidade.` };
    if (!perfil.quantidade.fracao && !Number.isInteger(d.quantidade)) return { campo: 'quantidade', erro: `A quantidade em ${perfil.quantidade.unidade} é inteira.` };
  }
  if ((d.forma !== undefined || (d.artista !== undefined && d.artista !== null)) && perfil.mural !== 'musicas') return { campo: d.forma !== undefined ? 'forma' : 'artista', erro: 'A forma e o artista são só das músicas.' };
  return null;
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
    case 'ficha.criar': {
      if (!ehMural(r['mural'])) return falha('mural', 'O mural é jogos, livros, filmes, series, animes ou musicas.');
      const c = lerFicha(r, true);
      if (!c.ok) return c;
      if (r['buscar_capa'] !== undefined && typeof r['buscar_capa'] !== 'boolean') return falha('buscar_capa', 'buscar_capa é true ou false.');
      return {
        ok: true,
        dados: { ...c.dados, mural: r['mural'], nome: c.dados.nome!, notas: c.dados.notas!, ...(r['buscar_capa'] === false && !c.dados.capa ? { buscar_capa: false as const } : {}) },
      };
    }
    case 'ficha.editar': {
      if (!isVersao(r['versao'])) return falha('versao', 'Mande a versao da ficha que você leu (o campo versao).');
      const c = lerFicha(r, false);
      if (!c.ok) return c;
      if (!Object.keys(c.dados).length) return falha('campos', 'Nada para mudar: mande pelo menos um campo.');
      return { ok: true, dados: { ...c.dados, versao: r['versao'] } };
    }
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

/** Os campos da ficha por cima (sem a nota final: ela só sai do Murall, então fica null até o pedido entrar). */
function juntarFicha(f: FichaV1, d: CamposDaFicha): FichaV1 {
  const music = f.mural === 'musicas';
  return {
    ...f,
    nome: d.nome ?? f.nome,
    por: d.por !== undefined ? d.por : f.por,
    ano: d.ano !== undefined ? d.ano : f.ano,
    capa: d.capa !== undefined ? d.capa : f.capa,
    forma: music ? (d.forma ?? f.forma ?? 'album') : null,
    artista: music ? (d.artista !== undefined ? d.artista : f.artista) : null,
    notas: { ...f.notas, ...(d.notas ?? {}) },
    nota_final: d.notas ? null : f.nota_final,
    status: d.status ?? f.status,
    dificuldade: f.dificuldade === null ? null : (d.dificuldade ?? f.dificuldade),
    veredito: d.veredito !== undefined ? d.veredito : f.veredito,
    quantidade: d.quantidade !== undefined ? d.quantidade : f.quantidade,
    texto: d.texto ?? f.texto,
    concluida_em: d.concluida_em !== undefined ? d.concluida_em : f.concluida_em,
    visibilidade: d.visibilidade ?? f.visibilidade,
  };
}

/**
 * A ficha de um pedido de criar, antes de o site aplicar: com o perfil do mural (as notas dele, a
 * dificuldade), sem a nota final e sem capa ainda (o Murall calcula e procura). `hoje` é o dia da
 * ficha quando a AI não diz.
 */
export function fichaDoPedido(id: string, d: CriarFichaV1, perfil: PerfilDoMuralV1 | null, hoje: string, agora: string): FichaV1 {
  const base: FichaV1 = {
    id,
    mural: d.mural,
    nome: d.nome,
    por: null,
    ano: null,
    capa: null,
    forma: d.mural === 'musicas' ? 'album' : null,
    artista: null,
    nota_final: null,
    notas: Object.fromEntries((perfil?.notas ?? []).map((n) => [n.id, null])),
    nota_final_na_mao: false,
    status: 'finalizado',
    dificuldade: perfil && !perfil.dificuldade ? null : 'nenhuma',
    veredito: null,
    quantidade: null,
    texto: '',
    concluida_em: hoje,
    visibilidade: 'privada',
    releitura_de: null,
    criada_em: agora,
    versao: agora,
  };
  return { ...juntarFicha(base, d), nota_final: null };
}

/** A ficha com uma mudança por cima (a prévia de `ficha.editar`). */
export function editarFichaV1(f: FichaV1, d: EditarFichaV1, agora: string): FichaV1 {
  const { versao: _v, ...campos } = d;
  return { ...juntarFicha(f, campos), versao: agora };
}
