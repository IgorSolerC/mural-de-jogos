import { DestroyRef, Injectable, InjectionToken, Injector, computed, effect, inject, signal, untracked } from '@angular/core';
import { CloudAccount, CloudError } from './cloud-account';
import { Cloud } from './cloud-config';
import { DataKey, LocalData } from './local-data';
import { Review, sanitizeReview } from './review';
import { ReviewStore, SharedSink } from './review-store';
import {
  MemberRole,
  arrivalOrg,
  outOfSharedGroup,
  legacyOrg,
  orgOf,
  samePersonal,
  Personal,
  SharedConflict,
  SharedDetail,
  SharedMember,
  SharedPerson,
  SharedRole,
  canManage,
  canWrite,
  mergeNote,
  noteFrom,
  parseDetail,
  parsePerson,
  personalOf,
  sameShared,
  sanitizePersonal,
  sharedContent,
  withPersonal,
} from './shared-notes';

/**
 * As anotações compartilhadas deste aparelho e a sincronização delas com a nuvem (ver
 * core/shared-notes.ts e api/src/routes/notes.ts).
 *
 * Cada anotação guarda a versão da nuvem em que este aparelho está (`base`, na `rev`) e, se houver, a
 * edição daqui que ainda não subiu (`local`). Para subir, o site diz em qual `rev` se baseou; se outra
 * pessoa gravou antes, a nuvem devolve a de agora, e as duas se juntam como no git (`mergeNote`): o que
 * só um mexeu entra, o que os dois acrescentaram fica. O que os dois mudaram de jeitos diferentes sobe
 * como conflito: a nuvem guarda as duas versões, e quem escreve escolhe uma (`resolve`).
 *
 * Fica tudo no IndexedDB, por conta (outra conta neste navegador não vê nem mexe nas de outra), e
 * funciona sem rede: a edição espera e sobe quando a conexão voltar. Nada da anotação vai no mural da
 * nuvem; só o lugar dela no mural de quem está aqui (fixada no topo, o grupo, o assunto e as tags), que
 * é da pessoa e vai para os outros aparelhos dela pelo mural privado (`places`, ver core/cloud-sync.ts),
 * nunca para a anotação.
 */

export const SHARED_KEY: DataKey = 'meu-mural:compartilhadas:v1';
/** Sincronizar sozinho (ao entrar, de tempos em tempos, depois de editar). Os testes desligam e chamam à mão. */
export const SHARED_AUTO = new InjectionToken<boolean>('SHARED_AUTO', { providedIn: 'root', factory: () => true });

const SECOND = 1_000;
const MINUTE = 60 * SECOND;
/** Quanto depois da última edição ela sobe. */
const PUSH_DELAY = 1_500;
/** De quanto em quanto tempo confere se algo mudou (com a aba à vista). */
const POLL_EVERY = MINUTE;
/** Com uma compartilhada aberta na leitura ou no editor: mais seguido, para ver os outros escrevendo. */
const POLL_OPEN = 15 * SECOND;
/** Quantas anotações pedir de uma vez à nuvem (a API devolve até 25). */
const DETAILS_PAGE = 25;

/** Uma anotação compartilhada neste aparelho. */
export interface SharedEntry {
  id: string;
  dono: SharedPerson;
  papel: SharedRole;
  membros: SharedMember[];
  /** A versão do conteúdo na nuvem em que este aparelho está. */
  rev: number;
  /** Sobe a cada mudança qualquer na nuvem (o conteúdo, as pessoas, o conflito). */
  versao: number;
  /** O conteúdo da nuvem na `rev` (de onde a edição daqui partiu). */
  base: Review;
  /** A edição daqui que ainda não subiu. */
  local: Review | null;
  /** A outra versão de um conflito achado aqui, que ainda não subiu junto com a `local`. */
  outra: Review | null;
  /** A `local` é a escolha num conflito (sobe tirando o conflito). */
  resolver: boolean;
  conflito: SharedConflict | null;
  atualizadoEm: string;
  atualizadoPor: SharedPerson | null;
  /** O lugar dela no mural de quem está aqui (fixada no topo, o grupo, o assunto e as tags): não vai para a nuvem. */
  pessoal: Personal;
  /** A anotação como ela aparece no mural (feita uma vez por mudança, para o mural saber o que mudou). */
  view: Review;
}

/** Um aviso do que aconteceu sem a pessoa pedir (para o bilhete do app). */
export type SharedNotice =
  | { tipo: 'conflito'; id: string; titulo: string }
  | { tipo: 'escolhido'; id: string; titulo: string; por: string }
  | { tipo: 'saiu'; id: string; titulo: string };

/**
 * O lugar de uma anotação compartilhada no mural de quem está aqui (fixada no topo, o grupo, o assunto
 * e as tags) e quando ele mudou: vai para os outros aparelhos da pessoa, e o mudado por último vale.
 */
export interface Place {
  p: Personal;
  em: string;
}

