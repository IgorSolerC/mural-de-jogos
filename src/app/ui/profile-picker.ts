import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  computed,
  input,
  model,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { Check, LockKeyhole, LucideAngularModule, Search, X } from 'lucide-angular';
import { KINDS, Kind, cap, profileOf } from '../core/kinds';
import { PROFILE_LIMITS } from '../core/profile';
import { Review, fold, formatScore, isNote, isPrivate } from '../core/review';
import { BackdropClose } from './backdrop-close';
import { CoverSleeve } from './cover-sleeve';
import { KIND_ICON } from './kind-switcher';
import { Pin } from './pin';

/**
 * Escolher as fichas de uma seção do perfil: todas as suas, de todos os murais, com busca e abas por
 * mural. A escolhida ganha o número da ordem (a próxima vai para o fim); as privadas ficam à vista,
 * mas apagadas, porque quem visita nunca as veria.
 */
@Component({
  selector: 'app-profile-picker',
  imports: [BackdropClose, CoverSleeve, LucideAngularModule, Pin],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dialog class="sheet escolher" aria-labelledby="escolher-titulo" (close)="open.set(false)" (backdropClose)="open.set(false)">
      @if (open()) {
        <div class="ficha cartolina" data-cor="amarelo">
          <app-pin class="pin" color="#e62e2d" />
          <header class="head">
            <div>
              <h2 id="escolher-titulo">Escolher fichas</h2>
              <p class="para">para “{{ sectionTitle() || 'Seção sem nome' }}”</p>
            </div>
            <button type="button" class="icon-btn" aria-label="Fechar" (click)="open.set(false)">
              <lucide-icon [img]="XIcon" [size]="22" [strokeWidth]="2.4" aria-hidden="true" />
            </button>
          </header>

          <div class="ferramentas">
            <label class="busca">
              <lucide-icon [img]="SearchIcon" [size]="18" [strokeWidth]="2.4" aria-hidden="true" />
              <span class="sr-only">Procurar pelo nome</span>
              <input #search type="search" autocomplete="off" placeholder="Procurar pelo nome" [value]="query()" (input)="query.set($any($event.target).value)" />
            </label>
            <div class="murais" role="group" aria-label="Mural">
              <button type="button" class="filtro" [attr.aria-pressed]="kind() === null" (click)="kind.set(null)">Todos <span class="n">{{ cards().length }}</span></button>
              @for (k of kinds(); track k.kind) {
                <button type="button" class="filtro" [attr.aria-pressed]="kind() === k.kind" (click)="kind.set(k.kind)">
                  <lucide-icon [img]="k.icon" [size]="15" [strokeWidth]="2.5" aria-hidden="true" />
                  {{ k.label }} <span class="n">{{ k.count }}</span>
                </button>
              }
            </div>
          </div>

          <div class="body">
            <ul class="lista" aria-label="Suas fichas">
              @for (r of shown(); track r.id) {
                @let at = chosen().indexOf(r.id);
                @let locked = isPrivate(r);
                <li>
                  <label class="item" [class.on]="at >= 0" [class.off]="locked || (at < 0 && full())">
                    <input
                      type="checkbox"
                      [checked]="at >= 0"
                      [disabled]="locked || (at < 0 && full())"
                      (change)="toggle(r.id)"
                    />
                    <app-cover-sleeve class="capa" size="thumb" [game]="r.game" [decorative]="true" />
                    <span class="texto">
                      <span class="nome">{{ r.game.name }}</span>
                      <span class="meta">
                        {{ kindLabel(r.kind) }}@if (!isNote(r) && r.scores.final !== null) { · média {{ score(r) }} }
                        @if (locked) { · <lucide-icon class="cadeado" [img]="LockIcon" [size]="13" [strokeWidth]="2.6" aria-hidden="true" /> privada: não aparece }
                      </span>
                    </span>
                    <span class="marca" aria-hidden="true">
                      @if (at >= 0) {
                        {{ at + 1 }}
                      } @else if (!locked) {
                        <lucide-icon [img]="CheckIcon" [size]="16" [strokeWidth]="3" />
                      }
                    </span>
                  </label>
                </li>
              } @empty {
                <li class="nada">
                  @if (cards().length) {
                    Nenhuma ficha com “{{ query().trim() }}”.
                  } @else {
                    Você ainda não tem fichas no mural. Pregue a primeira e ela aparece aqui.
                  }
                </li>
              }
            </ul>
          </div>

          <footer class="foot">
            <p class="conta" aria-live="polite">
              {{ chosen().length }} {{ chosen().length === 1 ? 'escolhida' : 'escolhidas' }}
              @if (full()) { <span>· chegou ao máximo de {{ max }}</span> }
            </p>
            <div class="actions">
              <button type="button" class="btn-ink" (click)="open.set(false)">Pronto</button>
            </div>
          </footer>
        </div>
      }
    </dialog>
  `,
  styleUrl: './profile-picker.scss',
})
export class ProfilePicker {
  readonly open = model(false);
  readonly sectionTitle = input('');
  /** Todas as suas fichas e anotações. */
  readonly cards = input.required<readonly Review[]>();
  /** Os ids já escolhidos, na ordem. */
  readonly chosen = input.required<readonly string[]>();
  readonly chosenChange = output<string[]>();

  protected readonly max = PROFILE_LIMITS.items;
  protected readonly XIcon = X;
  protected readonly SearchIcon = Search;
  protected readonly CheckIcon = Check;
  protected readonly LockIcon = LockKeyhole;
  protected readonly isNote = isNote;
  protected readonly isPrivate = isPrivate;
  protected readonly query = signal('');
  protected readonly kind = signal<Kind | null>(null);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly search = viewChild<ElementRef<HTMLInputElement>>('search');

  protected readonly full = computed(() => this.chosen().length >= this.max);
  /** Os murais que têm alguma ficha, com quantas. */
  protected readonly kinds = computed(() =>
    KINDS.map((kind) => ({ kind, label: cap(profileOf(kind).plural), icon: KIND_ICON[kind], count: this.cards().filter((r) => r.kind === kind).length })).filter((k) => k.count > 0),
  );
  /** As que já estavam escolhidas quando a folha abriu: elas vêm primeiro, e nada pula enquanto se marca. */
  private readonly before = signal<readonly string[]>([]);
  /** As escolhidas de antes primeiro (na ordem), depois as outras de A a Z. */
  protected readonly shown = computed(() => {
    const q = fold(this.query().trim());
    const kind = this.kind();
    const before = this.before();
    const list = this.cards().filter((r) => (!kind || r.kind === kind) && (!q || fold(r.game.name).includes(q)));
    const rank = (r: Review) => {
      const at = before.indexOf(r.id);
      return at < 0 ? Infinity : at;
    };
    return list.sort((a, b) => rank(a) - rank(b) || a.game.name.localeCompare(b.game.name, 'pt-BR'));
  });

  constructor() {
    let wasOpen = false;
    afterRenderEffect(() => {
      const el = this.dialog().nativeElement;
      const open = this.open();
      if (open && !el.open) el.showModal();
      else if (!open && el.open) el.close();
      if (open && !wasOpen) {
        this.before.set([...this.chosen()]);
        this.query.set('');
        this.kind.set(null);
        this.search()?.nativeElement.focus();
      }
      wasOpen = open;
    });
  }

  protected toggle(id: string): void {
    const now = this.chosen();
    this.chosenChange.emit(now.includes(id) ? now.filter((x) => x !== id) : [...now, id].slice(0, this.max));
  }

  protected kindLabel(kind: Kind): string {
    return cap(profileOf(kind).singular);
  }

  protected score(r: Review): string {
    return formatScore(r.scores.final);
  }
}
