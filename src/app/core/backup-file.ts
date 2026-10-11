import { CategoryLooks, sanitizeCategoryLooks } from './category-looks';
import { Profile, sanitizeProfile } from './profile';
import { Review, sanitizeReview } from './review';

/** Limita também o conteúdo descompactado, antes de tentar interpretar o JSON. */
const MAX_BYTES = 32 * 1024 * 1024;
class TooLarge extends Error {
  constructor() {
    super('Esse backup é grande demais (limite de 32 MB). Escolha um arquivo menor.');
  }
}

/** O texto compactado em gzip (o navegador precisa de CompressionStream). */
export async function gzip(text: string): Promise<Blob> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Response(stream).blob();
}

export async function readBackupFile(file: Blob): Promise<string> {
  if (file.size > MAX_BYTES) throw new TooLarge();
  const head = new Uint8Array(await file.slice(0, 2).arrayBuffer());
  const gzip = head[0] === 0x1f && head[1] === 0x8b;
  if (gzip && typeof DecompressionStream === 'undefined') {
    throw new Error(
      'Este navegador não abre backups compactados. Use um backup .json ou atualize o navegador.',
    );
  }
  const reader = (
    gzip
      ? file.stream().pipeThrough(new DecompressionStream('gzip'))
      : file.stream()
  ).getReader();
  const decoder = new TextDecoder();
  const parts: string[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BYTES) {
        await reader.cancel();
        throw new TooLarge();
      }
      parts.push(decoder.decode(value, { stream: true }));
    }
    parts.push(decoder.decode());
    return parts.join('');
  } catch (error) {
    if (error instanceof TooLarge) throw error;
    throw new Error(
      'Não consegui ler esse arquivo. Escolha o backup .json ou .json.gz baixado pelo Meu Mural.',
    );
  } finally {
    reader.releaseLock();
  }
}

export interface BackupSnapshot {
  reviews: Review[];
  exportedAt: string | null;
  skipped: number;
  /** O nome que a pessoa salvou em Ajustes antes de baixar (backups antigos não têm). */
  ownerName: string | null;
  /**
   * O ícone e a cor das categorias das anotações da pessoa (`categorias`, no mural público). Sem
   * nada (um colega guardado antes disso, ou um backup baixado), as categorias ficam do jeito de sempre.
   */
  categoryLooks?: CategoryLooks;
  /** O perfil da pessoa (`perfil`, só no mural público da nuvem); null sem perfil, ou num backup. */
  profile?: Profile | null;
}

/** O nome de quem fez o backup, se ele veio no arquivo. */
export function ownerNameOf(data: unknown): string | null {
  const owner = (data as { owner?: { name?: unknown } } | null)?.owner;
  const name = typeof owner?.name === 'string' ? owner.name.trim().slice(0, 60) : '';
  return name || null;
}

/** As listas de um backup, ainda cruas (ver `backupLists`). */
export interface BackupLists {
  /** O arquivo inteiro, já lido do JSON. */
  data: unknown;
  /** O mesmo, se é um objeto (os backups de antes eram só a lista de resenhas). */
  object: Record<string, unknown> | null;
  reviews: unknown[];
  /** As anotações, que vêm à parte (ver ReviewStore.snapshot); null num backup de antes delas. */
  notes: unknown[] | null;
}

/**
 * Lê o JSON de um backup e confere se ele serve: é do Meu Mural, de uma versão que este site sabe
 * ler, e tem as resenhas. Se não serve, lança o porquê, terminando com `hint` (o que escolher).
 */
export function backupLists(text: string, hint = 'Escolha o backup baixado pelo Meu Mural.'): BackupLists {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Esse arquivo não é um JSON válido. ${hint}`);
  }
  const object = data && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, unknown>) : null;
  if (object?.['app'] !== undefined && object['app'] !== 'meu-mural') {
    throw new Error(`Esse arquivo é de outro aplicativo. ${hint}`);
  }
  if (typeof object?.['version'] === 'number' && object['version'] > 2) {
    throw new Error('Esse backup é de uma versão mais nova. Atualize o Meu Mural antes de abrir.');
  }
  const reviews = Array.isArray(data) ? data : object?.['reviews'];
  if (!Array.isArray(reviews)) throw new Error(`Não achei resenhas nesse arquivo. ${hint}`);
  const notes = object?.['notas'];
  return { data, object, reviews, notes: Array.isArray(notes) ? notes : null };
}

/** Só lê e sanitiza: não toca nos dados pessoais nem aplica exclusões ao mural do usuário. */
export function parseBackupSnapshot(text: string): BackupSnapshot {
  const { object, reviews: found, notes } = backupLists(text, 'Escolha um backup do Meu Mural.');
  const list = notes ? [...found, ...notes] : found;
  const deleted = object?.['deleted'] as
    | { reviews?: Record<string, unknown> }
    | undefined;
  const reviews = new Map<string, Review>();
  let skipped = 0;
  for (const raw of list) {
    const r = sanitizeReview(raw);
    if (!r) {
      skipped++;
      continue;
    }
    // o backup de alguém aberto aqui é o mural dela visto por outra pessoa: o que é privado fica com ela
    if (r.private) continue;
    const removedAt = deleted?.reviews?.[r.id];
    if (
      typeof removedAt === 'string' &&
      Date.parse(removedAt) >= Date.parse(r.updatedAt)
    )
      continue;
    const current = reviews.get(r.id);
    if (!current || Date.parse(r.updatedAt) > Date.parse(current.updatedAt))
      reviews.set(r.id, r);
  }
  const exportedAt = object?.['exportedAt'];
  return {
    reviews: [...reviews.values()],
    skipped,
    ownerName: ownerNameOf(object),
    categoryLooks: sanitizeCategoryLooks(object?.['categorias']),
    profile: sanitizeProfile(object?.['perfil']),
    exportedAt:
      typeof exportedAt === 'string' && Number.isFinite(Date.parse(exportedAt))
        ? exportedAt
        : null,
  };
}