/** Lugares demais viram lixo guardado: os mais novos ficam (uma conta tem até 500 compartilhadas). */
export const MAX_PLACES = 600;

/**
 * Quando mudou o lugar em que a anotação chega (Compartilhadas): nunca. Ninguém o escolheu, então o
 * escolhido em qualquer outro aparelho vale mais, mesmo chegando depois dela.
 */
export const ARRIVAL_AT = new Date(0).toISOString();

/** Os lugares guardados ou vindos da nuvem (id → lugar), só os que servem. */
export function sanitizePlaces(raw: unknown): Map<string, Place> {
  const out = new Map<string, Place>();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    const em = (v as { em?: unknown } | null)?.em;
    if (!/^[\w-]{4,64}$/.test(id) || typeof em !== 'string' || !Number.isFinite(Date.parse(em))) continue;
    out.set(id, { p: sanitizePersonal((v as { p?: unknown }).p), em });
  }
  return newestPlaces(out);
}

function newestPlaces(map: Map<string, Place>): Map<string, Place> {
  if (map.size <= MAX_PLACES) return map;
  return new Map([...map].sort(([, a], [, b]) => (a.em < b.em ? 1 : a.em > b.em ? -1 : 0)).slice(0, MAX_PLACES));
}

/** O que vai no armazenamento: as anotações de cada conta, e o lugar delas no mural. */
interface Stored {
  contas: Record<string, unknown[]>;
  lugares: Record<string, unknown>;
}

const json = (r: Review | null) => (r ? sharedContent(r) : null);

function viewOf(e: Omit<SharedEntry, 'view'>): Review {
  return withPersonal(e.local ?? e.base, e.pessoal);
}

function entryOf(e: Omit<SharedEntry, 'view'>): SharedEntry {
  return { ...e, view: viewOf(e) };
}

function storedEntry(e: SharedEntry): unknown {
  const { view: _v, base, local, outra, conflito, ...rest } = e;
  return {
    ...rest,
    base: json(base),
    local: json(local),
    outra: json(outra),
    conflito: conflito ? { ...conflito, a: json(conflito.a), b: json(conflito.b) } : null,
  };
}

/**
 * Uma anotação guardada neste aparelho. A guardada antes do grupo, do assunto e das tags serem de cada
 * um (build 463) os tinha no conteúdo: eles viram os desta pessoa, e ela fica onde estava. `migrated`:
 * quando esse grupo foi escolhido (no mais tarde, quando o conteúdo guardado mudou), não a hora da
 * conversão; o aparelho que ficou fechado esse tempo todo tem o grupo de antes, e o escolhido depois
 * em outro aparelho vale mais.
 */
function readEntry(raw: unknown): (SharedEntry & { migrated?: string }) | null {
  const r = raw as Record<string, unknown> | null;
  const id = typeof r?.['id'] === 'string' ? r['id'] : null;
  if (!id) return null;
  const detail = parseDetail({ ...r, dados: r?.['base'], conflito: r?.['conflito'] });
  if (!detail) return null;
  const local = r?.['local'] ? noteFrom(r['local'], id) : null;
  const outra = r?.['outra'] ? noteFrom(r['outra'], id) : null;
  const stored = sanitizePersonal(r?.['pessoal']);
  const before = r?.['local'] ? sanitizeReview(r['local']) : null;
  const pessoal = legacyOrg(stored, before ? orgOf(before) : detail.orgDados);
  const entry = entryOf({
    id,
    dono: detail.dono,
    papel: detail.papel,
    membros: detail.membros,
    rev: detail.rev,
    versao: detail.versao,
    base: detail.dados,
    local,
    outra: local ? outra : null,
    resolver: r?.['resolver'] === true && !!local,
    conflito: detail.conflito,
    atualizadoEm: detail.atualizadoEm,
    atualizadoPor: detail.atualizadoPor,
    pessoal,
  });
  return stored.org ? entry : { ...entry, migrated: before?.updatedAt ?? detail.atualizadoEm };
}

@Injectable({ providedIn: 'root' })
export class SharedStore implements SharedSink {
  private readonly data = inject(LocalData);
  private readonly store = inject(ReviewStore);
  private readonly account = inject(CloudAccount);
  private readonly cloud = inject(Cloud);
  private readonly auto = inject(SHARED_AUTO);
  private readonly injector = inject(Injector);

