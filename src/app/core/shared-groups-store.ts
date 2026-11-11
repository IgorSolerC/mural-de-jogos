import { DestroyRef, Injectable, InjectionToken, computed, effect, inject, signal, untracked } from '@angular/core';
import { CloudAccount, CloudError } from './cloud-account';
import { Cloud } from './cloud-config';
import { LocalData } from './local-data';
import { isNote } from './review';
import { ReviewStore } from './review-store';
import { MemberRole, canManage, canWrite } from './shared-notes';
import { SharedStore } from './shared-store';
import { SharedGroup, groupNames, newGroupId, parseGroup, parseGroupDoc } from './shared-groups';
import { labelKey } from './text';
import { AccessPerson, AccessState } from './access';
import { SharedRole } from './shared-notes';
import type { SharedEntry } from './shared-store';
import { FRESH_AT, KanbanBoard, boardIdFor, mergeBoards, sanitizeBoard } from './kanban';

const RANK: Record<SharedRole, number> = { leitor: 1, editor: 2, gestor: 3, dono: 4 };
/** O papel mais aberto dos dois (o da anotação e o do grupo dela). */
const widest = (a: SharedRole, b: SharedRole | undefined): SharedRole => (b && RANK[b] > RANK[a] ? b : a);

/**
 * Os grupos compartilhados deste aparelho (PLANO-COMPARTILHAR.md; a parte pura em core/shared-groups.ts e
 * a nuvem em api/src/routes/groups.ts).
 *
 * - Guarda os grupos da conta (no IndexedDB, por conta, como as compartilhadas) e confere a nuvem de minuto
 *   em minuto, com a aba à vista: só o id, a versão e o papel; os que mudaram vêm inteiros.
 * - Dá a cada grupo o nome que ele tem no mural de quem está aqui (`names`, com "· Ana" quando já há um
 *   grupo seu com o mesmo nome) e passa os nomes ao `SharedStore`, que põe as anotações do grupo nele.
 * - **Um caminho só para entrar no grupo**: uma anotação sua que vai parar num grupo compartilhado em que
 *   você escreve (criada na aba dele, mudada de grupo no editor, no Kanban, em massa, pela API das AIs) é
 *   levada para ele aqui, uma de cada vez (`adopt`). Nenhuma tela precisa saber disso.
 */

export const GROUPS_KEY = 'meu-mural:grupos:v1';
/** Conferir e levar sozinho (os testes desligam e chamam à mão). */
export const GROUPS_AUTO = new InjectionToken<boolean>('GROUPS_AUTO', { providedIn: 'root', factory: () => true });

const MINUTE = 60_000;
const DETAILS_PAGE = 10;
/** Quanto depois da última mexida no documento do grupo ele sobe (as mexidas seguidas vão juntas). */
const PUSH_DELAY = 1_500;

/** O que está acontecendo com um grupo agora (a peça Quem vê mostra). */
export interface GroupMoving {
  grupo: string;
  /** Quantas anotações ainda faltam ir para a nuvem. */
  faltam: number;
}

@Injectable({ providedIn: 'root' })
export class SharedGroupsStore {
  private readonly data = inject(LocalData);
  private readonly account = inject(CloudAccount);
  private readonly cloud = inject(Cloud);
  private readonly store = inject(ReviewStore);
  private readonly shared = inject(SharedStore);
  private readonly auto = inject(GROUPS_AUTO);

  readonly entries = signal<ReadonlyMap<string, SharedGroup>>(new Map());
  private readonly accountId = computed(() => (this.account.signedIn() ? (this.account.account()?.id ?? null) : null));
  readonly active = computed(() => this.accountId() !== null && this.cloud.config() !== null);
  private loadedFor: string | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running: Promise<void> | null = null;

