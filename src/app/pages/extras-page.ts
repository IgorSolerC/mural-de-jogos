import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Mural } from '../core/mural';
import { RouterLink } from '@angular/router';
import { LucideIconData } from 'lucide-angular';
import { ICON, IconModule } from '../ui/icons';
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
 * abas, e as Estatísticas) e os jogos. Cada jogo novo (os quizzes) entra na segunda e joga com o mural escolhido em
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
        icon: ICON.barras,
        stock: 'var(--stock-azul)',
        pin: '#f4f4f0',
        go: 'Ver',
      },
      {
        path: '/comparar',
        name: 'Comparar',
        blurb: 'Abra o backup de um colega e veja onde vocês combinam e o que ele recomenda.',
        icon: ICON.pessoas,
        stock: 'var(--stock-verde)',
        pin: '#ffd23f',
        go: 'Abrir',
      },
      {
        path: '/extras/estatisticas',
        name: 'Estatísticas',
        blurb: 'Tudo o que o mural conta sobre você: notas, manias, recordes, a folhinha do ano e muito gráfico de papel.',
        icon: ICON.pizza,
        stock: 'var(--stock-laranja)',
        pin: '#2f6bff',
        go: 'Ver',
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
        icon: ICON.espadas,
        stock: 'var(--stock-amarelo)',
        pin: '#e62e2d',
        go: 'Jogar',
      },
      {
        path: '/extras/maior-ou-menor',
        name: 'Maior ou menor',
        blurb: 'Uma ficha com a nota à mostra, a próxima escondida: a dela é maior ou menor? Vale a sequência até errar.',
        icon: ICON.maiorOuMenor,
        stock: 'var(--stock-rosa)',
        pin: '#2f6bff',
        go: 'Jogar',
      },
      {
        path: '/extras/muraldle',
        name: 'Muraldle',
        blurb: 'Uma ficha secreta por dia. Chute outras fichas e os quadradinhos dizem o que bate: nota, status, ano, cartolina…',
        icon: ICON.quebraCabeca,
        stock: 'var(--stock-lilas)',
        pin: '#1fb65a',
        go: 'Jogar',
      },
    ],
  },
];

/**
 * Extras: o Ranking, o Comparar, as Estatísticas e os jogos feitos com as fichas do mural (o seu ou o de um colega
 * carregado em Comparar). Cada um é uma ficha pregada no quadro.
 */
@Component({
  selector: 'app-extras-page',
  imports: [IconModule, Pin, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- o mural e o logo ficam na barra embaixo do topo (ui/area-bar.ts); o que é Extras, aqui, escrito na parede -->
    <h1 class="sr-only">Extras</h1>
    <p class="nota">
      Números e jogos com as fichas do seu mural de {{ mural.profile().plural }}. Os jogos também dá para jogar com o mural de
      um colega aberto em <a routerLink="/comparar">Comparar</a>.
    </p>

    @for (shelf of shelves; track shelf.id) {
      <section class="prateleira-extras" [attr.aria-labelledby]="'extras-' + shelf.id">
        <h2 class="tape-label" [id]="'extras-' + shelf.id">{{ shelf.title }}</h2>
        <ul class="jogos" role="list">
          @for (j of shelf.entries; track j.path; let i = $index) {
            <li>
              <a class="jogo cartolina" [routerLink]="j.path" [style.--stock]="j.stock" [style.--tilt]="i % 2 ? 1.2 : -1.4">
                <app-pin class="pin" [color]="j.pin" />
                <lucide-icon class="icone" [img]="j.icon" [size]="34" aria-hidden="true" />
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

    /* O que é Extras, escrito à mão na parede */
    .nota {
      max-width: 78ch;
      margin: 0 0 30px;
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
