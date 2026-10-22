import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { ICON, IconModule } from './icons';
import { filter, map } from 'rxjs';
import { AreaSection, NOTE_SECTIONS, REVIEW_SECTIONS, VAULT_URL, areaOf, pathOf, reviewPath, reviewPlace, sectionOf } from '../core/areas';
import { CloudAccount } from '../core/cloud-account';
import { COFRE_ROTULO } from '../../../shared/topo-do-murall';
import { KINDS, Kind, SCORED_KINDS } from '../core/kinds';
import { Mural } from '../core/mural';
import { KanbanStore } from '../core/kanban-store';
import { CalendarStore } from '../core/calendar-store';
import { Settings } from '../core/settings';
import { KindSwitcher } from './kind-switcher';
import { CalendarLogo, ExtrasLogo, KanbanLogo, NotesLogo, QueueLogo, ReviewsLogo, WishlistLogo } from './section-logos';

/** Qual logo a barra mostra. */
type SectionLogo = 'analises' | 'fila' | 'wishlist' | 'notas' | 'kanban' | 'calendario' | 'extras';

/** Uma aba do índice, já com o endereço e se é a aberta. */
interface Tab {
  label: string;
  link: string;
  on: boolean;
  /** Um endereço fora do Murall (o cofre): link comum, sem o roteador. */
  external?: boolean;
}

/** A contagem do lado direito: o número em destaque e o resto, inteiro (tela larga) e curto. */
interface Summary {
  n: number;
  long: string;
  short: string;
}

/**
 * A barra da página, logo embaixo do topo: o cabeçalho das páginas que dependem do mural, numa
 * linha só. À esquerda a etiqueta do mural; ao lado, as seções da parte (ou a volta para Extras); na
 * ponta, o logo da seção e quanto há nela. O topo só diz em que parte se está (Anotações, Análises,
 * Extras); a barra diz o resto, sempre no mesmo lugar, sem uma linha de título a mais em cada página.
 *
 * Todo mural e toda seção tem o seu logo, uma peça de papelaria (ver ui/section-logos.ts), e todos
 * moram numa faixa da mesma altura (`--logo-h`): de uma página para a outra a barra não muda de
 * altura e nada embaixo dela é empurrado.
 *
 * - Análises: o mural de resenhas, Mural / Pra depois / Wishlist e a contagem da seção aberta.
 * - Anotações: as seções (Mural, Kanban, Calendário), quando houver mais de uma.
 * - Extras: o mural; nas páginas de dentro, a volta para Extras. O mural de um colega tem o próprio
 *   cabeçalho.
 * - Amigos, um mural por vez: só o mural, com o de anotações também (sem logo).
 */