  /** Os grupos que são só seus (os das anotações que não são de um grupo compartilhado): para o nome não repetir. */
  private readonly ownNames = computed(
    () => new Set(this.store.notes().filter((n) => isNote(n) && n.category && !this.shared.get(n.id)?.grupo).map((n) => n.category!)),
    { equal: (a, b) => a.size === b.size && [...a].every((x) => b.has(x)) },
  );
  /** O nome de cada grupo no seu mural (id → nome). */
  readonly names = computed(() => groupNames([...this.entries().values()], this.ownNames()), {
    equal: (a, b) => a.size === b.size && [...a].every(([k, v]) => b.get(k) === v),
  });
  /** O grupo compartilhado pelo nome do grupo no mural (a chave, sem acento nem caixa). */
  readonly byName = computed(() => new Map([...this.names()].map(([id, name]) => [labelKey(name), this.entries().get(id)!])));
  /** O que está indo para a nuvem agora. */
  readonly moving = signal<GroupMoving | null>(null);
  /**
   * O documento de cada grupo como estava na `rev` de onde as mexidas daqui partiram (só os que têm mexida
   * esperando para subir): a base da junção quando outra pessoa gravou antes.
   */
  private readonly bases = new Map<string, SharedGroup['dados']>();
  private pushTimer: ReturnType<typeof setTimeout> | undefined;

  /**
   * O quadro do Kanban de cada grupo compartilhado (PLANO-COMPARTILHAR.md, rodada 4), do documento dele, com o
   * id e a categoria do nome que o grupo tem aqui (o `KanbanStore` o mostra no lugar do quadro guardado).
   */
  readonly boards = computed<KanbanBoard[]>(() => {
    const out: KanbanBoard[] = [];
    for (const [id, name] of this.names()) {
      const raw = this.entries().get(id)?.dados['kanban'];
      const b = raw ? sanitizeBoard({ ...(raw as Record<string, unknown>), category: name }) : null;
      if (b) out.push(b);
    }
    return out;
  });
  /** O grupo compartilhado de cada quadro (pelo id do quadro aqui): também o dos que ainda não têm quadro. */
  readonly boardGroups = computed(() => new Map([...this.names()].map(([id, name]) => [boardIdFor(name), id])));
  /** O último erro de levar uma anotação para um grupo (a peça dele mostra; some no próximo que dá certo). */
  readonly error = signal<{ grupo: string; mensagem: string } | null>(null);

