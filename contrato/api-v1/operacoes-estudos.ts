/**
 * As operações nos Estudos (PLANO-API.md, seção 23, rodada 12): criar, mudar e apagar baralhos; virar
 * carta (pôr uma anotação em baralhos), mudar a frente, os baralhos e o "no mural", tirar dos Estudos,
 * responder (Errei ou Acertei) e recomeçar o progresso. Cada escrita da API vira um pedido com uma
 * destas operações, conferida aqui (a API ao receber, o site de novo ao aplicar). As prévias (o baralho
 * e a carta como vão ficar) também saem daqui, para a API mostrar os pedidos por cima da leitura. Só
 * tipos e funções puras.
 *
 * Sem versão, como no Kanban: o app junta carta a carta e baralho a baralho pela hora da mudança, e um
 * baralho ou uma carta que sumiram fazem o pedido falhar com o porquê. Cada baralho é de um grupo das
 * anotações (PLANO-ESTUDOS-GRUPOS.md): o grupo vem ao criar e não muda depois (muda com o grupo, renomeado
 * na tela), e a carta só entra nos baralhos do grupo da anotação dela. A resposta não muda o FSRS aqui:
 * quando a carta volta é conta do app, ao aplicar.
 */

import { CORES, type CorV1 } from './calendario';
import { dobra, textoLimpo } from './escopos';
import {
  BARALHOS_POR_CARTA,
  ESTILOS,
  NOME_DO_BARALHO_MAX,
  NOVAS_POR_DIA_MAX,
  SUBTITULO_MAX,
  TITULO_DA_FRENTE_MAX,
  type BaralhoV1,
  type CartaV1,
  type EstiloV1,
} from './estudos';

export type OpEstudo = 'baralho.criar' | 'baralho.editar' | 'baralho.apagar' | 'carta.por' | 'carta.editar' | 'carta.tirar' | 'carta.responder' | 'carta.recomecar';

export const OPS_DOS_ESTUDOS: readonly OpEstudo[] = ['baralho.criar', 'baralho.editar', 'baralho.apagar', 'carta.por', 'carta.editar', 'carta.tirar', 'carta.responder', 'carta.recomecar'];

/** O escopo que cada operação pede. */
export const ESCOPO_DA_OP_ESTUDO: Record<OpEstudo, string> = {
  'baralho.criar': 'estudos:escrever',
  'baralho.editar': 'estudos:escrever',
  'baralho.apagar': 'estudos:apagar',
  'carta.por': 'estudos:escrever',
  'carta.editar': 'estudos:escrever',
  'carta.tirar': 'estudos:apagar',
  'carta.responder': 'estudos:estudar',
  'carta.recomecar': 'estudos:apagar',
};

/** É um pedido dos Estudos? */
export function ehOpEstudo(op: string): op is OpEstudo {
  return (OPS_DOS_ESTUDOS as readonly string[]).includes(op);
}

/** Os campos de um baralho que se escrevem. */
export interface CamposDoBaralho {
  nome?: string;
  cor?: CorV1;
  novas_por_dia?: number;
  no_mural?: boolean;
  estilo?: EstiloV1;
}

export interface CriarBaralhoV1 extends CamposDoBaralho {
  nome: string;
  /**
   * O grupo das anotações do baralho (só as cartas dele entram). A API pede sempre; sem ele (um pedido de
   * antes dos grupos), o Murall usa o grupo de sempre.
   */
  grupo?: string;
}

export interface EditarBaralhoV1 extends CamposDoBaralho {
  /** O lugar na fileira das abas (0 é a primeira). */
  posicao?: number;
}

/** A frente de uma carta (também o `estudos` de uma nota nova). */
export interface FrenteV1 {
  /** O título da frente; null (ou vazio) usa o nome da anotação. */
  titulo?: string | null;
  subtitulo?: string | null;
  /** Um link https de uma imagem (null tira). */
  imagem?: string | null;
}

