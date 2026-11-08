import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, computed, effect, inject, input, output, signal, untracked, viewChild } from '@angular/core';
import { reducedMotion } from '../core/motion';
import { ReviewStore } from '../core/review-store';
import { daysBetween, review, studyDay } from '../core/fsrs';
import { fsrsConfig, frontTitle, inGroup, intervalLabel } from '../core/study';
import { DRILL_LABEL, DrillPlan, DrillState, drillAnswer, drillLeft, drillNext, drillReturn, startDrill } from '../core/study-drill';
import { QueueItem, StudyScope, countTotal, dayQueue, nextUp } from '../core/study-queue';
import { StudyStore } from '../core/study-store';
import { ICON, IconModule } from './icons';
import { pinningFor } from '../core/wall-physics';
import { StudyCard } from './study-card';
import { StudyCardBack } from './study-card-back';

/** Quanto a carta leva para desvirar (o `transition` do `.giro`, em study-session.scss). */
export const TURN_MS = 460;
/**
 * O clique do mouse ou do dedo que chega antes disto depois de os botões trocarem era para o botão de antes:
 * o segundo clique de um clique duplo cairia no que acabou de surgir no mesmo lugar, e viraria a próxima carta
 * sem mostrar a frente, ou responderia a carta sem mostrar a resposta.
 */
export const BOUNCE_MS = 350;
/** Quantas respostas do treino o Desfazer guarda (cada uma leva a rodada inteira de antes). */
export const DRILL_UNDO_MAX = 100;

/** Uma resposta da sessão, para o Desfazer: a carta, se acertou, e como voltar. */
interface Answered {
  item: QueueItem;
  ok: boolean;
  undo: () => void;
}

/**
 * A sessão de estudo (PLANO-ESTUDOS.md, 6.7): a mesa de tela cheia, a carta no meio. "Mostrar a resposta"
 * (Espaço ou Enter) vira a carta; atrás, a anotação inteira. Errei (1) ou Acertei (2, ou Espaço) e a
 * próxima vem; embaixo de cada botão, quando a carta voltaria. Desfazer (Z, Ctrl+Z) volta a anterior,
 * quantas vezes for preciso. Cada resposta fica guardada na hora: parar no meio não perde nada.
 *
 * A fila não fica guardada: a próxima é pedida depois de cada resposta (core/study-queue.ts, `nextUp`);
 * a carta respondida sai sozinha, e a que errou volta em 1 ou 10 minutos.
 *
 * Com `drill`, a mesma mesa vira o treino (core/study-drill.ts): as cartas escolhidas, embaralhadas, sem
 * guardar nada (nem o progresso, nem o boletim, nem os limites do dia). Em cima, no lugar dos montes, o placar
 * do treino; no fim da rodada, "Mais uma rodada" passa as mesmas cartas de novo, somando os números.
 */
@Component({
  selector: 'app-study-session',
  imports: [IconModule, StudyCard, StudyCardBack],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './study-session.html',
  styleUrl: './study-session.scss',
  host: { '(keydown)': 'onKey($event)' },
})
export class StudySession {
  /** O baralho estudado (null: o grupo, ou Estudar tudo). */
  readonly deck = input<string | null>(null);
  /** O grupo estudado, sem baralho (o Estudar o grupo: os baralhos dele juntos); null com os dois: tudo. */
  readonly group = input<string | null>(null);
  /** O que se estuda: o baralho, os baralhos do grupo, ou todos. */
  private readonly scope = computed<StudyScope>(() => {
    const deck = this.deck();
    if (deck) return deck;
    const group = this.group();
    return group ? this.study.decks().filter((d) => inGroup(d, group)).map((d) => d.id) : undefined;
  });
  /** O treino (as cartas e com o que treinar), no lugar do estudo do dia; null: o estudo de verdade. */
  readonly drill = input<DrillPlan | null>(null);
  readonly closed = output<void>();
  /** "Estudar tudo", no fim de um baralho: quem abriu troca a mesa para todos os baralhos. */
  readonly all = output<void>();
  /** "Estudar o resto de Japonês", no fim de um baralho: quem abriu troca a mesa para o grupo dele (o nome). */
  readonly groupAll = output<string>();

  protected readonly CloseIcon = ICON.fechar;
  protected readonly WrongIcon = ICON.fechar;
  protected readonly RightIcon = ICON.pronto;
  protected readonly UndoIcon = ICON.desfazer;
  protected readonly PlayIcon = ICON.estudar;
  protected readonly AgainIcon = ICON.recomecar;

  private readonly study = inject(StudyStore);
  private readonly store = inject(ReviewStore);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly back = viewChild(StudyCardBack);

