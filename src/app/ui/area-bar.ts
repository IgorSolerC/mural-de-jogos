import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { ArrowLeft, LucideAngularModule } from 'lucide-angular';
import { filter, map } from 'rxjs';
import { AreaSection, NOTE_SECTIONS, REVIEW_SECTIONS, areaOf, pathOf, reviewPath, reviewPlace, sectionOf } from '../core/areas';
import { KINDS, Kind, SCORED_KINDS } from '../core/kinds';
import { Mural } from '../core/mural';
import { KanbanStore } from '../core/kanban-store';
import { CalendarStore } from '../core/calendar-store';
import { Settings } from '../core/settings';
import { KindSwitcher } from './kind-switcher';
import { QueueLogo, WishlistLogo } from './section-logos';

/** Uma aba do índice, já com o endereço e se é a aberta. */
interface Tab {
  label: string;
  link: string;
  on: boolean;
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
 * ponta, o logo da seção (o bilhete de resgate da Wishlist, a etiqueta de caderno do Pra depois) e
 * quanto há nela. O topo só diz em que parte se está (Anotações, Análises, Extras); a
 * barra diz o resto, sempre no mesmo lugar, sem uma linha de título a mais em cada página.
 *
 * - Análises: o mural de resenhas, Mural / Pra depois / Wishlist e a contagem da seção aberta.
 * - Anotações: as seções, quando houver mais de uma (o Estudo cego e o Calendário entram em
 *   `NOTE_SECTIONS`); com uma só, nada.
 * - Extras: o mural e o que é Extras; nas páginas de dentro, a volta para Extras. O mural de um
 *   colega tem o próprio cabeçalho.
 * - Amigos, um mural por vez: só o mural, com o de anotações também.
 */
@Component({
  selector: 'app-area-bar',
  imports: [KindSwitcher, LucideAngularModule, QueueLogo, RouterLink, WishlistLogo],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.vazio]': '!shown()' },
  template: `
    @if (shown()) {
      @let ks = picker();
      @let sum = summary();
      @let lg = logo();
      <div class="indice" [class.com-logo]="lg" [class.sem-mural]="!ks">
        @if (ks) {
          <app-kind-switcher class="mural" [kinds]="ks" />
        }
        @if (tabs().length) {
          <nav class="secoes" [attr.aria-label]="navLabel()">
            <ul>
              @for (t of tabs(); track t.label) {
                <li>
                  <a class="secao" [routerLink]="t.link" [class.on]="t.on" [attr.aria-current]="t.on ? 'page' : null">{{ t.label }}</a>
                </li>
              }
            </ul>
          </nav>
        } @else if (inExtras() && !extrasHome()) {
          <nav class="secoes" aria-label="Voltar">
            <a class="secao volta" routerLink="/extras">
              <lucide-icon [img]="BackIcon" [size]="18" [strokeWidth]="2.8" aria-hidden="true" />
              Extras
            </a>
          </nav>
        }
        @if (extrasHome()) {
          <p class="nota">
            Números e jogos com as fichas do seu mural de {{ mural.profile().plural }}. Os jogos também dá para jogar com o mural
            de um colega aberto em <a routerLink="/comparar">Comparar</a>.
          </p>
        }
        @if (lg) {
          <!-- o logo da seção é o título dela (o h1 da página fica para o leitor de tela) -->
          <div class="pagina">
            @if (lg === 'wishlist') {
              <app-wishlist-logo class="logo-wishlist" />
            } @else {
              <app-queue-logo class="logo-fila" />
            }
            @if (sum) {
              <p class="resumo">
                <span class="n">{{ sum.n }}</span><span class="longo">{{ sum.long }}</span><span class="curto">{{ sum.short }}</span>
              </p>
            }
          </div>
        } @else if (sum) {
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
    }
    :host(.vazio) {
      display: none;
    }

    /* Celular: a etiqueta do mural e a contagem na primeira linha; as seções (ou o texto de Extras)
       embaixo, na largura toda */
    .indice {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      grid-template-areas:
        'mural resumo'
        'secoes secoes'
        'pagina pagina'
        'nota nota';
      align-items: center;
      gap: 10px 14px;
    }
    /* sem a etiqueta do mural (nas Anotações): as seções e a contagem dividem a primeira linha */
    .indice.sem-mural {
      grid-template-columns: minmax(0, 1fr) auto;
      grid-template-areas:
        'secoes resumo'
        'pagina pagina'
        'nota nota';
    }
    .mural {
      grid-area: mural;
      justify-self: start;
    }
    .secoes {
      grid-area: secoes;
      min-width: 0;

      ul {
        display: flex;
        gap: 2px;
        margin: 0;
        padding: 0;
        list-style: none;
      }
    }
    .nota {
      grid-area: nota;
    }
    .pagina {
      grid-area: pagina;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px 22px;
      min-width: 0;
      padding-top: 4px;
    }
    .resumo {
      grid-area: resumo;
      justify-self: end;
      text-align: right;
    }
    .pagina .resumo {
      text-align: left;
    }

    /* os logos, um pouco menores que no cabeçalho de antes, para caberem na linha da barra */
    .logo-wishlist {
      font-size: 1.85rem;
    }
    .logo-fila {
      font-size: 0.8rem;
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

    /* O que é Extras, escrito à mão na parede */
    .nota {
      max-width: 78ch;
      margin: 0;
      color: var(--wall-ink);
      font-family: var(--f-hand);
      font-size: 1.06rem;
      line-height: 1.35;
      text-wrap: pretty;

      a {
        color: inherit;
        text-decoration-thickness: 2px;
        text-underline-offset: 3px;
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
    /* embaixo das seções, o logo tem a linha toda: a contagem vai inteira */
    .pagina .longo {
      display: inline;
    }
    .pagina .curto {
      display: none;
    }

    /* Uma fileira só: a etiqueta, um risco de giz, as seções (ou o texto de Extras) e, na ponta, a
       contagem */
    @container indice (min-width: 500px) {
      .indice {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 10px 22px;
      }

      /* ainda sem lugar ao lado das seções: o logo e a contagem descem para a linha de baixo */
      .pagina {
        flex: 1 0 100%;
      }

      .secoes,
      .mural + .nota {
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

      .nota {
        flex: 0 1 auto;
      }

      .resumo {
        margin-left: auto;
        padding-left: 12px;
        white-space: nowrap;
      }
      .pagina .resumo {
        margin-left: 0;
        padding-left: 0;
      }

      .secao {
        padding: 0 11px;
        font-size: 1.1rem;
        letter-spacing: 0.1em;
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
      .indice.com-logo {
        flex-wrap: nowrap;
      }
      .pagina {
        flex: 0 1 auto;
        flex-wrap: nowrap;
        margin-left: auto;
        padding-top: 0;
      }
      .logo-wishlist {
        font-size: 2.1rem;
      }
      .logo-fila {
        font-size: 0.86rem;
      }
    }

    /* entre 900 e 1100 o logo e as seções dividem a linha: a contagem vai curta */
    @container indice (min-width: 900px) and (max-width: 1099px) {
      .pagina .longo {
        display: none;
      }
      .pagina .curto {
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
  private readonly calendar = inject(CalendarStore);

  protected readonly BackIcon = ArrowLeft;

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
  /** A própria página de Extras: o texto do que mora lá. */
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
    return list.map((s) => ({
      label: s.label,
      link: area === 'analises' ? reviewPath(kind, s.slug) : '/anotacoes' + (s.slug ? '/' + s.slug : ''),
      on: s === open,
    }));
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

  /** O logo da seção aberta, nas que têm um. */
  protected readonly logo = computed<'wishlist' | 'fila' | null>(() => {
    const section = reviewPlace(this.path())?.section;
    return section === 'wishlist' ? 'wishlist' : section === 'pra-depois' ? 'fila' : null;
  });

  protected readonly shown = computed(() => !!this.picker() || this.tabs().length > 0);

  protected readonly navLabel = computed(() => (this.area() === 'analises' ? 'Seções das análises' : 'Seções das anotações'));
}