export interface PorCartaV1 extends FrenteV1 {
  /** Os baralhos (pelo id; a rota troca os nomes pelos ids). A carta que já existe entra nestes também. */
  baralhos: string[];
  /** true aparece também no mural, false só nos Estudos, null segue os baralhos. */
  no_mural?: boolean | null;
}

export interface EditarCartaV1 extends FrenteV1 {
  /** A lista inteira dos baralhos (pelo menos um; para tirar dos Estudos, carta.tirar). */
  baralhos?: string[];
  no_mural?: boolean | null;
}

export interface ResponderV1 {
  acertou: boolean;
  /** O baralho que trouxe a carta (conta no limite de novas dele); sem ele, o primeiro da carta. */
  baralho?: string;
}

export type DadosDaOpEstudo = CriarBaralhoV1 | EditarBaralhoV1 | PorCartaV1 | EditarCartaV1 | ResponderV1 | Record<string, never>;

export type ConferidoEstudo<T> = { ok: true; dados: T } | { ok: false; campo: string; erro: string };
const falha = (campo: string, erro: string) => ({ ok: false as const, campo, erro });

const ID_RE = /^[\w-]{1,64}$/;
const isRef = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= 64;

function lerBaralho(r: Record<string, unknown>, criando: boolean): ConferidoEstudo<CamposDoBaralho> {
  const out: CamposDoBaralho = {};
  if (r['nome'] !== undefined || criando) {
    const nome = textoLimpo(r['nome'], NOME_DO_BARALHO_MAX + 1);
    if (!nome || nome.length > NOME_DO_BARALHO_MAX) return falha('nome', `O nome do baralho tem de 1 a ${NOME_DO_BARALHO_MAX} letras.`);
    out.nome = nome;
  }
  if (r['cor'] !== undefined) {
    if (!(CORES as readonly unknown[]).includes(r['cor'])) return falha('cor', `A cor é ${CORES.join(', ')}.`);
    out.cor = r['cor'] as CorV1;
  }
  if (r['novas_por_dia'] !== undefined) {
    const n = r['novas_por_dia'];
    if (!Number.isInteger(n) || (n as number) < 0 || (n as number) > NOVAS_POR_DIA_MAX) return falha('novas_por_dia', `novas_por_dia é um inteiro de 0 a ${NOVAS_POR_DIA_MAX}.`);
    out.novas_por_dia = n as number;
  }
  if (r['no_mural'] !== undefined) {
    if (typeof r['no_mural'] !== 'boolean') return falha('no_mural', 'no_mural é true ou false.');
    out.no_mural = r['no_mural'];
  }
  if (r['estilo'] !== undefined) {
    if (!(ESTILOS as readonly unknown[]).includes(r['estilo'])) return falha('estilo', `O estilo é ${ESTILOS.join(', ')}.`);
    out.estilo = r['estilo'] as EstiloV1;
  }
  return { ok: true, dados: out };
}

/** Um texto da frente: uma linha, até `max` letras; null (ou vazio) tira. */
function lerTexto(r: Record<string, unknown>, campo: 'titulo' | 'subtitulo', max: number): ConferidoEstudo<string | null | undefined> {
  const v = r[campo];
  if (v === undefined) return { ok: true, dados: undefined };
  if (v === null) return { ok: true, dados: null };
  if (typeof v !== 'string') return falha(campo, `O ${campo} da frente é um texto (ou null para tirar).`);
  const t = textoLimpo(v, max + 1);
  if (t.length > max) return falha(campo, `O ${campo} da frente tem até ${max} letras.`);
  return { ok: true, dados: t || null };
}

