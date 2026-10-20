import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';

/** Quantos assuntos ficam à mão; os outros aparecem no "+N" (o mesmo limite das tags). */
const MAX_SHORTCUTS = 10;

/** Um assunto do filtro: o valor que liga e desliga, o nome, em quantas anotações está e se está ligado. */
export interface SubjectChip {
  value: string;
  label: string;
  n: number;
  on: boolean;
}

/**
 * O filtro por assunto na pasta, depois do picote e antes das tags: o do mural de anotações (ver
 * `SubjectShortcuts`) e o do Kanban. O assunto é um só por anotação e organiza o grupo por dentro, então
 * ele é impresso em tinta como os controles da pasta (e não uma etiqueta, como as tags): um toque liga,
 * com o traço de marca-texto; ligados vários, vale qualquer um deles. Na frente, "Assunto", como o
 * "Ordenar" do campo da ordem.
 *
 * Só aparece quando separa alguma coisa: com um assunto só e todas as anotações nele, não há o que
 * filtrar (a não ser que ele esteja ligado, para poder desligar).
 */
@Component({
  selector: 'app-subject-chips',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.vazio]': '!shown()' },
  template: `
    @if (shown()) {
      <div class="assuntos" role="group" aria-label="Filtrar pelo assunto">
        <span class="rotulo" aria-hidden="true">Assunto</span>
        <ul class="lista">
          @for (c of visible().chips; track c.value) {
            <li>
              <button type="button" class="tinta assunto" [class.sem]="c.value === 'sem'" [attr.aria-pressed]="c.on" (click)="toggled.emit(c.value)">
                <span class="nome">{{ c.label }}</span><span class="sr-only">, </span>
                <span class="tinta-n">{{ c.n }}</span>
              </button>
            </li>
          }
          @if (visible().more || all()) {
            <li>
              <button type="button" class="tinta-link mais" [attr.aria-expanded]="all()" (click)="all.set(!all())">
                {{ all() ? 'Menos' : '+' + visible().more }}
                @if (!all()) {
                  <span class="sr-only">{{ visible().more === 1 ? 'assunto' : 'assuntos' }}</span>
                }
              </button>
            </li>
          }
        </ul>
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }

    :host(.vazio) {
      display: none;
    }

    .assuntos {
      display: flex;
      align-items: center;
      gap: 2px 6px;
    }

    /* "Assunto", como o "Ordenar" do campo da ordem: a mesma letra dos controles, mais leve */
    .rotulo {
      flex: none;
      padding-right: 2px;
      font-family: var(--f-label);
      font-weight: 600;
      font-size: 0.98rem;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      line-height: 1;
      opacity: 0.72;
    }

    .lista {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 2px;
      min-width: 0;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .mais {
      font-family: var(--f-label);
      font-weight: 700;
      font-size: 0.88rem;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      white-space: nowrap;
    }

    /* "Sem assunto" é o resto: a mesma tinta, mais leve */
    .sem .nome {
      font-weight: 600;
      opacity: 0.8;
    }

    /* no celular, uma linha só, que corre de lado dentro da pasta (como as tags) */
    @media (max-width: 720px) {
      /* como o "Ordenar": no celular o rótulo sai, e o último assunto não some na beirada */
      .rotulo {
        display: none;
      }
      .lista {
        flex-wrap: nowrap;
      }
      li {
        flex: none;
      }
    }
  `,
})
export class SubjectChips {
  /** Os assuntos, já na ordem. */
  readonly chips = input.required<readonly SubjectChip[]>();
  /** O toque: liga ou desliga o assunto. */
  readonly toggled = output<string>();

  /** Mostrando todos os assuntos (o "+N" aberto). */
  protected readonly all = signal(false);

  /** Os à mão: até dez, e sempre os ligados e o "Sem assunto"; os outros no "+N". */
  protected readonly visible = computed(() => {
    const c = this.chips();
    const chips = this.all() ? c : c.filter((x, i) => i < MAX_SHORTCUTS || x.on || x.value === 'sem');
    return { chips, more: c.length - chips.length };
  });

  /** Separa alguma coisa: dois assuntos ou mais (o "Sem assunto" conta), ou algum ligado. */
  protected readonly shown = computed(() => {
    const c = this.chips();
    return c.length > 1 || c.some((x) => x.on);
  });
}
