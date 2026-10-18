import { BUILD } from './build';
import { KanbanBoard, sanitizeBoard } from './kanban';
import { Review, sanitizeReview } from './review';

/**
 * O conteúdo da base: o que este aparelho e a nuvem tinham juntos na última sincronização, para a
 * junção de três vias (ver core/cloud-sync.ts). A base de antes guardava só a versão (`updatedAt`) de
 * cada ficha, o que diz *se* os dois lados mudaram, mas não *o quê*; com o conteúdo, duas mudanças em
 * partes diferentes da mesma ficha se juntam em vez de uma passar por cima da outra.
 *
 * Para não guardar o mural duas vezes, a ficha (e o quadro Kanban) só entra aqui quando muda neste
 * aparelho: a versão de antes da mudança, se era a da base. Uma sincronização que termina com os dois
 * iguais esvazia tudo; uma que junta e ainda tem o que enviar guarda a de lá das que ficaram diferentes.
 * Os ajustes (as tags fixas, as categorias, as configurações do mural, o perfil e as chaves) são
 * pequenos e ficam sempre.
 *
 * Mora com o estado da sincronização (o localStorage), por conta. Sem ela (perdida, ou de antes), a
 * junção volta a ser a de sempre: a mudada por último fica, e a outra é guardada.
 */

export const BASE_CONTENT_KEY = 'meu-mural:nuvem:base-conteudo';

/** Os ajustes que vão no mural privado da nuvem, cada um num campo (ver core/cloud-sync.ts). */
export type BlockKind = 'chaves' | 'tagsFixas' | 'categorias' | 'muralAnotacoes' | 'perfil';
export const BLOCK_KINDS: readonly BlockKind[] = ['chaves', 'tagsFixas', 'categorias', 'muralAnotacoes', 'perfil'];

export interface BaseContent {
  conta: string;
  /** id → a ficha como era na base (só as que mudaram aqui desde então). */
  fichas: Record<string, Review>;
  /** id do quadro → a versão (`at`) dele na base. */
  quadrosV: Record<string, string>;
  /** id do quadro → o quadro como era na base (só os que mudaram aqui). */
  quadros: Record<string, KanbanBoard>;
  /** Cada ajuste como era na base (os dados, sem a data). */
  ajustes: Partial<Record<BlockKind, unknown>>;
}

interface Kv {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const emptyBase = (conta: string): BaseContent => ({ conta, fichas: {}, quadrosV: {}, quadros: {}, ajustes: {} });

/** A base guardada desta conta (vazia se não há, se é de outra conta ou se não abriu). */
export function readBaseContent(kv: Kv, conta: string): BaseContent {
  try {
    const raw = JSON.parse(kv.getItem(BASE_CONTENT_KEY) ?? 'null') as Record<string, unknown> | null;
    if (!raw || raw['conta'] !== conta) return emptyBase(conta);
    const from = Number.isInteger(raw['build']) ? (raw['build'] as number) : 0;
    const obj = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
    const fichas: Record<string, Review> = {};
    for (const [id, v] of Object.entries(obj(raw['fichas']))) {
      const r = sanitizeReview(v, from);
      if (r && r.id === id) fichas[id] = r;
    }
    const quadros: Record<string, KanbanBoard> = {};
    for (const [id, v] of Object.entries(obj(raw['quadros']))) {
      const b = sanitizeBoard(v);
      if (b && b.id === id) quadros[id] = b;
    }
    const quadrosV = Object.fromEntries(Object.entries(obj(raw['quadrosV'])).filter(([, v]) => typeof v === 'string')) as Record<string, string>;
    const ajustes = Object.fromEntries(Object.entries(obj(raw['ajustes'])).filter(([k]) => (BLOCK_KINDS as readonly string[]).includes(k)));
    return { conta, fichas, quadrosV, quadros, ajustes };
  } catch {
    return emptyBase(conta);
  }
}

/** Guarda a base (null: esquece, ao sair da conta tirando o mural ou ao apagar a conta). */
export function writeBaseContent(kv: Kv, base: BaseContent | null): void {
  if (!base) {
    kv.removeItem(BASE_CONTENT_KEY);
    return;
  }
  try {
    kv.setItem(BASE_CONTENT_KEY, JSON.stringify({ ...base, build: BUILD }));
  } catch {
    // sem espaço: a próxima junção destas fichas volta a ser a de sempre (a mais nova fica, a outra é guardada)
    kv.removeItem(BASE_CONTENT_KEY);
  }
}
