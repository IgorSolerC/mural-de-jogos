import { DestroyRef, Injectable, InjectionToken, computed, effect, inject, signal, untracked } from '@angular/core';
import { readBackupFile } from './backup-file';
import { saveBeforeCloud } from './cloud-before';
import { Cloud } from './cloud-config';
import { CloudAccount, CloudError } from './cloud-account';
import { Review, isPrivate } from './review';
import { BackupPayload, ReviewStore, canonicalJson } from './review-store';
import { Settings } from './settings';
import { Confirm } from '../ui/confirm';

/**
 * A sincronização do mural com a nuvem.
 *
 * O aparelho continua sendo onde se trabalha (IndexedDB); a nuvem é a cópia que junta todos. Cada
 * versão do mural na nuvem tem um número (`rev`). Para gravar, o site diz em qual rev se baseou; se
 * outro aparelho gravou antes, a nuvem recusa (409), o site baixa, junta (com a mesma junção do
 * backup, que respeita as apagadas) e tenta de novo. Nada se perde quando dois aparelhos mexem.
 *
 * "Tem algo para enviar?" é decidido pela impressão digital do conteúdo (SHA-256 do mural em JSON
 * canônico), e não por um sinal de "sujo": juntar o que veio da nuvem não gera reenvio, e uma
 * mudança feita durante um envio fica para o próximo.
 */

/** O estado da sincronização neste aparelho (localStorage; "Apagar o save" leva junto). */
export const STATE_KEY = 'meu-mural:nuvem:sync';
/** De qual conta é o mural guardado aqui (fica ao sair mantendo o mural; vai com "Apagar o save"). */
export const OWNER_KEY = 'meu-mural:nuvem:dono';

/**
 * A versão do formato do mural na nuvem. Aumente quando `sanitizeReview`, `sanitizeDraft` ou
 * `sanitizeWish` passarem a guardar um campo novo, ou quando o mural da nuvem ganhar um campo: um
 * site antigo (aberto pelo cache do modo offline) que receber um mural de versão maior para de
 * sincronizar em vez de jogar fora o que não conhece. O teste "versão do formato" em
 * cloud-sync.spec.ts lembra disso.
 *
 * 2: as chaves de busca (`chaves`) passaram a ir no mural da nuvem.
 * 3: as fichas privadas (`private`, `publishedAt`). Um site antigo jogaria a marca fora e publicaria a ficha.
 */
export const SYNC_SCHEMA = 3;

/**
 * As chaves de busca (RAWG e TMDB) e quando mudaram. Vão só no mural privado da nuvem: nunca no
 * arquivo de backup nem no mural que os outros veem. A mudança mais nova vale.
 */
export interface SyncedKeys {
  rawg: string;
  tmdb: string;
  em: string;
}

/** As chaves que vieram da nuvem, ou null se não vieram (ou não servem). */
export function keysOf(data: Record<string, unknown>): SyncedKeys | null {
  const raw = data['chaves'] as Record<string, unknown> | undefined;
  if (!raw || typeof raw !== 'object') return null;
  const rawg = typeof raw['rawg'] === 'string' ? raw['rawg'].trim().slice(0, 200) : '';
  const tmdb = typeof raw['tmdb'] === 'string' ? raw['tmdb'].trim().slice(0, 600) : '';
  const em = typeof raw['em'] === 'string' && Number.isFinite(Date.parse(raw['em'])) ? raw['em'] : null;
  return em ? { rawg, tmdb, em } : null;
}

/** Qual chave vale: a mais nova; sem data aqui, vale a da nuvem. */
export function newerKeys(local: SyncedKeys | null, remote: SyncedKeys | null): 'local' | 'remote' {
  if (!remote) return 'local';
  if (!local) return 'remote';
  return remote.em > local.em ? 'remote' : 'local';
}

/** O site recusa enviar um mural compactado maior que isso (a nuvem aceita até 1,9 MB). */
export const MAX_GZ_BYTES = 1_800_000;
/** Resenhas criadas (ou tornadas públicas) há até 7 dias contam como novas para avisar quem segue. */
const NEW_REVIEW_DAYS = 7;
const MAX_NEW = 10;

/** O que os outros veem do mural: tudo, menos as fichas privadas. */
export function publicReviews(reviews: readonly Review[]): Review[] {
  return reviews.filter((r) => !isPrivate(r));
}