  /** As anotações compartilhadas da conta de agora (id → anotação). */
  readonly entries = signal<ReadonlyMap<string, SharedEntry>>(new Map());
  /**
   * O lugar de cada uma no mural de quem está aqui, com quando mudou (ver `Place`), também das que
   * ainda não chegaram neste aparelho: elas já chegam no lugar escolhido em outro.
   */
  readonly places = signal<ReadonlyMap<string, Place>>(new Map());
  /**
   * A conta em que se está (null: sem conta, e as compartilhadas não aparecem). Sem rede elas continuam
   * no mural: só a sincronização espera.
   */
  private readonly accountId = computed(() => (this.account.signedIn() ? (this.account.account()?.id ?? null) : null));
  /** Sincroniza: com conta e com a nuvem ligada. */
  readonly active = computed(() => this.accountId() !== null && this.cloud.config() !== null);
  /** As anotações com conflito que quem está aqui resolve (o dono, os gestores e os editores). */
  readonly conflicts = computed(() => [...this.entries().values()].filter((e) => e.conflito && canWrite(e.papel)));
  /** O último aviso (um conflito chegou, alguém escolheu antes, a anotação saiu do mural). */
  readonly notice = signal<(SharedNotice & { at: number }) | null>(null);
  /** As anotações abertas agora na leitura ou no editor: conferidas mais seguido. */
  private readonly watching = signal<ReadonlySet<string>>(new Set());

  /** De qual conta são as `entries` (null: nenhuma carregada). */
  private loadedFor: string | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private pushTimer: ReturnType<typeof setTimeout> | undefined;
  private current: Promise<void> | null = null;
  private rerun = false;
  /** Os conflitos que já abriram o aviso neste aparelho (não avisa duas vezes do mesmo). */
  private readonly told = new Set<string>();

  constructor() {
    this.store.attachShared(this);
    // a conta mudou (entrou, saiu, trocou): as compartilhadas dela, e só elas
    effect(() => {
      const id = this.accountId();
      untracked(() => this.loadFor(id));
    });
    // o mural mostra o que está aqui
    effect(() => {
      const list = [...this.entries().values()];
      untracked(() =>
        this.store.setShared(
          list.map((e) => e.view),
          new Set(list.filter((e) => e.papel !== 'dono').map((e) => e.id)),
        ),
      );
    });
    // outra aba mexeu: acompanha
    this.data.onExternalChange((key) => {
      if (key === SHARED_KEY) this.loadFor(this.accountId(), true);
    });
    if (!this.auto) return;
    const destroy = inject(DestroyRef);
    destroy.onDestroy(() => {
      clearTimeout(this.timer);
      clearTimeout(this.pushTimer);
    });
    effect(() => {
      if (this.active()) untracked(() => this.schedule(0));
      else clearTimeout(this.timer);
    });
    if (typeof window !== 'undefined') {
      const onVisible = () => document.visibilityState === 'visible' && this.active() && this.schedule(0);
      const onOnline = () => this.active() && this.schedule(0);
      document.addEventListener('visibilitychange', onVisible);
      window.addEventListener('online', onOnline);
      destroy.onDestroy(() => {
        document.removeEventListener('visibilitychange', onVisible);
        window.removeEventListener('online', onOnline);
      });
    }
  }

  // ——— o que o mural e as telas perguntam ———

  get(id: string): SharedEntry | undefined {
    return this.entries().get(id);
  }

  role(id: string): SharedRole | null {
    return this.entries().get(id)?.papel ?? null;
  }

  /** Lida, mas não escrita: a pessoa é leitora. */
  readOnly(id: string): boolean {
    const e = this.entries().get(id);
    return !!e && !canWrite(e.papel);
  }

  owned(): ReadonlySet<string> {
    return new Set([...this.entries().values()].filter((e) => e.papel === 'dono').map((e) => e.id));
  }

  /**
   * As compartilhadas que os outros veem no mural público de quem está aqui (as que não são privadas),
   * com o dono quando não é a própria pessoa.
   */
  publicShared(): { note: Review; dono: SharedPerson | null }[] {
    return [...this.entries().values()].filter((e) => !e.view.private).map((e) => ({ note: e.view, dono: e.papel === 'dono' ? null : e.dono }));
  }

  /**
   * Os lugares que vieram de outro aparelho da pessoa (pelo mural privado): cada um fica se for o
   * mudado por último, e a anotação que já está aqui vai para ele.
   */
  mergePlaces(remote: ReadonlyMap<string, Place>): void {
    const places = new Map(this.places());
    let changed = false;
    for (const [id, place] of remote) {
      const here = places.get(id);
      if (here && here.em >= place.em) continue;
      // o lugar de um site de antes (sem o grupo) só traz a fixada: o grupo guardado continua no lugar,
      // para o aparelho novo que a receber achar a anotação nele
      const known = here?.p.org ? here.p : this.entries().get(id)?.pessoal;
      places.set(id, place.p.org || !known?.org ? place : { p: legacyOrg(place.p, known), em: place.em });
      changed = true;
    }
    if (!changed) return;
    this.places.set(newestPlaces(places));
    for (const e of [...this.entries().values()]) {
      const place = this.places().get(e.id)?.p;
      // o lugar de um site de antes (sem o grupo): só a fixada muda, o grupo fica
      let p = place && legacyOrg(place, e.pessoal);
      // um aparelho com o site de antes da build 677 pôs a recebida no grupo Compartilhadas: ela sai dele
      const out = p && e.papel !== 'dono' ? outOfSharedGroup(p, this.places().get(e.id)!.em) : null;
      if (out) {
        p = out;
        this.setPlace(e.id, out, ARRIVAL_AT);
      }
      if (p && !samePersonal(p, e.pessoal)) this.put({ ...e, pessoal: p });
    }
    this.persist();
  }

