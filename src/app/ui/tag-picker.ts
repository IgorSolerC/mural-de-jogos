import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, model, signal } from '@angular/core';
import { ICON, IconModule } from './icons';
import { fold } from '../core/review';
import { LABEL_MAX, MAX_TAGS, TagEntry, cleanTag } from '../core/note-labels';
import { randomCategoryColor, tagColorHex, tagHasLook } from '../core/category-looks';
import { Settings } from '../core/settings';
import { NoteTag } from './note-tag';

/**
 * As tags da anotação, no editor (a parte Tags): todas, em linhas e em colunas, como as pastas e os grupos
 * das partes do lado (ui/_indice.scss), e marcadas como os bônus: a caixinha, a etiqueta (amarrada na
 * anotação, ou só o contorno) e em quantas anotações do grupo ela está. As desta anotação primeiro, depois
 * as fixas e as mais usadas no grupo. A busca filtra e, com um nome novo, cria; Enter amarra a primeira.
 * A estrela, no fim da linha, deixa a tag sempre à mão (fixa), em toda anotação.
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
    <ul class="lista" aria-label="Tags">
      @for (t of ordered(); track t.key) {
        <li class="tag-li" [class.fixa]="t.pinned">
          <button type="button" class="op" [attr.aria-pressed]="t.on" [disabled]="!t.on && full()" (click)="toggle(t.label)">
            <span class="caixa" aria-hidden="true">
              @if (t.on) {
                <lucide-icon [img]="CheckIcon" [size]="14" />
              }
            </span>
            <app-note-tag [label]="t.label" [ghost]="!t.on" [color]="colorOf(t.label)" />
            @if (t.n) {
              <span class="n"><span class="sr-only">, </span>{{ t.n }}<span class="sr-only"> {{ t.n === 1 ? 'anotação' : 'anotações' }}</span></span>
            }
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
        <li class="tag-li">
          <button type="button" class="op criar" [disabled]="full()" (click)="toggle(f)">
            <lucide-icon [img]="PlusIcon" [size]="15" aria-hidden="true" />
            Criar “{{ f }}”
          </button>
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
  protected readonly CheckIcon = ICON.pronto;
  protected readonly query = signal('');
  protected readonly full = computed(() => this.tags().length >= MAX_TAGS);

  /** Todas, na ordem: as desta anotação, depois as da cartela (as fixas primeiro), filtradas pela busca. */
  protected readonly ordered = computed(() => {
    const pins = new Set(this.settings.pinnedTags().map(fold));
    const uses = new Map(this.library().map((e) => [fold(e.label), e.n]));
    const out = new Map<string, { key: string; label: string; on: boolean; pinned: boolean; n: number }>();
    for (const t of this.tags()) out.set(fold(t), { key: fold(t), label: t, on: true, pinned: pins.has(fold(t)), n: uses.get(fold(t)) ?? 0 });
    for (const e of this.library())
      if (!out.has(fold(e.label))) out.set(fold(e.label), { key: fold(e.label), label: e.label, on: false, pinned: pins.has(fold(e.label)), n: e.n });
    const q = fold(cleanTag(this.query()));
    const list = [...out.values()];
    if (!q) return list;
    return [...list.filter((t) => t.key.startsWith(q)), ...list.filter((t) => !t.key.startsWith(q) && t.key.includes(q))];
  });

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
    // só "#" (ou espaços) não é busca nenhuma: a lista inteira, e a primeira seria uma tag desta anotação
    if (!cleanTag(this.query())) return;
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

  /** Outra anotação: a busca volta ao começo. */
  reset(): void {
    this.query.set('');
  }
}
