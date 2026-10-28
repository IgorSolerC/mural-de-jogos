import { DestroyRef, Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { Reminder, addDays } from './calendar';
import { CalendarStore } from './calendar-store';
import { CloudAccount, CloudError } from './cloud-account';
import { GEvent, deviceTimeZone, eventIdFor, fromEvent, instanceIdFor, isMuralEvent, reminderIdFor, toEvent } from './google-agenda';
import { ReviewStore } from './review-store';
import { readJson, removeKey, writeJson } from './storage';

/** O que este aparelho guarda da ligação: de que conta, o ponto da última leitura e os apagados que já saíram de lá. */
const DEVICE_KEY = 'meu-mural:agenda-google:v1';
/** A resposta do Google que chegou sem a janela do site aberta (ver public/google.js). */
export const RETURN_KEY = 'meu-mural:google-retorno';
/** Quantas mudanças vão de uma vez (o mesmo limite da API). */
const BATCH = 25;
/** De quanto em quanto tempo o Calendário aberto confere o Google. */
const EVERY_MS = 10 * 60_000;
/** Depois de uma mudança no Murall, quanto espera antes de mandar (junta as que vêm em seguida). */
const AFTER_CHANGE_MS = 3_000;
/** Quanto a aba que pediu para ligar espera a volta do Google (o mesmo tempo do pedido na API). */
const AWAIT_MS = 15 * 60_000;
/** De volta à página sem a resposta do Google (a janela fechada antes do fim): quanto espera antes de desistir. */
const GIVE_UP_MS = 2_000;

interface DeviceState {
  conta: string;
  sync?: string;
  feitos?: string[];
  em?: string;
  /** De que ligação é a leitura (o `desde` da API): ligar de novo recomeça. */
  desde?: string;
  /**
   * Os lembretes que o Google recusou (pelo id), com o `at` que foi e o porquê: saem da fila até mudarem
   * de novo aqui (mandar de novo o mesmo seria recusado de novo, a cada sincronização).
   */
  recusados?: Record<string, Refusal>;
}

interface Refusal {
  at: string;
  motivo?: string;
}

export type AgendaStatus = 'fora' | 'indisponivel' | 'desligada' | 'ligando' | 'ligada';

/** O que ficou só no Google na última leitura (o Murall não sabe mostrar), para a folha dizer. */
export interface Skipped {
  repeticao: number;
  excecao: number;
}

interface StatusReply {
  disponivel: boolean;
  conectada: boolean;
  desde: string | null;
}

interface Op {
  acao: 'criar' | 'mudar' | 'apagar' | 'voltar';
  id: string;
  evento?: unknown;
}

/** As mudanças de um lembrete, que vão juntas: o evento (se mudou) e as vezes tiradas ou devolvidas. */
interface Group {
  reminder: string;
  /** O `at` que foi. */
  sent: string;
  ops: Op[];
  /** O evento é criado agora (os dias tirados vão dentro dele). */
  creates: boolean;
  /** Os dias tirados do lembrete (o que o Google vai saber, se tudo der certo). */
  skip: string[];
  /** O dia de cada vez mandada, pelo id dela. */
  days: Map<string, { day: string; back: boolean }>;
  /** O lembrete é uma marcação (o evento vai sem avisos). */
  quiet: boolean;
}

/** Até quanto tempo atrás um dia tirado ainda vai ao Google como "tirar esta vez". */
const SKIP_DAYS = 30;

/** A mudança deste lembrete já foi recusada pelo Google (e não mudou desde então). */
function refusedNow(r: Reminder, refused: Record<string, Refusal>): boolean {
  return refused[r.id]?.at === r.at;
}

/** O aviso das mudanças recusadas: quais lembretes, o que isso quer dizer, o que fazer e o porquê que o Google deu. */
export function refusalMessage(list: { title: string; motivo?: string }[]): string | null {
  if (!list.length) return null;
  const names = list.map((x) => `“${x.title}”`);
  const which = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;
  const why = [...new Set(list.map((x) => x.motivo).filter((x): x is string => !!x))];
  const said = why.length ? ` (Resposta do Google: ${why.join(' / ')})` : '';
  return list.length === 1
    ? `O Google não aceitou a última mudança do lembrete ${which}: ela ficou só no Murall. Mude o lembrete de novo para tentar outra vez.${said}`
    : `O Google não aceitou a última mudança dos lembretes ${which}: elas ficaram só no Murall. Mude cada um de novo para tentar outra vez.${said}`;
}

/** O evento do lembrete mudou aqui e ainda não foi (o que só o Google muda nunca vai). */
function eventPending(r: Reminder): boolean {
  return !r.google?.lock && r.google?.at !== r.at;
}

/**
 * Os dias tirados (ou devolvidos, no Desfazer) que o Google ainda não sabe, de um lembrete já ligado que
 * se repete. O que o Google sabe é o `google.skip`; sem ele (ligado antes), os tirados foram na repetição.
 * Um convite ou um evento especial não se tira daqui; a repetição que só o Google muda, sim.
 */
function skipChanges(r: Reminder, today: string): { add: string[]; back: string[] } {
  const g = r.google;
  if (!g || !r.repeat || g.lock === 'convite' || g.lock === 'google') return { add: [], back: [] };
  const known = new Set(g.skip ?? r.skip);
  const mine = new Set(r.skip);
  const since = addDays(today, -SKIP_DAYS);
  return { add: r.skip.filter((d) => !known.has(d) && d >= since), back: [...known].filter((d) => !mine.has(d) && d >= since) };
}

function hasPending(r: Reminder, today: string): boolean {
  if (eventPending(r)) return true;
  const c = skipChanges(r, today);
  return c.add.length + c.back.length > 0;
}

/** Agora, mas depois de `a` e de `b` (a mudança daqui é a mais nova). */
function after(...stamps: (string | undefined)[]): string {
  let t = Date.now();
  for (const s of stamps) if (s && Date.parse(s) >= t) t = Date.parse(s) + 1;
  return new Date(t).toISOString();
}

/**
 * O Google Agenda ligado ao Calendário, nos dois sentidos, na agenda principal da pessoa (ver
 * core/google-agenda.ts para a conversão e api/src/routes/agenda.ts para a API).
 *
 * - Ligar: a API dá o endereço do Google, que abre numa janela; o Google volta para `google.html`, que
 *   entrega o código para esta página; a API troca pela permissão e guarda (cifrada).
 * - Sincronizar: primeiro lê o que mudou no Google (desde a última leitura deste aparelho) e aplica no
 *   Murall, a mudança mais nova vencendo; depois manda o que mudou no Murall (lembretes com `google.at`
 *   diferente do `at`, e os apagados). Os lembretes que vieram de outro aparelho pela nuvem já chegam
 *   ligados; o mesmo lembrete mandado por dois aparelhos bate no mesmo evento (o id sai do lembrete).
 * - Com o Calendário aberto: ao abrir, um pouco depois de cada mudança, de 10 em 10 minutos e ao voltar
 *   para a aba.
 */
@Injectable({ providedIn: 'root' })
export class GoogleAgenda {
  private readonly account = inject(CloudAccount);
  private readonly calendar = inject(CalendarStore);
  private readonly store = inject(ReviewStore);

  readonly status = signal<AgendaStatus>('fora');
  readonly since = signal<string | null>(null);
  readonly syncing = signal(false);
  readonly lastSync = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly skipped = signal<Skipped>({ repeticao: 0, excecao: 0 });
  /** A ligação deste aparelho, se for da conta aberta. */
  private device: DeviceState | null = null;
  private running: Promise<void> | null = null;
  /** As respostas do Google já entregues (pelo `state`). */
  private readonly handled = new Set<string>();
  /** Quando esta aba pediu para ligar: só ela termina a volta que chega pelo localStorage. */
  private awaitingSince = 0;
  /** Esperando a volta do Google: a página de volta (a janela fechada) sem ela desiste. */
  private stopWaiting: (() => void) | null = null;
  private again = false;

  /** O que o Murall tem para mandar ao Google (lembretes mudados e apagados). */
  readonly pending = computed(() => {
    const st = this.calendar.state();
    const done = new Set(this.doneDeletes());
    const today = this.calendar.today();
    const refused = this.refused();
    const changed = st.reminders.filter((r) => hasPending(r, today) && !refusedNow(r, refused)).length;
    // um lembrete ligado ao evento (o apagar desfeito) o segura no Google
    const live = new Set(st.reminders.map((r) => r.google?.id));
    const deletes = Object.keys(st.googleTrash ?? {}).filter((id) => !done.has(id) && !live.has(id)).length;
    return changed + deletes;
  });
  private readonly doneDeletes = signal<string[]>([]);
  private readonly refused = signal<Record<string, Refusal>>({});

  constructor() {
    // a resposta do Google numa janela: o google.html entrega aqui
    if (typeof window !== 'undefined') {
      window.addEventListener('message', (e) => {
        if (e.origin !== location.origin) return;
        const d = e.data as { tipo?: string; codigo?: string; estado?: string; erro?: string } | null;
        if (d?.tipo === 'murall-google') void this.finish(d);
      });
      // a janela do Google pode ter perdido o `opener`: a resposta chega pelo localStorage. O aviso chega a
      // todas as abas do Murall, mas o código vale uma vez: só a aba que pediu para ligar o entrega
      window.addEventListener('storage', (e) => {
        if (e.key !== RETURN_KEY || !e.newValue) return;
        if (!this.awaitingSince || Date.now() - this.awaitingSince > AWAIT_MS) return;
        const d = readJson<{ codigo?: string; estado?: string; erro?: string }>(RETURN_KEY);
        if (d) void this.finish(d);
      });
    }
    // trocou de conta (ou saiu): a ligação deste aparelho era da outra
    effect(() => {
      const conta = this.account.account()?.id ?? null;
      untracked(() => void this.refresh(conta));
    });
  }

  /** Confere com a API se o Google Agenda está ligado (e termina uma volta do Google que ficou esperando). */
  async refresh(conta = this.account.account()?.id ?? null): Promise<void> {
    if (!conta || !this.account.signedIn()) {
      this.status.set('fora');
      this.device = null;
      return;
    }
    const saved = readJson<DeviceState>(DEVICE_KEY);
    this.device = saved?.conta === conta ? saved : { conta };
    this.doneDeletes.set(this.device.feitos ?? []);
    this.refused.set(this.device.recusados ?? {});
    this.lastSync.set(this.device.em ?? null);
    try {
      const r = await this.account.request<StatusReply>('/v1/agenda');
      this.since.set(r.desde);
      this.status.set(!r.disponivel && !r.conectada ? 'indisponivel' : r.conectada ? 'ligada' : 'desligada');
      // ligado de novo (noutro aparelho) depois da última leitura daqui: lê tudo de novo
      if (r.conectada && r.desde && this.device.desde !== r.desde) {
        this.saveDevice({ sync: undefined, feitos: [], desde: r.desde, recusados: {} });
        this.doneDeletes.set([]);
        this.refused.set({});
      }
    } catch {
      this.status.set('indisponivel');
      return;
    }
    const back = readJson<{ codigo?: string; estado?: string; erro?: string }>(RETURN_KEY);
    if (back) await this.finish(back);
  }

  /**
   * Ligar: a janela abre já no clique (senão o navegador bloqueia) e vai para o Google quando a API
   * responde. Sem janela (bloqueada), a página inteira vai e volta.
   */
  async connect(): Promise<void> {
    if (this.status() === 'ligando') return;
    this.error.set(null);
    const win = window.open('', 'murall-google', 'popup,width=520,height=680');
    this.status.set('ligando');
    this.awaitingSince = Date.now();
    try {
      const retorno = new URL('google.html', document.baseURI).href;
      const { url } = await this.account.request<{ url: string }>('/v1/agenda/conectar', { method: 'POST', body: { retorno } });
      if (win) {
        win.location.href = url;
        this.waitForReturn();
      } else location.href = url;
    } catch (err) {
      win?.close();
      this.awaitingSince = 0;
      this.status.set('desligada');
      this.error.set(err instanceof CloudError ? err.message : 'Não deu para abrir o Google agora. Tente de novo.');
    }
  }

  /**
   * A janela do Google fechada antes do fim: a página volta a ter o foco e a resposta não chega. O botão
   * volta a ligar (a resposta que ainda chegar depois termina a ligação do mesmo jeito). O `closed` da
   * janela não serve: o Google corta o `opener`, e ela parece fechada logo que abre.
   */
  private waitForReturn(): void {
    this.stopWaiting?.();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onFocus = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (this.status() !== 'ligando') return;
        this.stopWaiting?.();
        this.status.set('desligada');
      }, GIVE_UP_MS);
    };
    window.addEventListener('focus', onFocus);
    this.stopWaiting = () => {
      clearTimeout(timer);
      window.removeEventListener('focus', onFocus);
      this.stopWaiting = null;
    };
  }

  /** O Google voltou: entrega o código à API e, ligado, sincroniza. */
  private async finish(d: { codigo?: string; estado?: string; erro?: string }): Promise<void> {
    // a mesma resposta chega pela mensagem e pelo localStorage: vale uma vez (a sem `state` não tem código)
    const key = d.estado ?? '';
    if (key && this.handled.has(key)) return;
    if (key) this.handled.add(key);
    this.stopWaiting?.();
    this.awaitingSince = 0;
    removeKey(RETURN_KEY);
    if (d.erro || !d.codigo || !d.estado) {
      this.status.set('desligada');
      this.error.set(d.erro === 'access_denied' ? 'A permissão não foi dada no Google.' : 'O Google não completou a ligação. Tente de novo.');
      return;
    }
    this.status.set('ligando');
    try {
      const r = await this.account.request<{ desde: string }>('/v1/agenda/retorno', { method: 'POST', body: { codigo: d.codigo, estado: d.estado } });
      this.since.set(r.desde);
      this.status.set('ligada');
      this.error.set(null);
      // uma ligação nova lê tudo de novo
      this.saveDevice({ sync: undefined, feitos: [], desde: r.desde, recusados: {} });
      this.doneDeletes.set([]);
      this.refused.set({});
      await this.sync();
    } catch (err) {
      this.status.set('desligada');
      this.error.set(err instanceof CloudError ? err.message : 'O Google não completou a ligação. Tente de novo.');
    }
  }

  async disconnect(): Promise<void> {
    try {
      await this.account.request('/v1/agenda', { method: 'DELETE' });
    } catch (err) {
      this.error.set(err instanceof CloudError ? err.message : 'Não deu para desligar agora. Tente de novo.');
      return;
    }
    removeKey(DEVICE_KEY);
    const conta = this.account.account()?.id;
    this.device = conta ? { conta } : null;
    this.doneDeletes.set([]);
    this.refused.set({});
    this.lastSync.set(null);
    this.skipped.set({ repeticao: 0, excecao: 0 });
    this.status.set('desligada');
    // sem vínculo nenhum: os eventos que vieram do Google viram lembretes do Murall, que se mudam aqui
    this.calendar.unlinkGoogle();
  }

  /** Lê o que mudou no Google, aplica, e manda o que mudou no Murall. Uma rodada por vez. */
  sync(): Promise<void> {
    if (this.status() !== 'ligada') return Promise.resolve();
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = (async () => {
      this.syncing.set(true);
      try {
        do {
          this.again = false;
          await this.pull();
          await this.push();
        } while (this.again);
        const em = new Date().toISOString();
        this.saveDevice({ em });
        this.lastSync.set(em);
        this.error.set(this.refusals());
      } catch (err) {
        if (err instanceof CloudError && err.code === 'agenda-desligada') {
          this.status.set('desligada');
          this.error.set('O Google Agenda foi desligado (a permissão saiu ou venceu). Ligue de novo.');
        } else this.error.set(err instanceof CloudError ? err.message : 'Não deu para falar com o Google agora.');
      } finally {
        this.syncing.set(false);
        this.running = null;
      }
    })();
    return this.running;
  }

  /** Com o Calendário aberto: sincroniza agora, depois das mudanças, de tempos em tempos e ao voltar para a aba. */
  use(destroy = inject(DestroyRef)): void {
    void this.sync();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const watch = effect(() => {
      const n = this.pending();
      const on = this.status() === 'ligada';
      untracked(() => {
        clearTimeout(timer);
        if (on && n > 0) timer = setTimeout(() => void this.sync(), AFTER_CHANGE_MS);
      });
    });
    const every = setInterval(() => document.visibilityState === 'visible' && void this.sync(), EVERY_MS);
    const onVisible = () => document.visibilityState === 'visible' && void this.sync();
    document.addEventListener('visibilitychange', onVisible);
    destroy.onDestroy(() => {
      watch.destroy();
      clearTimeout(timer);
      clearInterval(every);
      document.removeEventListener('visibilitychange', onVisible);
    });
  }

  private async pull(): Promise<void> {
    let sync = this.device?.sync;
    let page: string | undefined;
    const skipped: Skipped = { repeticao: 0, excecao: 0 };
    let full = !sync;
    for (let round = 0; round < 50; round++) {
      const q = new URLSearchParams();
      if (sync) q.set('sync', sync);
      if (page) q.set('pagina', page);
      let reply: { eventos: GEvent[]; sync: string | null; pagina?: string };
      try {
        const query = q.toString();
        reply = await this.account.request('/v1/agenda/eventos' + (query ? `?${query}` : ''));
      } catch (err) {
        // o Google esqueceu o ponto: lê tudo de novo
        if (err instanceof CloudError && err.code === 'agenda-refazer' && sync) {
          sync = undefined;
          page = undefined;
          full = true;
          skipped.repeticao = skipped.excecao = 0;
          this.saveDevice({ sync: undefined });
          continue;
        }
        throw err;
      }
      this.apply(reply.eventos, skipped);
      if (reply.pagina) {
        page = reply.pagina;
        continue;
      }
      if (reply.sync) this.saveDevice({ sync: reply.sync });
      break;
    }
    // o que ficou de fora: a conta da leitura do zero; numa leitura só de mudanças, soma ao que já havia
    this.skipped.update((s) => (full ? skipped : { repeticao: s.repeticao + skipped.repeticao, excecao: s.excecao + skipped.excecao }));
  }

  /** Aplica o que veio do Google: a mudança mais nova vence; o que só o Murall tem (as anotações) fica. */
  private apply(events: readonly GEvent[], skipped: Skipped): void {
    if (!events.length) return;
    const reminders = this.calendar.reminders();
    const byEvent = new Map(reminders.filter((r) => r.google).map((r) => [r.google!.id, r]));
    const byId = new Map(reminders.map((r) => [r.id, r]));
    const today = this.calendar.today();
    const removed = this.calendar.state().removed;
    const upserts = new Map<string, Reminder>();
    const removes: { id: string; at: string }[] = [];
    const current = (id: string) => upserts.get(id) ?? byId.get(id);
    // as vezes tiradas por último: o evento delas pode chegar depois, na mesma leva (ou ser novo)
    const ordered = [...events.filter((e) => !(e.status === 'cancelled' && e.recurringEventId)), ...events.filter((e) => e.status === 'cancelled' && e.recurringEventId)];
    for (const ev of ordered) {
      const known = byEvent.get(ev.id) ?? byId.get(reminderIdFor(ev.id));
      const existing = known && current(known.id);
      const pendingHere = !!existing && hasPending(existing, today);
      const result = fromEvent(ev, existing, today);
      switch (result.kind) {
        case 'upsert': {
          if (existing?.google?.etag && existing.google.etag === ev.etag) break;
          // apagado aqui depois da mudança de lá (o eco do que foi mandado antes): não volta
          const gone = removed[result.reminder.id];
          if (!existing && gone && gone >= result.reminder.at) break;
          // mudado aqui depois da mudança de lá: o daqui vai para o Google (o que só o Google muda vem sempre)
          if (pendingHere && existing!.at > result.reminder.at && !result.reminder.google?.lock) break;
          let next = result.reminder;
          // um dia tirado aqui que ainda não foi: continua para ir
          const sent = new Set(next.google?.skip ?? []);
          if (next.skip.some((d) => !sent.has(d))) next = { ...next, at: after(existing?.at, next.at) };
          upserts.set(next.id, next);
          byEvent.set(ev.id, next);
          break;
        }
        case 'remove': {
          if (!existing) break;
          const at = ev.updated && Number.isFinite(Date.parse(ev.updated)) ? new Date(ev.updated).toISOString() : new Date().toISOString();
          if (pendingHere && existing.at > at) break;
          upserts.delete(existing.id);
          removes.push({ id: existing.id, at: at > existing.at ? at : new Date().toISOString() });
          break;
        }
        case 'skipDay': {
          const master = byEvent.get(result.masterEventId);
          const m = master && current(master.id);
          if (!m?.google || !m.repeat) break;
          const known = m.google.skip ?? m.skip;
          if (m.skip.includes(result.day) && known.includes(result.day)) break;
          const skip = [...new Set([...m.skip, result.day])].sort();
          const gskip = [...new Set([...known, result.day])].sort();
          // o lembrete sem mudança daqui fica igual ao de lá; com mudança, ela continua para ir
          const at = after(m.at);
          const next: Reminder = { ...m, skip, at, google: { ...m.google, skip: gskip, ...(m.google.at === m.at ? { at } : {}) } };
          upserts.set(m.id, next);
          byEvent.set(result.masterEventId, next);
          break;
        }
        case 'ignore':
          if (result.reason === 'repeticao') skipped.repeticao++;
          if (result.reason === 'excecao') skipped.excecao++;
          break;
      }
    }
    this.calendar.applyGoogle([...upserts.values()], removes);
  }

  /** O aviso das recusas que continuam valendo (o lembrete não mudou desde então). */
  private refusals(): string | null {
    const refused = this.refused();
    const list = this.calendar
      .state()
      .reminders.filter((r) => refusedNow(r, refused))
      .map((r) => ({ title: r.title, motivo: refused[r.id].motivo }));
    return refusalMessage(list);
  }

  /**
   * Manda o que mudou no Murall: o evento de cada lembrete mudado, as vezes tiradas (ou devolvidas) de
   * cada um que se repete, depois do evento, e os apagados. O que o Google recusa sai da fila até mudar de
   * novo aqui; o que não coube na ida (`depois`) vai na rodada seguinte, logo em seguida.
   */
  private async push(): Promise<void> {
    const st = this.calendar.state();
    const tz = deviceTimeZone();
    const today = this.calendar.today();
    const done = new Set(this.doneDeletes());
    const refusedBefore = this.refused();
    const items: (Group | Op)[] = [];
    for (const r of st.reminders) {
      if (refusedNow(r, refusedBefore)) continue;
      const sendEvent = eventPending(r);
      const { add, back } = skipChanges(r, today);
      if (!sendEvent && !add.length && !back.length) continue;
      const id = r.google?.id ?? eventIdFor(r.id);
      const ops: Op[] = [];
      if (sendEvent) {
        const names = isMuralEvent(id) ? r.notes.map((n) => this.store.get(n)?.game.name).filter((x): x is string => !!x) : [];
        ops.push({ acao: r.google ? 'mudar' : 'criar', id, evento: toEvent(r, tz, names) });
      }
      const days = new Map<string, { day: string; back: boolean }>();
      const changes = [...add.map((day) => ({ day, back: false })), ...back.map((day) => ({ day, back: true }))];
      // o que não couber vai na próxima rodada (o Google continua sem saber dele)
      for (const c of changes.slice(0, BATCH - ops.length)) {
        const iid = instanceIdFor(id, r, c.day);
        ops.push({ acao: c.back ? 'voltar' : 'apagar', id: iid });
        days.set(iid, c);
      }
      items.push({ reminder: r.id, sent: r.at, ops, creates: !r.google, skip: r.google ? (r.google.skip ?? r.skip) : r.skip, days, quiet: !!r.quiet });
    }
    const live = new Set(st.reminders.map((r) => r.google?.id));
    for (const id of Object.keys(st.googleTrash ?? {})) if (!done.has(id) && !live.has(id)) items.push({ acao: 'apagar', id });
    for (let i = 0; i < items.length; ) {
      // um lembrete não se divide entre duas idas (o evento vai antes das vezes dele)
      const batch: (Group | Op)[] = [];
      let size = 0;
      for (; i < items.length; i++) {
        const n = 'ops' in items[i] ? (items[i] as Group).ops.length : 1;
        if (size && size + n > BATCH) break;
        batch.push(items[i]);
        size += n;
      }
      const ops = batch.flatMap((x) => ('ops' in x ? x.ops : [x]));
      const { resultados } = await this.account.request<{
        resultados: { id: string; ok: boolean; etag?: string | null; htmlLink?: string | null; erro?: string; motivo?: string }[];
      }>(
        '/v1/agenda/enviar',
        { method: 'POST', body: { ops: ops.map(({ acao, id, evento }) => ({ acao, id, ...(evento ? { evento } : {}) })) } },
      );
      const byId = new Map(resultados.map((x) => [x.id, x]));
      // a API não coube tudo numa ida: a sincronização dá outra volta
      if (resultados.some((x) => !x.ok && x.erro === 'depois')) this.again = true;
      const deleted: string[] = [];
      const refused: Record<string, Refusal> = {};
      for (const item of batch) {
        if (!('ops' in item)) {
          // apagar que o Google recusa não adianta mandar de novo: sai da fila
          const res = byId.get(item.id);
          if (res?.ok || res?.erro === 'recusado') deleted.push(item.id);
          if (res?.erro === 'recusado') console.warn(`Google Agenda: o Google não deixou apagar um evento (${res.motivo ?? 'sem motivo'})`);
          continue;
        }
        const no = item.ops.map((o) => byId.get(o.id)).find((x) => x && !x.ok && x.erro === 'recusado');
        if (no) {
          refused[item.reminder] = { at: item.sent, ...(no.motivo ? { motivo: no.motivo } : {}) };
          console.warn(`Google Agenda: o Google recusou a mudança de um lembrete (${no.motivo ?? 'sem motivo'})`);
        }
        const eventOp = item.ops.find((o) => o.acao === 'criar' || o.acao === 'mudar');
        const eventRes = eventOp ? byId.get(eventOp.id) : undefined;
        // o evento não foi: nada fica ligado, e tudo vai de novo
        if (eventOp && !eventRes?.ok) continue;
        // o que o Google sabe dos dias tirados: os que iam no evento novo, e as vezes que foram
        const known = new Set(item.skip);
        for (const [iid, c] of item.days) {
          if (!byId.get(iid)?.ok) continue;
          if (c.back) known.delete(c.day);
          else known.add(c.day);
        }
        const id = eventOp?.id ?? this.calendar.get(item.reminder)?.google?.id;
        if (!id) continue;
        this.calendar.linkGoogle(
          item.reminder,
          {
            id,
            ...(eventRes?.etag ? { etag: eventRes.etag } : {}),
            ...(eventRes?.htmlLink ? { link: eventRes.htmlLink } : {}),
            ...(eventRes ? { quiet: item.quiet } : {}),
            skip: [...known].sort(),
          },
          item.sent,
        );
      }
      if (deleted.length) {
        const feitos = [...new Set([...this.doneDeletes(), ...deleted])];
        this.doneDeletes.set(feitos);
        this.saveDevice({ feitos });
      }
      if (Object.keys(refused).length) {
        const recusados = { ...this.refused(), ...refused };
        this.refused.set(recusados);
        this.saveDevice({ recusados });
      }
      if (resultados.some((x) => !x.ok && x.erro === 'limite')) throw new CloudError('O Google pediu um tempo: o resto vai daqui a pouco.', 'limite', 429);
    }
  }

  private saveDevice(patch: Partial<DeviceState>): void {
    if (!this.device) return;
    this.device = { ...this.device, ...patch };
    if (!this.device.sync) delete this.device.sync;
    writeJson(DEVICE_KEY, this.device);
  }
}