@Component({
  selector: 'app-area-bar',
  imports: [CalendarLogo, ExtrasLogo, IconModule, KanbanLogo, KindSwitcher, NotesLogo, QueueLogo, ReviewsLogo, RouterLink, WishlistLogo],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.vazio]': '!shown()' },
  template: `
    @if (shown()) {
      @let ks = picker();
      @let sum = summary();
      @let lg = logo();
      <div class="indice" [class.sem-mural]="!ks" [class.em-extras]="inExtras()">
        @if (ks) {
          <app-kind-switcher class="mural" [kinds]="ks" />
        }
        @if (tabs().length) {
          <nav class="secoes" [attr.aria-label]="navLabel()">
            <ul>
              @for (t of tabs(); track t.label) {
                <li>
                  @if (t.external) {
                    <!-- o cofre é outra origem: link comum, na mesma aba, sem levar o endereço daqui -->
                    <a class="secao cofre" [href]="t.link" rel="noreferrer" aria-label="Cofre de senhas" title="Cofre de senhas">
                      <lucide-icon class="cadeado" [img]="LockIcon" [size]="18" aria-hidden="true" />
                      <span class="nome">{{ t.label }}</span>
                    </a>
                  } @else {
                    <a class="secao" [routerLink]="t.link" [class.on]="t.on" [attr.aria-current]="t.on ? 'page' : null">{{ t.label }}</a>
                  }
                </li>
              }
            </ul>
          </nav>
        } @else if (inExtras() && !extrasHome()) {
          <nav class="secoes" aria-label="Voltar">
            <a class="secao volta" routerLink="/extras">
              <lucide-icon [img]="BackIcon" [size]="18" aria-hidden="true" />
              Extras
            </a>
          </nav>
        }
        @if (lg) {
          <!-- o logo da seção é o título dela (o h1 da página fica para o leitor de tela), sempre numa
               faixa da mesma altura: trocar de página não empurra nada -->
          <div class="pagina">
            @switch (lg) {
              @case ('analises') {
                <app-reviews-logo class="logo" [plural]="mural.profile().plural" />
              }
              @case ('fila') {
                <app-queue-logo class="logo logo-fila" />
              }
              @case ('wishlist') {
                <app-wishlist-logo class="logo logo-wishlist" />
              }
              @case ('notas') {
                <app-notes-logo class="logo" />
              }
              @case ('kanban') {
                <app-kanban-logo class="logo" />
              }
              @case ('calendario') {
                <app-calendar-logo class="logo" [day]="calendar.today()" />
              }
              @case ('extras') {
                <app-extras-logo class="logo" />
              }
            }
          </div>
        }
        @if (sum) {
          <p class="resumo">
            <span class="n">{{ sum.n }}</span><span class="longo">{{ sum.long }}</span><span class="curto">{{ sum.short }}</span>
          </p>
        }
      </div>
    }
  `,
  styles: `
    :host {
      position: relative;
      /* o bloquinho dos murais sai por cima da prateleira de filtros (z-index 5) e fica sob o topo (20) */
      z-index: 15;
      display: block;
      container: indice / inline-size;
      margin-bottom: 24px;
      /* a faixa dos logos: todos cabem nela, e ela tem a mesma altura em toda página */
      --logo-h: 52px;
    }
    :host(.vazio) {
      display: none;
    }

    /* Celular: a etiqueta do mural e a contagem na primeira linha; as seções embaixo, na largura toda;
       por último a faixa do logo */
    .indice {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      grid-template-areas:
        'mural resumo'
        'secoes secoes'
        'pagina pagina';
      align-items: center;
      gap: 10px 14px;
    }
    /* sem a etiqueta do mural (nas Anotações): as seções e a contagem dividem a primeira linha */
    .indice.sem-mural {
      grid-template-columns: minmax(0, 1fr) auto;
      grid-template-areas:
        'secoes resumo'
        'pagina pagina';
    }
    /* em Extras não há contagem: a volta fica ao lado da etiqueta, e a página de Extras (sem volta) tem
       a mesma altura das de dentro */
    .indice.em-extras {
      grid-template-areas:
        'mural secoes'
        'pagina pagina';
    }
    .mural {
      grid-area: mural;
      justify-self: start;
    }
    .secoes {
      grid-area: secoes;
      min-width: 0;
      /* da altura da etiqueta do mural: com ou sem ela, a fileira é a mesma */
      min-height: 46px;
      display: flex;
      align-items: center;

      ul {
        display: flex;
        gap: 2px;
        margin: 0;
        padding: 0;
        list-style: none;
      }
    }
    .pagina {
      grid-area: pagina;
      display: flex;
      align-items: center;
      height: var(--logo-h);
      min-width: 0;
    }
    .resumo {
      grid-area: resumo;
      justify-self: end;
      text-align: right;
    }

    /* os logos, cada um no tamanho que dá a altura da faixa */
    .logo {
      flex: none;
    }
    .logo-wishlist {
      font-size: 2.4rem;
    }
    .logo-fila {
      font-size: 0.79rem;
    }

    /* Cada seção é uma palavra escrita na parede a giz, em caixa alta. A aberta fica em tinta sobre um
       traço de marca-texto amarelo (a cor de estado do site); ao passar, o traço começa a aparecer. */
    .secao {
      position: relative;
      isolation: isolate;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-height: 44px;
      padding: 0 8px;
      border-radius: 3px;
      color: var(--wall-ink-2);
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.98rem;
      letter-spacing: 0.08em;
      line-height: 1;
      text-transform: uppercase;
      text-decoration: none;
      white-space: nowrap;
      transition: color var(--t-ui) var(--ease-ui);

      &::after {
        content: '';
        position: absolute;
        z-index: -1;
        left: 3px;
        right: 1px;
        bottom: 9px;
        height: 9px;
        background: var(--hi);
        /* o traço de marca-texto: mais grosso no começo, a ponta chanfrada */
        -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 10' preserveAspectRatio='none'%3E%3Cpath d='M1 3.2C24 1.6 58 1.2 99 2.4L97 8.6C62 7.4 30 7.8 3 9.4Z'/%3E%3C/svg%3E")
          center / 100% 100% no-repeat;
        mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 10' preserveAspectRatio='none'%3E%3Cpath d='M1 3.2C24 1.6 58 1.2 99 2.4L97 8.6C62 7.4 30 7.8 3 9.4Z'/%3E%3C/svg%3E")
          center / 100% 100% no-repeat;
        scale: 0 1;
        transform-origin: 0 50%;
        transition: scale var(--t-physical) var(--ease-physical);
      }

      &:hover {
        color: var(--wall-ink);

        &::after {
          scale: 0.22 1;
        }
      }

      &:focus-visible {
        outline: 3px solid var(--hi);
        outline-offset: 1px;
      }

      &.on {
        color: var(--ink);

        &::after {
          inset: 9px 0 8px;
          height: auto;
          scale: 1 1;
        }
      }

      lucide-icon {
        display: inline-flex;
        translate: 0 -1px;
      }
    }

    /* a volta para Extras: a seta recua um pouco ao passar, sem marca-texto */
    .volta {
      &::after {
        display: none;
      }
      lucide-icon {
        transition: translate var(--t-ui) var(--ease-ui);
      }
      &:hover lucide-icon {
        translate: -3px -1px;
      }
    }

    /* Quanto há na página, a giz, com o número em destaque */
    .resumo {
      margin: 0;
      color: var(--wall-ink-2);
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.86rem;
      letter-spacing: 0.1em;
      line-height: 1.2;
      text-transform: uppercase;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    .n {
      color: var(--wall-ink);
      font-size: 1.14rem;
      letter-spacing: 0.04em;
    }
    .longo,
    .curto {
      margin-left: 0.4em;
    }
    .longo {
      display: none;
    }

    /* no celular mais estreito, os logos encolhem um pouco dentro da faixa (que fica do mesmo tamanho) */
    @container indice (max-width: 339px) {
      .logo {
        zoom: 0.86;
      }
    }

    /* Uma fileira: a etiqueta, um risco de giz, as seções e, na ponta, a contagem; o logo na faixa de
       baixo */
    @container indice (min-width: 500px) {
      .indice {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 10px 22px;
      }

      .pagina {
        order: 1;
        flex: 1 0 100%;
      }

      .secoes {
        position: relative;
        padding-left: 22px;

        &::before {
          content: '';
          position: absolute;
          left: 0;
          top: 50%;
          width: 2px;
          height: 26px;
          margin-top: -13px;
          border-radius: 1px;
          background: var(--wall-ink-2);
          opacity: 0.45;
          rotate: 8deg;
        }
      }
      /* sem a etiqueta do mural, as seções começam na beirada, sem o risco */
      .sem-mural .secoes {
        padding-left: 0;

        &::before {
          display: none;
        }
      }

      .resumo {
        margin-left: auto;
        padding-left: 12px;
      }

      .secao {
        padding: 0 11px;
        font-size: 1.1rem;
        letter-spacing: 0.1em;
      }
    }

    /* a aba do cofre: o nome, e o cadeado só quando a fileira aperta (as quatro seções e a contagem não
       cabem abaixo de ~342px: o cofre vira só o cadeado e as seções chegam mais perto) */
    .cofre .cadeado {
      display: none;
    }
    @container indice (max-width: 341px) {
      .indice:has(.cofre) .secao {
        padding: 0 6px;
        letter-spacing: 0.06em;
      }
      .cofre {
        min-width: 44px;
        justify-content: center;
      }
      .cofre .nome {
        display: none;
      }
      .cofre .cadeado {
        display: block;
      }
    }
    /* o celular mais estreito (320px): mais um aperto, para a contagem do Calendário caber ao lado */
    @container indice (max-width: 309px) {
      .indice:has(.cofre) .secao {
        padding: 0 4px;
        letter-spacing: 0.04em;
      }
      .indice:has(.cofre) .secoes ul {
        gap: 0;
      }
    }

    @container indice (min-width: 860px) {
      .longo {
        display: inline;
      }
      .curto {
        display: none;
      }
    }

    /* uma linha só: o logo e a contagem na ponta direita, onde antes sobrava parede */
    @container indice (min-width: 900px) {
      .indice {
        flex-wrap: nowrap;
      }
      .pagina {
        order: 0;
        flex: 0 1 auto;
        margin-left: auto;
      }
      .pagina + .resumo {
        margin-left: 0;
        padding-left: 0;
      }
    }

    /* entre 900 e 1100 o logo e as seções dividem a linha: a contagem vai curta */
    @container indice (min-width: 900px) and (max-width: 1099px) {
      .longo {
        display: none;
      }
      .curto {
        display: inline;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .secao::after,
      .volta lucide-icon {
        transition: none;
      }
    }
  `,
})
export class AreaBar {
  private readonly router = inject(Router);
  protected readonly mural = inject(Mural);
  private readonly settings = inject(Settings);
  private readonly kanban = inject(KanbanStore);
  protected readonly calendar = inject(CalendarStore);
  private readonly cloudAccount = inject(CloudAccount);

