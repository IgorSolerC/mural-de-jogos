import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, model, signal, viewChild } from '@angular/core';
import {
  Annoyed,
  BookOpen,
  Brain,
  Bug,
  Camera,
  CameraOff,
  CircleHelp,
  Clapperboard,
  Copy,
  Eye,
  EyeOff,
  Feather,
  Globe,
  ImageOff,
  Languages,
  Layers,
  Puzzle,
  Scissors,
  Shuffle,
  Sparkles,
  Swords,
  TrendingDown,
  UserX,
  Zap,
  ChevronUp,
  Clock,
  Coins,
  Cpu,
  Drama,
  Flag,
  FlagOff,
  Fingerprint,
  Heart,
  Hourglass,
  Laugh,
  Lightbulb,
  LucideAngularModule,
  LucideIconData,
  Microscope,
  Minus,
  Music,
  Pickaxe,
  Plus,
  Repeat,
  Scale,
  Snail,
  Sticker,
  Tag,
  Users,
} from 'lucide-angular';
import {
  BONUS_KINDS,
  BONUS_KIND_LABEL,
  BONUS_MAX_LABEL,
  Bonus,
  BonusKind,
  bonusTally,
  cleanBonusLabel,
  customBonusId,
  fold,
  formatScore,
  sortBonuses,
} from '../core/review';

const BONUS_ICON: Record<string, LucideIconData> = {
  'trilha-sonora': Music,
  personagens: Drama,
  'final-memoravel': Flag,
  mundo: Lightbulb,
  rejogar: Repeat,
  multiplayer: Users,
  rir: Laugh,
  emocionou: Heart,
  centavo: Fingerprint,
  genial: Brain,
  detalhista: Microscope,
  bugs: Bug,
  'mal-otimizado': Cpu,
  loadings: Hourglass,
  grind: Pickaxe,
  microtransacoes: Coins,
  'final-decepcionante': FlagOff,
  arrastado: Snail,
  'muito-curto': Clock,
  camera: CameraOff,
  desbalanceado: Scale,
  caro: Tag,
  // livros, filmes, séries e animes: o mesmo id quer dizer a mesma coisa, e tem o mesmo desenho
  'nao-larguei': BookOpen,
  'escrita-bonita': Feather,
  reviravolta: Shuffle,
  'mundo-rico': Globe,
  'me-fez-pensar': Brain,
  reler: Repeat,
  rever: Repeat,
  previsivel: Eye,
  'personagens-rasos': UserX,
  'traducao-ruim': Languages,
  'longo-demais': Hourglass,
  confuso: CircleHelp,
  cliche: Copy,
  fotografia: Camera,
  'atuacao-marcante': Drama,
  efeitos: Sparkles,
  furos: Puzzle,
  'efeitos-ruins': ImageOff,
  'atuacao-fraca': UserX,
  maratonei: Zap,
  abertura: Clapperboard,
  enrolacao: Snail,
  caiu: TrendingDown,
  'sem-final': Scissors,
  'personagens-irritantes': Annoyed,
  'temporadas-demais': Layers,
  'animacao-linda': Sparkles,
  lutas: Swords,
  filler: Layers,
  'animacao-ruim': ImageOff,
  fanservice: EyeOff,
};

/** O desenho do adesivo: o da cartela, ou um sinal de mais / menos para os escritos à mão. */
export function bonusIcon(b: Bonus): LucideIconData {
  return BONUS_ICON[b.id] ?? (b.kind === 'favor' ? Plus : Minus);
}

/** "2 bônus a favor e 1 contra". */
export function spokenTally(list: readonly Bonus[]): string {
  const t = bonusTally(list);
  const parts: string[] = [];
  if (t.favor) parts.push(`${t.favor} bônus a favor`);
  if (t.contra) parts.push(t.favor ? `${t.contra} contra` : `${t.contra} bônus contra`);
  return parts.join(' e ');
}

/** Colados à mão: cada adesivo sai um pouco torto, sempre do mesmo jeito. */
const TILTS = [-1.4, 0.9, -0.5, 1.3, -1, 0.6];

/**
 * Adesivo de bônus: etiqueta impressa, pequena, colada torta. A favor é papel com fio de tinta;
 * contra é tinta chapada com letra de papel. Os dois lados se distinguem sem depender de cor.
 * `ghost` é o adesivo ainda na cartela: só o contorno picotado de onde ele sai.
 */
