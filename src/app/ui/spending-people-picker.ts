import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, inject, input, output } from '@angular/core';
import { ICON, IconModule } from './icons';
import { fold } from '../core/text';
import { ME, PERSON_NAME_MAX, brl, splitAmount } from '../core/spending';
import { PersonRef } from '../core/spending-quick';
import { SpendingStore } from '../core/spending-store';

/** Uma pessoa na cartela: do livro, ou escrita agora com @ (ainda sem id). */
interface Choice {
  ref: PersonRef;
  on: boolean;
}

/** A mesma pessoa: pelo id, ou (as escritas agora) pelo nome. */
function same(a: PersonRef, b: PersonRef): boolean {
  return a.id || b.id ? a.id === b.id : fold(a.name) === fold(b.name);
}

/**
 * Com quem foi o gasto: um papel solto que cai embaixo do adesivo que o abriu, com uma cartela de pessoas
 * (como os filtros da pasta: a recortada, tracejada, está fora; a colada está no gasto) e uma linha para pôr
 * alguém novo. Sempre fica ao menos uma pessoa. Embaixo, quanto dá para cada um.
 *
 * Quem usa põe a peça dentro de um invólucro com `position: relative`, ao lado do botão que a abre: tocar
 * no botão não conta como tocar fora. Esc e um toque fora fecham (`closed`).
 */
@Component({
  selector: 'app-spending-people-picker',
  imports: [IconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:pointerdown)': 'outside($event)',
    '(keydown.escape)': '$event.stopPropagation(); closed.emit()',
  },
  template: `
    <div class="solto" role="group" aria-labelledby="gp-titulo">
      <p class="titulo" id="gp-titulo">Com quem foi?</p>
      <div class="cartela">
        @for (c of choices(); track c.ref.id ?? c.ref.name) {
          <label class="pessoa" [class.colada]="c.on" [class.so-ela]="c.on && onlyOne()">
            <input type="checkbox" [checked]="c.on" [disabled]="c.on && onlyOne()" (change)="toggle(c.ref)" />
            @if (c.on) {
              <lucide-icon [img]="OnIcon" [size]="13" aria-hidden="true" />
            }
            {{ c.ref.name }}
          </label>
        }
      </div>
      <form class="nova" (submit)="$event.preventDefault(); add(nova)">
        <label class="campo-mini">
          <span class="sr-only">Nome de quem mais estava</span>
          <input #nova type="text" [maxLength]="nameMax" placeholder="Mais alguém" autocomplete="off" enterkeyhint="done" />
        </label>
        <button type="submit" class="tinta-pequena">
          <lucide-icon [img]="AddIcon" [size]="14" aria-hidden="true" />
          Pôr
        </button>
      </form>
      @if (split(); as s) {
        <p class="conta" aria-live="polite">{{ s }}</p>
      }
    </div>
  `,
  styles: `
    @use 'paper-kit' as kit;
    @use 'spending-kit' as gk;

    :host {
      position: absolute;
      z-index: 7;
      top: calc(100% + 6px);
      left: 0;
      display: block;
      width: max-content;
      min-width: 220px;
      max-width: min(320px, calc(100vw - 32px));
      text-align: left;
    }

    .solto {
      --focus: var(--ink);
      display: grid;
      gap: 10px;
      padding: 12px;
      border-radius: 2px;
      background: var(--paper);
      color: var(--ink);
      color-scheme: light;
      box-shadow: var(--papel-solto-sombra);
      animation: cai var(--t-ui) var(--ease-ui);
    }

    @keyframes cai {
      from {
        opacity: 0;
        translate: 0 -4px;
      }
    }

    .titulo {
      @include gk.peca-titulo;
    }

    .cartela {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    /* fora do gasto: o recorte tracejado, ainda na cartela; no gasto: o adesivo colado */
    .pessoa {
      position: relative;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      min-height: 32px;
      padding: 3px 10px 2px;
      border-radius: 2px;
      outline: 1.5px dashed rgb(21 21 21 / 0.45);
      outline-offset: -1.5px;
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.84rem;
      letter-spacing: 0.05em;
      line-height: 1;
      text-transform: uppercase;
      white-space: nowrap;
      cursor: pointer;
      transition:
        background-color var(--t-ui) var(--ease-ui),
        translate var(--t-ui) var(--ease-ui);

      input {
        position: absolute;
        opacity: 0;
        width: 1px;
        height: 1px;
        margin: 0;
      }
      lucide-icon {
        display: inline-flex;
        margin-left: -3px;
      }
      &:hover {
        background: rgb(21 21 21 / 0.06);
      }
      &:has(input:focus-visible) {
        outline: 2.5px solid var(--ink);
        outline-offset: 2px;
      }
      @media (pointer: coarse) {
        min-height: 40px;
      }
    }
    .colada {
      outline-color: transparent;
      background-color: #fffdf8;
      background-image: var(--paper-grain);
      background-blend-mode: multiply;
      box-shadow:
        0 0 0 1px rgb(21 21 21 / 0.1),
        0 1px 1px rgb(0 0 0 / 0.2),
        0 2px 4px -2px rgb(0 0 0 / 0.3);

      &:hover {
        background-color: #fff;
        translate: 0 -1px;
      }
    }
    /* a única que sobrou não sai: sempre há alguém no gasto */
    .so-ela {
      cursor: default;

      &:hover {
        translate: none;
      }
    }

    .nova {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .campo-mini {
      @include kit.campo;
      flex: 1 1 auto;
      min-height: 38px;

      input {
        height: 36px;
      }
    }
    .tinta-pequena {
      @include gk.tinta-pequena;
    }

    .conta {
      margin: 0;
      font-family: var(--f-hand);
      font-size: 1rem;
      line-height: 1.3;
      color: var(--ink-2);
    }

    @media (prefers-reduced-motion: reduce) {
      .solto {
        animation: none;
      }
    }
  `,
})
export class SpendingPeoplePicker {
  private readonly store = inject(SpendingStore);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** Quem está no gasto agora (você, sem nada). */
  readonly refs = input.required<PersonRef[]>();
  /** O valor do gasto, para dizer quanto dá para cada um. */
  readonly amount = input<number | null>(null);
  readonly changed = output<PersonRef[]>();
  readonly closed = output<void>();

