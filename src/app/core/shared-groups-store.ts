import { DestroyRef, Injectable, InjectionToken, computed, effect, inject, signal, untracked } from '@angular/core';
import { CloudAccount, CloudError } from './cloud-account';
import { Cloud } from './cloud-config';
import { LocalData } from './local-data';
import { Review, isNote, withAudience } from './review';
import { ReviewStore } from './review-store';
import { MemberRole, canManage, canWrite } from './shared-notes';
import { SharedStore } from './shared-store';
import { SharedGroup, groupNames, newGroupId, parseGroup, parseGroupDoc } from './shared-groups';
import { labelKey } from './text';
import { AccessPerson, AccessState } from './access';
import { SharedRole } from './shared-notes';
import type { SharedEntry } from './shared-store';
import { FRESH_AT, KanbanBoard, boardIdFor, categoryKey, mergeBoards, sanitizeBoard } from './kanban';
import { lookKey } from './category-looks';
import { GroupDocFolder, NoteFolder, docFolders, mergeFolders, toDocFolders } from './folders';
import { Settings } from './settings';
import { GroupFolders } from './group-folders';
import { ApiReach } from './api-reach';

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

/** As pastas usadas pelas anotações dadas, com as de cima de cada uma (entre `folders`). */
function foldersInUse(folders: readonly NoteFolder[], notes: readonly Pick<Review, 'folder'>[]): Set<string> {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const out = new Set<string>();
  for (const n of notes) {
    let cur = n.folder ? byId.get(n.folder) : undefined;
    while (cur && !out.has(cur.id)) {
      out.add(cur.id);
      cur = cur.parent ? byId.get(cur.parent) : undefined;
    }
  }
  return out;
}
/** Conferir e levar sozinho (os testes desligam e chamam à mão). */
export const GROUPS_AUTO = new InjectionToken<boolean>('GROUPS_AUTO', { providedIn: 'root', factory: () => true });

const MINUTE = 60_000;
const DETAILS_PAGE = 10;
/** Quanto depois da última mexida no documento do grupo ele sobe (as mexidas seguidas vão juntas). */
const PUSH_DELAY = 1_500;

