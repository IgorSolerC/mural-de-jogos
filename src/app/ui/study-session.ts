import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, computed, effect, inject, input, output, signal, untracked, viewChild } from '@angular/core';
import { reducedMotion } from '../core/motion';
import { ReviewStore } from '../core/review-store';
import { daysBetween, review, studyDay } from '../core/fsrs';
import { fsrsConfig, frontTitle, inGroup, intervalLabel } from '../core/study';
import { QueueItem, StudyScope, countTotal, dayQueue, nextUp } from '../core/study-queue';
import { StudyStore } from '../core/study-store';
import { ICON, IconModule } from './icons';
import { pinningFor } from '../core/wall-physics';
import { StudyCard } from './study-card';
import { StudyCardBack } from './study-card-back';

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
  /** O "Estudar adiantado": as revisões de amanhã, quando hoje já está em dia. */
  readonly ahead = input(false);
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

  private readonly study = inject(StudyStore);
  private readonly store = inject(ReviewStore);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  /** A carta na mesa, e se já foi virada. */
  protected readonly current = signal<QueueItem | null>(null);
  protected readonly revealed = signal(false);
  /** Acabou: sem nada para agora (e quando volta a próxima de hoje, se houver). */
  protected readonly finished = signal(false);
  protected readonly later = signal<string | null>(null);
  private readonly answered = signal<Answered[]>([]);
  private readonly started = Date.now();
  /** O que a voz do leitor de tela diz (virou, respondeu). */
  protected readonly spoken = signal('');
  protected readonly calm = reducedMotion();

  protected readonly title = computed(() => {
    const id = this.deck();
    const name = id ? (this.study.deck(id)?.name ?? 'Baralho') : (this.group() ?? 'Tudo');
    return this.ahead() ? `${name} · adiantado` : name;
  });

  /** Os três montes do que falta, como no Anki (o da carta na mesa sublinhado). */
  protected readonly counts = computed(() => dayQueue(this.study.view(), this.study.now(), this.scope(), this.study.live, this.ahead() ? 1 : 0).counts);

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
      untracked(() => this.advance());
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
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  close(): void {
    const el = this.dialog().nativeElement;
    if (el.open) el.close();
  }

  /** A próxima carta, ou o fim. */
  private advance(): void {
    const up = nextUp(this.study.view(), new Date(), this.scope(), this.study.live, this.ahead() ? 1 : 0);
    this.current.set(up.item);
    this.revealed.set(false);
    this.finished.set(!up.item);
    this.later.set(up.later);
    if (!up.item) this.spoken.set('Por hoje, é isso.');
  }

  protected reveal(): void {
    if (!this.card() || this.revealed()) return;
    this.revealed.set(true);
    this.spoken.set('Resposta');
    // depois de virar, o foco vai para o Acertei (o Espaço também acerta)
    setTimeout(() => this.dialog().nativeElement.querySelector<HTMLElement>('.acertei')?.focus());
  }

  protected answer(ok: boolean): void {
    const c = this.card();
    if (!c || !this.revealed()) return;
    const undo = this.study.answer(c.item.note, ok, c.item.deck);
    if (!undo) return;
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
    last.undo();
    this.answered.set(list.slice(0, -1));
    this.current.set(last.item);
    this.revealed.set(false);
    this.finished.set(false);
    this.later.set(null);
    this.spoken.set('Resposta desfeita');
    this.focusMain();
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