  protected readonly OnIcon = ICON.pronto;
  protected readonly AddIcon = ICON.adicionar;
  protected readonly nameMax = PERSON_NAME_MAX;

  /** As pessoas do livro (você primeiro) e, no fim, as escritas agora que ainda não existem. */
  protected readonly choices = computed<Choice[]>(() => {
    const refs = this.refs();
    const all: PersonRef[] = this.store.people().map((p) => ({ id: p.id, name: p.name }));
    for (const r of refs) if (!all.some((a) => same(a, r))) all.push(r);
    return all.map((ref) => ({ ref, on: refs.some((r) => same(r, ref)) }));
  });

  protected readonly onlyOne = computed(() => this.refs().length <= 1);

  protected readonly split = computed(() => {
    const a = this.amount();
    const refs = this.refs();
    if (!a) return null;
    if (refs.length === 1) return refs[0].id === ME ? null : `O gasto inteiro conta para ${refs[0].name}.`;
    return `${brl(a)} ÷ ${refs.length}: ${brl(splitAmount(a, refs.length)[refs.length - 1])} para cada.`;
  });

  constructor() {
    // perto da beirada da tela, o papel puxa para dentro
    afterNextRender(() => {
      const el = this.host.nativeElement;
      const over = el.getBoundingClientRect().right - (document.documentElement.clientWidth - 8);
      if (over > 0) el.style.translate = `${-over}px 0`;
      el.querySelector<HTMLInputElement>('.pessoa input')?.focus({ preventScroll: true });
    });
  }

  protected toggle(ref: PersonRef): void {
    const refs = this.refs();
    const on = refs.some((r) => same(r, ref));
    if (on && refs.length <= 1) return;
    this.emit(on ? refs.filter((r) => !same(r, ref)) : [...refs, ref]);
  }

  protected add(el: HTMLInputElement): void {
    const name = el.value.trim();
    if (!name) return;
    const p = this.store.addPerson(name);
    el.value = '';
    const ref = { id: p.id, name: p.name };
    if (!this.refs().some((r) => same(r, ref))) this.emit([...this.refs(), ref]);
  }

  /** Na ordem da cartela (você primeiro), para a divisão dos centavos ser sempre a mesma. */
  private emit(next: PersonRef[]): void {
    this.changed.emit(this.choices().map((c) => c.ref).filter((o) => next.some((n) => same(n, o))));
  }

  /** Um toque fora do papel e do botão que o abriu fecha. */
  protected outside(e: PointerEvent): void {
    const wrap = this.host.nativeElement.parentElement ?? this.host.nativeElement;
    if (!wrap.contains(e.target as Node)) this.closed.emit();
  }
}
