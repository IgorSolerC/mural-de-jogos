/**
 * As operações nas Anotações (PLANO-API.md, 7.3 e 9): cada escrita da API vira um pedido com uma
 * destas operações, conferida aqui (a API confere ao receber, o site de novo ao aplicar) e aplicada
 * pelo site. As mudanças de texto (acrescentar, tarefas) moram aqui também, para a API mostrar o
 * pedido por cima da nota exatamente como o site vai aplicar. Só tipos e funções puras.
 */

import { dobra, textoLimpo } from './escopos';
import type { NotaV1 } from './notas';

export type OpNota =
  | 'nota.criar'
  | 'nota.editar'
  | 'nota.acrescentar'
  | 'nota.tarefas'
  | 'nota.finalizar'
  | 'nota.reabrir'
  | 'nota.fixar'
  | 'nota.desafixar'
  | 'nota.apagar';

export const OPS_DE_NOTA: readonly OpNota[] = [
  'nota.criar',
  'nota.editar',
  'nota.acrescentar',
  'nota.tarefas',
  'nota.finalizar',
  'nota.reabrir',
  'nota.fixar',
  'nota.desafixar',
  'nota.apagar',
];

/** O escopo que cada operação pede. */
export const ESCOPO_DA_OP: Record<OpNota, string> = {
  'nota.criar': 'notas:criar',
  'nota.editar': 'notas:editar',
  'nota.acrescentar': 'notas:editar',
  'nota.tarefas': 'notas:editar',
  'nota.finalizar': 'notas:editar',
  'nota.reabrir': 'notas:editar',
  'nota.fixar': 'notas:editar',
  'nota.desafixar': 'notas:editar',
  'nota.apagar': 'notas:apagar',
};

/**
 * O que muda ou apaga algo que existe: com a aprovação "mudancas", espera a pessoa. Criar não (a nota,
 * e nos Gastos o lançamento, o envelope e a pessoa: ver operacoes-gastos.ts).
 */
export function opMuda(op: string): boolean {
  return op !== 'nota.criar' && op !== 'gasto.lancar' && op !== 'envelope.criar' && op !== 'pessoa.criar';
}

/** Em que pé está um pedido. */
export type EstadoDoPedido = 'aguardando-aprovacao' | 'pendente' | 'aplicado' | 'conflito' | 'recusado' | 'falhou' | 'expirado' | 'desfeito';
export const ESTADOS_ABERTOS: readonly EstadoDoPedido[] = ['aguardando-aprovacao', 'pendente'];

/** Os campos de uma nota que se escrevem (a visibilidade só com o escopo `publicar`). */
export interface CamposDaNota {
  titulo?: string;
  texto?: string;
  grupo?: string | null;
  assunto?: string | null;
  tags?: string[];
  data?: string | null;
  capa?: string | null;
  visibilidade?: 'privada' | 'publica';
}

export interface CriarNotaV1 extends CamposDaNota {
  titulo: string;
  fixada?: boolean;
}

export interface EditarNotaV1 extends CamposDaNota {
  /** A versão que a AI leu: se a nota mudou depois, o pedido termina em conflito. */
  versao: string;
}

export interface AcrescentarV1 {
  texto: string;
  onde: 'fim' | 'inicio';
}

export interface TarefasV1 {
  marcar: string[];
  desmarcar: string[];
  novas: string[];
}

export type DadosDaOp = CriarNotaV1 | EditarNotaV1 | AcrescentarV1 | TarefasV1 | Record<string, never>;

export const TITULO_MAX = 200;
export const TEXTO_MAX = 20_000;
export const ROTULO_MAX = 32;
export const TAGS_MAX = 12;
const DATA_RE = /^\d{4}(-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?)?$/;

/** O resultado de conferir: os dados limpos, ou o erro em palavras (com o campo). */
export type Conferido<T> = { ok: true; dados: T } | { ok: false; campo: string; erro: string };

const falha = (campo: string, erro: string) => ({ ok: false as const, campo, erro });

