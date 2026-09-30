import { Review, sanitizeReview } from './review';

/** Limita também o conteúdo descompactado, antes de tentar interpretar o JSON. */
const MAX_BYTES = 32 * 1024 * 1024;
const TOO_LARGE =
  'Esse backup é grande demais (limite de 32 MB). Escolha um arquivo menor.';

export async function readBackupFile(file: Blob): Promise<string> {
  if (file.size > MAX_BYTES) throw new Error(TOO_LARGE);
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
        throw new Error(TOO_LARGE);
      }
      parts.push(decoder.decode(value, { stream: true }));
    }
    parts.push(decoder.decode());
    return parts.join('');
  } catch (error) {
    if (error instanceof Error && error.message === TOO_LARGE) throw error;
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
}

/** Só lê e sanitiza: não toca nos dados pessoais nem aplica exclusões ao mural do usuário. */
export function parseBackupSnapshot(text: string): BackupSnapshot {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      'Esse arquivo não é um JSON válido. Escolha um backup do Meu Mural.',
    );
  }
  const object =
    data && typeof data === 'object' && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : null;
  if (object?.['app'] !== undefined && object['app'] !== 'meu-mural') {
    throw new Error(
      'Esse arquivo é de outro aplicativo. Escolha um backup do Meu Mural.',
    );
  }
  if (typeof object?.['version'] === 'number' && object['version'] > 2) {
    throw new Error(
      'Esse backup é de uma versão mais nova. Atualize o Meu Mural antes de abrir.',
    );
  }
  const list = Array.isArray(data) ? data : object?.['reviews'];
  if (!Array.isArray(list))
    throw new Error(
      'Não achei resenhas nesse arquivo. Escolha um backup do Meu Mural.',
    );
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
    exportedAt:
      typeof exportedAt === 'string' && Number.isFinite(Date.parse(exportedAt))
        ? exportedAt
        : null,
  };
}
