import { ChangeDetectionStrategy, Component, ElementRef, afterRenderEffect, computed, inject, input, model, output, signal, viewChild } from '@angular/core';
import { Check, LockKeyhole, LucideAngularModule, Search, X } from 'lucide-angular';
import { KINDS, Kind, cap, profileOf } from '../core/kinds';
import { Review, fold, formatReviewDate, formatScore, isNote, isPrivate } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { belongs } from '../core/kanban';
import { pinningFor } from '../core/wall-physics';
import { BackdropClose } from './backdrop-close';
import { CoverSleeve } from './cover-sleeve';
import { KIND_ICON } from './kind-switcher';
import { Pin } from './pin';

/** As abas dos murais: as anotações primeiro (é delas que mais se cola), depois os de resenhas. */
const ORDER: readonly Kind[] = ['anotacoes', ...KINDS.filter((k) => k !== 'anotacoes')];

/**
 * Escolher a ficha que o widget Nota cola no texto (ver ui/linked-card.ts): todas as suas, de todos
 * os murais, com a busca e as abas por mural, como o "Escolher fichas" do perfil. Aqui é uma só:
 * tocar numa já escolhe e fecha. A já escolhida vem primeiro, com o tique; as outras, das mexidas
 * mais recentemente para as mais antigas (a que você acabou de escrever está no alto). Enter na
 * busca escolhe a primeira da lista.
 *
 * A privada pode ser colada (o texto é seu), mas avisa: quem visita o seu mural vê só o nome dela.
 */