/** A frente: o título, o subtítulo e a imagem (só os que vieram). */
export function lerFrente(r: Record<string, unknown>): ConferidoEstudo<FrenteV1> {
  const out: FrenteV1 = {};
  const titulo = lerTexto(r, 'titulo', TITULO_DA_FRENTE_MAX);
  if (!titulo.ok) return titulo;
  if (titulo.dados !== undefined) out.titulo = titulo.dados;
  const sub = lerTexto(r, 'subtitulo', SUBTITULO_MAX);
  if (!sub.ok) return sub;
  if (sub.dados !== undefined) out.subtitulo = sub.dados;
  if (r['imagem'] !== undefined) {
    const v = r['imagem'];
    if (v === null || v === '') out.imagem = null;
    else if (typeof v !== 'string' || v.length > 2000 || !/^https:\/\/\S+$/.test(v.trim())) return falha('imagem', 'A imagem é um link https (ou null para tirar).');
    else out.imagem = v.trim();
  }
  return { ok: true, dados: out };
}

/** Os baralhos de uma carta: a lista (sem repetir) dos nomes ou ids, de 1 a 20. */
export function lerBaralhos(v: unknown, campo = 'baralhos'): ConferidoEstudo<string[]> {
  if (!Array.isArray(v) || !v.length || v.length > BARALHOS_POR_CARTA || !v.every(isRef)) {
    return falha(campo, `${campo} é a lista dos baralhos (o nome ou o id, de 1 a ${BARALHOS_POR_CARTA}; veja ver_estudos).`);
  }
  const out = new Map<string, string>();
  for (const b of v as string[]) if (!out.has(dobra(b.trim()))) out.set(dobra(b.trim()), b.trim());
  return { ok: true, dados: [...out.values()] };
}

function lerNoMural(r: Record<string, unknown>): ConferidoEstudo<boolean | null | undefined> {
  if (r['no_mural'] === undefined) return { ok: true, dados: undefined };
  if (r['no_mural'] !== null && typeof r['no_mural'] !== 'boolean') return falha('no_mural', 'no_mural é true (também no mural), false (só nos Estudos) ou null (seguir os baralhos).');
  return { ok: true, dados: r['no_mural'] };
}

/** O tamanho de um nome de grupo (o das anotações). */
export const NOME_DO_GRUPO_MAX = 32;

/** Confere os dados de uma operação (vale na API, ao receber, e no site, ao aplicar). */
export function conferirOpEstudo(op: OpEstudo, raw: unknown): ConferidoEstudo<DadosDaOpEstudo> {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  switch (op) {
    case 'baralho.criar': {
      const b = lerBaralho(r, true);
      if (!b.ok) return b;
      const out = b.dados as CriarBaralhoV1;
      if (r['grupo'] !== undefined) {
        const g = textoLimpo(r['grupo'], NOME_DO_GRUPO_MAX + 1);
        if (!g || g.length > NOME_DO_GRUPO_MAX) return falha('grupo', `O grupo do baralho é o nome de um grupo das anotações (de 1 a ${NOME_DO_GRUPO_MAX} letras; veja ver_contexto).`);
        out.grupo = g;
      }
      return { ok: true, dados: out };
    }
    case 'baralho.editar': {
      if (r['grupo'] !== undefined) return falha('grupo', 'O grupo do baralho não muda por aqui: ele acompanha o grupo das anotações (renomeado no Murall). Para outro grupo, crie um baralho nele.');
      const b = lerBaralho(r, false);
      if (!b.ok) return b;
      const out: EditarBaralhoV1 = b.dados;
      if (r['posicao'] !== undefined) {
        if (!Number.isInteger(r['posicao']) || (r['posicao'] as number) < 0 || (r['posicao'] as number) > 1000) return falha('posicao', 'A posicao é o lugar na fileira: 0 é a primeira.');
        out.posicao = r['posicao'] as number;
      }
      if (!Object.keys(out).length) return falha('campos', 'Nada para mudar: mande o nome, a cor, novas_por_dia, no_mural, o estilo ou a posicao.');
      return { ok: true, dados: out };
    }
    case 'carta.por': {
      const decks = lerBaralhos(r['baralhos']);
      if (!decks.ok) return decks;
      const front = lerFrente(r);
      if (!front.ok) return front;
      const wall = lerNoMural(r);
      if (!wall.ok) return wall;
      return { ok: true, dados: { baralhos: decks.dados, ...front.dados, ...(wall.dados !== undefined ? { no_mural: wall.dados } : {}) } };
    }
    case 'carta.editar': {
      const out: EditarCartaV1 = {};
      if (r['baralhos'] !== undefined) {
        const decks = lerBaralhos(r['baralhos']);
        if (!decks.ok) return decks;
        out.baralhos = decks.dados;
      }
      const front = lerFrente(r);
      if (!front.ok) return front;
      Object.assign(out, front.dados);
      const wall = lerNoMural(r);
      if (!wall.ok) return wall;
      if (wall.dados !== undefined) out.no_mural = wall.dados;
      if (!Object.keys(out).length) return falha('campos', 'Nada para mudar: mande o titulo, o subtitulo, a imagem, os baralhos ou no_mural.');
      return { ok: true, dados: out };
    }
    case 'carta.responder': {
      if (typeof r['acertou'] !== 'boolean') return falha('acertou', 'acertou é true (Acertei) ou false (Errei).');
      const out: ResponderV1 = { acertou: r['acertou'] };
      if (r['baralho'] !== undefined && r['baralho'] !== null) {
        if (!isRef(r['baralho'])) return falha('baralho', 'baralho é o nome ou o id do baralho que trouxe a carta.');
        out.baralho = r['baralho'].trim();
      }
      return { ok: true, dados: out };
    }
    case 'baralho.apagar':
    case 'carta.tirar':
    case 'carta.recomecar':
      return { ok: true, dados: {} };
  }
}

