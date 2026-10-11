import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, input, output, signal, viewChild } from '@angular/core';
import { EMOJI_DRAWERS, EmojiEntry, searchEmoji } from '../core/emoji-catalog';
import { ReactionId } from '../core/reaction-kinds';
import { fold } from '../core/review';

/**
 * O "+" das reações: as gavetas de emojis (caras, gestos, corações…) e a busca pelo nome, para reagir
 * com um que não está na fileira.
 */
@Component({
  selector: 'app-emoji-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <input
      #search
      class="busca"
      type="search"
      autocomplete="off"
      placeholder="Procurar: gato, festa, pipoca…"
      aria-label="Procurar emoji pelo nome"
      [value]="query()"
      (input)="query.set($any($event.target).value)"
    />
    @if (!query().trim()) {
      <div class="gavetas" role="tablist" aria-label="Gavetas de emoji">
        @for (d of drawers; track d.id) {
          <button type="button" role="tab" class="gaveta" [attr.aria-selected]="drawer() === d.id" [attr.aria-label]="d.label" [title]="d.label" (click)="drawer.set(d.id)">
            {{ d.icon }}
          </button>
        }
      </div>
    }
    <div class="grade" role="group" [attr.aria-label]="query().trim() ? 'Emojis encontrados' : drawerLabel()">
      @for (item of shown(); track item.e) {
        <button type="button" class="emoji" [class.escolhido]="item.e === current()" [attr.aria-pressed]="item.e === current()" [attr.aria-label]="nameOf(item)" [title]="nameOf(item)" (click)="picked.emit(item.e)">
          {{ item.e }}
        </button>
      } @empty {
        <p class="nada">Nenhum emoji com “{{ query().trim() }}”.</p>
      }
    </div>
  `,
  styles: `
    :host {
      display: grid;
      gap: 8px;
      width: min(316px, calc(100vw - 40px));
    }
    .busca {
      width: 100%;
      height: 38px;
      padding: 0 12px;
      border: 0;
      border-radius: 19px;
      background: #fffdf7;
      color: #151515;
      font-family: var(--f-hand);
      font-size: 1.02rem;
      box-shadow: inset 0 0 0 1.5px rgb(21 21 21 / 0.35);
      outline: none;
    }
    .busca:focus {
      box-shadow: inset 0 0 0 2.5px #151515;
    }
    .gavetas {
      display: flex;
      justify-content: space-between;
      gap: 2px;
      padding-bottom: 6px;
      border-bottom: 1.5px dashed rgb(122 74 38 / 0.45);
    }
    .gaveta {
      display: grid;
      place-items: center;
      width: 38px;
      height: 34px;
      padding: 0;
      border: 0;
      border-radius: 8px;
      background: transparent;
      font-size: 19px;
      line-height: 1;
      cursor: pointer;
      opacity: 0.6;
      filter: grayscale(0.6);
      transition:
        opacity 120ms ease-out,
        filter 120ms ease-out;
    }
    .gaveta[aria-selected='true'] {
      opacity: 1;
      filter: none;
      background: rgb(21 21 21 / 0.1);
    }
    .gaveta:hover {
      opacity: 1;
      filter: none;
    }
    .gaveta:focus-visible,
    .emoji:focus-visible {
      outline: 2.5px solid #151515;
      outline-offset: -2px;
    }
    .grade {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(38px, 1fr));
      gap: 2px;
      max-height: 196px;
      /* rola só de pé: o emoji crescido do hover na beirada passava da grade e abria uma barra de
         lado; a folguinha deixa ele crescer sem ser cortado */
      padding: 4px;
      margin: -4px;
      overflow: hidden auto;
      overscroll-behavior: contain;
    }
    .emoji {
      display: grid;
      place-items: center;
      height: 38px;
      padding: 0;
      border: 0;
      border-radius: 50%;
      background: transparent;
      font-size: 23px;
      line-height: 1;
      cursor: pointer;
      transition: scale 120ms ease-out;
    }
    .emoji:hover {
      scale: 1.2;
    }
    .emoji.escolhido {
      background: rgb(21 21 21 / 0.12);
    }
    .nada {
      grid-column: 1 / -1;
      margin: 6px 2px;
      font-family: var(--f-hand);
      font-size: 1rem;
      color: rgb(21 21 21 / 0.7);
    }
  `,
})
export class EmojiPanel {
  /** A reação que você já deu, para vir marcada. */
  readonly current = input<ReactionId | null>(null);
  readonly picked = output<string>();
  protected readonly drawers = EMOJI_DRAWERS;
  protected readonly drawer = signal(EMOJI_DRAWERS[0].id);
  protected readonly query = signal('');
  private readonly search = viewChild.required<ElementRef<HTMLInputElement>>('search');
  protected readonly drawerLabel = computed(() => EMOJI_DRAWERS.find((d) => d.id === this.drawer())!.label);
  protected readonly shown = computed<readonly EmojiEntry[]>(() =>
    this.query().trim() ? searchEmoji(this.query(), fold) : EMOJI_DRAWERS.find((d) => d.id === this.drawer())!.list,
  );

  constructor() {
    afterNextRender(() => this.search().nativeElement.focus());
  }

  /** O nome do emoji para quem não o vê: a primeira palavra da busca. */
  protected nameOf(item: EmojiEntry): string {
    const first = item.k.split(' ')[0];
    return first.charAt(0).toUpperCase() + first.slice(1);
  }
}