  /** A carta na mesa, e se já foi virada. */
  protected readonly current = signal<QueueItem | null>(null);
  protected readonly revealed = signal(false);
  /**
   * A anotação da carta que acabou de sair, enquanto a mesa desvira: o giro é um só, e a carta nova não pode
   * aparecer de costas, com a resposta dela à mostra, antes de a frente chegar.
   */
  protected readonly leaving = signal<string | null>(null);
  private leavingTimer: ReturnType<typeof setTimeout> | undefined;
  /** Quando os botões do pé trocaram pela última vez (no relógio do `timeStamp` dos eventos). */
  private swappedAt = 0;
  /** Acabou: sem nada para agora (e quando volta a próxima de hoje, se houver). */
  protected readonly finished = signal(false);
  protected readonly later = signal<string | null>(null);
  private readonly answered = signal<Answered[]>([]);
  private readonly started = Date.now();
  /** O treino em andamento: só aqui, na memória da mesa (fechou, sumiu). */
  protected readonly tally = signal<DrillState | null>(null);
  private rounds = 0;
  /** O que a voz do leitor de tela diz (virou, respondeu). */
  protected readonly spoken = signal('');
  protected readonly calm = reducedMotion();

  protected readonly title = computed(() => {
    const id = this.deck();
    return id ? (this.study.deck(id)?.name ?? 'Baralho') : (this.group() ?? 'Tudo');
  });
  /** Com o que se treina, na dica do título. */
  protected readonly drillLabel = computed(() => {
    const d = this.drill();
    return d ? DRILL_LABEL[d.kind] : null;
  });

  /** Os três montes do que falta, como no Anki (o da carta na mesa sublinhado). */
  protected readonly counts = computed(() => dayQueue(this.study.view(), this.study.now(), this.scope(), this.study.live).counts);

  /** A carta na mesa: a frente e a anotação (o verso, em ui/study-card-back.ts). */
  protected readonly card = computed(() => {
    const item = this.current();
    if (!item) return null;
    const card = this.study.cardOf().get(item.note);
    const note = this.store.get(item.note);
    if (!card || !note) return null;
    return {
      item,
      title: frontTitle(card, note.game.name),
      subtitle: card.front.subtitle,
      image: card.front.image,
      // a cor da anotação como o mural a desenha (sem cor escolhida, a sorteada pelo id)
      stock: pinningFor(note.id, note.stock).stock,
      deck: this.study.deck(item.deck) ?? null,
      noteId: note.id,
      srs: card.srs,
    };
  });

  /** Quando a carta voltaria com cada resposta (o que o FSRS calcularia agora, sem guardar nada). */
  protected readonly intervals = computed(() => {
    const c = this.card();
    if (!c) return null;
    const now = new Date();
    const drill = this.tally();
    if (drill) {
      // no treino: daqui a quanto volta na rodada, ou que sai dela; sendo a única que sobrou, ela volta já
      const alone = drillLeft(drill) <= 1;
      const label = (ok: boolean) => {
        const min = drillReturn(drill, c.item.note, ok);
        if (min === null) return 'sai da rodada';
        return alone ? 'volta já' : intervalLabel(now, new Date(now.getTime() + min * 60_000), false);
      };
      return { wrong: label(false), right: label(true) };
    }
    const cfg = { ...fsrsConfig(this.study.config()), fuzz: false };
    const label = (ok: boolean) => {
      const next = review(c.srs, ok ? 3 : 1, now, cfg, c.item.note);
      return intervalLabel(now, new Date(next.due), next.state === 'revisao');
    };
    return { wrong: label(false), right: label(true) };
  });

  /** O resumo do fim: quantas vistas, quantas acertou, quanto tempo, e o que vem amanhã. */
  protected readonly summary = computed(() => {
    const list = this.answered();
    const right = list.filter((a) => a.ok).length;
    const minutes = Math.max(1, Math.round((Date.now() - this.started) / 60_000));
    const next = this.nextDay();
    return {
      seen: list.length,
      right,
      rate: list.length ? Math.round((right / list.length) * 100) : 0,
      minutes,
      next,
    };
  });

  /**
   * O grupo do baralho estudado, quando outro baralho dele ainda tem cartas para hoje (no fim, o "Estudar
   * o resto de Japonês", antes do "Estudar tudo"): o nome do grupo, ou null.
   */
  protected readonly groupMore = computed(() => {
    const deck = this.deck();
    const group = deck ? this.study.deck(deck)?.group : null;
    if (!group) return null;
    const ids = this.study.decks().filter((d) => inGroup(d, group)).map((d) => d.id);
    return countTotal(dayQueue(this.study.view(), this.study.now(), ids, this.study.live).counts) > 0 ? group : null;
  });