/**
 * O baralho pelo id ou pelo nome (sem ligar para acento e caixa), ou null. O mesmo nome pode estar em mais
 * de um grupo (o Kana de Japonês e o de Idiomas): com `grupo`, vale o desse grupo.
 */
export function acharBaralho<T extends Pick<BaralhoV1, 'id' | 'nome'> & { grupo?: string | null }>(decks: readonly T[], ref: string, grupo?: string | null): T | null {
  const byId = decks.find((d) => d.id === ref);
  if (byId) return byId;
  const named = baralhosDeNome(decks, ref);
  return (grupo ? named.find((d) => !!d.grupo && dobra(d.grupo) === dobra(grupo)) : undefined) ?? named[0] ?? null;
}

/** Os baralhos com este nome (sem ligar para acento e caixa): mais de um quando o nome se repete em grupos diferentes. */
export function baralhosDeNome<T extends Pick<BaralhoV1, 'nome'>>(decks: readonly T[], nome: string): T[] {
  return decks.filter((d) => dobra(d.nome.trim()) === dobra(nome.trim()));
}

const ID_DO_BARALHO = ID_RE;
export const ehIdDeBaralho = (v: unknown): v is string => typeof v === 'string' && ID_DO_BARALHO.test(v);

/** O baralho novo como vai ficar (sem cartas; no fim da fileira). */
export function baralhoDoPedido(id: string, d: CriarBaralhoV1, posicao: number, criadoEm: string): BaralhoV1 {
  return {
    id,
    nome: d.nome,
    grupo: d.grupo ?? null,
    cor: d.cor ?? 'amarelo',
    icone: null,
    novas_por_dia: d.novas_por_dia ?? 5,
    no_mural: d.no_mural ?? false,
    estilo: d.estilo ?? 'classica',
    posicao,
    cartas: 0,
    por_nivel: { desconhecida: 0, nova: 0, aprendendo: 0, dominada: 0 },
    filas: [],
    versao: criadoEm,
  };
}

/** O baralho mudado como vai ficar (a posição mexe na fileira inteira: quem chama renumera). */
export function editarBaralhoV1(b: BaralhoV1, d: EditarBaralhoV1, em: string): BaralhoV1 {
  return {
    ...b,
    ...(d.nome !== undefined ? { nome: d.nome } : {}),
    ...(d.cor !== undefined ? { cor: d.cor } : {}),
    ...(d.novas_por_dia !== undefined ? { novas_por_dia: d.novas_por_dia } : {}),
    ...(d.no_mural !== undefined ? { no_mural: d.no_mural } : {}),
    ...(d.estilo !== undefined ? { estilo: d.estilo } : {}),
    versao: em,
  };
}

