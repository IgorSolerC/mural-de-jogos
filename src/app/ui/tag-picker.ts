import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, model, signal } from '@angular/core';
import { ICON, IconModule } from './icons';
import { fold } from '../core/review';
import { LABEL_MAX, MAX_TAGS, TagEntry, cleanTag } from '../core/note-labels';
import { randomCategoryColor, tagColorHex, tagHasLook } from '../core/category-looks';
import { Settings } from '../core/settings';
import { NoteTag } from './note-tag';

/** Sem busca, quantas tags aparecem de uma vez (as da anotação sempre aparecem). */
const SHOWN = 24;

/**
 * As tags da anotação, no editor (a parte Tags): todas à mão, como na folha da anotação no quadro,
 * cada uma a etiqueta para tocar (amarrada na anotação, ou só o contorno). As desta anotação
 * primeiro, depois as fixas e as mais usadas no grupo. A busca filtra e, com um nome novo, cria;
 * Enter amarra a primeira. A estrela deixa a tag sempre à mão (fixa), em toda anotação.
 */
@Component({
  selector: 'app-tag-picker',
  imports: [IconModule, NoteTag],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="topo">
      <label class="campo">
        <lucide-icon class="lupa" [img]="SearchIcon" [size]="18" aria-hidden="true" />
        <span class="sr-only">Buscar ou criar tag</span>
        <input
          type="text"
          autocomplete="off"
          enterkeyhint="done"
          [maxLength]="max"
          placeholder="Buscar ou criar tag"
          [value]="query()"
          (input)="onInput($any($event.target))"
          (keydown.enter)="$event.preventDefault(); enter()"
        />
      </label>
      @if (tags().length >= maxTags - 3) {
        <span class="conta" [class.cheia]="full()">{{ tags().length }} de {{ maxTags }} tags</span>
      }
    </div>
    <ul class="tags" aria-label="Tags">
      @for (t of shown(); track t.key; let i = $index) {
        <li class="tag-li" [class.fixa]="t.pinned">
          <button type="button" class="tag-op" [attr.aria-pressed]="t.on" [disabled]="!t.on && full()" (click)="toggle(t.label)">
            <app-note-tag [label]="t.label" [ghost]="!t.on" [index]="t.on ? i : null" [color]="colorOf(t.label)" />
          </button>
          <button
            type="button"
            class="estrela"
            [attr.aria-pressed]="t.pinned"
            [attr.aria-label]="'Sempre à mão: ' + t.label"
            [title]="t.pinned ? 'Sempre à mão em toda anotação. Toque para soltar.' : 'Deixar sempre à mão em toda anotação'"
            (click)="settings.togglePinnedTag(t.label)"
          >
            <lucide-icon [img]="StarIcon" [size]="14" aria-hidden="true" />
          </button>
        </li>
      }
      @if (fresh(); as f) {
        <li>
          <button type="button" class="tag-op criar" [disabled]="full()" (click)="toggle(f)">
            <lucide-icon [img]="PlusIcon" [size]="15" aria-hidden="true" />
            Criar “{{ f }}”
          </button>
        </li>
      }
      @if (hidden(); as n) {
        <li>
          <button type="button" class="mais quieto" (click)="all.set(true)">Mais {{ n }}</button>
        </li>
      }
    </ul>
    <p class="legenda"><lucide-icon [img]="StarIcon" [size]="13" aria-hidden="true" />sempre à mão nas anotações</p>
    @if (full()) {
      <p class="dica">Esta anotação já tem {{ maxTags }} tags: tire uma para pôr outra.</p>
    }
  `,
  styleUrl: './tag-picker.scss',
})
export class TagPicker {
  protected readonly settings = inject(Settings);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly tags = model<string[]>([]);
  /** As tags à mão (as fixas e as das outras anotações do grupo; ver `tagLibrary`). */
  readonly library = input<readonly TagEntry[]>([]);
  /** O grupo da anotação: a cor de cada tag é a dela nele. */
  readonly category = input<string | null>(null);

  protected readonly max = LABEL_MAX;
  protected readonly maxTags = MAX_TAGS;
  protected readonly SearchIcon = ICON.buscar;
  protected readonly PlusIcon = ICON.adicionar;
  protected readonly StarIcon = ICON.estrela;
  protected readonly query = signal('');
  /** "Mais N" foi tocado: todas à mostra. */
  protected readonly all = signal(false);
  protected readonly full = computed(() => this.tags().length >= MAX_TAGS);

  /** Todas, na ordem: as desta anotação, depois as da cartela (as fixas primeiro), filtradas pela busca. */
  private readonly ordered = computed(() => {
    const pins = new Set(this.settings.pinnedTags().map(fold));
    const out = new Map<string, { key: string; label: string; on: boolean; pinned: boolean }>();
    for (const t of this.tags()) out.set(fold(t), { key: fold(t), label: t, on: true, pinned: pins.has(fold(t)) });
    for (const e of this.library()) if (!out.has(fold(e.label))) out.set(fold(e.label), { key: fold(e.label), label: e.label, on: false, pinned: pins.has(fold(e.label)) });
    const q = fold(cleanTag(this.query()));
    const list = [...out.values()];
    if (!q) return list;
    return [...list.filter((t) => t.key.startsWith(q)), ...list.filter((t) => !t.key.startsWith(q) && t.key.includes(q))];
  });

  protected readonly shown = computed(() => {
    const list = this.ordered();
    if (this.all() || this.query().trim()) return list;
    return list.slice(0, Math.max(SHOWN, this.tags().length));
  });

  protected readonly hidden = computed(() => this.ordered().length - this.shown().length);

  /** O escrito, quando ainda não é tag nenhuma: "Criar “Urgente”". */
  protected readonly fresh = computed(() => {
    const t = cleanTag(this.query());
    return t && !this.ordered().some((x) => x.key === fold(t)) ? t : null;
  });

  protected colorOf(tag: string): string | null {
    return tagColorHex(this.settings.categoryLooks(), tag, this.category() ?? '');
  }

  protected onInput(field: HTMLInputElement): void {
    let v = field.value;
    // a vírgula amarra o que veio antes dela (colar "bug, ui" amarra as duas)
    if (v.includes(',')) {
      const parts = v.split(',');
      for (const p of parts.slice(0, -1)) this.add(p);
      v = parts.at(-1)!;
      field.value = v;
    }
    this.query.set(v);
  }

  /** Enter: a primeira que bate com a busca (amarra ou solta), ou a tag nova. */
  protected enter(): void {
    if (!this.query().trim()) return;
    const first = this.ordered()[0];
    if (first) this.toggle(first.label);
    else if (this.fresh()) this.toggle(this.fresh()!);
  }

  protected toggle(label: string): void {
    const on = this.tags().some((t) => fold(t) === fold(label));
    if (on) this.tags.update((l) => l.filter((t) => fold(t) !== fold(label)));
    else this.add(label);
    this.query.set('');
  }

  /** Amarra a tag (a grafia da que já existe, se existir). */
  add(raw: string): void {
    const tag = cleanTag(raw);
    if (!tag || this.full() || this.tags().some((t) => fold(t) === fold(tag))) return;
    const entry = this.library().find((e) => fold(e.label) === fold(tag));
    // como o grupo novo: a tag que ainda não está em nenhuma anotação do grupo, e não tem cor nele,
    // ganha uma das cores, sorteada (dá para trocar nas configurações do mural)
    const category = this.category() ?? '';
    if (!entry?.n && !tagHasLook(this.settings.categoryLooks(), tag, category)) this.settings.setTagColor(tag, randomCategoryColor(), category);
    this.tags.update((l) => [...l, entry?.label ?? tag]);
  }

  /** O foco vai para a busca (ao abrir a parte). */
  focus(): void {
    this.host.nativeElement.querySelector<HTMLInputElement>('input')?.focus();
  }

  /** Outra anotação: a busca e o "Mais" voltam ao começo. */
  reset(): void {
    this.query.set('');
    this.all.set(false);
  }
}