  constructor() {
    effect(() => {
      const id = this.accountId();
      untracked(() => this.loadFor(id));
    });
    // o SharedStore põe as anotações de cada grupo nele, com o nome daqui
    effect(() => {
      const names = this.names();
      untracked(() => this.shared.groupNames.set(names));
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
    // a anotação sua que foi parar num grupo compartilhado vai para ele
    effect(() => {
      this.store.notes();
      this.byName();
      this.shared.entries();
      untracked(() => void this.adopt());
    });
    if (typeof document !== 'undefined') {
      const onVisible = () => document.visibilityState === 'visible' && this.active() && this.schedule(0);
      document.addEventListener('visibilitychange', onVisible);
      destroy.onDestroy(() => document.removeEventListener('visibilitychange', onVisible));
    }
  }

  get(id: string): SharedGroup | undefined {
    return this.entries().get(id);
  }

  /** O grupo compartilhado de um grupo do mural (pelo nome), ou undefined: é só seu. */
  ofCategory(category: string | null | undefined): SharedGroup | undefined {
    return category ? this.byName().get(labelKey(category)) : undefined;
  }

  /**
   * Quem vê uma compartilhada, contando o grupo dela (PLANO-COMPARTILHAR.md, 3.4: vale o mais aberto): as
   * pessoas dela e as do grupo, o papel mais alto de quem olha, e pública se ela ou o grupo for.
   */
  accessOf(e: SharedEntry, meCode: string | null, live = e.view): AccessState & { group: string | null; viaGroup: Set<string> } {
    const g = e.grupo ? this.entries().get(e.grupo) : undefined;
    const members = new Map<string, AccessPerson>(e.membros.map((m) => [m.codigo, { codigo: m.codigo, nome: m.nome, papel: m.papel }]));
    const viaGroup = new Set<string>();
    for (const m of g?.membros ?? []) {
      const here = members.get(m.codigo);
      if (!here) viaGroup.add(m.codigo);
      if (!here || RANK[m.papel] > RANK[here.papel]) members.set(m.codigo, { codigo: m.codigo, nome: m.nome, papel: m.papel });
    }
    return {
      me: widest(e.papel, g?.papel),
      meCode,
      ownerName: e.dono.nome,
      members: [...members.values()],
      public: !live.private || !!g?.publico,
      feed: !live.private && !live.quiet,
      group: e.grupo ? (this.names().get(e.grupo) ?? null) : null,
      viaGroup,
    };
  }

  /** O grupo compartilhado de um quadro (pelo id do quadro), ou undefined: o quadro é só seu. */
  groupOfBoard(boardId: string): SharedGroup | undefined {
    const id = this.boardGroups().get(boardId);
    return id ? this.entries().get(id) : undefined;
  }

  /**
   * Muda o quadro do Kanban de um grupo compartilhado (quem escreve no grupo): vale aqui na hora e sobe logo
   * depois, partindo da versão de agora (outra pessoa gravou antes: as duas se juntam, cartão a cartão).
   * Devolve false para quem só lê (nada muda).
   */
  updateBoard(groupId: string, board: KanbanBoard): boolean {
    const g = this.entries().get(groupId);
    if (!g || !canWrite(g.papel)) return false;
    if (!this.bases.has(groupId)) this.bases.set(groupId, g.dados);
    this.put({ ...g, dados: { ...g.dados, kanban: board } });
    this.schedulePush();
    return true;
  }

  /**
   * Renomeia um grupo compartilhado (o dono e os gestores): o nome vai no documento, para todos que estão
   * nele. Devolve false para quem não pode (nada muda).
   */
  rename(groupId: string, nome: string): boolean {
    const g = this.entries().get(groupId);
    if (!g || !canManage(g.papel) || !nome.trim()) return false;
    if (!this.bases.has(groupId)) this.bases.set(groupId, g.dados);
    this.put({ ...g, dados: { ...g.dados, nome: nome.trim().slice(0, 40) } });
    this.schedulePush();
    return true;
  }

  // ——— o que a peça Quem vê pede ———

  /**
   * Compartilha um grupo seu com as pessoas pedidas: o grupo passa a morar na nuvem, e as anotações dele vão
   * em seguida, uma a uma (`adopt`). Devolve o grupo, ou lança CloudError com a mensagem pronta.
   */
  async share(
    category: string,
    people: { codigo: string; papel: MemberRole }[],
    look: { icone?: string; cor?: string } = {},
    board: KanbanBoard | null = null,
  ): Promise<SharedGroup> {
    // o quadro do Kanban do grupo vai junto (o de sempre, em que ninguém mexeu, não: cada um vê o de sempre)
    const kanban = board && board.at !== FRESH_AT ? { kanban: board } : {};
    const res = await this.account.request<{ grupo: unknown }>('/v1/grupos', {
      method: 'POST',
      body: { id: newGroupId(), dados: { nome: category, ...(look.icone || look.cor ? { aparencia: look } : {}), ...kanban }, membros: people },
    });
    const g = this.integrate(res?.grupo);
    if (!g) throw new CloudError('A nuvem respondeu de um jeito estranho. Tente de novo.', 'resposta-invalida', 0);
    void this.adopt();
    return g;
  }

  async setRole(id: string, codigo: string, papel: MemberRole): Promise<void> {
    const res = await this.account.request<{ grupo: unknown }>(`/v1/grupos/${encodeURIComponent(id)}/membros/${encodeURIComponent(codigo)}`, {
      method: 'PUT',
      body: { papel },
    });
    this.integrate(res?.grupo);
  }

  async removeMember(id: string, codigo: string): Promise<void> {
    const res = await this.account.request<{ grupo: unknown }>(`/v1/grupos/${encodeURIComponent(id)}/membros/${encodeURIComponent(codigo)}`, { method: 'DELETE' });
    this.integrate(res?.grupo);
  }

  /** Sai do grupo (quem não é o dono): ele e tudo o que está nele somem do seu mural. */
  async leave(id: string): Promise<void> {
    try {
      await this.account.request(`/v1/grupos/${encodeURIComponent(id)}/membros/eu`, { method: 'DELETE' });
    } catch (err) {
      if (!(err instanceof CloudError && err.status === 404)) throw err;
    }
    this.drop(id);
    await this.shared.sync();
  }

  /**
   * Para de compartilhar (só o dono): as pessoas deixam de ver, e tudo o que está no grupo fica com você, no
   * grupo de mesmo nome (as anotações viram compartilhadas suas com ninguém, como as que já foram divididas).
   */
  async stop(id: string): Promise<KanbanBoard | null> {
    const g = this.entries().get(id);
    if (!g) return null;
    const board = this.boards().find((b) => b.id === boardIdFor(this.names().get(id) ?? g.dados.nome)) ?? null;
    const name = this.names().get(id) ?? g.dados.nome;
    // o lugar delas no seu mural: o grupo de mesmo nome (antes de a nuvem as soltar do grupo)
    this.shared.placeInGroup(
      this.shared.inGroupOf(id).map((e) => e.id),
      name,
    );
    await this.account.request(`/v1/grupos/${encodeURIComponent(id)}`, { method: 'DELETE' });
    this.bases.delete(id);
    this.drop(id);
    await this.shared.sync();
    // o quadro do Kanban do grupo, como ficou: quem chamou o guarda como o quadro só seu
    return board;
  }

  // ——— a sincronização ———

  async sync(): Promise<void> {
    if (!this.active()) return;
    if (this.running) return this.running;
    this.running = this.pull()
      .catch(() => undefined)
      .finally(() => {
        this.running = null;
        if (this.auto && this.active()) this.schedule(MINUTE);
      });
    return this.running;
  }

  private schedule(ms: number): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.sync(), ms);
  }