@Component({
  selector: 'app-bonus-sticker',
  imports: [LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class]': 'bonus().kind',
    '[class.ghost]': 'ghost()',
    '[class.mini]': 'size() === "mini"',
    '[style.--st-tilt]': 'tilt() + "deg"',
  },
  template: `
    <lucide-icon [img]="icon()" [size]="size() === 'mini' ? 12 : 14" [strokeWidth]="2.6" aria-hidden="true" />
    <span class="txt">{{ bonus().label }}</span>
  `,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      max-width: 100%;
      min-height: 26px;
      padding: 4px 9px 3px 7px;
      border-radius: 2px;
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.88rem;
      letter-spacing: 0.015em;
      line-height: 1;
      white-space: nowrap;
      rotate: var(--st-tilt, 0deg);
      transition:
        rotate var(--t-physical) var(--ease-physical),
        scale var(--t-physical) var(--ease-physical),
        background-color var(--t-ui) var(--ease-ui),
        color var(--t-ui) var(--ease-ui),
        box-shadow var(--t-ui) var(--ease-ui),
        outline-color var(--t-ui) var(--ease-ui);
    }
    /* a favor: papel com o fio impresso na borda, para não sumir no papel creme das fichas abertas */
    :host(.favor) {
      background: var(--paper);
      color: var(--ink);
      box-shadow:
        inset 0 0 0 1.5px rgb(21 21 21 / 0.82),
        0 1px 1.5px rgb(0 0 0 / 0.3);
    }
    /* contra: tinta chapada, a mesma do canhoto do veredito */
    :host(.contra) {
      background: var(--ink);
      color: var(--paper);
      box-shadow: 0 1px 1.5px rgb(0 0 0 / 0.35);
    }
    /* ainda na cartela: o recorte picotado, sem cola e sem sombra */
    :host(.ghost) {
      rotate: 0deg;
      background: transparent;
      color: rgb(21 21 21 / 0.74);
      box-shadow: none;
      outline: 1.5px dashed rgb(21 21 21 / 0.42);
      outline-offset: -1.5px;
    }
    :host(.mini) {
      gap: 4px;
      min-height: 22px;
      padding: 3px 7px 2px 6px;
      font-size: 0.8rem;
    }
    lucide-icon {
      display: inline-flex;
      flex: none;
      margin-top: -1px;
    }
    .txt {
      overflow: hidden;
      text-overflow: ellipsis;
      padding-bottom: 1px;
    }
  `,
})
export class BonusSticker {
  readonly bonus = input.required<Bonus>();
  readonly ghost = input(false);
  readonly size = input<'card' | 'mini'>('card');
  /** Posição do adesivo na fileira, para a tortura de cada um; null cola reto. */
  readonly index = input<number | null>(null);
  protected readonly icon = computed(() => bonusIcon(this.bonus()));
  protected readonly tilt = computed(() => {
    const i = this.index();
    return i === null ? 0 : TILTS[i % TILTS.length];
  });
}

/** A contagem curta dos bônus: "+2" em papel, "−1" em tinta, como dois adesivinhos. */
@Component({
  selector: 'app-bonus-tally',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (tally().favor) {
      <span class="t favor" aria-hidden="true">+{{ tally().favor }}</span>
    }
    @if (tally().contra) {
      <span class="t contra" aria-hidden="true">−{{ tally().contra }}</span>
    }
    <span class="sr-only">{{ spoken() }}</span>
  `,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      vertical-align: 1px;
    }
    .t {
      display: inline-block;
      padding: 3px 5px 2px;
      border-radius: 2px;
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.8rem;
      letter-spacing: 0.02em;
      line-height: 1;
      font-variant-numeric: tabular-nums;
    }
    .favor {
      background: var(--paper);
      color: var(--ink);
      box-shadow: inset 0 0 0 1.5px rgb(21 21 21 / 0.82);
    }
    .contra {
      background: var(--ink);
      color: var(--paper);
    }
  `,
})
export class BonusTally {
  readonly bonuses = input.required<readonly Bonus[]>();
  protected readonly tally = computed(() => bonusTally(this.bonuses()));
  protected readonly spoken = computed(() => spokenTally(this.bonuses()));
}

let uid = 0;

/**
 * Cartela de adesivos de bônus. Fechada, mostra o que já está colado na ficha; aberta, é a cartela
 * inteira: cada adesivo é o recorte picotado até ser colado. No fim de cada lado dá para escrever um
 * bônus novo, que volta nas próximas fichas.
 */
@Component({
  selector: 'app-bonus-picker',
  imports: [LucideAngularModule, BonusSticker, BonusTally],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'group', '[attr.aria-labelledby]': 'uid + "-t"' },
  template: `
    <div class="top">
      <p class="label" [id]="uid + '-t'">Bônus</p>
      @if (value().length) {
        <app-bonus-tally [bonuses]="value()" />
      }
      <!-- com a cartela aberta a estrela sai de vista: a média viaja junto, aqui no alto -->
      @if (open() && final() !== null) {
        <span class="ao-vivo" aria-hidden="true">
          Média <b>{{ fmt(final()) }}</b>
          @if (shift()) {
            <span class="delta">({{ shift() }})</span>
          }
        </span>
      }
      <button
        type="button"
        class="toggle"
        [attr.aria-expanded]="open()"
        [attr.aria-controls]="uid + '-cartela'"
        (click)="setOpen(!open())"
      >
        <lucide-icon [img]="open() ? CloseIcon : StickerIcon" [size]="17" [strokeWidth]="2.6" aria-hidden="true" />
        {{ open() ? 'Fechar cartela' : value().length ? 'Mexer nos bônus' : 'Colar bônus' }}
      </button>
    </div>

    @if (open()) {
      <div class="cartela" [id]="uid + '-cartela'">
        @for (k of kinds; track k) {
          <div class="lado" role="group" [attr.aria-labelledby]="uid + '-' + k">
            <p class="lado-label" [id]="uid + '-' + k">
              <span>{{ kindLabels[k] }}</span>
              <span class="lado-conta">até {{ k === 'favor' ? '+0,25' : '−0,25' }} cada</span>
            </p>
            <div class="slots">
              @for (b of options()[k]; track b.id) {
                <button
                  type="button"
                  class="slot"
                  [class.favor]="b.kind === 'favor'"
                  [attr.aria-pressed]="chosen().has(b.id)"
                  (click)="toggle(b)"
                >
                  <app-bonus-sticker [bonus]="b" [ghost]="!chosen().has(b.id)" [index]="chosen().has(b.id) ? $index : null" />
                </button>
              }
              @if (writing() === k) {
                <input
                  #write
                  class="write"
                  [class]="k"
                  type="text"
                  autocomplete="off"
                  enterkeyhint="done"
                  [maxLength]="maxLabel"
                  placeholder="Nome do bônus"
                  [attr.aria-label]="'Novo bônus ' + kindLabels[k].toLowerCase() + '. Enter cola na ficha.'"
                  (keydown)="onKey($event, k)"
                  (blur)="commit(k, $any($event.target))"
                />
              } @else {
                <button
                  type="button"
                  class="slot write-btn"
                  [attr.data-write]="k"
                  [attr.aria-label]="'Escrever outro bônus ' + kindLabels[k].toLowerCase()"
                  (click)="startWriting(k)"
                >
                  <lucide-icon [img]="PlusIcon" [size]="15" [strokeWidth]="2.8" aria-hidden="true" />
                  Escrever outro
                </button>
              }
            </div>
          </div>
        }
      </div>
    } @else if (value().length) {
      <ul class="colados" aria-label="Bônus colados na ficha">
        @for (b of sorted(); track b.id; let i = $index) {
          <li>
            <app-bonus-sticker [bonus]="b" [index]="i" />
            <span class="sr-only">({{ kindLabels[b.kind].toLowerCase() }})</span>
          </li>
        }
      </ul>
    } @else {
      <p class="hint">{{ examples() }} Cada um mexe na média como uma nota a mais (10 a favor, 0 contra), no máximo um quarto de ponto.</p>
    }
  `,
  styles: `
    :host {
      display: block;
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
    /* o mesmo risco de pincel dos outros atalhos da ficha ("Trocar jogo", "Usar hoje") */
    /* a média ao vivo, impressa como a conta ao lado da estrela */
    .ao-vivo {
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.84rem;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--ink-2);
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    .ao-vivo b {
      color: var(--ink);
      font-style: italic;
      font-size: 1.08rem;
      letter-spacing: -0.01em;
    }
    .ao-vivo .delta {
      margin-left: 5px;
      color: var(--ink);
      font-size: 0.92rem;
      letter-spacing: 0.01em;
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

    .colados {
      display: flex;
      flex-wrap: wrap;
      gap: 8px 7px;
      margin: 6px 0 0;
      padding: 0;
      list-style: none;
    }
    .colados li {
      display: flex;
      max-width: 100%;
    }
    .hint {
      margin-top: 2px;
      max-width: 52ch;
      font-size: 0.92rem;
      color: var(--ink-2);
    }

    /* A cartela: uma folha de adesivos mais branca que a ficha, pousada em cima dela */
    .cartela {
      display: grid;
      gap: 16px;
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
    .lado-label {
      display: flex;
      align-items: baseline;
      gap: 8px;
      margin-bottom: 6px;
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.9rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .lado-conta {
      font-weight: 600;
      letter-spacing: 0.03em;
      text-transform: none;
      color: var(--ink-2);
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
    }
    .slot app-bonus-sticker {
      min-width: 0;
    }
    /* na cartela o recorte fica mais apagado, para o colado se destacar dele */
    .slot app-bonus-sticker.ghost {
      color: rgb(21 21 21 / 0.62);
      outline-color: rgb(21 21 21 / 0.34);
    }
    .slot:hover app-bonus-sticker.ghost {
      background: rgb(21 21 21 / 0.06);
      color: var(--ink);
      outline-color: rgb(21 21 21 / 0.62);
    }
    /* colado: sai da cartela um pouco maior e torto, como adesivo que acabou de grudar */
    .slot[aria-pressed='true'] app-bonus-sticker {
      scale: 1.04;
      box-shadow: 0 2px 3px rgb(0 0 0 / 0.3);
    }
    /* o a favor colado ganha o fio inteiro: papel sobre papel precisa da borda para se ver colado */
    .slot.favor[aria-pressed='true'] app-bonus-sticker {
      box-shadow:
        inset 0 0 0 2px var(--ink),
        0 2px 3px rgb(0 0 0 / 0.3);
    }
    /* dedo não é cursor: no toque, alvos maiores e mais folga entre os adesivos */
    @media (pointer: coarse) {
      .slots {
        gap: 6px;
      }
      .slot {
        min-height: 40px;
      }
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
      letter-spacing: 0.015em;
      color: var(--ink);
      text-decoration: underline 1.5px;
      text-underline-offset: 4px;
      transition: background-color var(--t-ui) var(--ease-ui);
    }
    .write-btn:hover {
      background: rgb(21 21 21 / 0.06);
    }
    .write-btn lucide-icon {
      display: inline-flex;
    }
    /* o adesivo em branco, sendo escrito */
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
      letter-spacing: 0.015em;
      outline: none;
      box-shadow:
        inset 0 0 0 2px var(--ink),
        0 0 0 3px rgb(21 21 21 / 0.12);
    }
    .write.contra {
      background: var(--ink);
      color: var(--paper);
      caret-color: var(--hi);
      box-shadow: 0 0 0 3px rgb(21 21 21 / 0.18);
    }
    .write::placeholder {
      color: rgb(21 21 21 / 0.5);
      font-weight: 600;
    }
    .write.contra::placeholder {
      color: rgb(247 244 236 / 0.62);
    }
    @media (max-width: 480px) {
      .cartela {
        padding: 12px 10px 10px;
      }
    }
  `,
})
export class BonusPicker {
  readonly value = model<Bonus[]>([]);
  /** A cartela pronta do mural. */
  readonly catalog = input.required<readonly Bonus[]>();
  /** Os bônus que a pessoa já escreveu em outras fichas do mural. */
  readonly library = input<readonly Bonus[]>([]);
  /** A média com os bônus e quanto eles mexeram, para a cartela aberta mostrar ao vivo. */
  readonly final = input<number | null>(null);
  readonly shift = input('');
  protected readonly fmt = formatScore;

  protected readonly StickerIcon = Sticker;
  protected readonly CloseIcon = ChevronUp;
  protected readonly PlusIcon = Plus;
  protected readonly kinds = BONUS_KINDS;
  protected readonly kindLabels = BONUS_KIND_LABEL;
  protected readonly maxLabel = BONUS_MAX_LABEL;
  protected readonly uid = `bonus-${++uid}`;

  /** Sempre começa fechada: a cartela inteira só aparece para quem vai colar. */
  protected readonly open = signal(false);
  /** Qual lado está com o adesivo em branco aberto para escrever. */
  protected readonly writing = signal<BonusKind | null>(null);
  /** Escritos nesta ficha: continuam na cartela mesmo se forem descolados antes de salvar. */
  private readonly written = signal<Bonus[]>([]);
  private readonly writeInput = viewChild<ElementRef<HTMLInputElement>>('write');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly chosen = computed(() => new Set(this.value().map((b) => b.id)));
  protected readonly sorted = computed(() => sortBonuses(this.value()));

  /** A cartela pronta primeiro, sempre no mesmo lugar; os escritos à mão depois. */
  protected readonly options = computed<Record<BonusKind, Bonus[]>>(() => {
    const all = new Map<string, Bonus>();
    for (const b of [...this.catalog(), ...this.library(), ...this.written(), ...this.value()]) {
      if (!all.has(b.id)) all.set(b.id, b);
    }
    const list = [...all.values()];
    return { favor: list.filter((b) => b.kind === 'favor'), contra: list.filter((b) => b.kind === 'contra') };
  });

  /** "Trilha sonora incrível, muitos bugs…": o primeiro de cada lado da cartela. */
  protected readonly examples = computed(() => {
    const favor = this.catalog().find((b) => b.kind === 'favor')?.label ?? '';
    const contra = this.catalog().find((b) => b.kind === 'contra')?.label ?? '';
    return `${favor}, ${contra.charAt(0).toLowerCase()}${contra.slice(1)}…`;
  });

  /** Ficha nova ou outra ficha: esquece o que foi escrito na anterior. */
  reset(): void {
    this.written.set([]);
    this.writing.set(null);
    this.open.set(false);
  }

  protected setOpen(open: boolean): void {
    this.open.set(open);
    if (!open) this.writing.set(null);
  }

  protected toggle(b: Bonus): void {
    this.value.update((list) => (list.some((x) => x.id === b.id) ? list.filter((x) => x.id !== b.id) : [...list, b]));
  }

  protected startWriting(kind: BonusKind): void {
    this.writing.set(kind);
    setTimeout(() => this.writeInput()?.nativeElement.focus());
  }

  protected onKey(e: KeyboardEvent, kind: BonusKind): void {
    const el = e.target as HTMLInputElement;
    if (e.key === 'Enter') {
      // Enter cola o adesivo e deixa outro em branco, sem mandar a ficha
      e.preventDefault();
      this.add(kind, el.value);
      el.value = '';
    } else if (e.key === 'Escape') {
      // Esc larga o adesivo em branco, sem fechar a ficha inteira
      e.preventDefault();
      e.stopPropagation();
      el.value = '';
      this.writing.set(null);
      setTimeout(() => this.host.nativeElement.querySelector<HTMLElement>(`[data-write="${kind}"]`)?.focus());
    }
  }

  protected commit(kind: BonusKind, el: HTMLInputElement): void {
    if (this.writing() !== kind) return;
    this.add(kind, el.value);
    this.writing.set(null);
  }

  private add(kind: BonusKind, raw: string): void {
    const label = cleanBonusLabel(raw);
    if (!label) return;
    const id = customBonusId(label, kind);
    // Já existe desse lado (na cartela ou escrito antes): só cola o que existe. Do outro lado não
    // vale: "Muitos bugs" escrito em A favor não pode colar o contra e baixar a média sem aviso.
    const same = this.options()[kind].find((b) => b.id === id || fold(b.label) === fold(label));
    if (same) {
      if (!this.chosen().has(same.id)) this.value.update((list) => [...list, same]);
      return;
    }
    const b: Bonus = { id, label, kind };
    this.written.update((list) => [...list, b]);
    this.value.update((list) => [...list, b]);
  }
}