  private setPlace(id: string, p: Personal, em = new Date().toISOString()): void {
    const places = new Map(this.places());
    places.set(id, { p, em });
    this.places.set(newestPlaces(places));
  }

  /** A leitura ou o editor abriu (ou fechou) uma compartilhada: enquanto aberta, ela é conferida mais seguido. */
  watch(id: string, on: boolean): void {
    if (!this.entries().has(id) && on) return;
    const next = new Set(this.watching());
    if (on) next.add(id);
    else next.delete(id);
    this.watching.set(next);
    if (on && this.auto) this.schedule(0);
  }

  /** Confere já (ao abrir uma compartilhada, ao chegar o aviso de que compartilharam algo). */
  refreshSoon(): void {
    if (this.auto && this.active()) this.schedule(0);
  }

  // ——— o que muda daqui ———

  /**
   * A anotação foi salva neste aparelho (ver `SharedSink`). Quem só lê muda só o lugar dela no próprio
   * mural (fixada, o grupo, o assunto e as tags, que são de cada um); o editor não muda a estrutura (quem
   * vê fica como está). Com `from`
   * (a versão que o editor abriu) diferente da de agora (outra pessoa gravou enquanto ele estava aberto),
   * as duas se juntam como no git.
   */
  save(review: Review, from?: Review): void {
    const e = this.entries().get(review.id);
    if (!e) return;
    const pessoal = personalOf(review);
    const current = e.local ?? e.base;
    let next: Review = withPersonal(review, {});
    if (!canWrite(e.papel)) next = current;
    else if (!canManage(e.papel)) next = withStructureOf(next, current);
    let local = e.local;
    let outra = e.outra;
    if (canWrite(e.papel) && !sameShared(next, current)) {
      if (from && !sameShared(withPersonal(from, {}), current)) {
        // o editor abriu uma versão e outra chegou por baixo: junta as duas a partir da que ele abriu
        const m = mergeNote(withPersonal(from, {}), current, next);
        local = m.merged;
        outra = m.other ?? outra;
      } else {
        local = { ...next, updatedAt: next.updatedAt > current.updatedAt ? next.updatedAt : new Date().toISOString() };
      }
    }
    if (local === e.local && outra === e.outra && samePersonal(pessoal, e.pessoal)) return;
    // o lugar mudou quando a anotação diz (agora, no que a pessoa mexe; antes, numa conversão), nunca no futuro
    const now = new Date().toISOString();
    if (!samePersonal(pessoal, e.pessoal)) this.setPlace(e.id, pessoal, review.updatedAt < now ? review.updatedAt : now);
    this.put({ ...e, local, outra, pessoal });
    if (local !== e.local) this.schedulePush();
  }

  /**
   * Compartilha uma anotação do próprio mural: ela passa a morar na nuvem à parte, com as pessoas
   * pedidas. Devolve a anotação compartilhada (ou lança CloudError com a mensagem pronta).
   */
  async share(review: Review, people: { codigo: string; papel: MemberRole }[]): Promise<SharedEntry> {
    const res = await this.account.request<{ nota: unknown }>('/v1/notas', {
      method: 'POST',
      body: { id: review.id, dados: sharedContent(review), membros: people },
    });
    const detail = parseDetail(res?.nota);
    if (!detail) throw new CloudError('A nuvem respondeu de um jeito estranho. Tente de novo.', 'resposta-invalida', 0);
    // a de antes de compartilhar continua sendo a mais nova aqui, se mudou durante o pedido
    const now = this.store.get(review.id) ?? review;
    const local = sameShared(withPersonal(now, {}), detail.dados) ? null : withPersonal(now, {});
    // o grupo, o assunto e as tags continuam os de quem compartilhou (só para ele)
    const pessoal = personalOf(now);
    this.setPlace(detail.id, pessoal);
    const entry = this.adopt(detail, { pessoal, local });
    if (local) this.schedulePush();
    return entry;
  }

  /** Põe alguém na anotação, ou troca o papel de quem já está (o dono e os gestores). */
  async setRole(id: string, codigo: string, papel: MemberRole): Promise<void> {
    const res = await this.account.request<{ nota: unknown }>(`/v1/notas/${encodeURIComponent(id)}/membros/${encodeURIComponent(codigo)}`, {
      method: 'PUT',
      body: { papel },
    });
    this.integrateDetail(res?.nota);
  }

  /** Tira alguém da anotação (o dono e os gestores). */
  async removeMember(id: string, codigo: string): Promise<void> {
    const res = await this.account.request<{ nota: unknown }>(`/v1/notas/${encodeURIComponent(id)}/membros/${encodeURIComponent(codigo)}`, {
      method: 'DELETE',
    });
    this.integrateDetail(res?.nota);
  }