  private schedulePush(ms = PUSH_DELAY): void {
    clearTimeout(this.pushTimer);
    this.pushTimer = setTimeout(() => void this.pushAll(), ms);
  }

  /** Sobe os documentos com mexida esperando, um de cada vez. */
  async pushAll(): Promise<void> {
    for (const id of [...this.bases.keys()]) {
      for (let attempt = 0; attempt < 4 && this.bases.has(id); attempt++) {
        if (await this.pushOne(id)) break;
      }
    }
  }

  /** Sobe o documento do grupo; false: outra pessoa gravou antes, e o de agora já foi juntado ao daqui. */
  private async pushOne(id: string): Promise<boolean> {
    const g = this.entries().get(id);
    if (!g || !canWrite(g.papel)) {
      this.bases.delete(id);
      return true;
    }
    const sent = g.dados;
    try {
      const res = await this.account.request<{ grupo: unknown }>(`/v1/grupos/${encodeURIComponent(id)}`, { method: 'PUT', body: { base: g.rev, dados: sent } });
      const saved = parseGroup(res?.grupo);
      const now = this.entries().get(id);
      if (!saved || !now) return true;
      // o que mudou aqui enquanto subia continua esperando, partindo do que subiu
      if (now.dados !== sent) {
        this.bases.set(id, saved.dados);
        this.put({ ...saved, dados: now.dados });
        this.schedulePush(0);
      } else {
        this.bases.delete(id);
        this.put(saved);
      }
      return true;
    } catch (err) {
      if (!(err instanceof CloudError)) throw err;
      if (err.status === 409) {
        const theirs = parseGroup((err.body as { grupo?: unknown } | null)?.grupo);
        if (!theirs) return true;
        this.put({ ...theirs, dados: this.joined(this.bases.get(id) ?? theirs.dados, theirs.dados, this.entries().get(id)?.dados ?? sent) });
        this.bases.set(id, theirs.dados);
        return false;
      }
      if (err.status === 404) {
        this.bases.delete(id);
        this.drop(id);
        return true;
      }
      if (err.status === 403) {
        // virou leitor: a mexida daqui não sobe mais; vale o da nuvem na próxima conferida
        this.bases.delete(id);
        this.schedule(0);
        return true;
      }
      return true; // sem rede, 429: a próxima conferida sobe
    }
  }