/** Uma tag como o app guarda: sem `#` na frente, espaços juntos, até 32 letras. */
function limparTag(raw: string): string {
  return raw.trim().replace(/^#+/, '').replace(/\s+/g, ' ').trim().slice(0, ROTULO_MAX).trim();
}

function lerCampos(raw: Record<string, unknown>, criando: boolean): Conferido<CamposDaNota> {
  const out: CamposDaNota = {};
  if (raw['titulo'] !== undefined || criando) {
    const t = textoLimpo(raw['titulo'], TITULO_MAX + 1);
    if (!t) return falha('titulo', 'O título é obrigatório.');
    if (t.length > TITULO_MAX) return falha('titulo', `O título tem até ${TITULO_MAX} letras.`);
    out.titulo = t;
  }
  if (raw['texto'] !== undefined) {
    if (typeof raw['texto'] !== 'string') return falha('texto', 'O texto é um texto (o markdown do Murall).');
    const t = raw['texto'].replace(/\r\n?/g, '\n').trim();
    if (t.length > TEXTO_MAX) return falha('texto', `O texto tem até ${TEXTO_MAX} letras.`);
    out.texto = t;
  }
  for (const campo of ['grupo', 'assunto'] as const) {
    if (raw[campo] === undefined) continue;
    if (raw[campo] === null || raw[campo] === '') {
      out[campo] = null;
      continue;
    }
    if (typeof raw[campo] !== 'string') return falha(campo, `O ${campo} é um nome (ou null para tirar).`);
    const v = textoLimpo(raw[campo], ROTULO_MAX + 1);
    if (v.length > ROTULO_MAX) return falha(campo, `O ${campo} tem até ${ROTULO_MAX} letras.`);
    out[campo] = v || null;
  }
  if (raw['tags'] !== undefined) {
    if (!Array.isArray(raw['tags']) || raw['tags'].some((t) => typeof t !== 'string')) return falha('tags', 'As tags são uma lista de nomes.');
    const tags = new Map<string, string>();
    for (const t of raw['tags'] as string[]) {
      const v = limparTag(t);
      if (v && !tags.has(dobra(v))) tags.set(dobra(v), v);
    }
    if (tags.size > TAGS_MAX) return falha('tags', `No máximo ${TAGS_MAX} tags por nota.`);
    out.tags = [...tags.values()];
  }
  if (raw['data'] !== undefined) {
    if (raw['data'] !== null && (typeof raw['data'] !== 'string' || !DATA_RE.test(raw['data']))) {
      return falha('data', 'A data é AAAA, AAAA-MM ou AAAA-MM-DD (ou null).');
    }
    out.data = raw['data'] as string | null;
  }
  if (raw['capa'] !== undefined) {
    if (raw['capa'] !== null && (typeof raw['capa'] !== 'string' || raw['capa'].length > 2000 || !/^https:\/\/[^\s]+$/.test(raw['capa']))) {
      return falha('capa', 'A capa é um endereço https (ou null).');
    }
    out.capa = raw['capa'] as string | null;
  }
  if (raw['visibilidade'] !== undefined) {
    if (raw['visibilidade'] !== 'privada' && raw['visibilidade'] !== 'publica') return falha('visibilidade', 'A visibilidade é privada ou publica.');
    out.visibilidade = raw['visibilidade'];
  }
  return { ok: true, dados: out };
}

/** Confere os dados de uma operação (vale na API, ao receber, e no site, ao aplicar). */
export function conferirOp(op: OpNota, raw: unknown): Conferido<DadosDaOp> {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  switch (op) {
    case 'nota.criar': {
      const c = lerCampos(r, true);
      if (!c.ok) return c;
      if (r['fixada'] !== undefined && typeof r['fixada'] !== 'boolean') return falha('fixada', 'fixada é true ou false.');
      return { ok: true, dados: { ...c.dados, titulo: c.dados.titulo!, ...(r['fixada'] === true ? { fixada: true } : {}) } };
    }
    case 'nota.editar': {
      if (typeof r['versao'] !== 'string' || Number.isNaN(Date.parse(r['versao']))) {
        return falha('versao', 'Mande a versao da nota que você leu (o campo versao): ela evita passar por cima de uma mudança mais nova.');
      }
      const c = lerCampos(r, false);
      if (!c.ok) return c;
      if (!Object.keys(c.dados).length) return falha('campos', 'Nada para mudar: mande pelo menos um campo.');
      return { ok: true, dados: { ...c.dados, versao: r['versao'] } };
    }
    case 'nota.acrescentar': {
      if (typeof r['texto'] !== 'string' || !r['texto'].trim()) return falha('texto', 'Mande o texto a acrescentar.');
      if (r['texto'].length > TEXTO_MAX) return falha('texto', `O texto tem até ${TEXTO_MAX} letras.`);
      const onde = r['onde'] ?? 'fim';
      if (onde !== 'fim' && onde !== 'inicio') return falha('onde', 'onde é fim ou inicio.');
      return { ok: true, dados: { texto: r['texto'].replace(/\r\n?/g, '\n').trim(), onde } };
    }
    case 'nota.tarefas': {
      const lista = (k: string): string[] | null => {
        const v = r[k] ?? [];
        return Array.isArray(v) && v.length <= 50 && v.every((x) => typeof x === 'string' && x.trim() && x.length <= 500) ? (v as string[]).map((x) => x.trim()) : null;
      };
      const marcar = lista('marcar');
      const desmarcar = lista('desmarcar');
      const novas = lista('novas');
      if (!marcar || !desmarcar || !novas) return falha('tarefas', 'marcar, desmarcar e novas são listas de textos (até 50).');
      if (!marcar.length && !desmarcar.length && !novas.length) return falha('tarefas', 'Nada para fazer: mande marcar, desmarcar ou novas.');
      return { ok: true, dados: { marcar, desmarcar, novas } };
    }
    default:
      return { ok: true, dados: {} };
  }
}

/** Acrescenta um pedaço de texto no fim (ou no começo), com uma linha entre os dois. */
export function acrescentar(texto: string, novo: string, onde: 'fim' | 'inicio'): string {
  const a = texto.replace(/\s+$/, '');
  if (!a) return novo;
  return onde === 'fim' ? `${a}\n${novo}` : `${novo}\n${a}`;
}

/** A linha de tarefa do Murall: `- [ ] fazer` ou `- [x] feito` (o mesmo jeito de `core/rich-text.ts`). */
const TAREFA = /^\s*[-*+•]\s+\[([ xX])\]\s?(.*)$/;
const CERCA = /^\s*(```|~~~)/;

/**
 * Marca, desmarca e acrescenta tarefas, achando cada uma pelo texto (sem ligar para caixa e acento;
 * dentro de blocos de código não vale). Tarefa que não existe, ou que aparece duas vezes, é erro: a AI
 * escolhe de novo. As novas entram depois da última tarefa (ou no fim do texto).
 */
export function mexerNasTarefas(texto: string, t: TarefasV1): { ok: true; texto: string } | { ok: false; erro: string } {
  const linhas = texto.replace(/\r\n?/g, '\n').split('\n');
  const tarefas: { i: number; nome: string }[] = [];
  let cerca: string | null = null;
  for (let i = 0; i < linhas.length; i++) {
    const f = CERCA.exec(linhas[i]!);
    if (f) {
      cerca = cerca === null ? f[1]! : cerca === f[1] ? null : cerca;
      continue;
    }
    if (cerca !== null) continue;
    const m = TAREFA.exec(linhas[i]!);
    if (m) tarefas.push({ i, nome: dobra(m[2]!.trim()) });
  }
  const achar = (nome: string): number | string => {
    const alvo = dobra(nome);
    const achadas = tarefas.filter((x) => x.nome === alvo);
    if (!achadas.length) return `Não achei a tarefa "${nome}". As que existem: ${tarefas.map((x) => linhas[x.i]!.replace(TAREFA, '$2').trim()).join('; ') || 'nenhuma'}.`;
    if (achadas.length > 1) return `A tarefa "${nome}" aparece ${achadas.length} vezes; mude o texto dela antes.`;
    return achadas[0]!.i;
  };
  for (const [lista, marca] of [
    [t.marcar, 'x'],
    [t.desmarcar, ' '],
  ] as const) {
    for (const nome of lista) {
      const i = achar(nome);
      if (typeof i === 'string') return { ok: false, erro: i };
      linhas[i] = linhas[i]!.replace(/\[([ xX])\]/, `[${marca}]`);
    }
  }
  if (t.novas.length) {
    const novas = t.novas.map((n) => `- [ ] ${n}`);
    const depois = tarefas.length ? tarefas[tarefas.length - 1]!.i + 1 : linhas.length;
    if (!tarefas.length && linhas.join('').trim()) linhas.push(...novas);
    else if (!tarefas.length) linhas.splice(0, linhas.length, ...novas);
    else linhas.splice(depois, 0, ...novas);
  }
  const out = linhas.join('\n');
  if (out.length > TEXTO_MAX) return { ok: false, erro: `O texto passaria de ${TEXTO_MAX} letras.` };
  return { ok: true, texto: out };
}

/** As tarefas de um texto, contadas (para a nota v1 de um pedido por cima). */
export function contarTarefas(texto: string): { feitas: number; total: number } {
  let feitas = 0;
  let total = 0;
  let cerca: string | null = null;
  for (const l of texto.replace(/\r\n?/g, '\n').split('\n')) {
    const f = CERCA.exec(l);
    if (f) {
      cerca = cerca === null ? f[1]! : cerca === f[1] ? null : cerca;
      continue;
    }
    if (cerca !== null) continue;
    const m = TAREFA.exec(l);
    if (m) {
      total++;
      if (m[1] !== ' ') feitas++;
    }
  }
  return { feitas, total };
}

/**
 * A nota como vai ficar depois do pedido (a API mostra por cima do espelho; o site aplica de verdade).
 * Devolve null quando o pedido apaga a nota; com erro (uma tarefa que não existe), a nota fica como
 * estava. `agora` carimba o que tem hora (finalizar).
 */
export function aplicarNaNotaV1(nota: NotaV1, op: OpNota, dados: DadosDaOp, agora: string): NotaV1 | null {
  switch (op) {
    case 'nota.apagar':
      return null;
    case 'nota.editar': {
      const { versao: _v, ...campos } = dados as EditarNotaV1;
      const n = { ...nota, ...campos } as NotaV1;
      return { ...n, tarefas: contarTarefas(n.texto) };
    }
    case 'nota.acrescentar': {
      const a = dados as AcrescentarV1;
      const texto = acrescentar(nota.texto, a.texto, a.onde);
      return { ...nota, texto, tarefas: contarTarefas(texto) };
    }
    case 'nota.tarefas': {
      const r = mexerNasTarefas(nota.texto, dados as TarefasV1);
      return r.ok ? { ...nota, texto: r.texto, tarefas: contarTarefas(r.texto) } : nota;
    }
    case 'nota.finalizar':
      return { ...nota, finalizada_em: nota.finalizada_em ?? agora };
    case 'nota.reabrir':
      return { ...nota, finalizada_em: null };
    case 'nota.fixar':
      return { ...nota, fixada: true };
    case 'nota.desafixar':
      return { ...nota, fixada: false };
    default:
      return nota;
  }
}

/** A nota v1 de um pedido de criar, antes de o site aplicar (a API mostra assim, por cima). */
export function notaDoPedido(id: string, d: CriarNotaV1, agora: string): NotaV1 {
  const texto = d.texto ?? '';
  return {
    id,
    titulo: d.titulo,
    texto,
    grupo: d.grupo ?? null,
    assunto: d.assunto ?? null,
    tags: d.tags ?? [],
    data: d.data ?? null,
    finalizada_em: null,
    fixada: d.fixada === true,
    visibilidade: d.visibilidade ?? 'privada',
    capa: d.capa ?? null,
    tarefas: contarTarefas(texto),
    kanban: null,
    criada_em: agora,
    versao: agora,
  };
}

/** Um id de ficha como o do Murall (`newId` em core/review.ts): `r` + a hora em base 36 + 12 letras. */
export function idDeFicha(agora: number, aleatorio: string): string {
  return `r${agora.toString(36)}${aleatorio.replace(/[^0-9a-z]/g, '').slice(0, 12).padEnd(12, '0')}`;
}