  /**
   * Sai da anotação: ela some do seu mural (quem ficou continua com ela). Uma edição daqui que ainda não
   * subiu não vai mais, mas fica guardada (em Ajustes), como quando a anotação sai pela nuvem.
   */
  async leave(id: string): Promise<void> {
    try {
      await this.account.request(`/v1/notas/${encodeURIComponent(id)}/membros/eu`, { method: 'DELETE' });
    } catch (err) {
      // já não estava nela: sai daqui do mesmo jeito
      if (!(err instanceof CloudError && err.status === 404)) throw err;
    }
    const e = this.entries().get(id);
    if (e?.local && !sameShared(e.local, e.base)) this.store.keepVersions([withPersonal(e.local, e.pessoal)], 'compartilhada');
    this.drop(id);
  }

  /** Apaga para todos (só o dono). */
  async deleteForAll(id: string): Promise<void> {
    try {
      await this.account.request(`/v1/notas/${encodeURIComponent(id)}`, { method: 'DELETE' });
    } catch (err) {
      if (!(err instanceof CloudError && err.status === 404)) throw err;
    }
    this.drop(id);
  }

  /**
   * Escolhe uma das versões de um conflito (ou uma terceira, juntando as duas). Ela vira a anotação e
   * sobe tirando o conflito; se outra pessoa escolheu antes, vale a escolha dela. As duas versões são
   * de quando o conflito aconteceu: o que alguém escreveu depois dele (em outro trecho) continua, porque
   * a escolha entra na anotação de agora como uma edição a partir da versão que ficou valendo (`a`).
   */
  resolve(id: string, chosen: Review): void {
    const e = this.entries().get(id);
    if (!e || !e.conflito || !canWrite(e.papel)) return;
    this.told.add(conflictKey(e));
    const current = e.local ?? e.base;
    const pick = withPersonal(chosen, {});
    const m = mergeNote(e.conflito.a, current, pick);
    // o que veio depois mexeu no mesmo trecho que a escolha: vale a escolha
    let next = m.other ?? m.merged;
    // quem não gere só manda a estrutura (quem vê) de agora ou a da versão escolhida (a nuvem recusa outra)
    if (!canManage(e.papel) && structureKey(next) !== structureKey(current) && structureKey(next) !== structureKey(pick)) next = withStructureOf(next, pick);
    this.put({ ...e, local: { ...next, updatedAt: new Date().toISOString() }, outra: null, resolver: true, conflito: null });
    this.schedulePush(0);
  }

  /** Confere agora: baixa o que mudou, junta e sobe o que está esperando. */
  async sync(): Promise<void> {
    if (this.current) {
      this.rerun = true;
      return this.current;
    }
    this.current = this.withLock(() => this.syncOnce());
    try {
      await this.current;
    } finally {
      this.current = null;
      if (this.rerun) {
        this.rerun = false;
        if (this.auto) this.schedule(SECOND);
      }
    }
  }

  // ——— por dentro ———