  /**
   * As duas versões do documento juntas, a partir de `o`: o quadro do Kanban cartão a cartão (`mergeBoards`,
   * a mesma junção de dois aparelhos), o resto o mudado por último (só o dono e os gestores mudam o nome).
   */
  private joined(o: SharedGroup['dados'], theirs: SharedGroup['dados'], mine: SharedGroup['dados']): SharedGroup['dados'] {
    const board = (d: SharedGroup['dados']) => (d['kanban'] ? sanitizeBoard({ ...(d['kanban'] as Record<string, unknown>), category: d.nome }) : null);
    const [bo, bt, bm] = [board(o), board(theirs), board(mine)];
    const kanban = bt && bm ? mergeBoards(bo ?? bt, bt, bm) : (bm ?? bt);
    return { ...theirs, ...(mine.nome !== o.nome ? { nome: mine.nome } : {}), ...(kanban ? { kanban } : {}) };
  }

  private async pull(): Promise<void> {
    const res = await this.account.request<{ grupos?: unknown }>('/v1/eu/grupos');
    if (!Array.isArray(res?.grupos)) throw new CloudError('A nuvem respondeu de um jeito estranho. Tente de novo.', 'resposta-invalida', 0);
    const index = new Map<string, number>();
    for (const item of res.grupos) {
      const r = item as Record<string, unknown> | null;
      if (typeof r?.['id'] === 'string' && Number.isSafeInteger(r['versao'])) index.set(r['id'], r['versao'] as number);
    }
    for (const id of [...this.entries().keys()]) if (!index.has(id)) this.drop(id);
    const stale = [...index].filter(([id, v]) => this.entries().get(id)?.versao !== v).map(([id]) => id);
    for (let i = 0; i < stale.length; i += DETAILS_PAGE) {
      const ids = stale.slice(i, i + DETAILS_PAGE);
      const page = await this.account.request<{ grupos?: unknown[] }>(`/v1/eu/grupos/detalhes?ids=${ids.map(encodeURIComponent).join(',')}`);
      for (const raw of Array.isArray(page?.grupos) ? page.grupos : []) this.integrate(raw);
    }
  }

  /**
   * Leva para o grupo compartilhado as anotações suas que estão nele no mural mas ainda não na nuvem: as que
   * só existem aqui sobem já no grupo; as compartilhadas suas (soltas) mudam para ele. Uma de cada vez.
   */
  async adopt(): Promise<void> {
    if (!this.active() || this.moving()) return;
    const queue = this.pending();
    if (!queue.length) return;
    const tried = new Set(queue.map((q) => q.note.id));
    try {
      for (let i = 0; i < queue.length; i++) {
        const { note, grupo } = queue[i]!;
        this.moving.set({ grupo, faltam: queue.length - i });
        const entry = this.shared.get(note.id);
        const now = this.store.get(note.id);
        if (!now || this.ofCategory(now.category)?.id !== grupo) continue;
        if (entry) await this.shared.moveToGroup(note.id, grupo);
        else await this.shared.share(now, [], grupo);
      }
      this.error.set(null);
    } catch (err) {
      const grupo = this.moving()?.grupo ?? queue[0]!.grupo;
      this.error.set({ grupo, mensagem: err instanceof CloudError ? err.message : 'Não deu para levar as anotações para o grupo agora. Elas vão na próxima vez.' });
    } finally {
      this.moving.set(null);
    }
    // o que entrou enquanto isso (cada anotação uma vez por rodada: a que a nuvem não levou espera a próxima)
    if (!this.error() && this.pending().some((q) => !tried.has(q.note.id))) void this.adopt();
  }

  /** As anotações suas que estão num grupo compartilhado (pelo nome) e ainda não foram para ele na nuvem. */
  private pending(): { note: { id: string }; grupo: string }[] {
    const out: { note: { id: string }; grupo: string }[] = [];
    for (const n of this.store.notes()) {
      if (!isNote(n) || !n.category) continue;
      const g = this.ofCategory(n.category);
      if (!g || !canWrite(g.papel)) continue;
      const e = this.shared.get(n.id);
      // já está nele; ou é de outra pessoa (só quem é dono da anotação a põe num grupo)
      if (e && (e.grupo === g.id || e.papel !== 'dono')) continue;
      if (e?.grupo) continue;
      out.push({ note: n, grupo: g.id });
    }
    return out;
  }

