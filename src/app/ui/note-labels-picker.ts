import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, model, signal, viewChild } from '@angular/core';
import { ChevronUp, LucideAngularModule, Pin, PinOff, Plus, Sticker, X } from 'lucide-angular';
import { Bonus, fold } from '../core/review';
import { LABEL_MAX, MAX_TAGS, TagEntry, categoryBonus, cleanCategory, cleanTag } from '../core/note-labels';
import { Settings } from '../core/settings';
import { BonusSticker } from './bonus';
import { NoteTag } from './note-tag';

let uid = 0;

/**
 * A categoria e as tags da anotação, no editor (ver core/note-labels.ts).
 *
 * - Categoria: a cartela de adesivos (a pronta e as escritas à mão), como a dos bônus; só uma fica
 *   colada. Tocar na colada tira.
 * - Tags: um campo com sugestões (as fixas primeiro, depois as mais usadas). Enter, vírgula ou Tab
 *   amarram a tag; Backspace no campo vazio solta a última. O alfinete de cada tag a fixa (ela fica
 *   sempre à mão, aqui embaixo, em toda anotação).
 */
@Component({
  selector: 'app-note-labels-picker',
  imports: [LucideAngularModule, BonusSticker, NoteTag],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- ===== Categoria ===== -->
    <div class="grupo" role="group" [attr.aria-labelledby]="id + '-cat'">
      <div class="top">
        <p class="label" [id]="id + '-cat'">Categoria</p>
        <button type="button" class="toggle" [attr.aria-expanded]="open()" [attr.aria-controls]="id + '-cartela'" (click)="setOpen(!open())">
          <lucide-icon [img]="open() ? CloseIcon : StickerIcon" [size]="17" [strokeWidth]="2.6" aria-hidden="true" />
          {{ open() ? 'Fechar cartela' : category() ? 'Trocar' : 'Escolher' }}
        </button>
      </div>
      @if (open()) {
        <div class="cartela" [id]="id + '-cartela'">
          <div class="slots">
            @for (b of options(); track b.id) {
              <button type="button" class="slot" [attr.aria-pressed]="isChosen(b)" (click)="pick(b)">
                <app-bonus-sticker [bonus]="b" [ghost]="!isChosen(b)" [index]="isChosen(b) ? 0 : null" />
              </button>
            }
            @if (writing()) {
              <input
                #write
                class="write"
                type="text"
                autocomplete="off"
                enterkeyhint="done"
                [maxLength]="max"
                placeholder="Nome da categoria"
                aria-label="Nova categoria. Enter cola na anotação."
                (keydown)="onWriteKey($event)"
                (blur)="commitWrite($any($event.target))"
              />
            } @else {
              <button type="button" class="slot write-btn" data-write (click)="startWriting()">
                <lucide-icon [img]="PlusIcon" [size]="15" [strokeWidth]="2.8" aria-hidden="true" />
                Escrever outra
              </button>
            }
          </div>
        </div>
      } @else if (category(); as c) {
        <div class="colada">
          <app-bonus-sticker [bonus]="sticker(c)" [index]="0" />
          <button type="button" class="tirar" (click)="category.set(null)" [attr.aria-label]="'Tirar a categoria ' + c">
            <lucide-icon [img]="RemoveIcon" [size]="15" [strokeWidth]="2.8" aria-hidden="true" />
          </button>
        </div>
      } @else {
        <p class="hint">O assunto da anotação, um só: {{ examples() }} O mural agrupa e filtra por ela.</p>
      }
    </div>

    <!-- ===== Tags ===== -->
    <div class="grupo" role="group" [attr.aria-labelledby]="id + '-tags'">
      <div class="top">
        <p class="label" [id]="id + '-tags'">Tags</p>
        <span class="conta" aria-hidden="true">{{ tags().length }}/{{ maxTags }}</span>
      </div>
      <div class="amarradas" (click)="focusInput($event)">
        @for (t of tags(); track t; let i = $index) {
          <span class="amarrada">
            <app-note-tag [label]="t" [index]="i" />
            <button
              type="button"
              class="mini-btn fixar"
              [class.fixa]="settings.isPinnedTag(t)"
              [attr.aria-pressed]="settings.isPinnedTag(t)"
              [attr.aria-label]="'Tag fixa: ' + t"
              [title]="settings.isPinnedTag(t) ? 'Fixa: fica sempre à mão. Toque para soltar.' : 'Fixar: deixar sempre à mão nas anotações'"
              (click)="settings.togglePinnedTag(t)"
            >
              <lucide-icon [img]="PinIcon" [size]="13" [strokeWidth]="2.6" aria-hidden="true" />
            </button>
            <button type="button" class="mini-btn" [attr.aria-label]="'Tirar a tag ' + t" (click)="remove(t)">
              <lucide-icon [img]="RemoveIcon" [size]="13" [strokeWidth]="2.8" aria-hidden="true" />
            </button>
          </span>
        }
        @if (tags().length < maxTags) {
          <input
            #tagInput
            class="campo"
            type="text"
            autocomplete="off"
            enterkeyhint="done"
            role="combobox"
            aria-autocomplete="list"
            [attr.aria-expanded]="showList()"
            [attr.aria-controls]="id + '-sug'"
            [attr.aria-activedescendant]="showList() && suggestions().length ? id + '-sug-' + active() : null"
            [attr.aria-labelledby]="id + '-tags'"
            [maxLength]="max"
            [placeholder]="tags().length ? 'Mais uma tag…' : 'Bugfix, Feature, Urgente…'"
            [value]="query()"
            (input)="onInput($any($event.target).value)"
            (keydown)="onKey($event)"
            (focus)="focused.set(true)"
            (blur)="onBlur()"
          />
        }
      </div>
      @if (showList()) {
        <ul class="sugestoes" role="listbox" [id]="id + '-sug'" [attr.aria-label]="'Tags para ' + (query().trim() ? '“' + query().trim() + '”' : 'pôr')">
          @for (s of suggestions(); track s.label; let i = $index) {
            <li
              role="option"
              [id]="id + '-sug-' + i"
              [class.ativa]="i === active()"
              [attr.aria-selected]="i === active()"
              (mousedown)="$event.preventDefault()"
              (click)="add(s.label)"
            >
              <app-note-tag [label]="s.label" size="mini" />
              <span class="sug-meta">
                @if (s.pinned) {
                  <lucide-icon [img]="PinIcon" [size]="12" [strokeWidth]="2.6" aria-hidden="true" /> fixa
                }
                @if (s.n) {
                  {{ s.pinned ? ' · ' : '' }}{{ s.n === 1 ? 'em 1 anotação' : 'em ' + s.n + ' anotações' }}
                }
              </span>
            </li>
          }
          @if (newTag(); as t) {
            <li
              role="option"
              class="nova"
              [id]="id + '-sug-' + suggestions().length"
              [class.ativa]="active() === suggestions().length"
              [attr.aria-selected]="active() === suggestions().length"
              (mousedown)="$event.preventDefault()"
              (click)="add(t)"
            >
              <lucide-icon [img]="PlusIcon" [size]="14" [strokeWidth]="2.8" aria-hidden="true" />
              <span>Nova tag “{{ t }}”</span>
            </li>
          }
        </ul>
      }
      <!-- as fixas que ainda não estão nesta anotação: a um toque -->
      @if (pinnedLeft().length) {
        <div class="fixas">
          <span class="fixas-label"><lucide-icon [img]="PinIcon" [size]="13" [strokeWidth]="2.6" aria-hidden="true" /> Fixas</span>
          @for (t of pinnedLeft(); track t) {
            <span class="fixa-op">
              <button type="button" class="slot" [attr.aria-label]="'Pôr a tag ' + t" (click)="add(t)" [disabled]="tags().length >= maxTags">
                <app-note-tag [label]="t" size="mini" [ghost]="true" />
              </button>
              <button type="button" class="mini-btn soltar" [attr.aria-label]="'Soltar a tag fixa ' + t" title="Soltar: deixa de ficar sempre à mão" (click)="settings.togglePinnedTag(t)">
                <lucide-icon [img]="UnpinIcon" [size]="12" [strokeWidth]="2.6" aria-hidden="true" />
              </button>
            </span>
          }
        </div>
      } @else if (!tags().length) {
        <p class="hint">Tags informam: Bugfix, Feature, Urgente… Várias por anotação. O alfinete deixa uma tag sempre à mão.</p>
      }
    </div>
  `,
  styles: `
    :host {
      display: grid;
      gap: 20px;
    }
    .top {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px 10px;
      min-height: 40px;
    }
    .label {
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 1rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .conta {
      font-family: var(--f-label);
      font-weight: 700;
      font-size: 0.82rem;
      letter-spacing: 0.04em;
      color: var(--ink-2);
      font-variant-numeric: tabular-nums;
    }
    .toggle {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      margin: 0 -8px 0 auto;
      min-height: 40px;
      padding: 6px 8px;
      border: 0;
      border-radius: 4px;
      background: transparent;
      color: var(--ink);
      font-family: var(--f-marker);
      font-size: 1rem;
      text-decoration: underline 2px;
      text-underline-offset: 5px;
      transition: background-color var(--t-ui) var(--ease-ui);
    }
    .toggle:hover {
      background: rgb(21 21 21 / 0.05);
    }
    .toggle lucide-icon {
      display: inline-flex;
    }
    .hint {
      margin-top: 2px;
      max-width: 54ch;
      font-size: 0.92rem;
      color: var(--ink-2);
    }

    /* a categoria colada, com o x para tirar */
    .colada {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-top: 4px;
    }

    /* A cartela: uma folha de adesivos mais branca que a ficha (a mesma dos bônus) */
    .cartela {
      margin-top: 8px;
      padding: 14px 14px 12px;
      border-radius: 2px;
      background: #fdfcf8;
      box-shadow:
        inset 0 0 0 1.5px rgb(21 21 21 / 0.14),
        0 1px 2px rgb(0 0 0 / 0.12),
        0 6px 12px -8px rgb(0 0 0 / 0.3);
      animation: cartela-in var(--t-physical) var(--ease-physical);
    }
    @keyframes cartela-in {
      from {
        opacity: 0;
        translate: 0 -6px;
      }
    }
    .slots {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 3px 6px;
    }
    .slot {
      display: inline-grid;
      place-items: center;
      max-width: 100%;
      min-height: 34px;
      padding: 0 1px;
      border: 0;
      border-radius: 4px;
      background: transparent;
      color: var(--ink);
      cursor: pointer;
    }
    .slot:disabled {
      cursor: default;
      opacity: 0.5;
    }
    .slot app-bonus-sticker.ghost {
      color: rgb(21 21 21 / 0.62);
      outline-color: rgb(21 21 21 / 0.34);
    }
    .slot:hover app-bonus-sticker.ghost {
      background: rgb(21 21 21 / 0.06);
      color: var(--ink);
      outline-color: rgb(21 21 21 / 0.62);
    }
    .slot[aria-pressed='true'] app-bonus-sticker {
      scale: 1.04;
      box-shadow:
        inset 0 0 0 2px var(--ink),
        0 2px 3px rgb(0 0 0 / 0.3);
    }
    .slot:focus-visible {
      outline: 3px solid var(--ink);
      outline-offset: 0;
    }
    .write-btn {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 0 8px;
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.88rem;
      text-decoration: underline 1.5px;
      text-underline-offset: 4px;
    }
    .write-btn:hover {
      background: rgb(21 21 21 / 0.06);
    }
    .write-btn lucide-icon {
      display: inline-flex;
    }
    .write {
      width: min(22ch, 100%);
      height: 32px;
      margin: 4px 0;
      padding: 0 9px;
      border: 0;
      border-radius: 2px;
      background: var(--paper);
      color: var(--ink);
      caret-color: var(--red);
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.92rem;
      outline: none;
      box-shadow:
        inset 0 0 0 2px var(--ink),
        0 0 0 3px rgb(21 21 21 / 0.12);
    }

    /* ===== Tags: as etiquetas amarradas e o campo, numa tira de papel ===== */
    .amarradas {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px 10px;
      min-height: 46px;
      padding: 7px 10px;
      border-radius: 2px;
      background: var(--paper);
      box-shadow:
        inset 0 0 0 1.5px rgb(21 21 21 / 0.2),
        inset 0 2px 3px rgb(0 0 0 / 0.06);
      cursor: text;
    }
    .amarradas:focus-within {
      box-shadow:
        inset 0 0 0 2px var(--ink),
        0 0 0 3px rgb(21 21 21 / 0.1);
    }
    .amarrada {
      display: inline-flex;
      align-items: center;
      gap: 1px;
      max-width: 100%;
    }
    .amarrada app-note-tag {
      margin-right: 3px;
      min-width: 0;
    }
    .mini-btn {
      display: inline-grid;
      place-items: center;
      width: 26px;
      height: 26px;
      padding: 0;
      border: 0;
      border-radius: 50%;
      background: transparent;
      color: var(--ink-2);
      cursor: pointer;
      transition:
        background-color var(--t-ui) var(--ease-ui),
        color var(--t-ui) var(--ease-ui);
    }
    .mini-btn:hover {
      background: rgb(21 21 21 / 0.07);
      color: var(--ink);
    }
    .mini-btn:focus-visible {
      outline: 2.5px solid var(--ink);
      outline-offset: 0;
    }
    .mini-btn lucide-icon {
      display: inline-flex;
    }
    /* a tag fixa: o alfinete cravado, vermelho */
    .fixar.fixa {
      color: #c4302b;
    }
    .fixar.fixa ::ng-deep svg {
      fill: currentColor;
      fill-opacity: 0.85;
    }
    .campo {
      flex: 1 1 14ch;
      min-width: 12ch;
      height: 30px;
      padding: 0 2px;
      border: 0;
      background: transparent;
      color: var(--ink);
      caret-color: var(--red);
      font-family: var(--f-label);
      font-weight: 700;
      font-size: 1rem;
      letter-spacing: 0.02em;
      outline: none;
    }
    .campo::placeholder {
      color: rgb(21 21 21 / 0.45);
      font-weight: 600;
    }

    /* as sugestões: uma folhinha embaixo do campo, como a lista dos links */
    .sugestoes {
      margin: 6px 0 0;
      padding: 6px;
      list-style: none;
      border-radius: 2px;
      background: #fdfcf8;
      box-shadow:
        inset 0 0 0 1.5px rgb(21 21 21 / 0.16),
        0 6px 14px -8px rgb(0 0 0 / 0.35);
      max-height: 232px;
      overflow: auto;
    }
    .sugestoes li {
      display: flex;
      align-items: center;
      gap: 10px;
      min-height: 38px;
      padding: 4px 8px;
      border-radius: 2px;
      cursor: pointer;
    }
    .sugestoes li:hover {
      background: rgb(21 21 21 / 0.05);
    }
    .sugestoes li.ativa {
      background: rgb(255 218 66 / 0.55);
    }
    .sug-meta {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      font-family: var(--f-hand);
      font-size: 0.95rem;
      color: var(--ink-2);
    }
    .sugestoes .nova {
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.92rem;
      letter-spacing: 0.02em;
    }

    /* as fixas à mão */
    .fixas {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 4px 8px;
      margin-top: 10px;
    }
    .fixas-label {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      margin-right: 2px;
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.8rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--ink-2);
    }
    .fixa-op {
      display: inline-flex;
      align-items: center;
    }
    .fixa-op .slot:hover app-note-tag {
      background: rgb(21 21 21 / 0.06);
      color: var(--ink);
    }
    .soltar {
      width: 22px;
      height: 22px;
    }
    @media (pointer: coarse) {
      .slot {
        min-height: 40px;
      }
      .mini-btn {
        width: 34px;
        height: 34px;
      }
    }
  `,
})
export class NoteLabelsPicker {
  /** A categoria escolhida (null: nenhuma). */
  readonly category = model<string | null>(null);
  readonly tags = model<string[]>([]);
  /** A cartela: as categorias prontas e as escritas à mão nas anotações (ver `categoryLibrary`). */
  readonly categories = input.required<readonly Bonus[]>();
  /** As tags à mão: as fixas e as usadas (ver `tagLibrary`). */
  readonly library = input.required<readonly TagEntry[]>();

  protected readonly settings = inject(Settings);
  protected readonly id = `rotulos-${++uid}`;
  protected readonly max = LABEL_MAX;
  protected readonly maxTags = MAX_TAGS;
  protected readonly StickerIcon = Sticker;
  protected readonly CloseIcon = ChevronUp;
  protected readonly PlusIcon = Plus;
  protected readonly RemoveIcon = X;
  protected readonly PinIcon = Pin;
  protected readonly UnpinIcon = PinOff;

  protected readonly open = signal(false);
  protected readonly writing = signal(false);
  /** Escritas nesta anotação: ficam na cartela mesmo trocadas antes de salvar. */
  private readonly written = signal<string[]>([]);
  private readonly writeInput = viewChild<ElementRef<HTMLInputElement>>('write');
  private readonly tagInput = viewChild<ElementRef<HTMLInputElement>>('tagInput');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly query = signal('');
  protected readonly focused = signal(false);
  protected readonly active = signal(0);

  protected readonly sticker = categoryBonus;

  /** A cartela: a pronta, as escritas no mural e as escritas aqui (e a escolhida, se for nova). */
  protected readonly options = computed<Bonus[]>(() => {
    const all = new Map<string, Bonus>();
    const extra = [...this.written(), ...(this.category() ? [this.category()!] : [])].map(categoryBonus);
    for (const b of [...this.categories(), ...extra]) if (!all.has(fold(b.label))) all.set(fold(b.label), b);
    return [...all.values()];
  });

  protected readonly examples = computed(() => {
    const [a, b, c] = this.categories();
    return a && b && c ? `${a.label}, ${b.label}, ${c.label}…` : '';
  });

  protected isChosen(b: Bonus): boolean {
    const c = this.category();
    return !!c && fold(c) === fold(b.label);
  }

  /** As sugestões para o que está escrito: as que contêm o texto (as que começam com ele primeiro), sem as já amarradas. */
  protected readonly suggestions = computed<TagEntry[]>(() => {
    const q = fold(cleanTag(this.query()));
    const have = new Set(this.tags().map(fold));
    const list = this.library().filter((t) => !have.has(fold(t.label)));
    if (!q) return list.slice(0, 8);
    const starts = list.filter((t) => fold(t.label).startsWith(q));
    const inside = list.filter((t) => !fold(t.label).startsWith(q) && fold(t.label).includes(q));
    return [...starts, ...inside].slice(0, 8);
  });

  /** "Nova tag “x”", quando o escrito não é nenhuma tag que já existe. */
  protected readonly newTag = computed<string | null>(() => {
    const t = cleanTag(this.query());
    if (!t) return null;
    const known = [...this.library().map((e) => e.label), ...this.tags()];
    return known.some((k) => fold(k) === fold(t)) ? null : t;
  });

  /** A lista abre com o campo em foco e algo para mostrar. */
  protected readonly showList = computed(() => this.focused() && (this.suggestions().length > 0 || !!this.newTag()) && (!!this.query().trim() || this.pinnedLeft().length === 0));

  /** As fixas que ainda não estão nesta anotação. */
  protected readonly pinnedLeft = computed(() => {
    const have = new Set(this.tags().map(fold));
    return this.settings.pinnedTags().filter((t) => !have.has(fold(t)));
  });

  private readonly optionCount = computed(() => this.suggestions().length + (this.newTag() ? 1 : 0));

  /** Outra anotação: esquece o que foi escrito na anterior. */
  reset(): void {
    this.written.set([]);
    this.writing.set(false);
    this.open.set(false);
    this.query.set('');
    this.active.set(0);
  }

  protected setOpen(open: boolean): void {
    this.open.set(open);
    if (!open) this.writing.set(false);
  }

  /** Cola a categoria (só uma: troca a de antes) e fecha a cartela; tocar na colada tira. */
  protected pick(b: Bonus): void {
    this.category.set(this.isChosen(b) ? null : b.label);
    this.open.set(false);
  }

  protected startWriting(): void {
    this.writing.set(true);
    setTimeout(() => this.writeInput()?.nativeElement.focus());
  }

  protected onWriteKey(e: KeyboardEvent): void {
    const el = e.target as HTMLInputElement;
    if (e.key === 'Enter') {
      // Enter cola a categoria escrita, sem mandar a anotação
      e.preventDefault();
      this.commitWrite(el);
    } else if (e.key === 'Escape') {
      // Esc larga o adesivo em branco, sem fechar o editor
      e.preventDefault();
      e.stopPropagation();
      el.value = '';
      this.writing.set(false);
      setTimeout(() => this.host.nativeElement.querySelector<HTMLElement>('[data-write]')?.focus());
    }
  }

  protected commitWrite(el: HTMLInputElement): void {
    if (!this.writing()) return;
    const label = cleanCategory(el.value);
    this.writing.set(false);
    if (!label) return;
    const known = this.options().find((b) => fold(b.label) === fold(label));
    if (!known) this.written.update((l) => [...l, label]);
    this.category.set(known?.label ?? label);
    this.open.set(false);
  }

  protected onInput(v: string): void {
    // a vírgula amarra o que veio antes dela (colar "bug, ui" amarra as duas)
    if (v.includes(',')) {
      const parts = v.split(',');
      for (const p of parts.slice(0, -1)) this.add(p, false);
      v = parts.at(-1)!;
    }
    this.query.set(v);
    this.active.set(0);
  }

  protected onKey(e: KeyboardEvent): void {
    const n = this.optionCount();
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && this.showList() && n) {
      e.preventDefault();
      this.active.set((this.active() + (e.key === 'ArrowDown' ? 1 : n - 1)) % n);
    } else if (e.key === 'Enter' || (e.key === 'Tab' && this.query().trim())) {
      // Enter amarra (a sugestão marcada, ou o que está escrito), sem mandar a anotação
      if (e.key === 'Enter' || this.query().trim()) e.preventDefault();
      const sug = this.showList() ? this.suggestions()[this.active()] : undefined;
      this.add(sug?.label ?? this.query());
    } else if (e.key === 'Backspace' && !this.query() && this.tags().length) {
      this.remove(this.tags().at(-1)!);
    } else if (e.key === 'Escape' && (this.query() || this.showList())) {
      // Esc limpa o campo (e fecha as sugestões), sem fechar o editor
      e.preventDefault();
      e.stopPropagation();
      this.query.set('');
      this.focused.set(false);
    }
  }

  protected onBlur(): void {
    this.focused.set(false);
  }

  /** Amarra a tag (a grafia da que já existe, se existir). */
  add(raw: string, keepFocus = true): void {
    const tag = cleanTag(raw);
    this.query.set('');
    this.active.set(0);
    if (!tag || this.tags().length >= MAX_TAGS) return;
    if (this.tags().some((t) => fold(t) === fold(tag))) return;
    const known = this.library().find((e) => fold(e.label) === fold(tag))?.label ?? tag;
    this.tags.update((l) => [...l, known]);
    if (keepFocus) setTimeout(() => this.tagInput()?.nativeElement.focus());
  }

  protected remove(tag: string): void {
    this.tags.update((l) => l.filter((t) => t !== tag));
    setTimeout(() => this.tagInput()?.nativeElement.focus());
  }

  /** Tocar na tira (fora das etiquetas) leva ao campo. */
  protected focusInput(e: MouseEvent): void {
    if (e.target === e.currentTarget) this.tagInput()?.nativeElement.focus();
  }
}
