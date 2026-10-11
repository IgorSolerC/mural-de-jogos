import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { LucideAngularModule, NotebookPen, Plus, Scissors, Settings as SettingsIcon, UsersRound } from 'lucide-angular';
import { filter, map } from 'rxjs';
import { Desk } from '../core/desk';
import { isNotes } from '../core/kinds';
import { Follow } from '../core/follow';
import { Mural } from '../core/mural';
import { ProfileStore } from '../core/profile-store';
import { Settings } from '../core/settings';
import { KindSwitcher } from './kind-switcher';
import { Pin } from './pin';

/** Uma etiqueta do varal: uma parte do mural aberto. */
interface Section {
  path: string;
  label: string;
  /** Outras rotas que moram dentro desta parte (o lado a lado é uma vista do mural). */
  also?: string[];
}

/** O que muda com o mural aberto: cada mural tem a sua parede, a sua fila, a sua wishlist e os seus extras. */
const SECTIONS: Section[] = [
  { path: '/', label: 'Mural', also: ['/lado-a-lado'] },
  { path: '/fila', label: 'Pra depois' },
  { path: '/wishlist', label: 'Wishlist' },
  // o Ranking e o Comparar moram dentro de Extras: a etiqueta de Extras fica acesa neles também
  { path: '/extras', label: 'Extras', also: ['/ranking', '/comparar', '/comparar/mural'] },
];

/** As partes que não existem no mural de anotações. */
const NOT_FOR_NOTES = ['/fila', '/wishlist', '/extras'];

/** Cada etiqueta pende de um jeito no barbante, sempre o mesmo (o prendedor é o eixo). */
const TILTS = [-2.2, 1.6, -1.2, 2];

/** O caminho aberto, sem query nem fragmento. */
export function pathOf(url: string): string {
  return url.split(/[?#]/)[0];
}

/** A etiqueta acende na própria página, nas que moram dentro dela e nas sub-páginas (menos o Mural, que é a raiz). */
export function sectionOn(path: string, s: { path: string; also?: string[] }): boolean {
  return path === s.path || !!s.also?.includes(path) || (s.path !== '/' && path.startsWith(s.path + '/'));
}

/**
 * O topo do site, igual em todas as páginas, em três grupos que não se misturam:
 * - o cartaz, "Meu mural de *jogos*", que troca de mural;
 * - o varal: as partes do mural aberto (Mural, Pra depois, Wishlist, Extras), etiquetas de kraft presas
 *   por prendedores num barbante;
 * - os bottons: o que é seu e vale para todos os murais (Perfil, Amigos, Ajustes), broches redondos;
 * e o botão de adicionar da página (a pilha de fichas, a folha de caderno, o cupom), num lugar só dele.
 *
 * A disposição segue a largura do próprio topo (container queries), não a da janela: assim o teste mede
 * o topo em qualquer largura sem abrir janelas (ver site-header.spec.ts).
 */
@Component({
  selector: 'app-site-header',
  imports: [KindSwitcher, LucideAngularModule, Pin, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './site-header.html',
  styleUrl: './site-header.scss',
})
export class SiteHeader {
  protected readonly mural = inject(Mural);
  protected readonly desk = inject(Desk);
  protected readonly profiles = inject(ProfileStore);
  private readonly follow = inject(Follow);
  private readonly settings = inject(Settings);
  private readonly router = inject(Router);

  protected readonly PlusIcon = Plus;
  protected readonly NoteIcon = NotebookPen;
  protected readonly CutIcon = Scissors;
  protected readonly GearIcon = SettingsIcon;
  protected readonly FriendsIcon = UsersRound;

  private readonly path = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map((e) => pathOf((e as NavigationEnd).urlAfterRedirects)),
    ),
    { initialValue: pathOf(this.router.url) },
  );

  /** O mural aberto é o de anotações: lá só existe a parede. */
  protected readonly notes = computed(() => isNotes(this.mural.kind()));

  protected readonly sections = computed(() =>
    (this.notes() ? SECTIONS.filter((s) => !NOT_FOR_NOTES.includes(s.path)) : SECTIONS).map((s, i) => ({
      ...s,
      on: sectionOn(this.path(), s),
      tilt: TILTS[i % TILTS.length],
    })),
  );

  /** Na fila do Pra depois ou na Wishlist: lá o botão adiciona à lista, não ao mural. */
  protected readonly onList = computed<'fila' | 'wishlist' | null>(() => {
    if (this.notes()) return null;
    const p = this.path();
    return p.startsWith('/fila') ? 'fila' : p.startsWith('/wishlist') ? 'wishlist' : null;
  });

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