@Component({
  selector: 'app-card-picker',
  imports: [BackdropClose, CoverSleeve, LucideAngularModule, Pin],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- as teclas ficam aqui: o painel e o editor por baixo não ouvem o Esc nem o que se digita -->
    <dialog #dialog class="sheet escolher" aria-labelledby="colar-titulo" (close)="open.set(false)" (backdropClose)="open.set(false)" (keydown)="$event.stopPropagation()">
      @if (open()) {
        <div class="ficha cartolina" data-cor="amarelo">
          <app-pin class="pin" />
          <header class="head">
            <div>
              <h2 id="colar-titulo">{{ heading() }}</h2>
              <p class="para">{{ hint() }}</p>
            </div>
            <button type="button" class="icon-btn" aria-label="Fechar" (click)="open.set(false)">
              <lucide-icon [img]="CloseIcon" [size]="22" [strokeWidth]="2.6" aria-hidden="true" />
            </button>
          </header>

          <div class="ferramentas">
            <label class="busca">
              <lucide-icon [img]="SearchIcon" [size]="18" [strokeWidth]="2.4" aria-hidden="true" />
              <span class="sr-only">Procurar pelo nome</span>
              <input
                #search
                type="search"
                autocomplete="off"
                placeholder="Procurar pelo nome"
                [value]="query()"
                (input)="query.set($any($event.target).value)"
                (keydown.enter)="$event.preventDefault(); pickFirst()"
                (keydown.arrowdown)="$event.preventDefault(); focusItem(0)"
              />
            </label>
            @if (doneOption()) {
              <div class="murais" role="group" aria-label="Finalizadas">
                <button type="button" class="filtro" [attr.aria-pressed]="hideDone()" (click)="hideDone.set(!hideDone())">Esconder finalizadas</button>
              </div>
            }
            @if (!onlyKind()) {
            <div class="murais" role="group" aria-label="Mural">
              <button type="button" class="filtro" [attr.aria-pressed]="kind() === null" (click)="kind.set(null)">Todos <span class="n">{{ cards().length }}</span></button>
              @for (k of kinds(); track k.kind) {
                <button type="button" class="filtro" [attr.aria-pressed]="kind() === k.kind" (click)="kind.set(k.kind)">
                  <lucide-icon [img]="k.icon" [size]="15" [strokeWidth]="2.5" aria-hidden="true" />
                  {{ k.label }} <span class="n">{{ k.count }}</span>
                </button>
              }
            </div>
            }
          </div>

          <div class="body">
            <ul #lista class="lista" aria-label="Suas fichas" (keydown)="onListKey($event)">
              @for (r of shown(); track r.id) {
                @let on = r.id === chosen();
                <li>
                  <button type="button" class="item escolha" [class.on]="on" [attr.aria-current]="on ? 'true' : null" (click)="pick(r)">
                    @if (r.game.coverUrl || !isNote(r)) {
                      <app-cover-sleeve class="capa" size="thumb" [game]="r.game" [decorative]="true" />
                    } @else {
                      <!-- a anotação sem capa: um pedacinho da cartolina dela, na cor do mural -->
                      <span class="capa folhinha" [style.--stock]="'var(--stock-' + stockOf(r) + ')'" [attr.data-cor]="stockOf(r)" aria-hidden="true">
                        <lucide-icon [img]="NoteIcon" [size]="18" [strokeWidth]="2.4" aria-hidden="true" />
                      </span>
                    }
                    <span class="texto">
                      <span class="nome">{{ r.game.name }}</span>
                      <span class="meta">
                        <lucide-icon class="mural-icone" [img]="iconOf(r.kind)" [size]="13" [strokeWidth]="2.6" aria-hidden="true" />
                        {{ metaOf(r) }}
                        @if (isPrivate(r) && !isNote(r)) {
                          · <lucide-icon class="cadeado" [img]="LockIcon" [size]="13" [strokeWidth]="2.6" aria-hidden="true" /> privada: quem visita vê só o nome
                        }
                      </span>
                    </span>
                    <span class="marca" aria-hidden="true">
                      @if (on) {
                        <lucide-icon [img]="CheckIcon" [size]="16" [strokeWidth]="3" aria-hidden="true" />
                      }
                    </span>
                    @if (on) {
                      <span class="sr-only">(a escolhida agora)</span>
                    }
                  </button>
                </li>
              } @empty {
                <li class="nada">
                  @if (cards().length) {
                    Nenhuma ficha com “{{ query().trim() }}”@if (kind(); as k) { em {{ kindLabel(k) }}}.
                  } @else {
                    {{ emptyText() }}
                  }
                </li>
              }
            </ul>
          </div>

          <footer class="foot">
            <p class="conta">{{ footHint() }}</p>
            <div class="actions">
              <button type="button" class="btn-quiet" (click)="open.set(false)">Cancelar</button>
            </div>
          </footer>
        </div>
      }
    </dialog>
  `,
  styleUrls: ['./profile-picker.scss', './card-picker.scss'],
})
export class CardPicker {
  readonly open = model(false);
  /** A ficha que já está escolhida (o id), ou "". */
  readonly chosen = input('');
  /** A ficha onde ela vai ser colada: fica de fora da lista. */
  readonly selfId = input<string | null>(null);
  readonly picked = output<Review>();
  /** Só as fichas deste mural (sem as abas de mural): o "Buscar nota" do Kanban, só anotações. */
  readonly onlyKind = input<Kind | null>(null);
  /** Só as da categoria (a chave, ver `categoryKey`): o "Buscar nota" do quadro de uma categoria. */
  readonly onlyCategory = input<string | null>(null);
  /** As que já estão onde a escolhida vai (as do quadro): ficam de fora. */
  readonly exclude = input<readonly string[]>([]);
  readonly heading = input('Escolher a nota');
  readonly hint = input('Uma anotação ou ficha de qualquer mural, para colar no texto.');
  readonly footHint = input('Toque numa ficha para colar.');
  /** Mostra "Esconder finalizadas" (ligado ao abrir): o "Buscar nota" do Kanban. */
  readonly doneOption = input(false);
  protected readonly hideDone = signal(true);
  readonly emptyText = input('Você ainda não tem outras fichas. Pregue uma no mural e ela aparece aqui.');

  protected readonly CloseIcon = X;
  protected readonly SearchIcon = Search;
  protected readonly CheckIcon = Check;
  protected readonly LockIcon = LockKeyhole;
  protected readonly NoteIcon = KIND_ICON.anotacoes;
  protected readonly isNote = isNote;
  protected readonly isPrivate = isPrivate;
  protected readonly query = signal('');
  protected readonly kind = signal<Kind | null>(null);
  private readonly store = inject(ReviewStore);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly search = viewChild<ElementRef<HTMLInputElement>>('search');
  private readonly lista = viewChild<ElementRef<HTMLElement>>('lista');

  /** Todas as suas fichas, menos aquela onde a nota vai ser colada. */
  protected readonly cards = computed(() => {
    const self = this.selfId();
    const only = this.onlyKind();
    const out = new Set(this.exclude());
    const noDone = this.doneOption() && this.hideDone();
    const cat = this.onlyCategory();
    return this.store
      .reviews()
      .filter((r) => r.id !== self && !out.has(r.id) && (!only || r.kind === only) && !(noDone && r.doneAt) && (!cat || belongs({ category: cat }, r)));
  });
  /** Os murais que têm alguma ficha, com quantas. */
  protected readonly kinds = computed(() =>
    ORDER.map((kind) => ({ kind, label: this.kindLabel(kind), icon: KIND_ICON[kind], count: this.cards().filter((r) => r.kind === kind).length })).filter((k) => k.count > 0),
  );
  /** A escolhida quando a folha abriu: ela vem primeiro, e nada pula enquanto se procura. */
  private readonly before = signal('');
  /** A escolhida primeiro, depois as mexidas mais recentemente. */
  protected readonly shown = computed(() => {
    const q = fold(this.query().trim());
    const kind = this.kind();
    const before = this.before();
    const list = this.cards().filter((r) => (!kind || r.kind === kind) && (!q || fold(r.game.name).includes(q)));
    return list.sort((a, b) => Number(b.id === before) - Number(a.id === before) || b.updatedAt.localeCompare(a.updatedAt) || a.game.name.localeCompare(b.game.name, 'pt-BR'));
  });

  constructor() {
    let wasOpen = false;
    afterRenderEffect(() => {
      const el = this.dialog().nativeElement;
      const open = this.open();
      if (open && !el.open) el.showModal();
      else if (!open && el.open) el.close();
      if (open && !wasOpen) {
        this.before.set(this.chosen());
        this.query.set('');
        // já tem uma escolhida: abre no mural dela (trocar costuma ser por outra parecida)
        this.kind.set(this.store.get(this.chosen())?.kind ?? null);
        this.search()?.nativeElement.focus();
      }
      wasOpen = open;
    });
  }

  protected pick(r: Review): void {
    this.picked.emit(r);
    this.open.set(false);
  }

  /** Enter na busca: a primeira da lista. */
  protected pickFirst(): void {
    const first = this.shown()[0];
    if (first) this.pick(first);
  }

  /** As setas andam pela lista; para cima, da primeira, volta para a busca. */
  protected onListKey(e: KeyboardEvent): void {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const items = this.items();
    const at = items.indexOf(document.activeElement as HTMLElement);
    if (at < 0) return;
    e.preventDefault();
    if (e.key === 'ArrowUp' && at === 0) this.search()?.nativeElement.focus();
    else this.focusItem(at + (e.key === 'ArrowDown' ? 1 : -1));
  }

  protected focusItem(at: number): void {
    const items = this.items();
    items[Math.max(0, Math.min(at, items.length - 1))]?.focus();
  }

  private items(): HTMLElement[] {
    return Array.from(this.lista()?.nativeElement.querySelectorAll<HTMLElement>('.escolha') ?? []);
  }

  protected kindLabel(kind: Kind): string {
    return cap(profileOf(kind).plural);
  }

  protected iconOf(kind: Kind) {
    return KIND_ICON[kind];
  }

  protected stockOf(r: Review): string {
    return pinningFor(r.id, r.stock).stock;
  }

  /** O mural e o que diz dela: a categoria e a data da anotação; a média da resenha. */
  protected metaOf(r: Review): string {
    const kind = cap(profileOf(r.kind).singular);
    if (isNote(r)) return [kind, r.category, r.completedAt ? formatReviewDate(r.completedAt) : ''].filter(Boolean).join(' · ');
    return r.scores.final !== null ? `${kind} · média ${formatScore(r.scores.final)}` : kind;
  }
}