/**
 * As fichas que viram aviso para quem segue: as públicas que apareceram nos últimos 7 dias. Uma
 * ficha que era privada aparece quando deixa de ser (`publishedAt`), não quando foi escrita. A nuvem
 * só avisa uma vez de cada ficha, então mandar de novo não repete o aviso.
 */
export function newReviews(reviews: readonly Review[], now: number): { ref: string; titulo: string; mural: Review['kind'] }[] {
  const since = now - NEW_REVIEW_DAYS * 24 * 60 * MINUTE;
  const shownAt = (r: Review) => Date.parse(r.publishedAt ?? r.createdAt);
  return publicReviews(reviews)
    .filter((r) => shownAt(r) >= since)
    .sort((a, b) => shownAt(b) - shownAt(a))
    .slice(0, MAX_NEW)
    .map((r) => ({ ref: r.id, titulo: r.game.name, mural: r.kind }));
}
/**
 * Válvula de segurança contra um laço de envios (algo errado na junção, a nuvem esquecendo o mural):
 * o mesmo conteúdo enviado 3 vezes em 10 minutos, ou mais de 30 envios. Quem edita de verdade manda
 * um conteúdo novo a cada vez, uns segundos depois de parar de mexer, e não chega perto disso.
 */
const MAX_PUSHES_PER_10_MIN = 30;
const MAX_SAME_PUSHES_PER_10_MIN = 3;
const PUSH_WINDOW = 10 * 60_000;
const MINUTE = 60_000;

export type SyncStatus =
  | 'fora' // sem conta ou nuvem desligada
  | 'sincronizando'
  | 'ok'
  | 'sem-rede' // tentando de novo sozinho
  | 'pausado' // a nuvem pediu para esperar (cota, só leitura, desligada)
  | 'escolha' // primeira vez neste aparelho: falta a pessoa decidir
  | 'desatualizado' // o mural na nuvem é de uma versão mais nova do site
  | 'erro';

interface SyncState {
  /** A conta (id) a que este estado se refere. */
  conta: string;
  /** A rev da nuvem que este aparelho já tem juntada. */
  rev: number;
  /** A impressão digital do mural quando ele e a nuvem eram iguais pela última vez. */
  impressao: string;
  /** Quando a última sincronização terminou bem (ms). */
  em: number | null;
}

type Remote = { kind: 'same' } | { kind: 'none' } | { kind: 'doc'; rev: number; text: string; data: Record<string, unknown> };

/** Onde o estado da sincronização mora (o localStorage; os testes dão um por aparelho). */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const SYNC_STORAGE = new InjectionToken<KeyValueStore>('SYNC_STORAGE', {
  providedIn: 'root',
  factory: () => ({
    getItem: (k) => {
      try {
        return localStorage.getItem(k);
      } catch {
        return null;
      }
    },
    setItem: (k, v) => {
      try {
        localStorage.setItem(k, v);
      } catch {
        /* sem armazenamento: a próxima abertura recomeça pela primeira sincronização (que só junta) */
      }
    },
    removeItem: (k) => {
      try {
        localStorage.removeItem(k);
      } catch {
        /* idem */
      }
    },
  }),
});

/** Sincronizar sozinho (ao abrir, ao mudar algo, de tempos em tempos). Os testes desligam e chamam à mão. */
export const SYNC_AUTO = new InjectionToken<boolean>('SYNC_AUTO', { providedIn: 'root', factory: () => true });

function readState(kv: KeyValueStore): SyncState | null {
  try {
    const raw = JSON.parse(kv.getItem(STATE_KEY) ?? 'null') as Partial<SyncState> | null;
    if (!raw || typeof raw.conta !== 'string' || !Number.isSafeInteger(raw.rev) || typeof raw.impressao !== 'string') return null;
    return { conta: raw.conta, rev: raw.rev!, impressao: raw.impressao, em: typeof raw.em === 'number' ? raw.em : null };
  } catch {
    return null;
  }
}

const byId = <T extends { id: string }>(list: readonly T[]) => [...list].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