  /** Outro baralho ainda tem cartas para hoje (no fim, o "Estudar tudo"). */
  protected readonly moreElsewhere = computed(() => this.scope() !== undefined && countTotal(dayQueue(this.study.view(), this.study.now(), undefined, this.study.live).counts) > 0);

  protected readonly canUndo = computed(() => this.answered().length > 0);

  constructor() {
    // a primeira carta, e de novo quando o baralho troca (o "Estudar tudo" do fim): o baralho é uma
    // entrada, que ainda não chegou quando o construtor roda
    effect(() => {
      this.deck();
      this.group();
      const drill = this.drill();
      untracked(() => {
        this.tally.set(drill ? startDrill(drill.items, this.seed()) : null);
        this.advance();
      });
    });
    afterNextRender(() => {
      this.dialog().nativeElement.showModal();
      this.focusMain();
    });
    // a carta em aprendizado que volta daqui a pouco: o relógio anda e a mesa pergunta de novo
    const timer = setInterval(() => {
      this.study.tick();
      if (this.finished() && this.later()) this.advance();
    }, 30_000);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(timer);
      clearTimeout(this.leavingTimer);
    });
  }

  close(): void {
    const el = this.dialog().nativeElement;
    if (el.open) el.close();
  }

  /** A próxima carta, ou o fim. */
  private advance(): void {
    const drill = this.tally();
    if (drill) {
      const cards = this.study.cardOf();
      const item = drillNext(drill, Date.now(), (note) => this.study.live(note) && cards.has(note));
      this.current.set(item);
      this.revealed.set(false);
      this.finished.set(!item);
      this.later.set(null);
      this.swappedAt = performance.now();
      if (!item) this.spoken.set('Rodada completa.');
      return;
    }
    const up = nextUp(this.study.view(), new Date(), this.scope(), this.study.live);
    this.current.set(up.item);
    this.revealed.set(false);
    this.finished.set(!up.item);
    this.later.set(up.later);
    this.swappedAt = performance.now();
    if (!up.item) this.spoken.set('Por hoje, é isso.');
  }

  protected reveal(): void {
    if (!this.card() || this.revealed()) return;
    // virou de novo antes de a mesa terminar de desvirar: o verso já é o desta carta
    this.holdBack(null);
    // o verso é o mesmo de carta em carta: a resposta abre do começo, não onde a anterior parou de rolar
    this.back()?.toTop();
    this.revealed.set(true);
    this.swappedAt = performance.now();
    this.spoken.set('Resposta');
    // depois de virar, o foco vai para o Acertei (o Espaço também acerta)
    setTimeout(() => this.dialog().nativeElement.querySelector<HTMLElement>('.acertei')?.focus());
  }

  protected answer(ok: boolean): void {
    const c = this.card();
    if (!c || !this.revealed()) return;
    const drill = this.tally();
    if (drill) {
      // o treino não guarda nada: a resposta só mexe na rodada, e desfazer é voltar a rodada de antes
      this.holdBack(c.noteId);
      this.tally.set(drillAnswer(drill, c.item.note, ok, Date.now()));
      this.answered.update((list) => [...list, { item: c.item, ok, undo: () => this.tally.set(drill) }].slice(-DRILL_UNDO_MAX));
      const min = drillReturn(drill, c.item.note, ok);
      const back = drillLeft(drill) <= 1 ? 'Volta já.' : `Volta em ${min} min.`;
      this.spoken.set(`${ok ? 'Acertou' : 'Errou'}. ${min === null ? 'Saiu da rodada.' : back}`);
      this.advance();
      this.focusMain();
      return;
    }
    const undo = this.study.answer(c.item.note, ok, c.item.deck);
    if (!undo) return;
    this.holdBack(c.noteId);
    this.answered.update((list) => [...list, { item: c.item, ok, undo }]);
    const back = this.study.cardOf().get(c.item.note);
    if (back) {
      const now = new Date();
      const when = intervalLabel(now, new Date(back.srs.due), back.srs.state === 'revisao');
      this.spoken.set(`${ok ? 'Acertou' : 'Errou'}. Volta em ${when}.`);
    }
    this.advance();
    this.focusMain();
  }

  /** Desfazer: a última resposta volta, e a carta dela volta para a mesa, sem virar. */
  protected undo(): void {
    const list = this.answered();
    const last = list.at(-1);
    if (!last) return;
    const showing = this.revealed() ? this.card() : null;
    if (showing) this.holdBack(showing.noteId);
    last.undo();
    this.answered.set(list.slice(0, -1));
    this.current.set(last.item);
    this.revealed.set(false);
    this.swappedAt = performance.now();
    this.finished.set(false);
    this.later.set(null);
    this.spoken.set('Resposta desfeita');
    this.focusMain();
  }

  /** O toque no "Mostrar a resposta". */
  protected pressReveal(e: MouseEvent): void {
    if (!this.bounced(e)) this.reveal();
  }

  /** O toque no Errei ou no Acertei. */
  protected pressAnswer(e: MouseEvent, ok: boolean): void {
    if (!this.bounced(e)) this.answer(ok);
  }

  /** O clique que era para o botão de antes (`BOUNCE_MS`). O do teclado (`detail` 0) mira o botão com o foco: esse vale. */
  private bounced(e: MouseEvent): boolean {
    return e.detail > 0 && e.timeStamp - this.swappedAt < BOUNCE_MS;
  }

  /** Deixa o verso na anotação que saiu até a mesa terminar de desvirar; null solta na hora. */
  private holdBack(note: string | null): void {
    clearTimeout(this.leavingTimer);
    this.leaving.set(note);
    if (note) this.leavingTimer = setTimeout(() => this.leaving.set(null), TURN_MS);
  }

  /** "Mais uma rodada", no fim do treino: as mesmas cartas, embaralhadas de novo, e o placar continua. */
  protected again(): void {
    const drill = this.drill();
    const tally = this.tally();
    if (!drill || !tally) return;
    this.tally.set(startDrill(drill.items, this.seed(), tally));
    // a rodada que acabou não se desfaz mais: o Desfazer volta só dentro da rodada nova
    this.answered.set([]);
    this.advance();
    this.focusMain();
  }

  /** A semente do sorteio de cada rodada (cada uma numa ordem). */
  private seed(): string {
    return `${this.started}:${this.rounds++}`;
  }

  /** "Estudar tudo", no fim de um baralho: a mesa continua, com todos os baralhos. */
  protected studyAll(): void {
    this.all.emit();
  }

  /** "Estudar o resto de Japonês", no fim de um baralho: a mesa continua, com os baralhos do grupo dele. */
  protected studyGroup(group: string): void {
    this.groupAll.emit(group);
  }

  protected onKey(e: KeyboardEvent): void {
    if (e.target instanceof HTMLElement && e.target.closest('input, textarea, select, [contenteditable="true"]')) return;
    const key = e.key.toLowerCase();
    if (key === 'z' && !e.altKey) {
      e.preventDefault();
      this.undo();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    // a tecla segurada não passa as cartas sozinha: cada virada e cada resposta é um aperto
    if (e.repeat && (key === ' ' || key === 'enter' || key === '1' || key === '2')) {
      e.preventDefault();
      return;
    }
    // Espaço e Enter num botão com o foco são do botão (o Voltar do fim, o Errei escolhido pelo Tab), e
    // no que se toca no texto do verso também: o título do card que abre e fecha, o spoiler. O link só usa
    // o Enter: com o foco nele (de volta da leitura que ele abriu), o Espaço continua sendo o Acertei
    const own = key === ' ' ? 'button, summary, [role="button"]' : 'button, a[href], summary, [role="button"], [role="link"]';
    if ((key === ' ' || key === 'enter') && e.target instanceof Element && e.target.closest(own)) return;
    if (!this.card()) return;
    if (!this.revealed()) {
      if (key === ' ' || key === 'enter') {
        e.preventDefault();
        this.reveal();
      }
      return;
    }
    if (key === '1') {
      e.preventDefault();
      this.answer(false);
    } else if (key === '2' || key === ' ') {
      e.preventDefault();
      this.answer(true);
    }
  }

  /** O foco na ação principal da mesa: o "Mostrar a resposta", ou o primeiro botão do fim. */
  private focusMain(): void {
    setTimeout(() => this.dialog().nativeElement.querySelector<HTMLElement>('.mostrar, .fim .btn-ink')?.focus());
  }

  /** O próximo dia com revisão (no baralho, ou em todos) e quantas cartas vencem nele. */
  private nextDay(): { when: string; n: number } | null {
    const now = this.study.now();
    const today = studyDay(now);
    const scope = this.scope();
    const ids = scope === undefined ? null : typeof scope === 'string' ? [scope] : scope;
    let day: string | null = null;
    let n = 0;
    for (const c of this.study.cards()) {
      if (c.srs.state !== 'revisao' || !this.study.live(c.note)) continue;
      if (ids ? !c.decks.some((d) => ids.includes(d)) : !c.decks.length) continue;
      const due = studyDay(new Date(c.srs.due));
      if (due <= today) continue;
      if (!day || due < day) {
        day = due;
        n = 1;
      } else if (due === day) n++;
    }
    if (!day) return null;
    const gap = daysBetween(today, day);
    return { when: gap === 1 ? 'Amanhã' : `Em ${gap} dias`, n };
  }

  /** Quando a carta em aprendizado volta, dito como gente ("daqui a 25 min"). */
  protected laterLabel(at: string): string {
    return intervalLabel(new Date(), new Date(at), false);
  }
}
