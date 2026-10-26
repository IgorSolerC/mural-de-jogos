import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { ICON, IconModule } from './icons';
import { filter, map } from 'rxjs';
import { CALENDAR_PATH, SPENDING_PATH, areaOf, listOf, pathOf, reviewPath } from '../core/areas';
import { CalendarStore } from '../core/calendar-store';
import { Desk } from '../core/desk';
import { Follow } from '../core/follow';
import { Mural } from '../core/mural';
import { ProfileStore } from '../core/profile-store';
import { Settings } from '../core/settings';
import { SpendingStore } from '../core/spending-store';
import type { LucideIconData } from 'lucide-angular';
import { BOTTONS, DESENHOS, INCLINACOES, PARTES_DO_SITE } from '../../../shared/topo-do-murall';
import { Pin } from './pin';

/*
 * As partes do varal, os bottons e os desenhos deles moram em `shared/topo-do-murall.ts`, e o desenho do
 * topo em `shared/topo/_topo-do-murall.scss`: o topo do cofre de senhas usa os mesmos, e os dois nunca
 * se desencontram.
 */

/**
 * O topo do site, igual em todas as páginas, em três grupos que não se misturam:
 * - o cartaz, "Murall", que leva à última parede aberta;
 * - o varal: as partes do site (Anotações, Análises, Utilidades, Extras), etiquetas de kraft presas por
 *   prendedores num barbante. O mural de resenhas e as seções de cada parte ficam no índice da
 *   própria página (ver ui/area-bar.ts), nunca aqui;
 * - os bottons: o que é seu e vale para todos os murais (Perfil, Amigos, Ajustes), broches redondos;
 * e o botão de adicionar da página (a pilha de fichas, a folha de caderno, o cupom), num lugar só dele.
 *
 * A disposição segue a largura do próprio topo (container queries), não a da janela: assim o teste mede
 * o topo em qualquer largura sem abrir janelas (ver site-header.spec.ts).
 */
@Component({
  selector: 'app-site-header',
  imports: [IconModule, Pin, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './site-header.html',
  styleUrl: './site-header.scss',
})
export class SiteHeader {
  protected readonly mural = inject(Mural);
  protected readonly desk = inject(Desk);
  private readonly calendar = inject(CalendarStore);
  private readonly spending = inject(SpendingStore);
  protected readonly profiles = inject(ProfileStore);
  private readonly follow = inject(Follow);
  private readonly settings = inject(Settings);
  private readonly router = inject(Router);

  protected readonly PlusIcon = ICON.adicionar;
  protected readonly NoteIcon = ICON.praDepois;
  protected readonly CutIcon = ICON.tesoura;
  protected readonly GearIcon = DESENHOS.ajustes as unknown as LucideIconData;
  protected readonly FriendsIcon = DESENHOS.amigos as unknown as LucideIconData;
  /** Os bottons pelo id: o nome, a dica e o caminho de cada um. */
  protected readonly botton = Object.fromEntries(BOTTONS.map((b) => [b.id, b])) as Record<(typeof BOTTONS)[number]['id'], (typeof BOTTONS)[number]>;

  private readonly path = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map((e) => pathOf((e as NavigationEnd).urlAfterRedirects)),
    ),
    { initialValue: pathOf(this.router.url) },
  );

  /** Nas Anotações: o botão prega uma anotação, não uma resenha. */
  protected readonly notes = computed(() => areaOf(this.path()) === 'anotacoes');

  protected readonly sections = computed(() => {
    const open = areaOf(this.path());
    return PARTES_DO_SITE.map((s, i) => ({
      ...s,
      // as Análises abrem direto no último mural de resenhas (sem passar pelo redirecionamento)
      path: s.area === 'analises' ? reviewPath(this.mural.reviewKind()) : s.area === 'utilidades' ? SPENDING_PATH : '/' + s.area,
      on: s.area === open,
      tilt: INCLINACOES[i % INCLINACOES.length],
    }));
  });

  /** No Calendário: o botão marca um lembrete, não prega uma anotação. */
  protected readonly onCalendar = computed(() => this.path() === CALENDAR_PATH);

  /** Nos Gastos: o botão lança um gasto no livro do mês. */
  protected readonly onSpending = computed(() => this.path() === SPENDING_PATH);

  /** O que o botão de adicionar cria: "Nova resenha", "Nova anotação", no Calendário "Novo lembrete" e nos Gastos "Novo gasto". */
  protected readonly addLabel = computed(() =>
    this.onCalendar()
      ? { verb: 'Novo', noun: 'lembrete' }
      : this.onSpending()
        ? { verb: 'Novo', noun: 'gasto' }
        : { verb: 'Nova', noun: this.notes() ? 'anotação' : 'resenha' },
  );

  protected add(): void {
    if (this.onCalendar()) this.calendar.ask();
    else if (this.onSpending()) this.spending.ask();
    else this.desk.newReview();
  }

  /** No Pra depois ou na Wishlist: lá o botão adiciona à lista, não ao mural. */
  protected readonly onList = computed(() => listOf(this.path()));

  /** Amigos só existe com a nuvem e a conta. */
  protected readonly friends = computed(() => this.follow.available());
  /** O adesivo amarelo do botton de Amigos: quantas novidades chegaram (se a pessoa quer ver o número). */
  protected readonly unseen = computed(() => (this.settings.mailCount() && this.follow.unseen()) || 0);

  /** O seu perfil (o seu, ou editando); o perfil de outra pessoa não acende o seu botton. */
  protected readonly onProfile = computed(() => this.path() === '/perfil' || this.path() === '/perfil/editar');
  protected readonly onFriends = computed(() => this.path() === '/amigos');
  /** As Novidades se abrem pelos Ajustes: o botton fica aceso nelas também. */
  protected readonly onSettings = computed(() => this.path().startsWith('/ajustes') || this.path() === '/novidades');

  /**
   * Chegou algo dos amigos (o número apareceu ou subiu, inclusive ao abrir o site com novidades
   * guardadas): as pessoas do botton dão uma balançada, uma vez.
   */
  protected readonly nudge = signal(false);
  private lastUnseen: number | null = null;
  private nudgeTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly nudgeOnArrival = effect(() => {
    const n = this.unseen();
    const before = this.lastUnseen;
    this.lastUnseen = n;
    if (before === null || n <= before) return;
    untracked(() => {
      this.nudge.set(false);
      requestAnimationFrame(() => {
        this.nudge.set(true);
        clearTimeout(this.nudgeTimer);
        this.nudgeTimer = setTimeout(() => this.nudge.set(false), 1600);
      });
    });
  });
}