/** A impressão digital do conteúdo do mural (sem a data do backup nem o nome), com as chaves se houver. */
export async function fingerprint(doc: Pick<BackupPayload, 'reviews' | 'drafts' | 'wishes' | 'deleted'>, keys: SyncedKeys | null = null): Promise<string> {
  const text = canonicalJson({
    reviews: byId(doc.reviews ?? []),
    drafts: byId(doc.drafts ?? []),
    wishes: byId(doc.wishes ?? []),
    deleted: doc.deleted ?? { reviews: {}, drafts: {}, wishes: {} },
    ...(keys ? { chaves: keys } : {}),
  });
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function gzip(text: string): Promise<Blob> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Response(stream).blob();
}

/** O mural na nuvem é de uma versão do formato mais nova do que este site sabe ler? */
export function isNewerSchema(data: Record<string, unknown>): boolean {
  const schema = (data['sync'] as { schema?: unknown } | undefined)?.schema;
  return typeof schema === 'number' && schema > SYNC_SCHEMA;
}

@Injectable({ providedIn: 'root' })
export class CloudSync {
  private readonly cloud = inject(Cloud);
  private readonly account = inject(CloudAccount);
  private readonly store = inject(ReviewStore);
  private readonly settings = inject(Settings);
  private readonly confirm = inject(Confirm);
  private readonly kv = inject(SYNC_STORAGE);

  readonly status = signal<SyncStatus>('fora');
  /** O que mostrar junto do estado (erros e avisos), já em português. */
  readonly message = signal<string | null>(null);
  readonly lastSyncAt = signal<number | null>(readState(this.kv)?.em ?? null);
  /** Diferença entre o relógio da nuvem e o deste aparelho (ms; positivo: o aparelho está atrasado). */
  readonly clockSkew = signal(0);
  readonly clockWrong = computed(() => Math.abs(this.clockSkew()) > 5 * MINUTE);
  readonly active = computed(() => this.account.signedIn() && this.cloud.config() !== null);

  private timer: ReturnType<typeof setTimeout> | undefined;
  private failures = 0;
  /** Os envios dos últimos 10 minutos: quando e a impressão digital do que foi. */
  private pushes: { at: number; print: string }[] = [];
  private running = false;
  private rerun = false;
  /** A primeira sincronização deste aparelho espera a pessoa escolher (não pergunta de novo sozinha). */
  private waitingChoice = false;
  /** O mural local mudou por causa da própria sincronização: não agenda outra por isso. */
  private applying = false;
  private lastAttempt = 0;

  constructor() {
    if (!inject(SYNC_AUTO)) return;
    const destroy = inject(DestroyRef);
    // Entrou (ou a nuvem ligou): sincroniza já. Saiu: para.
    effect(() => {
      if (this.active()) {
        untracked(() => this.schedule(0));
      } else {
        untracked(() => {
          clearTimeout(this.timer);
          this.status.set('fora');
          this.message.set(null);
          this.waitingChoice = false;
        });
      }
    });

    // Mudou algo no mural: envia uns segundos depois da última mudança.
    let first = true;
    effect(() => {
      this.store.reviews();
      this.store.drafts();
      this.store.wishes();
      this.store.lastChangeAt();
      if (first) {
        first = false;
        return;
      }
      untracked(() => {
        if (this.active() && !this.applying && !this.waitingChoice) this.schedule(5_000);
      });
    });

    // Mudou uma chave de busca: vai para a nuvem também (só no mural privado).
    let firstKeys = true;
    effect(() => {
      this.settings.rawgKey();
      this.settings.tmdbKey();
      this.settings.keysAt();
      if (firstKeys) {
        firstKeys = false;
        return;
      }
      untracked(() => {
        if (this.active() && !this.applying && !this.waitingChoice) this.schedule(5_000);
      });
    });

    if (typeof window !== 'undefined') {
      const onVisible = () => {
        if (document.visibilityState === 'visible' && this.active() && Date.now() - this.lastAttempt > MINUTE) this.schedule(0);
      };
      const onOnline = () => this.active() && this.schedule(0);
      document.addEventListener('visibilitychange', onVisible);
      window.addEventListener('online', onOnline);
      const every = setInterval(() => {
        if (document.visibilityState === 'visible' && this.active()) this.schedule(0);
      }, 5 * MINUTE);
      destroy.onDestroy(() => {
        document.removeEventListener('visibilitychange', onVisible);
        window.removeEventListener('online', onOnline);
        clearInterval(every);
        clearTimeout(this.timer);
      });
    }
  }

  /** Sincroniza agora (o botão em Ajustes). Também é a volta da primeira sincronização adiada. */
  async syncNow(): Promise<void> {
    this.waitingChoice = false;
    clearTimeout(this.timer);
    await this.run();
  }