/** A fileira dos baralhos com um deles levado para `posicao` (as posições refeitas, de 0 em diante). */
export function moverBaralho<T extends { id: string; posicao: number }>(decks: readonly T[], id: string, posicao: number): T[] {
  const list = [...decks].sort((a, b) => a.posicao - b.posicao);
  const from = list.findIndex((d) => d.id === id);
  if (from < 0) return list;
  const [deck] = list.splice(from, 1);
  list.splice(Math.min(posicao, list.length), 0, deck!);
  return list.map((d, i) => (d.posicao === i ? d : { ...d, posicao: i }));
}

/**
 * A carta mudada como vai ficar (a frente, os baralhos, o "no mural"). `somar`: os baralhos do pedido
 * entram junto com os de agora (o `carta.por` numa carta que já existe); senão, trocam a lista.
 * `porBaralhos` diz se os baralhos levam ao mural (quando a carta segue os baralhos).
 */
export function editarCartaV1(c: CartaV1, d: EditarCartaV1, em: string, porBaralhos?: (baralhos: readonly string[]) => boolean, somar = false): CartaV1 {
  const titulo = d.titulo !== undefined ? d.titulo || null : c.titulo_da_frente;
  const baralhos = d.baralhos ? (somar ? [...new Set([...c.baralhos, ...d.baralhos])] : [...d.baralhos]) : c.baralhos;
  const no_mural = d.no_mural !== undefined ? d.no_mural : c.no_mural;
  return {
    ...c,
    titulo: titulo ?? c.nota_titulo,
    titulo_da_frente: titulo,
    ...(d.subtitulo !== undefined ? { subtitulo: d.subtitulo || null } : {}),
    ...(d.imagem !== undefined ? { imagem: d.imagem || null } : {}),
    baralhos,
    no_mural,
    fica_no_mural: no_mural ?? (porBaralhos ? porBaralhos(baralhos) : c.fica_no_mural),
    versao: em,
  };
}

/**
 * A carta que vai nascer de `carta.por` numa anotação que ainda não é carta (ou que já é: aí os baralhos
 * somam). `nota` é o que se sabe da anotação; `noMuralAntes` diz se ela estava no mural (a que já existia
 * continua lá, como no "Trazer anotações" da tela).
 */
export function cartaDoPedido(
  nota: { id: string; titulo: string; texto: string; grupo: string | null },
  atual: CartaV1 | null,
  d: PorCartaV1,
  em: string,
  porBaralhos: (baralhos: readonly string[]) => boolean,
  noMuralAntes = true,
): CartaV1 {
  // a que já é carta só ganha os baralhos (mudar a frente ou o mural é carta.editar, que espera a aprovação)
  if (atual) return editarCartaV1(atual, { baralhos: d.baralhos }, em, porBaralhos, true);
  const no_mural = d.no_mural !== undefined ? d.no_mural : noMuralAntes ? true : null;
  const titulo = d.titulo || null;
  return {
    nota: nota.id,
    titulo: titulo ?? nota.titulo,
    titulo_da_frente: titulo,
    subtitulo: d.subtitulo || null,
    imagem: d.imagem || null,
    nota_titulo: nota.titulo,
    verso: nota.texto,
    grupo: nota.grupo,
    baralhos: [...d.baralhos],
    no_mural,
    fica_no_mural: no_mural ?? porBaralhos(d.baralhos),
    nivel: 'desconhecida',
    estado: 'nova',
    volta_em: null,
    vistas: 0,
    acertos: 0,
    erros: 0,
    ultimas: '',
    entrou_em: em,
    versao: em,
  };
}
