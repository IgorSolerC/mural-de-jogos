import { ChangeDetectionStrategy, Component, ElementRef, input, model, viewChild } from '@angular/core';
import { LucideAngularModule, Search, X } from 'lucide-angular';

/**
 * A tira de papel de busca, colada na parede com fita-crepe. A mesma tira serve o mural e a fila
 * do Pra depois; a tecla "/" foca a que estiver na página (ver `data-busca`).
 */
@Component({
  selector: 'app-search-strip',
  imports: [LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'search', '[class.colada]': 'glued()' },
  template: `
    @if (!glued()) {
      <span class="tape tape-l" aria-hidden="true"></span>
      <span class="tape tape-r" aria-hidden="true"></span>
    }
    <lucide-icon [img]="SearchIcon" [size]="20" [strokeWidth]="2.4" aria-hidden="true" />
    <label [for]="inputId()" class="sr-only">{{ label() }}</label>
    <input
      #field
      data-busca
      [id]="inputId()"
      type="search"
      [placeholder]="placeholder()"
      autocomplete="off"
      enterkeyhint="search"
      aria-keyshortcuts="/"
      [value]="value()"
      (input)="value.set($any($event.target).value)"
      (keydown)="onKey($event)"
    />
    @if (value()) {
      <button type="button" class="clear" (click)="clear()" aria-label="Limpar busca">
        <lucide-icon [img]="ClearIcon" [size]="18" [strokeWidth]="2.6" />
      </button>
    } @else {
      <kbd aria-hidden="true">/</kbd>
    }
  `,
  styles: `
    :host {
      position: relative;
      display: flex;
      align-items: center;
      gap: 10px;
      min-height: 48px;
      padding: 0 10px 0 14px;
      background: var(--paper);
      color: var(--ink);
      border-radius: 2px;
      rotate: -0.6deg;
      box-shadow: var(--shadow-card);
    }
    :host(:focus-within) {
      box-shadow:
        0 0 0 3px var(--focus),
        var(--shadow-card);
    }

    /* colada: a etiqueta de papel branco colada reta na pasta das anotações, sem fita; o foco é a
       tinta preta (o amarelo sumiria no manilha) */
    :host(.colada) {
      min-height: 44px;
      rotate: 0deg;
      border-radius: 3px;
      box-shadow:
        inset 0 0 0 1px rgb(21 21 21 / 0.14),
        0 1px 2px rgb(60 40 10 / 0.28);
    }
    :host(.colada:focus-within) {
      box-shadow:
        inset 0 0 0 1px rgb(21 21 21 / 0.14),
        0 0 0 2.5px var(--ink);
    }
    :host(.colada) input {
      height: 42px;
    }

    input {
      flex: 1;
      min-width: 0;
      height: 46px;
      border: 0;
      background: transparent;
      outline: none;
      color: var(--ink);
      font-weight: 500;
      font-size: 1.05rem;
      caret-color: var(--red);
    }
    input::placeholder {
      /* 4,5:1 no papel da tira */
      color: rgb(21 21 21 / 0.66);
    }
    input::-webkit-search-cancel-button {
      display: none;
    }

    /* fita crepe segurando a tira de papel */
    .tape {
      position: absolute;
      top: -9px;
      width: 54px;
      height: 20px;
      background: rgb(222 205 160 / 0.82);
      box-shadow: 0 1px 1px rgb(0 0 0 / 0.2);
    }
    .tape-l {
      left: -14px;
      rotate: -28deg;
    }
    .tape-r {
      right: -14px;
      rotate: 24deg;
    }
    :host-context(body.has-tape) .tape {
      background: url('textures/fita-crepe.png') center / 100% 100% no-repeat;
      box-shadow: none;
    }

    .clear {
      display: grid;
      place-items: center;
      width: 36px;
      height: 36px;
      border: 0;
      border-radius: 50%;
      background: transparent;
      color: var(--ink);
    }
    .clear:hover {
      background: rgb(21 21 21 / 0.1);
    }

    kbd {
      display: grid;
      place-items: center;
      min-width: 24px;
      height: 24px;
      border-radius: 4px;
      box-shadow: inset 0 0 0 1.5px rgb(21 21 21 / 0.35);
      color: rgb(21 21 21 / 0.62);
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.9rem;
    }
    @media (max-width: 720px) {
      kbd {
        display: none;
      }
    }
  `,
})
export class SearchStrip {
  readonly value = model('');
  readonly label = input.required<string>();
  readonly placeholder = input.required<string>();
  readonly inputId = input.required<string>();
  /** Colada reta, sem fita (na pasta das anotações). */
  readonly glued = input(false);

  private readonly field = viewChild.required<ElementRef<HTMLInputElement>>('field');

  protected readonly SearchIcon = Search;
  protected readonly ClearIcon = X;

  protected clear(): void {
    this.value.set('');
    this.field().nativeElement.focus();
  }

  protected onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape' && this.value()) {
      e.preventDefault();
      this.value.set('');
    }
  }
}
