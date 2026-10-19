import { Injectable, computed, effect, signal } from '@angular/core';
import { CalendarState, GoogleLink, Reminder, drawColor, mergeCalendar, remindersOn, sanitizeCalendar, skipDay } from './calendar';
import { todayISO } from './dates';

/** A hora do aparelho, 'HH:MM'. */
function nowTime(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
import { newId } from './review';
import { writeJson } from './storage';

/** Os lembretes deste navegador (vão embora com "Apagar o save", como os quadros do Kanban). */
export const CALENDAR_KEY = 'meu-mural:calendario:v1';

function read(): CalendarState {
  try {
    return sanitizeCalendar(JSON.parse(localStorage.getItem(CALENDAR_KEY) ?? 'null'));
  } catch {
    return { reminders: [], removed: {} };
  }
}

/** Agora, mas sempre depois de `prev` (duas mudanças no mesmo milissegundo continuam em ordem). */
function stampAfter(prev: string | undefined): string {
  const now = Date.now();
  const before = prev ? Date.parse(prev) : NaN;
  return new Date(Number.isFinite(before) && before >= now ? before + 1 : now).toISOString();
}

/** O pedido de um lembrete novo (o botão do topo, o N, um dia da folha), com o dia em que ele nasce. */
export interface ComposeRequest {
  day: string | null;
  /** Para dois pedidos iguais seguidos serem dois pedidos. */
  n: number;
}

/**
 * Os lembretes do Calendário (ver core/calendar.ts): guardados neste navegador e, com conta, no mural
 * privado da nuvem (`calendario`, juntado lembrete a lembrete, ver core/cloud-sync.ts). Nunca no mural
 * público: o calendário é só seu, mesmo com as anotações anexadas públicas.
 */
@Injectable({ providedIn: 'root' })
export class CalendarStore {
  readonly state = signal<CalendarState>(read());
  readonly reminders = computed(() => this.state().reminders);
  /** Quando os lembretes mudaram aqui (para a sincronização enviar). */
  readonly changedAt = signal(0);

  /** O topo pediu um lembrete novo (a página do Calendário abre a folha). */
  readonly compose = signal<ComposeRequest | null>(null);
  /**
   * "Escrever uma nota nova" de dentro da folha do lembrete: a anotação salva em seguida é anexada a
   * ele (`claimNote`). O número é o da folha que pediu; fechar o editor sem salvar esquece.
   */
  readonly pendingNote = signal<number | null>(null);
  /** A anotação escrita a pedido da folha `token`, para ela anexar. */
  readonly createdNote = signal<{ token: number; id: string } | null>(null);
  private nextToken = 1;

  /** O dia de hoje, que vira à meia-noite enquanto o site está aberto (ver `tick`). */
  readonly today = signal(todayISO());
  /** A hora de agora ('HH:MM'): o lembrete de hoje cujo horário já foi sai riscado. */
  readonly time = signal(nowTime());
  /** Quantos lembretes hoje tem (a contagem da barra da página). */
  readonly todayCount = computed(() => remindersOn(this.reminders(), this.today()).length);

  constructor() {
    effect(() => writeJson(CALENDAR_KEY, this.state()));
  }

  /** Confere se o dia (ou o minuto) virou: a página chama de vez em quando e quando a aba volta. */
  tick(): void {
    const day = todayISO();
    if (day !== this.today()) this.today.set(day);
    this.time.set(nowTime());
  }

  get(id: string): Reminder | undefined {
    return this.reminders().find((r) => r.id === id);
  }

  ask(day: string | null = null): void {
    this.compose.set({ day, n: (this.compose()?.n ?? 0) + 1 });
  }

  /** Um lembrete em branco para a folha: no dia pedido, sem horário, com uma cor sorteada. */
  blank(day: string): Reminder {
    const now = new Date().toISOString();
    return { id: newId(), title: '', date: day, color: drawColor(this.reminders()), notes: [], skip: [], createdAt: now, at: now };
  }

  /** Guarda o lembrete (novo, ou no lugar do de mesmo id), mais novo que antes. */
  save(r: Reminder): void {
    const st = this.state();
    const i = st.reminders.findIndex((x) => x.id === r.id);
    const at = stampAfter(i >= 0 ? st.reminders[i].at : undefined);
    const next = { ...r, at };
    const reminders = i >= 0 ? st.reminders.map((x, j) => (j === i ? next : x)) : [...st.reminders, next];
    const removed = { ...st.removed };
    delete removed[r.id];
    this.set({ ...st, reminders, removed });
  }

  remove(id: string): void {
    const st = this.state();
    const gone = st.reminders.find((r) => r.id === id);
    if (!gone) return;
    const at = new Date().toISOString();
    // ligado a um evento do Google que é dele: o evento sai de lá (ver GoogleAgenda)
    const own = gone.google && !gone.google.lock;
    const trash = own ? { googleTrash: { ...st.googleTrash, [gone.google!.id]: at } } : {};
    this.set({ ...st, ...trash, reminders: st.reminders.filter((r) => r.id !== id), removed: { ...st.removed, [id]: at } });
  }

  /**
   * O que veio do Google Agenda: os lembretes como estão lá (com o `at` da mudança de lá, o mesmo em
   * todo aparelho) e os apagados lá (que não voltam para o lixo do Google).
   */
  applyGoogle(upserts: readonly Reminder[], removes: readonly { id: string; at: string }[]): void {
    if (!upserts.length && !removes.length) return;
    const st = this.state();
    const byId = new Map(st.reminders.map((r) => [r.id, r]));
    for (const r of upserts) byId.set(r.id, r);
    const removed = { ...st.removed };
    for (const { id, at } of removes) {
      byId.delete(id);
      removed[id] = at;
    }
    this.set({ ...st, reminders: [...byId.values()], removed });
  }

  /**
   * O lembrete foi para o Google: guarda o evento dele. Se ele não mudou enquanto ia (`sent` é o `at`
   * que foi), fica igual ao de lá; se mudou, continua com mudança para mandar.
   */
  linkGoogle(id: string, link: Omit<GoogleLink, 'at'>, sent: string): void {
    const st = this.state();
    const r = st.reminders.find((x) => x.id === id);
    if (!r) return;
    const google: GoogleLink = { ...r.google, ...link };
    if (r.at !== sent) {
      this.set({ ...st, reminders: st.reminders.map((x) => (x === r ? { ...x, google: { ...google, at: sent } } : x)) });
      return;
    }
    const at = stampAfter(r.at);
    this.set({ ...st, reminders: st.reminders.map((x) => (x === r ? { ...x, at, google: { ...google, at } } : x)) });
  }

  /**
   * O Google Agenda foi desconectado: nenhum lembrete fica ligado a um evento (nem travado por ser de lá);
   * todos se mudam e se apagam aqui. Mais novos que antes, para os outros aparelhos ficarem iguais.
   */
  unlinkGoogle(): void {
    const st = this.state();
    if (!st.reminders.some((r) => r.google)) return;
    const reminders = st.reminders.map((r) => {
      if (!r.google) return r;
      const { google: _, ...rest } = r;
      return { ...rest, at: stampAfter(r.at) };
    });
    this.set({ ...st, reminders });
  }

  /** Desfazer: o lembrete volta como era, mais novo que a mudança desfeita. */
  restore(r: Reminder): void {
    // a ligação com o Google é a de agora (o que o Google já sabe), não a de antes da mudança
    const now = this.get(r.id);
    const back = now ? { ...r, google: now.google } : r;
    if (!back.google) delete back.google;
    // (desfez o apagar: o evento continua no lixo do Google, mas um lembrete ligado a ele o segura lá)
    this.save(back);
  }

  /** "Apagar só neste dia", num lembrete que se repete. */
  skipDay(id: string, day: string): void {
    this.change(id, (r, at) => skipDay(r, day, at));
  }

  /** Tira uma anotação do lembrete (a anotação continua no mural). */
  detach(id: string, note: string): void {
    this.change(id, (r, at) => ({ ...r, notes: r.notes.filter((n) => n !== note), at }));
  }

  /** Os lembretes que vieram de outro aparelho, juntados aos daqui. */
  merge(remote: CalendarState): void {
    const next = mergeCalendar(this.state(), remote);
    if (JSON.stringify(next) !== JSON.stringify(this.state())) this.state.set(next);
  }

  /** A folha de um lembrete vai pedir uma anotação nova: o número que vai identificar a resposta. */
  askNote(): number {
    const token = this.nextToken++;
    this.pendingNote.set(token);
    return token;
  }

  /** A anotação acabou de ser salva: se a folha de um lembrete pediu, ela é anexada lá. Devolve se foi. */
  claimNote(id: string): boolean {
    const token = this.pendingNote();
    if (token === null) return false;
    this.pendingNote.set(null);
    this.createdNote.set({ token, id });
    return true;
  }

  private change(id: string, fn: (r: Reminder, at: string) => Reminder): void {
    const st = this.state();
    let changed = false;
    const reminders = st.reminders.map((r) => {
      if (r.id !== id) return r;
      changed = true;
      return fn(r, stampAfter(r.at));
    });
    if (changed) this.set({ ...st, reminders });
  }

  private set(state: CalendarState): void {
    // guardados na ordem de criação, a mesma da junção (as impressões dos aparelhos batem)
    const reminders = [...state.reminders].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    this.state.set({ ...state, reminders });
    this.changedAt.set(Date.now());
  }
}
