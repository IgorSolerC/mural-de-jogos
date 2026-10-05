import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ChartNoAxesColumn, LucideAngularModule, LucideIconData, Swords, Users } from 'lucide-angular';
import { Mural } from '../core/mural';
import { Pin } from '../ui/pin';

interface Entry {
  path: string;
  name: string;
  blurb: string;
  icon: LucideIconData;
  stock: string;
  pin: string;
  /** O que vai na etiqueta preta do canto. */
  go: string;
}

interface Shelf {
  id: string;
  title: string;
  entries: Entry[];
}

/**
 * O que mora em Extras, em duas prateleiras: os números do mural (Ranking e Comparar, que já eram
 * abas) e os jogos. Cada jogo novo (os quizzes) entra na segunda e joga com o mural escolhido em
 * `Players`, o seu ou o de um colega.
 */
const SHELVES: Shelf[] = [
  {
    id: 'numeros',
    title: 'Números',
    entries: [
      {
        path: '/ranking',
        name: 'Ranking',
        blurb: 'O mural em ordem de nota, por média ou por categoria, com os totais.',
        icon: ChartNoAxesColumn,
        stock: 'var(--stock-azul)',
        pin: '#f4f4f0',
        go: 'Ver',
      },
      {
        path: '/comparar',
        name: 'Comparar',
        blurb: 'Abra o backup de um colega e veja onde vocês combinam e o que ele recomenda.',
        icon: Users,
        stock: 'var(--stock-verde)',
        pin: '#ffd23f',
        go: 'Abrir',
      },
    ],
  },
  {
    id: 'jogos',
    title: 'Jogos',
    entries: [
      {
        path: '/extras/mata-mata',
        name: 'Mata-mata',
        blurb: 'As fichas duelam de duas em duas e você escolhe quem passa, até sobrar a favorita.',
        icon: Swords,
        stock: 'var(--stock-amarelo)',
        pin: '#e62e2d',
        go: 'Jogar',
      },
    ],
  },
];

/**
 * Extras: o Ranking, o Comparar e os jogos feitos com as fichas do mural (o seu ou o de um colega
 * carregado em Comparar). Cada um é uma ficha pregada no quadro.
 */
@Component({
  selector: 'app-extras-page',
  imports: [LucideAngularModule, Pin, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="head">
      <h1 class="tape-label big">Extras</h1>
      <p class="intro">
        Números e jogos com as fichas do seu mural de {{ mural.profile().plural }}. Os jogos também dá para jogar com o mural
        de um colega aberto em <a routerLink="/comparar">Comparar</a>.
      </p>
    </header>

    @for (shelf of shelves; track shelf.id) {
      <section class="prateleira-extras" [attr.aria-labelledby]="'extras-' + shelf.id">
        <h2 class="tape-label" [id]="'extras-' + shelf.id">{{ shelf.title }}</h2>
        <ul class="jogos" role="list">
          @for (j of shelf.entries; track j.path; let i = $index) {
            <li>
              <a class="jogo cartolina" [routerLink]="j.path" [style.--stock]="j.stock" [style.--tilt]="i % 2 ? 1.2 : -1.4">
                <app-pin class="pin" [color]="j.pin" />
                <lucide-icon class="icone" [img]="j.icon" [size]="34" [strokeWidth]="2.2" aria-hidden="true" />
                <h3>{{ j.name }}</h3>
                <p>{{ j.blurb }}</p>
                <span class="jogar" aria-hidden="true">{{ j.go }}</span>
              </a>
            </li>
          }
        </ul>
      </section>
    }
  `,
  styles: `
    :host {
      display: block;
    }

    .head {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 12px 24px;
      margin-bottom: 40px;
    }

    .intro {
      max-width: 52ch;
      color: var(--wall-ink);
      font-family: var(--f-hand);
      font-size: 1.12rem;
      line-height: 1.35;

      a {
        color: inherit;
        text-decoration-thickness: 2px;
        text-underline-offset: 3px;
      }
    }

    .prateleira-extras + .prateleira-extras {
      margin-top: 56px;
    }

    .jogos {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr));
      gap: 40px 32px;
      margin: 0;
      padding: 34px 0 0;
      list-style: none;
    }

    .jogo {
      position: relative;
      display: grid;
      gap: 8px;
      min-height: 220px;
      padding: 30px 24px 22px;
      color: var(--ink);
      text-decoration: none;
      box-shadow: var(--shadow-card);
      rotate: calc(var(--tilt, 0) * 1deg);
      transition:
        rotate var(--t-physical) var(--ease-physical),
        translate var(--t-physical) var(--ease-physical),
        box-shadow var(--t-ui) var(--ease-ui);

      &:hover {
        rotate: 0deg;
        translate: 0 -3px;
        box-shadow: var(--shadow-lift);
      }

      &:focus-visible {
        outline: 3px solid var(--hi);
        outline-offset: 5px;
      }
    }

    .pin {
      position: absolute;
      top: -12px;
      left: calc(50% - 13px);
    }

    .icone {
      display: inline-flex;
    }

    h3 {
      margin: 0;
      font-family: var(--f-marker);
      font-weight: 400;
      font-size: 2rem;
      line-height: 1;
    }

    p {
      margin: 0;
      font-family: var(--f-hand);
      font-size: 1.1rem;
      line-height: 1.3;
    }

    .jogar {
      justify-self: end;
      align-self: end;
      padding: 8px 16px 6px;
      background: var(--ink);
      color: var(--hi);
      font-family: var(--f-marker);
      font-size: 1.1rem;
      rotate: -2deg;
    }
  `,
})
export class ExtrasPage {
  protected readonly mural = inject(Mural);
  protected readonly shelves = SHELVES;
}