  private schedule(ms: number): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.sync().catch(() => undefined), ms);
  }

  private schedulePush(ms = PUSH_DELAY): void {
    if (!this.auto) return;
    clearTimeout(this.pushTimer);
    this.pushTimer = setTimeout(() => void this.sync().catch(() => undefined), ms);
  }

  /** A próxima conferida sozinha: mais seguido com uma compartilhada aberta, e só com a aba à vista. */
  private nextPoll(failed: boolean): void {
    if (!this.auto || !this.active()) return;
    const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
    if (hidden) return;
    const open = [...this.watching()].some((id) => this.entries().has(id));
    this.schedule(failed ? 2 * MINUTE : open ? POLL_OPEN : POLL_EVERY);
  }

  private async withLock(fn: () => Promise<void>): Promise<void> {
    const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
    if (locks?.request) await locks.request('meu-mural:compartilhadas', fn);
    else await fn();
  }

  private async syncOnce(): Promise<void> {
    const account = this.accountId();
    if (!account || !this.active()) return;
    // outra aba pode ter gravado enquanto esta esperava a vez
    this.loadFor(account, true);
    let failed = false;
    try {
      await this.pull();
      await this.pushAll();
    } catch (err) {
      failed = true;
      if (!(err instanceof CloudError)) console.error(err);
    } finally {
      this.nextPoll(failed);
    }
  }

  /** Baixa a lista e as anotações que mudaram. */
  private async pull(): Promise<void> {
    const res = await this.account.request<{ notas?: unknown }>('/v1/eu/notas');
    // uma resposta sem a lista (a página de um wi-fi de hotel, com 200) não diz que elas saíram: tirar
    // todas daqui levaria junto o lugar delas, e elas voltariam no grupo de antes
    if (!Array.isArray(res?.notas)) throw new CloudError('A nuvem respondeu de um jeito estranho. Tente de novo.', 'resposta-invalida', 0);
    const index = new Map<string, number>();
    for (const item of res.notas) {
      const r = item as Record<string, unknown> | null;
      if (typeof r?.['id'] === 'string' && Number.isSafeInteger(r['versao'])) index.set(r['id'], r['versao'] as number);
    }
    // as que saíram: a pessoa saiu (ou foi tirada), ou o dono apagou
    for (const e of [...this.entries().values()]) if (!index.has(e.id)) this.drop(e.id, true);
    const stale = [...index].filter(([id, v]) => this.entries().get(id)?.versao !== v).map(([id]) => id);
    const before = new Set(this.entries().keys());
    for (let i = 0; i < stale.length; i += DETAILS_PAGE) {
      const ids = stale.slice(i, i + DETAILS_PAGE);
      const page = await this.account.request<{ notas?: unknown[] }>(`/v1/eu/notas/detalhes?ids=${ids.map(encodeURIComponent).join(',')}`);
      for (const raw of Array.isArray(page?.notas) ? page.notas : []) this.integrateDetail(raw);
    }
    // chegou uma anotação de outra pessoa: o aviso "compartilhou com você" já está no correio, sem esperar a conferida dele
    const arrived = [...this.entries().values()].some((e) => !before.has(e.id) && e.papel !== 'dono');
    if (arrived && this.auto) {
      const { Follow } = await import('./follow');
      void this.injector.get(Follow).check();
    }
  }

  /** Sobe o que está esperando, uma anotação de cada vez. */
  private async pushAll(): Promise<void> {
    for (const id of [...this.entries().keys()]) {
      for (let attempt = 0; attempt < 4; attempt++) {
        const e = this.entries().get(id);
        if (!e || (!e.local && !e.outra) || !canWrite(e.papel)) break;
        const done = await this.pushOne(e);
        if (done) break;
      }
    }
  }

  /** Sobe a edição daqui; devolve false se precisa tentar de novo (outra pessoa gravou antes e já juntou). */
  private async pushOne(e: SharedEntry): Promise<boolean> {
    const sent = e.local ?? e.base;
    const body = {
      base: e.rev,
      dados: sharedContent(sent),
      ...(e.outra ? { conflito: { b: sharedContent(e.outra) } } : e.resolver ? { resolver: true } : {}),
    };
    let res: Response;
    try {
      res = await this.account.requestRaw(`/v1/notas/${encodeURIComponent(e.id)}`, { method: 'PUT', body });
    } catch (err) {
      if (!(err instanceof CloudError)) throw err;
      if (err.status === 409) {
        // outra pessoa gravou antes: a de agora vem junto, e as duas se juntam antes de tentar de novo
        const now = (err.body as { nota?: unknown } | null)?.nota;
        if (now && parseDetail(now)) this.integrateDetail(now);
        else await this.refetch(e.id);
        return false;
      }
      if (err.status === 429) return true; // a próxima conferida sobe
      if (err.status === 404) {
        this.drop(e.id, true);
        return true;
      }
      if (err.status === 403) {
        // não pode mais escrever (virou leitor) ou mudou o que não podia: a edição fica guardada
        this.store.keepVersions([withPersonal(sent, e.pessoal)], 'compartilhada');
        // (saiu dela enquanto o pedido ia: não há mais o que limpar nem baixar)
        const now = this.entries().get(e.id);
        if (!now) return true;
        this.put({ ...now, local: null, outra: null, resolver: false });
        await this.refetch(e.id);
        return true;
      }
      throw err;
    }
    const detail = parseDetail(((await res.json().catch(() => null)) as { nota?: unknown } | null)?.nota);
    const now = this.entries().get(e.id);
    if (!detail || !now) return true;
    // o que mudou aqui enquanto subia continua esperando (já partindo do que subiu)
    const changedMeanwhile = now.local !== e.local;
    const conflict = detail.conflito;
    this.put({
      ...now,
      ...meta(detail),
      base: detail.dados,
      rev: detail.rev,
      local: changedMeanwhile ? now.local : null,
      outra: changedMeanwhile ? now.outra : null,
      resolver: changedMeanwhile ? now.resolver : false,
      conflito: conflict,
    });
    if (conflict && e.outra) this.announce(this.entries().get(e.id)!);
    return true;
  }

  private async refetch(id: string): Promise<void> {
    const page = await this.account.request<{ notas?: unknown[] }>(`/v1/eu/notas/detalhes?ids=${encodeURIComponent(id)}`);
    const raw = Array.isArray(page?.notas) ? page.notas.find((n) => (n as { id?: unknown } | null)?.id === id) : undefined;
    if (raw) this.integrateDetail(raw);
    else this.drop(id, true);
  }

  /** Uma anotação que veio da nuvem entra aqui, juntando com a edição daqui se houver. */
  private integrateDetail(raw: unknown): void {
    const d = parseDetail(raw);
    if (!d) return;
    const e = this.entries().get(d.id);
    if (!e) {
      this.adopt(d, {});
      return;
    }
    let { local, outra, resolver } = e;
    // virou leitor: a edição que esperava não sobe mais (fica guardada)
    if (local && !canWrite(d.papel)) {
      this.store.keepVersions([withPersonal(local, e.pessoal)], 'compartilhada');
      local = null;
      outra = null;
      resolver = false;
    }
    if (d.rev !== e.rev && (local || outra)) {
      if (resolver && !d.conflito) {
        // outra pessoa escolheu antes: vale a escolha dela (a daqui, se era outra, fica guardada)
        if (local && !sameShared(local, d.dados)) this.store.keepVersions([withPersonal(local, e.pessoal)], 'compartilhada', false);
        this.notice.set({ tipo: 'escolhido', id: d.id, titulo: d.dados.game.name, por: d.atualizadoPor?.nome ?? 'Outra pessoa', at: Date.now() });
        local = null;
        outra = null;
        resolver = false;
      } else if (outra) {
        // um conflito daqui ainda não tinha subido: as duas versões dele partem agora da de lá
        const mine = local ?? e.base;
        local = mergeNote(e.base, d.dados, mine).merged;
        const other = mergeNote(e.base, d.dados, outra);
        outra = other.other ?? other.merged;
        resolver = false;
      } else if (local) {
        // a edição daqui partiu de `e.base`; a da nuvem andou: junta as duas, como o git
        const m = mergeNote(e.base, d.dados, local);
        local = sameShared(m.merged, d.dados) && !m.other ? null : m.merged;
        outra = m.other;
        if (outra) resolver = false;
      }
    }
    // a escolha daqui num conflito que ainda não subiu: o conflito continua resolvido aqui
    const conflito = resolver && local ? null : d.conflito;
    this.put({ ...e, ...meta(d), rev: d.rev, base: d.dados, local, outra, resolver, conflito });
    if (local || outra) this.schedulePush(0);
    this.maybeAnnounce(this.entries().get(d.id)!);
  }

  /** Uma anotação nova aqui (acabou de ser compartilhada, daqui ou com a pessoa). */
  private adopt(d: SharedDetail, extra: { pessoal?: Personal; local?: Review | null }): SharedEntry {
    const pessoal = extra.pessoal ?? this.arrival(d);
    const entry = entryOf({
      ...meta(d),
      id: d.id,
      rev: d.rev,
      base: d.dados,
      local: extra.local ?? null,
      outra: null,
      resolver: false,
      conflito: d.conflito,
      pessoal,
    });
    this.put(entry);
    this.maybeAnnounce(entry);
    return this.entries().get(d.id)!;
  }

  /**
   * Onde a anotação chega neste aparelho: no lugar escolhido em outro aparelho da pessoa, se ele veio
   * antes dela; a de outra pessoa, nova para quem a recebe, sem grupo (ela aparece na aba Compartilhadas
   * do mural; até a build 677 ia para o grupo Compartilhadas, e de lá ela sai); a dele mesmo, no grupo
   * em que estava.
   */
  private arrival(d: SharedDetail): Personal {
    const place = this.places().get(d.id)?.p;
    if (place?.org) {
      const out = d.papel === 'dono' ? null : outOfSharedGroup(place, this.places().get(d.id)!.em);
      if (!out) return place;
      // ninguém escolheu este lugar: o de qualquer outro aparelho vale mais
      this.setPlace(d.id, out, ARRIVAL_AT);
      return out;
    }
    // um lugar de antes do grupo ser de cada um: quem já estava nela continua no grupo de antes
    if (place || d.papel === 'dono') return legacyOrg(place ?? {}, d.orgDados);
    const p = arrivalOrg();
    this.setPlace(d.id, p, ARRIVAL_AT);
    return p;
  }

  /** Tira a anotação daqui. `quiet` falso: foi a pessoa que pediu; verdadeiro: a nuvem disse que saiu. */
  private drop(id: string, fromCloud = false): void {
    const e = this.entries().get(id);
    if (!e) return;
    // o dono apagou em outro aparelho com uma edição daqui esperando: ela não some
    if (fromCloud && e.local) this.store.keepVersions([withPersonal(e.local, e.pessoal)], 'compartilhada');
    const next = new Map(this.entries());
    next.delete(id);
    this.entries.set(next);
    if (this.places().has(id)) {
      const places = new Map(this.places());
      places.delete(id);
      this.places.set(places);
    }
    this.persist();
    if (fromCloud && e.papel !== 'dono') this.notice.set({ tipo: 'saiu', id, titulo: e.view.game.name, at: Date.now() });
  }

  private put(e: Omit<SharedEntry, 'view'> | SharedEntry): void {
    const entry = entryOf(e);
    const before = this.entries().get(entry.id);
    // a mesma anotação de antes no mural: o mesmo objeto (o mural não refaz a ficha)
    const view = before && sameView(before.view, entry.view) ? before.view : entry.view;
    const next = new Map(this.entries());
    next.set(entry.id, { ...entry, view });
    this.entries.set(next);
    this.persist();
  }

  private maybeAnnounce(e: SharedEntry): void {
    if (!e.conflito || !canWrite(e.papel)) return;
    this.announce(e);
  }

  private announce(e: SharedEntry): void {
    if (!e.conflito) return;
    const key = conflictKey(e);
    if (this.told.has(key)) return;
    this.told.add(key);
    this.notice.set({ tipo: 'conflito', id: e.id, titulo: e.view.game.name, at: Date.now() });
  }

  /** Lê as compartilhadas da conta (de novo, se `force`, quando outra aba gravou). */
  private loadFor(account: string | null, force = false): void {
    if (!force && account === this.loadedFor) return;
    this.loadedFor = account;
    if (!account) {
      if (this.entries().size) this.entries.set(new Map());
      if (this.places().size) this.places.set(new Map());
      return;
    }
    const all = this.readAll();
    this.places.set(sanitizePlaces(all.lugares[account]));
    const list = (all.contas[account] ?? []).map(readEntry).filter((e) => e !== null);
    const before = this.entries();
    const next = new Map<string, SharedEntry>();
    let moved = false;
    for (const { migrated, ...read } of list) {
      let e: SharedEntry = read;
      if (migrated) {
        // o grupo de antes vira o desta pessoa, e vai para os outros aparelhos dela; um lugar com o
        // grupo escolhido depois (uma aba com o site de antes regravou a anotação) continua valendo
        const known = this.places().get(e.id);
        if (known?.p.org && known.em >= migrated) e = entryOf({ ...e, pessoal: known.p });
        else this.setPlace(e.id, e.pessoal, migrated);
      }
      // a recebida que ainda está no grupo Compartilhadas (onde chegava até a build 677) sai dele: ela
      // fica sem grupo, na aba Compartilhadas, e vai assim para os outros aparelhos da pessoa
      const out = e.papel === 'dono' ? null : outOfSharedGroup(e.pessoal, this.places().get(e.id)?.em ?? ARRIVAL_AT);
      if (out) {
        e = entryOf({ ...e, pessoal: out });
        this.setPlace(e.id, out, ARRIVAL_AT);
        moved = true;
      }
      const was = before.get(e.id);
      next.set(e.id, was && sameView(was.view, e.view) ? { ...e, view: was.view } : e);
    }
    this.entries.set(next);
    if (moved || list.some((e) => e.migrated)) this.persist();
  }

  private readAll(): Stored {
    try {
      const raw = JSON.parse(this.data.getItem(SHARED_KEY) ?? 'null') as Partial<Stored> | null;
      const contas = raw?.contas && typeof raw.contas === 'object' ? raw.contas : {};
      const lugares = raw?.lugares && typeof raw.lugares === 'object' ? raw.lugares : {};
      return { contas: Object.fromEntries(Object.entries(contas).filter(([, v]) => Array.isArray(v))) as Record<string, unknown[]>, lugares };
    } catch {
      return { contas: {}, lugares: {} };
    }
  }

  private persist(): void {
    const account = this.loadedFor;
    if (!account) return;
    const all = this.readAll();
    all.contas[account] = [...this.entries().values()].map(storedEntry);
    if (!all.contas[account].length) delete all.contas[account];
    all.lugares[account] = Object.fromEntries(this.places());
    if (!this.places().size) delete all.lugares[account];
    try {
      void Promise.resolve(this.data.setItem(SHARED_KEY, JSON.stringify(all))).catch(() => undefined);
    } catch {
      /* sem espaço: fica na memória até a próxima gravação */
    }
  }
}