  private schedule(ms: number): void {
    if (this.waitingChoice) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.run(), ms);
  }

  private async run(): Promise<void> {
    if (this.running) {
      this.rerun = true;
      return;
    }
    this.running = true;
    try {
      await this.withLock(() => this.syncOnce());
    } finally {
      this.running = false;
      if (this.rerun) {
        this.rerun = false;
        this.schedule(1_000);
      }
    }
  }

  /** Uma aba por vez (as outras esperam a vez e acham tudo já feito). */
  private async withLock(fn: () => Promise<void>): Promise<void> {
    const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
    if (locks?.request) await locks.request('meu-mural:sync', fn);
    else await fn();
  }

  private async syncOnce(): Promise<void> {
    if (!this.active()) return;
    const account = this.account.account();
    if (!account?.id) {
      // conta de antes do id: busca o id e volta
      await this.account.refresh().catch(() => undefined);
      if (!this.account.account()?.id) return this.fail(new CloudError('Não consegui falar com a nuvem agora.', 'sem-rede', 0));
    }
    const accountId = this.account.account()!.id!;
    this.lastAttempt = Date.now();
    this.status.set('sincronizando');
    this.message.set(null);
    try {
      let state = readState(this.kv);
      if (state && state.conta !== accountId) state = null;
      if (!state) {
        state = await this.firstSync(accountId);
        if (!state) return;
      }
      await this.pullAndPush(state);
      this.failures = 0;
      this.status.set('ok');
    } catch (err) {
      this.fail(err);
    }
  }

  /** Baixa o que mudou na nuvem, junta, e envia se o mural daqui ficou diferente do de lá. */
  private async pullAndPush(state: SyncState): Promise<void> {
    let remote = await this.fetchRemote(state.rev);
    for (let attempt = 0; ; attempt++) {
      if (remote.kind === 'doc') {
        if (isNewerSchema(remote.data)) throw this.outdated();
        this.merge(remote.text);
        this.mergeKeys(remote.data);
        state = { ...state, rev: remote.rev };
        const here = await fingerprint(this.store.snapshot(), this.localKeys());
        if (here === (await fingerprint(remote.data as unknown as BackupPayload, keysOf(remote.data)))) state = { ...state, impressao: here };
        this.writeState(state);
      } else if (remote.kind === 'none' && state.rev !== 0) {
        // a nuvem perdeu o mural (conta recriada, banco restaurado): recomeça do zero, sem apagar nada aqui
        state = { ...state, rev: 0, impressao: '' };
        this.writeState(state);
      }

      const doc = this.store.snapshot(this.account.account()?.nome ?? '');
      const keys = this.localKeys();
      const here = await fingerprint(doc, keys);
      if (here === state.impressao) break;
      if (attempt >= 3) throw new CloudError('Outros aparelhos estão gravando ao mesmo tempo. Tento de novo daqui a pouco.', 'conflito', 409);
      try {
        const rev = await this.push(doc, state.rev, keys, here);
        state = { ...state, rev, impressao: here };
        this.writeState(state);
        break;
      } catch (err) {
        if (!(err instanceof CloudError && err.status === 409)) throw err;
        remote = await this.fetchRemote(); // outro aparelho gravou antes: baixa tudo, junta e tenta de novo
      }
    }
    const now = Date.now();
    this.writeState({ ...state, em: now });
    this.lastSyncAt.set(now);
  }

  /**
   * A primeira vez desta conta neste aparelho. Devolve o estado pronto para seguir, ou null quando
   * ficou esperando a pessoa escolher.
   */
  private async firstSync(accountId: string): Promise<SyncState | null> {
    const remote = await this.fetchRemote();
    if (remote.kind === 'doc' && isNewerSchema(remote.data)) throw this.outdated();
    const localHas = this.store.hasContent();
    const owner = this.kv.getItem(OWNER_KEY);
    const otherOwner = owner !== null && owner !== accountId;
    const remoteHas = remote.kind === 'doc' && this.hasContent(remote.data);
    const base: SyncState = { conta: accountId, rev: remote.kind === 'doc' ? remote.rev : 0, impressao: '', em: null };

    if (remoteHas && !localHas) {
      // aparelho vazio: o mural da conta desce
      this.apply(() => this.store.importJson((remote as { text: string }).text, 'replace'));
    } else if (localHas && (otherOwner || (remoteHas && owner !== accountId))) {
      // os dois têm mural, ou o daqui é de outra conta: a pessoa decide
      const choice = await this.ask(remoteHas, otherOwner);
      if (choice === null) {
        this.waitingChoice = true;
        this.status.set('escolha');
        this.message.set('Falta escolher o que fazer com o mural deste navegador.');
        return null;
      }
      await this.keepCopy();
      if (choice === 'conta') {
        const text = remote.kind === 'doc' ? remote.text : JSON.stringify({ reviews: [], drafts: [], wishes: [], deleted: {} });
        this.apply(() => this.store.importJson(text, 'replace'));
      } else if (remote.kind === 'doc') {
        this.merge(remote.text);
      }
    } else if (remoteHas && localHas) {
      // o mural daqui já era desta conta: junta sem perguntar (com a cópia de antes, por garantia)
      await this.keepCopy();
      this.merge((remote as { text: string }).text);
    }
    // as chaves: a da nuvem vale se for mais nova (a conferência seguinte é "mudou?", e não traria)
    if (remote.kind === 'doc') this.mergeKeys(remote.data);
    // (sem nada na nuvem e o daqui sem dono ou desta conta: sobe como está, logo abaixo)
    this.writeOwner(accountId);
    this.writeState(base);
    return base;
  }

  private async ask(remoteHas: boolean, otherOwner: boolean): Promise<'juntar' | 'conta' | null> {
    const here = this.describe(this.store.snapshot());
    if (!remoteHas) {
      // a conta não tem mural e o daqui é de outra conta
      const choice = await this.confirm.choose({
        title: 'Este mural é de outra conta',
        text: `Este navegador tem o mural de outra conta (${here}). Levar ele para a sua conta, ou começar a sua conta vazia? Começando vazia, o mural daqui fica guardado como backup por 30 dias, em Ajustes.`,
        confirm: 'Levar para a minha conta',
        secondary: 'Começar vazia',
      });
      return choice === 'confirm' ? 'juntar' : choice === 'secondary' ? 'conta' : null;
    }
    const choice = await this.confirm.choose({
      title: otherOwner ? 'Este mural é de outra conta' : 'Juntar os murais?',
      text:
        (otherOwner
          ? `Este navegador tem o mural de outra conta (${here}), e a sua conta já tem o dela. `
          : `Este navegador tem ${here}, e a sua conta já tem um mural. `) +
        'Juntar os dois, ou ficar só com o da conta? O mural daqui fica guardado como backup por 30 dias, em Ajustes.',
      confirm: 'Juntar os dois',
      secondary: 'Só o da conta',
    });
    return choice === 'confirm' ? 'juntar' : choice === 'secondary' ? 'conta' : null;
  }

  private describe(doc: BackupPayload): string {
    const n = doc.reviews.length;
    const extra = doc.drafts.length + doc.wishes.length;
    const reviews = `${n} ${n === 1 ? 'resenha' : 'resenhas'}`;
    return extra ? `${reviews} e mais ${extra} na fila e na wishlist` : reviews;
  }

  private hasContent(data: Record<string, unknown>): boolean {
    const len = (k: string) => (Array.isArray(data[k]) ? (data[k] as unknown[]).length : 0);
    const deleted = (data['deleted'] ?? {}) as Record<string, Record<string, unknown> | undefined>;
    const tombs = ['reviews', 'drafts', 'wishes'].reduce((n, k) => n + Object.keys(deleted[k] ?? {}).length, 0);
    return len('reviews') + len('drafts') + len('wishes') + tombs > 0;
  }

  /** A cópia de antes da nuvem (ver cloud-before.ts). */
  private async keepCopy(): Promise<void> {
    if (!this.store.hasContent()) return;
    const { blob } = await this.store.exportBackup(this.settings.ownerName());
    await saveBeforeCloud(blob);
  }

  private merge(text: string): void {
    this.apply(() => this.store.importJson(text, 'merge'));
  }

  /**
   * As chaves deste aparelho para a nuvem, ou null se não há nenhuma. Chaves de antes de existir a
   * data ganham a data de agora na primeira vez que sobem.
   */
  private localKeys(): SyncedKeys | null {
    const rawg = this.settings.rawgKey().trim();
    const tmdb = this.settings.tmdbKey().trim();
    let em = this.settings.keysAt();
    if (!em) {
      if (!rawg && !tmdb) return null;
      em = new Date().toISOString();
      untracked(() => this.settings.keysAt.set(em));
    }
    return { rawg, tmdb, em };
  }

  /** As chaves que vieram da nuvem ficam aqui se forem as mais novas. */
  private mergeKeys(data: Record<string, unknown>): void {
    const remote = keysOf(data);
    if (!remote) return;
    const em = this.settings.keysAt();
    const local = em ? { rawg: this.settings.rawgKey().trim(), tmdb: this.settings.tmdbKey().trim(), em } : null;
    if (newerKeys(local, remote) !== 'remote') return;
    if (local && local.rawg === remote.rawg && local.tmdb === remote.tmdb && local.em === remote.em) return;
    this.apply(() => this.settings.applyKeys(remote));
  }

  private apply(fn: () => void): void {
    this.applying = true;
    try {
      fn();
    } finally {
      // os effects do mural rodam depois; o envio que eles agendariam já está sendo feito aqui
      setTimeout(() => (this.applying = false), 0);
    }
  }

  private async fetchRemote(rev?: number): Promise<Remote> {
    let res: Response;
    try {
      res = await this.account.requestRaw(`/v1/eu/mural${rev === undefined ? '' : `?rev=${rev}`}`);
    } catch (err) {
      if (err instanceof CloudError && err.code === 'sem-mural') return { kind: 'none' };
      throw err;
    }
    this.noteClock(res);
    if (res.status === 204) return { kind: 'same' };
    const remoteRev = Number(res.headers.get('Mural-Rev'));
    const text = await readBackupFile(await res.blob());
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      throw new CloudError('O mural que veio da nuvem não abriu.', 'mural-invalido', 0);
    }
    if (!Number.isSafeInteger(remoteRev) || !data || typeof data !== 'object') {
      throw new CloudError('O mural que veio da nuvem não abriu.', 'mural-invalido', 0);
    }
    return { kind: 'doc', rev: remoteRev, text, data: data as Record<string, unknown> };
  }

  /** Envia o mural; devolve a rev nova. */
  private async push(doc: BackupPayload, base: number, keys: SyncedKeys | null, print: string): Promise<number> {
    const now = Date.now();
    this.pushes = this.pushes.filter((p) => now - p.at < PUSH_WINDOW);
    const same = this.pushes.filter((p) => p.print === print).length;
    if (this.pushes.length >= MAX_PUSHES_PER_10_MIN || same >= MAX_SAME_PUSHES_PER_10_MIN) {
      throw new CloudError(
        'A sincronização deu uma pausa para não gastar a nuvem: foram envios demais seguidos. Ela volta sozinha em alguns minutos; se continuar, avise.',
        'envios-demais',
        0,
      );
    }
    if (typeof CompressionStream === 'undefined') {
      throw new CloudError('Este navegador não sabe compactar o mural para a nuvem. Atualize o navegador.', 'sem-compressao', 0);
    }
    const name = this.account.account()?.nome ?? '';
    // as chaves só no privado: o público e o arquivo de backup nunca levam
    const privado = await gzip(JSON.stringify({ ...doc, ...(keys ? { chaves: keys } : {}), sync: { schema: SYNC_SCHEMA } }));
    if (privado.size > MAX_GZ_BYTES) {
      throw new CloudError('O mural ficou grande demais para a nuvem (passa de 1,8 MB compactado). Ele continua salvo aqui.', 'mural-grande-demais', 413);
    }
    const publico = await gzip(
      // o que os outros veem: sem as fichas privadas
      JSON.stringify({ app: 'meu-mural', version: 2, exportedAt: doc.exportedAt, ...(name ? { owner: { name } } : {}), reviews: publicReviews(doc.reviews) }),
    );
    const novas = newReviews(doc.reviews, now);
    const form = new FormData();
    form.append('privado', privado, 'privado.json.gz');
    form.append('publico', publico, 'publico.json.gz');
    form.append('novas', JSON.stringify(novas));
    this.pushes.push({ at: now, print });
    const res = await this.account.requestRaw('/v1/eu/mural', { method: 'PUT', headers: { 'Mural-Rev-Base': String(base) }, body: form });
    this.noteClock(res);
    const body = (await res.json()) as { rev: number };
    return body.rev;
  }

  private noteClock(res: Response): void {
    const cloud = Date.parse(res.headers.get('Mural-Agora') ?? '');
    if (Number.isFinite(cloud)) this.clockSkew.set(cloud - Date.now());
  }

  private outdated(): CloudError {
    return new CloudError(
      'O mural na nuvem foi salvo por uma versão mais nova do site. Recarregue a página para continuar sincronizando.',
      'desatualizado',
      0,
    );
  }

  private fail(err: unknown): void {
    const e = err instanceof CloudError ? err : new CloudError('Algo deu errado na sincronização.', 'erro', 0);
    if (e.code === 'desatualizado') {
      this.status.set('desatualizado');
      this.message.set(e.message);
      return;
    }
    if (e.status === 401) {
      this.status.set('fora');
      this.message.set(null);
      return;
    }
    if (e.status === 0 && e.code === 'sem-rede') {
      this.status.set('sem-rede');
      this.message.set('Sem conexão com a nuvem. O mural está salvo neste aparelho e sobe quando a conexão voltar.');
      this.failures++;
      this.schedule(Math.min(30 * MINUTE, 30_000 * 2 ** (this.failures - 1)));
      return;
    }
    if (e.status === 429) {
      this.status.set('sincronizando');
      this.schedule(5_000);
      return;
    }
    if (e.status === 503) {
      this.status.set('pausado');
      this.message.set(e.message);
      this.schedule(30 * MINUTE);
      return;
    }
    this.status.set('erro');
    this.message.set(e.message);
    if (e.code === 'envios-demais') {
      // volta sozinha quando o envio mais antigo sai da janela de 10 minutos
      const oldest = Math.min(...this.pushes.map((p) => p.at));
      this.schedule(Math.max(MINUTE, oldest + PUSH_WINDOW - Date.now()));
      return;
    }
    if (e.code !== 'mural-grande-demais' && e.code !== 'sem-compressao') {
      this.failures++;
      this.schedule(Math.min(30 * MINUTE, 30_000 * 2 ** (this.failures - 1)));
    }
  }

  /**
   * Sair da conta, decidindo o que fica neste navegador. Devolve false se a pessoa desistiu.
   * Tirar o mural daqui só com tudo já na nuvem.
   */
  async signOut(): Promise<boolean> {
    const choice = await this.confirm.choose({
      title: 'Sair da conta?',
      text: 'Na nuvem o mural continua. Aqui, ele pode ficar (aparelho seu) ou sair (aparelho emprestado).',
      confirm: 'Sair e manter aqui',
      secondary: 'Sair e tirar daqui',
      cancel: 'Cancelar',
    });
    if (choice === null) return false;
    if (choice === 'secondary') {
      await this.syncNow();
      if (!(await this.everythingSent())) {
        await this.confirm.ask({
          title: 'Ainda tem coisa só aqui',
          text: 'Há mudanças neste navegador que ainda não subiram para a nuvem, então o mural não pode sair daqui agora. Confira a conexão e tente de novo.',
          confirm: 'Entendi',
          cancel: 'Fechar',
          icon: null,
        });
        return false;
      }
    }
    await this.account.signOut();
    this.writeState(null);
    this.lastSyncAt.set(null);
    if (choice === 'secondary') {
      this.writeOwner(null);
      const { eraseSave } = await import('./erase-save');
      await eraseSave();
      location.reload();
    }
    return true;
  }

  /** Depois de apagar a conta: o mural daqui não é de conta nenhuma. */
  forgetAccount(): void {
    this.writeState(null);
    this.writeOwner(null);
    this.lastSyncAt.set(null);
  }

  private writeState(state: SyncState | null): void {
    if (state) this.kv.setItem(STATE_KEY, JSON.stringify(state));
    else this.kv.removeItem(STATE_KEY);
  }

  private writeOwner(id: string | null): void {
    if (id) this.kv.setItem(OWNER_KEY, id);
    else this.kv.removeItem(OWNER_KEY);
  }

  /** O mural daqui é igual ao que está na nuvem? */
  async everythingSent(): Promise<boolean> {
    const state = readState(this.kv);
    const id = this.account.account()?.id;
    if (!state || state.conta !== id) return !this.store.hasContent();
    return (await fingerprint(this.store.snapshot(), this.localKeys())) === state.impressao;
  }
}
