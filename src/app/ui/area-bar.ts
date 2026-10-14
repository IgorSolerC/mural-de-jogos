import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter, map } from 'rxjs';
import { AreaSection, NOTE_SECTIONS, REVIEW_SECTIONS, areaOf, pathOf, reviewPath, sectionOf } from '../core/areas';
import { KINDS, Kind, SCORED_KINDS } from '../core/kinds';
import { Mural } from '../core/mural';
import { Settings } from '../core/settings';
import { KindSwitcher } from './kind-switcher';

/** Uma aba do índice, já com o endereço e se é a aberta. */
interface Tab {
  label: string;
  link: string;
  on: boolean;
}

/**
 * O índice da parte aberta, logo embaixo do topo, nas páginas que precisam dele: à esquerda o seletor
 * de mural (nas páginas que dependem do mural), ao lado as seções da parte. O topo só diz em que parte
 * se está (Anotações, Análises, Extras); o índice diz o resto, sempre no mesmo lugar.
 *
 * - Análises: o mural de resenhas e as seções Mural, Pra depois e Wishlist.
 * - Anotações: as seções, quando houver mais de uma (o Estudo cego e o Calendário entram em
 *   `NOTE_SECTIONS`); com uma só, nada.
 * - Extras: só o mural (os números e os jogos são de um mural). O mural de um colega tem o próprio.
 * - Amigos, separado por mural: só o mural, com o de anotações também.
 */
@Component({
  selector: 'app-area-bar',
  imports: [KindSwitcher, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.vazio]': '!picker() && !tabs().length' },
  template: `
    @let ks = picker();
    @if (ks || tabs().length) {
      <div class="indice">
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
      margin-bottom: 26px;
    }
    :host(.vazio) {
      display: none;
    }

    /* Celular: a etiqueta do mural em cima, as seções embaixo, na largura toda. Com espaço, uma
       fileira só: a etiqueta, um risco de giz, as seções. */
    .indice {
      display: grid;
      justify-items: start;
      gap: 12px;
    }

    .secoes {
      justify-self: stretch;
      min-width: 0;

      ul {
        display: flex;
        gap: 2px;
        margin: 0;
        padding: 0;
        list-style: none;
      }
    }

    /* Cada seção é uma palavra escrita na parede a giz, em caixa alta. A aberta fica clara, com um
       traço de marca-texto amarelo (a cor de estado do site) por baixo; ao passar, o traço começa a
       aparecer. */
    .secao {
      position: relative;
      isolation: isolate;
      display: inline-flex;
      align-items: center;
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
        /* tinta escura sobre o amarelo: o traço vira o fundo da palavra */
        color: var(--ink);

        &::after {
          inset: 9px 0 8px;
          height: auto;
          scale: 1 1;
        }
      }
    }

    @container indice (min-width: 500px) {
      .indice {
        grid-auto-flow: column;
        justify-content: start;
        align-items: center;
        gap: 22px;
      }

      /* o risco de giz entre o mural e as seções */
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

      .secao {
        padding: 0 11px;
        font-size: 1.1rem;
        letter-spacing: 0.1em;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .secao::after {
        transition: none;
      }
    }
  `,
})
export class AreaBar {
  private readonly router = inject(Router);
  private readonly mural = inject(Mural);
  private readonly settings = inject(Settings);

  private readonly path = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map((e) => pathOf((e as NavigationEnd).urlAfterRedirects)),
    ),
    { initialValue: pathOf(this.router.url) },
  );

  private readonly area = computed(() => areaOf(this.path()));

  /** Os murais do seletor, nas páginas que dependem do mural; `null` onde ele não aparece. */
  protected readonly picker = computed<readonly Kind[] | null>(() => {
    const p = this.path();
    const area = this.area();
    if (area === 'analises') return SCORED_KINDS;
    // o mural de um colega tem o próprio seletor, com os murais que a pessoa tem
    if (area === 'extras') return p === '/comparar/mural' ? null : SCORED_KINDS;
    if (p === '/amigos' && this.settings.friendKinds() === 'separado') return KINDS;
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

  protected readonly navLabel = computed(() => (this.area() === 'analises' ? 'Seções das análises' : 'Seções das anotações'));
}