/** O que vem da nuvem e não é o conteúdo: o dono, o papel, as pessoas, quem gravou. */
function meta(d: SharedDetail): Pick<SharedEntry, 'id' | 'dono' | 'papel' | 'membros' | 'versao' | 'atualizadoEm' | 'atualizadoPor'> {
  return { id: d.id, dono: d.dono, papel: d.papel, membros: d.membros, versao: d.versao, atualizadoEm: d.atualizadoEm, atualizadoPor: d.atualizadoPor };
}

/** A anotação com a estrutura (quem vê) de `from`: o que o editor não muda. */
function withStructureOf(r: Review, from: Review): Review {
  const { private: _p, quiet: _q, publishedAt: _w, ...rest } = r;
  return {
    ...rest,
    ...(from.private ? { private: true as const } : {}),
    ...(from.quiet ? { quiet: true as const } : {}),
    ...(from.publishedAt ? { publishedAt: from.publishedAt } : {}),
  } as Review;
}

/** A estrutura da anotação como a nuvem confere (ver `structureOf` em api/src/domain/shared-note.ts). */
const structureKey = (r: Review) => JSON.stringify([!!r.private, !!r.quiet, r.publishedAt ?? null]);
const sameView = (a: Review, b: Review) => a.updatedAt === b.updatedAt && sameShared(a, b) && samePersonal(personalOf(a), personalOf(b));
const conflictKey = (e: SharedEntry) => `${e.id}@${e.conflito?.em ?? ''}`;

export { parsePerson };