  private integrate(raw: unknown): SharedGroup | null {
    const parsed = parseGroup(raw);
    if (!parsed) return null;
    // (o grupo que chega antes de a conta ser lida aqui: os guardados dela vêm antes, para ele entrar junto)
    if (this.loadedFor === null) this.loadFor(this.accountId());
    // com mexida daqui esperando para subir: ela continua por cima do que chegou (junta na subida)
    const here = this.entries().get(parsed.id);
    const base = this.bases.get(parsed.id);
    const g = here && base && here.rev !== parsed.rev ? { ...parsed, dados: this.joined(base, parsed.dados, here.dados) } : here && base ? { ...parsed, dados: here.dados } : parsed;
    if (here && base && here.rev !== parsed.rev) this.bases.set(parsed.id, parsed.dados);
    this.put(g);
    return g;
  }

  private put(g: SharedGroup): void {
    const next = new Map(this.entries());
    next.set(g.id, g);
    this.entries.set(next);
    this.persist();
  }

  private drop(id: string): void {
    if (!this.entries().has(id)) return;
    const next = new Map(this.entries());
    next.delete(id);
    this.entries.set(next);
    this.persist();
  }

  /** Quem gere o grupo (o dono e os gestores). */
  manages(id: string): boolean {
    return canManage(this.entries().get(id)?.papel);
  }

  // ——— guardado por conta, como as compartilhadas ———

  private loadFor(account: string | null): void {
    if (account === this.loadedFor) return;
    this.loadedFor = account;
    if (!account) {
      if (this.entries().size) this.entries.set(new Map());
      return;
    }
    const stored = this.readAll();
    const list = stored.contas[account] ?? [];
    this.entries.set(new Map(list.map(parseGroup).filter((g): g is SharedGroup => !!g).map((g) => [g.id, g])));
    // as mexidas que não chegaram a subir (a aba fechou antes): continuam esperando, e sobem
    this.bases.clear();
    for (const [id, base] of Object.entries(stored.bases[account] ?? {})) {
      const doc = parseGroupDoc(base);
      if (doc && this.entries().has(id)) this.bases.set(id, doc);
    }
    if (this.bases.size && this.auto) this.schedulePush(0);
  }

  private readAll(): { contas: Record<string, unknown[]>; bases: Record<string, Record<string, unknown>> } {
    try {
      const raw = JSON.parse(this.data.getItem(GROUPS_KEY) ?? 'null') as { contas?: Record<string, unknown>; bases?: Record<string, unknown> } | null;
      const contas = raw?.contas && typeof raw.contas === 'object' ? raw.contas : {};
      const bases = raw?.bases && typeof raw.bases === 'object' ? raw.bases : {};
      return {
        contas: Object.fromEntries(Object.entries(contas).filter(([, v]) => Array.isArray(v))) as Record<string, unknown[]>,
        bases: Object.fromEntries(Object.entries(bases).filter(([, v]) => !!v && typeof v === 'object')) as Record<string, Record<string, unknown>>,
      };
    } catch {
      return { contas: {}, bases: {} };
    }
  }

  private persist(): void {
    const account = this.loadedFor;
    if (!account) return;
    const all = this.readAll();
    all.contas[account] = [...this.entries().values()];
    if (!all.contas[account].length) delete all.contas[account];
    // a base das mexidas que esperam subir: sem ela, uma aba fechada antes da subida perderia a mexida
    all.bases[account] = Object.fromEntries(this.bases);
    if (!this.bases.size) delete all.bases[account];
    try {
      void Promise.resolve(this.data.setItem(GROUPS_KEY, JSON.stringify(all))).catch(() => undefined);
    } catch {
      /* sem espaço: fica na memória */
    }
  }
}
