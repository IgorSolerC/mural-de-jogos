import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { LucideAngularModule, PenLine, Search, WifiOff } from 'lucide-angular';
import { GameLookup, LookupError } from '../core/game-lookup';
import { PickedGame } from '../core/review';
import { CoverSleeve } from './cover-sleeve';

let uid = 0;

type Option = { kind: 'hit'; game: PickedGame } | { kind: 'manual'; game: PickedGame };

/** Combobox com auto-complete de jogos conhecidos (padrão ARIA 1.2). */
@Component({
  selector: 'app-game-search',
  imports: [LucideAngularModule, CoverSleeve],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <label class="label" [for]="inputId">Qual jogo?</label>
    <div class="strip" [class.busy]="loading()">
      <lucide-icon [img]="SearchIcon" [size]="20" [strokeWidth]="2.4" aria-hidden="true" />
      <input
        #field
        [id]="inputId"
        type="text"
        role="combobox"
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
        enterkeyhint="search"
        placeholder="Comece a digitar: Hollow Knight, Zelda…"
        aria-autocomplete="list"
        [attr.aria-expanded]="open()"
        [attr.aria-controls]="listId"
        [attr.aria-activedescendant]="active() >= 0 ? optionId(active()) : null"
        [attr.aria-describedby]="hintId"
        [value]="query()"
        (input)="onInput($any($event.target).value)"
        (keydown)="onKey($event)"
        (focus)="query().trim().length >= 2 && open.set(true)"
        (blur)="onBlur()"
      />
      <span class="spinner" aria-hidden="true"></span>
    </div>
    <p class="sr-only" [id]="hintId">
      {{ usingRawg ? 'Buscando na RAWG.' : 'Buscando na Wikipedia.' }} Use as setas e Enter para escolher.
    </p>

    @if (open()) {
      <ul class="list" role="listbox" [id]="listId" aria-label="Jogos encontrados">
        @if (loading() && !hits().length) {
          @for (s of [1, 2, 3]; track s) {
            <li class="skeleton" role="presentation"><span></span><span></span></li>
          }
        }
        @for (opt of options(); track $index; let i = $index) {
          <li
            role="option"
            [id]="optionId(i)"
            [class.active]="active() === i"
            [class.manual]="opt.kind === 'manual'"
            [attr.aria-selected]="active() === i"
            (mousedown)="$event.preventDefault()"
            (mouseenter)="active.set(i)"
            (click)="choose(opt)"
          >
            @if (opt.kind === 'hit') {
              <app-cover-sleeve class="thumb" size="thumb" [game]="opt.game" />
              <span class="name">{{ opt.game.name }}</span>
              @if (opt.game.year) {
                <span class="year">{{ opt.game.year }}</span>
              }
            } @else {
              <lucide-icon class="manual-icon" [img]="PenIcon" [size]="20" aria-hidden="true" />
              <span class="name">Usar “{{ opt.game.name }}” sem capa</span>
            }
          </li>
        }
        @if (error(); as err) {
          <li class="note" role="presentation">
            <lucide-icon [img]="OfflineIcon" [size]="16" aria-hidden="true" />
            {{ err }} Você ainda pode seguir sem capa.
          </li>
        } @else if (!loading() && searched() && !hits().length) {
          <li class="note" role="presentation">Nenhum jogo conhecido com esse nome.</li>
        }
      </ul>
    }
    <p class="sr-only" aria-live="polite">{{ announcement() }}</p>
  `,
  styleUrl: './game-search.scss',
})
export class GameSearch {
  private readonly lookup = inject(GameLookup);
  readonly initialQuery = input('');
  readonly picked = output<PickedGame>();

  protected readonly SearchIcon = Search;
  protected readonly PenIcon = PenLine;
  protected readonly OfflineIcon = WifiOff;

  protected readonly inputId = `jogo-${++uid}`;
  protected readonly listId = `${this.inputId}-lista`;
  protected readonly hintId = `${this.inputId}-dica`;

  protected readonly query = signal('');
  protected readonly hits = signal<PickedGame[]>([]);
  protected readonly loading = signal(false);
  protected readonly searched = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly open = signal(false);
  protected readonly active = signal(-1);

  private readonly field = viewChild.required<ElementRef<HTMLInputElement>>('field');
  private timer: ReturnType<typeof setTimeout> | undefined;
  private abort: AbortController | undefined;

  protected readonly options = computed<Option[]>(() => {
    const q = this.query().trim();
    const list: Option[] = this.hits().map((game) => ({ kind: 'hit', game }));
    if (q && !this.loading()) {
      list.push({ kind: 'manual', game: { name: q, coverUrl: null, source: 'manual' } });
    }
    return list;
  });

  protected readonly announcement = computed(() => {
    if (!this.open() || this.loading()) return '';
    const n = this.hits().length;
    return n ? `${n} ${n === 1 ? 'jogo encontrado' : 'jogos encontrados'}.` : '';
  });

  get usingRawg(): boolean {
    return this.lookup.usingRawg;
  }

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.timer);
      this.abort?.abort();
    });
  }

  ngOnInit(): void {
    const q = this.initialQuery();
    if (q) {
      this.query.set(q);
      this.schedule(q, 0);
    }
  }

  focus(): void {
    this.field().nativeElement.focus();
  }

  protected optionId(i: number): string {
    return `${this.listId}-${i}`;
  }

  protected onInput(value: string): void {
    this.query.set(value);
    this.active.set(-1);
    this.schedule(value, 240);
  }

  private schedule(value: string, delay: number): void {
    clearTimeout(this.timer);
    this.abort?.abort();
    const q = value.trim();
    if (q.length < 2) {
      this.hits.set([]);
      this.loading.set(false);
      this.searched.set(false);
      this.error.set(null);
      this.open.set(q.length > 0);
      return;
    }
    this.open.set(true);
    this.loading.set(true);
    this.timer = setTimeout(() => this.run(q), delay);
  }

  private async run(q: string): Promise<void> {
    const ctrl = new AbortController();
    this.abort = ctrl;
    try {
      const found = await this.lookup.search(q, ctrl.signal);
      if (ctrl.signal.aborted) return;
      this.hits.set(found);
      this.error.set(null);
    } catch (e) {
      if (ctrl.signal.aborted || (e as Error).name === 'AbortError') return;
      this.hits.set([]);
      this.error.set(e instanceof LookupError ? e.message : 'Algo deu errado na busca.');
    } finally {
      if (!ctrl.signal.aborted) {
        this.loading.set(false);
        this.searched.set(true);
      }
    }
  }

  protected onKey(e: KeyboardEvent): void {
    const count = this.options().length;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        this.open.set(true);
        if (count) this.active.set((this.active() + 1) % count);
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (count) this.active.set(this.active() <= 0 ? count - 1 : this.active() - 1);
        break;
      case 'Enter': {
        e.preventDefault();
        const i = this.active() >= 0 ? this.active() : 0;
        const opt = this.options()[i];
        if (opt && this.open()) this.choose(opt);
        break;
      }
      case 'Escape':
        if (this.open()) {
          // fecha só a lista, não o diálogo inteiro
          e.preventDefault();
          e.stopPropagation();
          this.open.set(false);
          this.active.set(-1);
        }
        break;
    }
  }

  protected onBlur(): void {
    this.open.set(false);
    this.active.set(-1);
  }

  protected choose(opt: Option): void {
    this.open.set(false);
    this.picked.emit(opt.game);
  }
}