/** O nome que um grupo compartilhado tem no seu mural, e desde quando (a hora daqui, ISO). */
interface KnownName {
  nome: string;
  desde: string;
}

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
  private readonly settings = inject(Settings);

  readonly entries = signal<ReadonlyMap<string, SharedGroup>>(new Map());
  private readonly accountId = computed(() => (this.account.signedIn() ? (this.account.account()?.id ?? null) : null));
  readonly active = computed(() => this.accountId() !== null && this.cloud.config() !== null);
  private loadedFor: string | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running: Promise<void> | null = null;

  /**
   * O nome que cada grupo compartilhado já tem no seu mural (id → nome) e desde quando: guardado por conta, com os
   * grupos. É ele que deixa o nome parado enquanto as anotações novas do grupo ainda não subiram (ver `ownNames`).
   */
  private readonly known = signal<ReadonlyMap<string, KnownName>>(new Map());
  /**
   * Os grupos que são só seus, para o nome não repetir: os das anotações que não são de um grupo compartilhado e
   * não estão a caminho de um. A caminho está a anotação sua que entrou num grupo em que você escreve depois de ele
   * ganhar o nome que tem aqui (a criada nele pelo editor, pelo Kanban, em massa, pela API das AIs): ela vai
   * subir para ele (`adopt`), e contá-la como um grupo seu de mesmo nome faria o grupo virar "Nome · Dona" e
   * a deixaria só sua. As que já estavam com o nome antes (o grupo seu de antes do convite, as que chegam de
   * outro aparelho) contam, e o grupo da outra pessoa fica com o "· Dona", à parte.
   */
  private readonly ownNames = computed(
    () => {
      const heading = new Map<string, number>();
      for (const [id, k] of this.known()) {
        if (canWrite(this.entries().get(id)?.papel)) heading.set(labelKey(k.nome), Date.parse(k.desde));
      }
      const own = new Set<string>();
      for (const n of this.store.notes()) {
        if (!isNote(n) || !n.category) continue;
        const e = this.shared.get(n.id);
        if (e?.grupo) continue;
        const since = heading.get(labelKey(n.category));
        // (só a que `pending` leva: a compartilhada com você por outra pessoa não entra no grupo, e conta. O nome
        // guardado é o que o grupo mostra: com um grupo seu de mesmo nome, "Nome · Dona", e as suas de "Nome",
        // editadas ou não, nunca batem com ele)
        if (since !== undefined && Date.parse(n.updatedAt) >= since && (!e || e.papel === 'dono')) continue;
        own.add(n.category);
      }
      return own;
    },
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
   * A lista dos grupos já foi conferida na nuvem desde que o site abriu: antes disso, "este grupo não é
   * compartilhado" ainda não é certeza (os quadros não dizem à nuvem que saíram do grupo por engano).
   */
  readonly synced = signal(false);
  /**
   * O documento de cada grupo como estava na `rev` de onde as mexidas daqui partiram (só os que têm mexida
   * esperando para subir): a base da junção quando outra pessoa gravou antes.
   */
  private readonly bases = new Map<string, SharedGroup['dados']>();
  /** As anotações que a nuvem recusou de vez ao levá-las para um grupo (id → `refusalKey`): ver `adopt`. */
  private readonly refused = new Map<string, string>();
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
  /**
   * As pastas dos grupos compartilhados (PLANO-CONSERTO-GRUPOS.md, rodada 2), do documento de cada um, na chave do
   * nome que o grupo tem aqui: as mesmas para todos que estão nele. Só dos grupos cujo documento já tem pastas (o
   * de antes desta build continua com as pastas guardadas de cada um, até o dono levá-las, ver `seedFolders`).
   */
  readonly folders = computed<NoteFolder[]>(
    () => {
      const out: NoteFolder[] = [];
      for (const [id, name] of this.names()) {
        const raw = this.entries().get(id)?.dados['pastas'];
        if (Array.isArray(raw)) out.push(...docFolders(raw, lookKey(name)));
      }
      return out;
    },
    // (mexer no Kanban do grupo muda o documento, mas não as pastas: a árvore não é refeita à toa)
    { equal: (a, b) => JSON.stringify(a) === JSON.stringify(b) },
  );
  /**
   * Os grupos compartilhados pela chave do nome que eles têm aqui: o id, se quem está aqui escreve nele, e se o
   * documento já guarda as pastas (para `NoteFolders` saber de onde vêm e para onde vão as pastas de cada grupo).
   */
  readonly folderGroups = computed<ReadonlyMap<string, { id: string; write: boolean; doc: boolean; dono: boolean }>>(() => {
    const out = new Map<string, { id: string; write: boolean; doc: boolean; dono: boolean }>();
    for (const [id, name] of this.names()) {
      const g = this.entries().get(id);
      if (g) out.set(lookKey(name), { id, write: canWrite(g.papel), doc: Array.isArray(g.dados['pastas']), dono: g.papel === 'dono' });
    }
    return out;
  }, { equal: (a, b) => JSON.stringify([...a]) === JSON.stringify([...b]) });
  /**
   * As anotações dos grupos compartilhados em que a conta é dono ou gestor: a API das AIs alcança estas como as
   * suas (core/api-reach.ts). As de um grupo em que ela só edita ou lê, não.
   */
  readonly apiManaged = computed<ReadonlySet<string>>(
    () => {
      const out = new Set<string>();
      const groups = this.entries();
      const names = this.names();
      for (const e of this.shared.entries().values()) {
        if (e.grupo && names.has(e.grupo) && canManage(groups.get(e.grupo)?.papel)) out.add(e.id);
      }
      return out;
    },
    { equal: (a, b) => a.size === b.size && [...a].every((x) => b.has(x)) },
  );
  /** Os grupos compartilhados em que a conta só edita ou lê, pela chave do nome que têm aqui: fechados para a API. */
  readonly apiClosed = computed<ReadonlySet<string>>(
    () => new Set([...this.names()].filter(([id]) => !canManage(this.entries().get(id)?.papel)).map(([, name]) => categoryKey(name))),
    { equal: (a, b) => a.size === b.size && [...a].every((x) => b.has(x)) },
  );
  /** O último erro de levar uma anotação para um grupo (a peça dele mostra; some no próximo que dá certo). */
  readonly error = signal<{ grupo: string; mensagem: string } | null>(null);

  constructor() {
    // as pastas dos grupos para a árvore das pastas (NoteFolders), sem ela depender deste serviço
    inject(GroupFolders).attach({ folders: () => this.folders(), groups: () => this.folderGroups(), update: (id, list) => this.updateFolders(id, list) });
    // as anotações dos grupos em que a conta é dono ou gestor, para a API das AIs
    inject(ApiReach).attach({ managed: () => this.apiManaged(), closed: () => this.apiClosed() });
    effect(() => {
      const id = this.accountId();
      untracked(() => this.loadFor(id));
    });
    // o SharedStore põe as anotações de cada grupo nele, com o nome daqui
    effect(() => {
      const names = this.names();
      untracked(() => this.shared.groupNames.set(names));
    });
    // o nome de cada grupo aqui, e desde quando (o que entra nele depois disso está a caminho dele)
    effect(() => {
      const names = this.names();
      untracked(() => this.remember(names));
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
    // as pastas de um grupo seu compartilhado antes desta build vão para o documento dele, para todos
    effect(() => {
      this.entries();
      this.names();
      this.settings.notesConfig();
      untracked(() => this.seedFolders());
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

  /** Guarda o nome de cada grupo aqui: o que mudou (ou é novo) passa a valer de agora; o grupo que saiu sai. */
  private remember(names: ReadonlyMap<string, string>): void {
    if (!this.loadedFor) return;
    const before = this.known();
    const now = new Date().toISOString();
    const next = new Map<string, KnownName>();
    for (const [id, nome] of names) {
      const k = before.get(id);
      next.set(id, k && k.nome === nome ? k : { nome, desde: now });
    }
    if (next.size === before.size && [...next].every(([id, k]) => before.get(id) === k)) return;
    this.known.set(next);
    this.persist();
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
   * Muda as pastas de um grupo compartilhado (quem escreve no grupo): `folders` são as dele, na chave do nome que
   * ele tem aqui. Vale aqui na hora e sobe logo depois (outra pessoa gravou antes: as duas se juntam pasta a
   * pasta). Devolve false para quem só lê, ou quando nada mudou.
   */
  updateFolders(groupId: string, folders: readonly NoteFolder[]): boolean {
    const g = this.entries().get(groupId);
    const name = this.names().get(groupId);
    if (!g || !name || !canWrite(g.papel)) return false;
    const pastas = toDocFolders(folders, lookKey(name));
    if (JSON.stringify(pastas) === JSON.stringify(g.dados['pastas'] ?? null)) return false;
    if (!this.bases.has(groupId)) this.bases.set(groupId, g.dados);
    this.put({ ...g, dados: { ...g.dados, pastas } });
    this.schedulePush();
    return true;
  }

  /**
   * Leva para o documento do grupo as pastas guardadas aqui que ainda não estão nele (PLANO-CONSERTO-GRUPOS.md, 2):
   *
   * - o dono, num grupo dele compartilhado antes desta build (o documento sem pastas): as pastas dele do grupo,
   *   uma vez (as configurações ficam com a cópia). Sem pasta nenhuma guardada, espera: as configurações podem
   *   ainda não ter chegado a este aparelho, e um documento vazio esconderia as que chegassem depois;
   * - quem escreve no grupo e não é o dono, quando o documento já tem pastas: as que ele criou no grupo antes disso
   *   (só ele as via) entram no documento e saem das configurações dele.
   *
   * O documento que já tem pastas nunca recebe as do dono de novo: a cópia dele pode ser velha (uma pasta que
   * alguém desfez e que já saiu de vez voltaria).
   */
  seedFolders(): void {
    const mine = this.settings.notesConfig().folders ?? [];
    let moved: Set<string> | null = null;
    for (const [id, name] of this.names()) {
      const g = this.entries().get(id);
      if (!g || !canWrite(g.papel)) continue;
      const key = lookKey(name);
      const raw = g.dados['pastas'];
      const own = mine.filter((f) => f.group === key);
      if (!own.length) continue;
      if (g.papel === 'dono') {
        if (!Array.isArray(raw)) this.updateFolders(id, own);
        continue;
      }
      if (!Array.isArray(raw)) continue;
      // só as que as anotações do grupo usam (e as de cima delas): uma pasta de um grupo só dela, de mesmo nome e
      // sem anotação nenhuma, não vai parar no grupo dos outros
      const used = foldersInUse(own, this.store.notes().filter((n) => isNote(n) && lookKey(n.category ?? '') === key));
      const take = own.filter((f) => used.has(f.id));
      if (!take.length) continue;
      const doc = docFolders(raw, key);
      const ids = new Set(doc.map((f) => f.id));
      this.updateFolders(id, [...doc, ...take.filter((f) => !ids.has(f.id))]);
      moved ??= new Set();
      for (const f of take) moved.add(f.id);
    }
    if (moved) this.settings.setNotesConfig({ folders: mine.filter((f) => !moved!.has(f.id)) });
  }

  /**
   * Renomeia um grupo compartilhado (o dono e os gestores): o nome vai no documento, para todos que estão
   * nele. Devolve false para quem não pode (nada muda).
   */
  rename(groupId: string, nome: string): boolean {
    const g = this.entries().get(groupId);
    if (!g || !canManage(g.papel) || !nome.trim()) return false;
    const before = this.names().get(groupId);
    if (!this.bases.has(groupId)) this.bases.set(groupId, g.dados);
    this.put({ ...g, dados: { ...g.dados, nome: nome.trim().slice(0, 40) } });
    // as pastas do documento seguem o nome sozinhas; a cópia guardada aqui (a do dono) vai junto, para não ficar
    // num grupo de nome velho, sem anotação nenhuma
    const from = before ? lookKey(before) : null;
    const after = this.names().get(groupId);
    const to = after ? lookKey(after) : null;
    const stored = this.settings.notesConfig().folders ?? [];
    if (from && to && from !== to && stored.some((f) => f.group === from)) {
      this.settings.setNotesConfig({ folders: stored.map((f) => (f.group === from ? { ...f, group: to } : f)) });
    }
    this.schedulePush();
    return true;
  }

  /**
   * Torna o grupo público (qualquer pessoa lê, pelo seu mural e pelo link) ou só de quem está (o dono e os
   * gestores). Outra gravação no meio (409): tenta de novo a partir da de agora.
   */
  async setPublic(groupId: string, on: boolean): Promise<void> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const g = this.entries().get(groupId);
      if (!g || g.publico === on) return;
      try {
        const res = await this.account.request<{ grupo: unknown }>(`/v1/grupos/${encodeURIComponent(groupId)}`, { method: 'PUT', body: { base: g.rev, publico: on } });
        this.integrate(res?.grupo);
        return;
      } catch (err) {
        if (!(err instanceof CloudError) || err.status !== 409) throw err;
        this.integrate((err.body as { grupo?: unknown } | null)?.grupo);
      }
    }
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
    publico = false,
  ): Promise<SharedGroup> {
    // o quadro do Kanban do grupo vai junto (o de sempre, em que ninguém mexeu, não: cada um vê o de sempre)
    const kanban = board && board.at !== FRESH_AT ? { kanban: board } : {};
    // as pastas do grupo vão junto: quem entra vê as mesmas, e as anotações continuam nelas (PLANO-CONSERTO-GRUPOS.md, 2)
    const pastas = toDocFolders(this.settings.notesConfig().folders ?? [], lookKey(category));
    const res = await this.account.request<{ grupo: unknown }>('/v1/grupos', {
      method: 'POST',
      body: {
        id: newGroupId(),
        dados: { nome: category, ...(look.icone || look.cor ? { aparencia: look } : {}), ...kanban, pastas },
        membros: people,
        ...(publico ? { publico: true } : {}),
      },
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
    this.bases.delete(id);
    this.drop(id);
    this.persist();
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
    const ids = this.shared.inGroupOf(id).map((e) => e.id);
    this.shared.placeInGroup(ids, name);
    await this.account.request(`/v1/grupos/${encodeURIComponent(id)}`, { method: 'DELETE' });
    // as pastas do grupo, como ficaram nele, voltam para as suas configurações (as anotações continuam nelas)
    this.returnFolders(id, name);
    this.bases.delete(id);
    this.drop(id);
    this.persist();
    await this.shared.sync();
    // as que ficaram só com você voltam a ser anotações comuns do seu mural, no grupo de mesmo nome, com a pasta e
    // as tags (antes, ficavam "compartilhadas com ninguém" para sempre, e nem o apagar em massa as tirava)
    for (const noteId of ids) await this.shared.unshare(noteId);
    // o quadro do Kanban do grupo, como ficou: quem chamou o guarda como o quadro só seu
    return board;
  }

  /** As pastas do documento do grupo `id` (nome `name` aqui) nas suas configurações, por cima das guardadas de mesmo id. */
  private returnFolders(id: string, name: string): void {
    const raw = this.entries().get(id)?.dados['pastas'];
    if (!Array.isArray(raw)) return;
    const back = docFolders(raw, lookKey(name));
    if (!back.length) return;
    const ids = new Set(back.map((f) => f.id));
    const kept = (this.settings.notesConfig().folders ?? []).filter((f) => !ids.has(f.id));
    this.settings.setNotesConfig({ folders: [...kept, ...back] });
  }

  // ——— a sincronização ———


  async sync(): Promise<void> {
    if (!this.active()) return;
    if (this.running) return this.running;
    this.running = this.pull()
      // o que ficou sem ir para o grupo (sem rede, a nuvem fora) vai na conferida: nada mais a chama de novo
      // quando o mural não muda
      .then(() => this.adopt())
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
        this.persist();
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
    // as pastas, pasta a pasta (duas pessoas criando ou renomeando pastas ao mesmo tempo: as duas mexidas ficam)
    const list = (d: SharedGroup['dados']) => (Array.isArray(d['pastas']) ? (d['pastas'] as GroupDocFolder[]) : null);
    const [po, pt, pm] = [list(o), list(theirs), list(mine)];
    // (conferida de novo: duas pessoas movendo uma pasta para dentro da outra ao mesmo tempo não deixam um ciclo)
    const pastas = pt || pm ? toDocFolders(docFolders(mergeFolders(po ?? [], pt ?? [], pm ?? []), ''), '') : null;
    return { ...theirs, ...(mine.nome !== o.nome ? { nome: mine.nome } : {}), ...(kanban ? { kanban } : {}), ...(pastas ? { pastas } : {}) };
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
    this.synced.set(true);
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
    if (!queue.length) {
      // a recusada saiu (apagada, noutro grupo, mudou): o aviso dela sai junto
      if (this.error() && !this.stillRefused()) this.error.set(null);
      return;
    }
    const tried = new Set(queue.map((q) => q.note.id));
    // cada anotação vai por conta própria: a que a nuvem não levou não segura as outras
    let failed: { grupo: string; mensagem: string } | null = null;
    try {
      for (let i = 0; i < queue.length; i++) {
        const { note, grupo } = queue[i]!;
        this.moving.set({ grupo, faltam: queue.length - i });
        const entry = this.shared.get(note.id);
        const now = this.store.get(note.id);
        if (!now || this.ofCategory(now.category)?.id !== grupo) continue;
        try {
          // num grupo público, a privada fica pública, fora do Feed (o editor pergunta antes; os outros caminhos
          // chegam aqui sem perguntar, e a nuvem já a mostraria pelo grupo: o que ela diz tem de bater)
          const g = this.entries().get(grupo);
          // (a daqui muda antes de subir: o envio compara com ela, e a privada voltaria por cima)
          if (g?.publico && now.private) this.store.update(withAudience(now, 'visivel', new Date().toISOString()));
          const ready = this.store.get(note.id) ?? now;
          if (entry) await this.shared.moveToGroup(note.id, grupo);
          else await this.shared.share(ready, [], grupo);
          this.refused.delete(note.id);
        } catch (err) {
          // a recusa que não muda sozinha (o grupo cheio, quem virou leitor, a anotação grande demais) não é pedida
          // de novo até a anotação ou o grupo mudarem; sem rede, a nuvem fora, a pressa e o conflito, sim
          if (err instanceof CloudError && !passing(err)) this.refused.set(note.id, refusalKey(this.store.get(note.id) ?? now, this.entries().get(grupo)));
          failed ??= { grupo, mensagem: err instanceof CloudError ? err.message : 'Não deu para levar as anotações para o grupo agora. Elas vão na próxima vez.' };
        }
      }
    } finally {
      this.moving.set(null);
      this.error.set(failed);
    }
    // o que entrou enquanto isso (cada anotação uma vez por rodada: a que a nuvem não levou espera a próxima)
    if (!this.error() && this.pending().some((q) => !tried.has(q.note.id))) void this.adopt();
  }

  /** Alguma anotação que a nuvem recusou continua como estava, esperando no grupo. */
  private stillRefused(): boolean {
    for (const [id, key] of this.refused) {
      const n = this.store.get(id);
      if (n && n.category && refusalKey(n, this.ofCategory(n.category)) === key && !this.shared.get(id)?.grupo) return true;
    }
    return false;
  }

  /** As anotações suas que estão num grupo compartilhado (pelo nome) e ainda não foram para ele na nuvem. */
  private pending(): { note: { id: string }; grupo: string }[] {
    const out: { note: { id: string }; grupo: string }[] = [];
    if (![...this.entries().values()].some((g) => canWrite(g.papel))) return out;
    for (const n of this.store.notes()) {
      if (!isNote(n) || !n.category) continue;
      const g = this.ofCategory(n.category);
      if (!g || !canWrite(g.papel)) continue;
      const e = this.shared.get(n.id);
      // já está nele; ou é de outra pessoa (só quem é dono da anotação a põe num grupo)
      if (e && (e.grupo === g.id || e.papel !== 'dono')) continue;
      if (e?.grupo) continue;
      // a que a nuvem recusou de vez, enquanto nem ela nem o grupo mudam
      if (this.refused.get(n.id) === refusalKey(n, g)) continue;
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

  /** Quem muda o grupo de uma anotação que está num grupo compartilhado: só o dono do grupo (ver `moveNote`). */
  movesNotesOf(groupId: string | null | undefined): boolean {
    return !!groupId && this.entries().get(groupId)?.papel === 'dono';
  }

  /**
   * O dono do grupo compartilhado em que a anotação está a muda de grupo (pelo editor): para outro grupo
   * compartilhado em que escreve (ela passa a ser do dono dele), ou para fora (`category` só sua, ou null: sem
   * grupo), e ela continua dele, no grupo escolhido. Um gestor não: tirada do grupo, ela continua do dono do grupo
   * e sairia do mural de quem a tirou.
   */
  async moveNote(noteId: string, category: string | null): Promise<void> {
    const e = this.shared.get(noteId);
    if (!e?.grupo) return;
    if (!this.movesNotesOf(e.grupo)) throw new CloudError('Só o dono do grupo muda o grupo desta anotação.', 'so-dono', 403);
    const target = category ? this.ofCategory(category) : undefined;
    if (target?.id === e.grupo) return;
    if (target) {
      if (!canWrite(target.papel)) throw new CloudError('Você pode ler esse grupo, mas não escrever nele.', 'so-leitura', 403);
      await this.shared.moveToGroup(noteId, target.id);
      return;
    }
    await this.shared.moveToGroup(noteId, null);
    // fora do grupo, ela fica no grupo escolhido (a nuvem a deixa no de mesmo nome do de antes)
    this.shared.placeInGroup([noteId], category ?? '', false);
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
      if (this.known().size) this.known.set(new Map());
      if (this.entries().size) this.entries.set(new Map());
      return;
    }
    const stored = this.readAll();
    const list = stored.contas[account] ?? [];
    const known = new Map<string, KnownName>();
    for (const [id, k] of Object.entries(stored.nomes[account] ?? {})) {
      const v = k as Partial<KnownName> | null;
      if (typeof v?.nome === 'string' && typeof v.desde === 'string' && Number.isFinite(Date.parse(v.desde))) known.set(id, { nome: v.nome, desde: v.desde });
    }
    this.known.set(known);
    this.entries.set(new Map(list.map(parseGroup).filter((g): g is SharedGroup => !!g).map((g) => [g.id, g])));
    // as mexidas que não chegaram a subir (a aba fechou antes): continuam esperando, e sobem
    this.bases.clear();
    for (const [id, base] of Object.entries(stored.bases[account] ?? {})) {
      const doc = parseGroupDoc(base);
      if (doc && this.entries().has(id)) this.bases.set(id, doc);
    }
    if (this.bases.size && this.auto) this.schedulePush(0);
  }

  private readAll(): { contas: Record<string, unknown[]>; bases: Record<string, Record<string, unknown>>; nomes: Record<string, Record<string, unknown>> } {
    const objects = (v: unknown) =>
      Object.fromEntries(Object.entries(v && typeof v === 'object' ? v : {}).filter(([, x]) => !!x && typeof x === 'object')) as Record<string, Record<string, unknown>>;
    try {
      const raw = JSON.parse(this.data.getItem(GROUPS_KEY) ?? 'null') as { contas?: Record<string, unknown>; bases?: unknown; nomes?: unknown } | null;
      const contas = raw?.contas && typeof raw.contas === 'object' ? raw.contas : {};
      return {
        contas: Object.fromEntries(Object.entries(contas).filter(([, v]) => Array.isArray(v))) as Record<string, unknown[]>,
        bases: objects(raw?.bases),
        nomes: objects(raw?.nomes),
      };
    } catch {
      return { contas: {}, bases: {}, nomes: {} };
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
    // o nome de cada grupo aqui e desde quando: sem ele, a anotação que ainda não subiu viraria um grupo seu ao abrir
    const known = [...this.known()].filter(([id]) => this.entries().has(id));
    all.nomes[account] = Object.fromEntries(known);
    if (!known.length) delete all.nomes[account];
    try {
      void Promise.resolve(this.data.setItem(GROUPS_KEY, JSON.stringify(all))).catch(() => undefined);
    } catch {
      /* sem espaço: fica na memória */
    }
  }
}

/** A falha que passa sozinha (sem rede, a nuvem fora, a pressa, outra pessoa gravando antes): tentar de novo vale. */
function passing(err: CloudError): boolean {
  return err.status === 0 || err.status === 408 || err.status === 429 || err.status >= 500 || (err.status === 409 && err.code === 'conflito');
}

/**
 * A anotação e o grupo como estavam quando a nuvem recusou levá-la: mudou a anotação, o grupo dela ou o papel de
 * quem está aqui nele, ela tenta de novo (não a `versao`, que anda com qualquer mexida no quadro do grupo).
 */
function refusalKey(note: { updatedAt: string; category?: string | null }, group: SharedGroup | undefined): string {
  return JSON.stringify([note.updatedAt, note.category ?? '', group?.id ?? '', group?.papel ?? '']);
}
