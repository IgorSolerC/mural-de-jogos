import { canonicalJson } from './canonical-json';
import { Review, isNote, sanitizeReview, storedNote } from './review';
import { DAY_MS } from './dates';

/**
 * As versões guardadas: a rede de proteção da sincronização.
 *
 * Juntar dois murais é ficha por ficha, e a mexida por último fica. Quando a mesma ficha foi mexida
 * em dois aparelhos desde a última vez que eles se acertaram com a nuvem (ou foi apagada num e mexida
 * no outro), a versão que perdeu não some: ela fica guardada aqui por 30 dias, vai junto para a nuvem
 * (só no mural privado) e Ajustes › Backup mostra cada uma com "Restaurar". O mesmo vale para o editor
 * aberto com uma versão que mudou por baixo dele (a sincronização trouxe a de outro aparelho): salvar
 * guarda a que estava lá.
 *
 * Nada aqui decide o que fica no mural; só garante que o que saiu dele por causa de uma junção possa
 * voltar.
 */

/** Por que a versão ficou guardada. */
export type KeptReason =
  /** A mesma ficha mudou em dois aparelhos; ficou a mexida por último. */
  | 'juntou'
  /** Foi apagada num aparelho depois de mexida no outro. */
  | 'apagada'
  /** O editor estava aberto com uma versão anterior e salvou por cima. */
  | 'editor'
  /** Estava no mural quando você restaurou outra versão dela. */
  | 'trocada'
  /** Uma edição numa anotação compartilhada que não pôde mais subir (ela foi apagada, ou você saiu dela ou não pode mais editar). */
  | 'compartilhada'
  /** A versão que ficou de fora quando você escolheu a outra num conflito da sincronização (ver core/sync-conflicts.ts). */
  | 'conflito'
  /** Apagada (ou desfeita) por um pedido da API das AIs (ver core/api-requests.ts). */
  | 'api';

export interface KeptVersion {
  /** A ficha como era. */
  ficha: Review;
  /** Quando ficou guardada (ISO). */
  em: string;
  motivo: KeptReason;
}

/** Quanto tempo uma versão fica guardada. */
export const KEEP_VERSION_DAYS = 30;
/** Quantas versões ficam, no máximo (as mais novas). */
export const MAX_VERSIONS = 60;
const REASONS: readonly KeptReason[] = ['juntou', 'apagada', 'editor', 'trocada', 'compartilhada', 'conflito', 'api'];

/** O bilhete de quando versões acabaram de ficar guardadas. */
export function keptMessage(n: number, motivo: KeptReason): string {
  if (motivo === 'compartilhada') return 'Uma edição sua numa anotação compartilhada não pôde subir. Ela ficou guardada em Ajustes › Backup.';
  if (motivo === 'editor') return 'Esta ficha tinha mudado em outro aparelho enquanto você editava. A versão de lá ficou guardada em Ajustes › Backup.';
  return n === 1
    ? 'Uma ficha mudou em dois aparelhos ao mesmo tempo. Ficou a mexida por último, e a outra versão está guardada em Ajustes › Backup.'
    : `${n} fichas mudaram em dois aparelhos ao mesmo tempo. Ficaram as mexidas por último, e as outras versões estão guardadas em Ajustes › Backup.`;
}

/** Uma versão é a ficha numa data: a mesma ficha, na mesma data, é a mesma versão. */
export const versionKey = (v: { ficha: Pick<Review, 'id' | 'updatedAt'> }): string => `${v.ficha.id}@${v.ficha.updatedAt}`;

/** As duas fichas dizem a mesma coisa (sem contar quando foram mexidas)? */
export function sameContent(a: Review, b: Review): boolean {
  const { updatedAt: _a, ...x } = a;
  const { updatedAt: _b, ...y } = b;
  return canonicalJson(x) === canonicalJson(y);
}

/** As versões lidas de onde vieram (o armazenamento, a nuvem, um backup); `from` é a build que gravou. */
export function sanitizeVersions(raw: unknown, from = 0): KeptVersion[] {
  if (!Array.isArray(raw)) return [];
  const out: KeptVersion[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const ficha = sanitizeReview(r['ficha'], from);
    const em = typeof r['em'] === 'string' && Number.isFinite(Date.parse(r['em'])) ? r['em'] : null;
    const motivo = REASONS.includes(r['motivo'] as KeptReason) ? (r['motivo'] as KeptReason) : 'juntou';
    if (ficha && em) out.push({ ficha, em, motivo });
  }
  return out;
}

/** Como as versões vão para o armazenamento e para a nuvem (a anotação sem as notas, como no mural). */
export function storedVersions(list: readonly KeptVersion[]): unknown[] {
  return list.map((v) => ({ ...v, ficha: isNote(v.ficha) ? storedNote(v.ficha) : v.ficha }));
}

/**
 * As versões dos dois lados juntas: uma de cada (a guardada primeiro fica), só as do prazo, as
 * guardadas por último primeiro, até `MAX_VERSIONS`. Dois aparelhos que juntam as listas um do outro
 * chegam à mesma.
 */
export function mergeVersions(a: readonly KeptVersion[], b: readonly KeptVersion[], now = Date.now()): KeptVersion[] {
  const byKey = new Map<string, KeptVersion>();
  for (const v of [...a, ...b]) {
    if (now - Date.parse(v.em) > KEEP_VERSION_DAYS * DAY_MS) continue;
    const k = versionKey(v);
    const had = byKey.get(k);
    if (!had || v.em < had.em || (v.em === had.em && canonicalJson(v) < canonicalJson(had))) byKey.set(k, v);
  }
  return [...byKey.values()]
    .sort((x, y) => (x.em !== y.em ? (x.em < y.em ? 1 : -1) : versionKey(x) < versionKey(y) ? -1 : 1))
    .slice(0, MAX_VERSIONS);
}