  protected readonly BackIcon = ICON.voltar;
  protected readonly LockIcon = ICON.privada;

  private readonly path = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map((e) => pathOf((e as NavigationEnd).urlAfterRedirects)),
    ),
    { initialValue: pathOf(this.router.url) },
  );

  private readonly area = computed(() => areaOf(this.path()));

  /** Em Extras, fora o mural de um colega (que tem o próprio cabeçalho). */
  protected readonly inExtras = computed(() => this.area() === 'extras' && this.path() !== '/comparar/mural');
  /** A própria página de Extras (lá não há volta). */
  protected readonly extrasHome = computed(() => this.path() === '/extras');

  /** Os murais do seletor, nas páginas que dependem do mural; `null` onde ele não aparece. */
  protected readonly picker = computed<readonly Kind[] | null>(() => {
    if (this.area() === 'analises' || this.inExtras()) return SCORED_KINDS;
    if (this.path() === '/amigos' && this.settings.friendKinds() === 'separado') return KINDS;
    return null;
  });

  /** As seções da parte aberta; com uma só, nenhuma (não há o que escolher). */
  protected readonly tabs = computed<Tab[]>(() => {
    const area = this.area();
    const kind = this.mural.kind();
    const list: readonly AreaSection[] = area === 'analises' ? REVIEW_SECTIONS : area === 'anotacoes' ? NOTE_SECTIONS : [];
    if (list.length < 2) return [];
    const open = sectionOf(this.path(), list);
    const tabs: Tab[] = list.map((s) => ({
      label: s.label,
      link: area === 'analises' ? reviewPath(kind, s.slug) : '/anotacoes' + (s.slug ? '/' + s.slug : ''),
      on: s === open,
    }));
    // o cofre de senhas, depois do Calendário, só para quem pode usá-lo (o /v1/eu pergunta ao cofre)
    if (area === 'anotacoes' && this.cloudAccount.account()?.cofre) tabs.push({ label: COFRE_ROTULO, link: VAULT_URL, on: false, external: true });
    return tabs;
  });

  /** Quanto há na seção aberta das Análises (nada quando está vazia: a página já diz). */
  protected readonly summary = computed<Summary | null>(() => {
    // no Kanban: quantas anotações o quadro aberto tem
    if (sectionOf(this.path(), NOTE_SECTIONS)?.slug === 'kanban' && this.area() === 'anotacoes') {
      const board = this.kanban.openBoard() ? this.kanban.get(this.kanban.openBoard()!) : undefined;
      const n = board ? this.kanban.live(board).length : 0;
      return n ? { n, long: n === 1 ? 'anotação no quadro' : 'anotações no quadro', short: 'no quadro' } : null;
    }
    // no Calendário: quantos lembretes hoje tem
    if (sectionOf(this.path(), NOTE_SECTIONS)?.slug === 'calendario' && this.area() === 'anotacoes') {
      const n = this.calendar.todayCount();
      return n ? { n, long: n === 1 ? 'lembrete hoje' : 'lembretes hoje', short: 'hoje' } : null;
    }
    const place = reviewPlace(this.path());
    if (!place) return null;
    const p = this.mural.profile();
    const noun = (n: number) => (n === 1 ? p.singular : p.plural);
    const of = (n: number, long: string, short: string): Summary | null => (n ? { n, long: `${noun(n)} ${long}`, short } : null);
    switch (place.section) {
      case 'pra-depois':
        return of(this.mural.draftCount(), 'esperando a sua opinião', 'esperando');
      case 'wishlist':
        return of(this.mural.wishCount(), `que você quer ${p.verb}`, 'na lista');
      case 'lado-a-lado':
        return null;
      default:
        return of(this.mural.count(), 'no mural', noun(this.mural.count()));
    }
  });

  /**
   * O logo da seção aberta: cada mural e cada seção tem o seu (o mural de resenhas e o Lado a lado, o
   * Pra depois, a Wishlist, o mural de anotações, o Kanban, o Calendário e Extras). Só Amigos fica sem.
   */
  protected readonly logo = computed<SectionLogo | null>(() => {
    const area = this.area();
    if (area === 'analises') {
      const section = reviewPlace(this.path())?.section;
      return section === 'wishlist' ? 'wishlist' : section === 'pra-depois' ? 'fila' : 'analises';
    }
    if (area === 'anotacoes') {
      const slug = sectionOf(this.path(), NOTE_SECTIONS)?.slug;
      return slug === 'kanban' ? 'kanban' : slug === 'calendario' ? 'calendario' : 'notas';
    }
    return this.inExtras() ? 'extras' : null;
  });

  protected readonly shown = computed(() => !!this.picker() || this.tabs().length > 0);

  protected readonly navLabel = computed(() => (this.area() === 'analises' ? 'Seções das análises' : 'Seções das anotações'));
}
