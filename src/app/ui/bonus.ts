import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, inject, input, model, signal, viewChild } from '@angular/core';
import { LucideIconData } from 'lucide-angular';
import { BackdropClose } from './backdrop-close';
import { ICON, IconModule } from './icons';
import { Pin } from './pin';
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
import { scramble } from '../core/spoiler';
import { Rabisco } from './rabisco';

const BONUS_ICON: Record<string, LucideIconData> = {
  'trilha-sonora': ICON.musica,
  personagens: ICON.drama,
  'final-memoravel': ICON.bandeira,
  mundo: ICON.lampada,
  rejogar: ICON.repetir,
  multiplayer: ICON.pessoas,
  rir: ICON.risada,
  emocionou: ICON.coracao,
  centavo: ICON.digital,
  genial: ICON.cerebro,
  detalhista: ICON.microscopio,
  'melhor-do-genero': ICON.coroa,
  'combate-fluido': ICON.espadas,
  'me-marcou': ICON.marcador,
  'pausar-pintura': ICON.paleta,
  worldbuilding: ICON.mundo,
  classico: ICON.predio,
  acessibilidade: ICON.acessibilidade,
  bugs: ICON.inseto,
  'mal-otimizado': ICON.chip,
  loadings: ICON.ampulheta,
  grind: ICON.picareta,
  microtransacoes: ICON.moedas,
  'final-decepcionante': ICON.semBandeira,
  arrastado: ICON.lesma,
  'muito-curto': ICON.relogio,
  camera: ICON.semCamera,
  desbalanceado: ICON.balanca,
  caro: ICON.etiqueta,
  repetitivo: ICON.copiar,
  estressante: ICON.aborrecido,
  simplista: ICON.desmarcado,
  'historia-cliche': ICON.livrosRepetidos,
  // O mesmo id em diferentes categorias usa o mesmo desenho.
  'nao-larguei': ICON.livros,
  'escrita-bonita': ICON.pena,
  reviravolta: ICON.embaralhar,
  'mundo-rico': ICON.mundo,
  // "Genial" já é o cérebro nos jogos: refletir é o cérebro com a engrenagem girando
  'me-fez-pensar': ICON.cerebroPensando,
  reler: ICON.repetir,
  rever: ICON.repetir,
  previsivel: ICON.ver,
  'personagens-rasos': ICON.removerPessoa,
  'traducao-ruim': ICON.idiomas,
  'longo-demais': ICON.ampulheta,
  confuso: ICON.ajuda,
  cliche: ICON.copiar,
  fotografia: ICON.camera,
  'atuacao-marcante': ICON.drama,
  efeitos: ICON.brilho,
  furos: ICON.quebraCabeca,
  'efeitos-ruins': ICON.semImagem,
  'atuacao-fraca': ICON.removerPessoa,
  maratonei: ICON.raio,
  abertura: ICON.video,
  enrolacao: ICON.lesma,
  caiu: ICON.queda,
  'sem-final': ICON.tesoura,
  'personagens-irritantes': ICON.aborrecido,
  'temporadas-demais': ICON.camadas,
  'animacao-linda': ICON.brilho,
  lutas: ICON.espadas,
  filler: ICON.camadas,
  'animacao-ruim': ICON.semImagem,
  fanservice: ICON.esconder,
  // os equivalentes dos jogos nos outros murais
  'leitura-fluida': ICON.vento,
  frases: ICON.marcaTexto,
  'bom-de-conversar': ICON.conversa,
  revisao: ICON.ortografia,
  enchecao: ICON.camadas,
  'caca-niquel': ICON.moedas,
  'ritmo-irregular': ICON.ritmo,
  'cenas-de-acao': ICON.espadas,
  'com-amigos': ICON.pessoas,
  continuidade: ICON.inseto,
  montagem: ICON.filmes,
  dublagem: ICON.semMicrofone,
  propaganda: ICON.megafone,
  // a cartela das músicas
  'nao-sai-da-cabeca': ICON.infinito,
  arrepia: ICON.raio,
  refrao: ICON.repetir,
  'letra-marcante': ICON.aspas,
  'vocal-impecavel': ICON.vocal,
  solo: ICON.guitarra,
  producao: ICON.ajustar,
  'cantar-junto': ICON.microfone,
  danca: ICON.festa,
  'sem-pular': ICON.listaDeMusicas,
  'ao-vivo': ICON.caixaDeSom,
  'boa-pra-estrada': ICON.carro,
  feat: ICON.apertoDeMao,
  'capa-linda': ICON.imagem,
  nostalgia: ICON.voltarFita,
  'trilha-da-vida': ICON.fones,
  atemporal: ICON.joia,
  'a-frente-do-tempo': ICON.foguete,
  enjoa: ICON.bateriaFraca,
  'letra-fraca': ICON.polegarParaBaixo,
  'refrao-chato': ICON.aborrecido,
  autotune: ICON.robo,
  mixagem: ICON.ondas,
  generico: ICON.copiar,
  copia: ICON.livrosRepetidos,
  'intro-longa': ICON.cronometro,
  hype: ICON.megafone,
  datado: ICON.semData,
  cansa: ICON.semOuvir,
  // as categorias prontas das anotações
  compras: ICON.carrinho,
  'a-fazer': ICON.tarefas,
  ideias: ICON.lampada,
  lembretes: ICON.sino,
  estudos: ICON.capelo,
  trabalho: ICON.maleta,
  receitas: ICON.chapeu,
  metas: ICON.alvo,
  viagem: ICON.aviao,
  diario: ICON.praDepois,
};

/** O desenho do adesivo: o da cartela, ou um sinal de mais / menos para os escritos à mão (a pasta, na categoria). */
export function bonusIcon(b: Bonus): LucideIconData {
  // a categoria de anotação escrita à mão: uma pasta (ver core/note-labels.ts)
  if (b.id.startsWith('cat-')) return ICON.pasta;
  return BONUS_ICON[b.id] ?? (b.kind === 'favor' ? ICON.adicionar : ICON.tirar);
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
 * `masked` é o modo sem spoilers: meio papel, meio tinta, com o nome embaralhado — não dá para
 * saber se é a favor ou contra.
 */
@Component({
  selector: 'app-bonus-sticker',
  imports: [IconModule, Rabisco],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class]': 'masked() ? "misterio" : bonus().kind',
    '[class.ghost]': 'ghost()',
    '[class.mini]': 'size() === "mini"',
    '[style.--st-tilt]': 'tilt() + "deg"',
  },
  template: `
    <lucide-icon [img]="icon()" [size]="size() === 'mini' ? 12 : 14" aria-hidden="true" />
    @if (masked()) {
      <span class="txt"><app-rabisco [text]="label()" /></span>
      <span class="sr-only">Bônus escondido</span>
    } @else {
      <span class="txt">{{ bonus().label }}</span>
    }
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
    /* sem spoilers: metade papel, metade tinta. A letra branca em "diferença" fica escura no papel e
       clara na tinta, então o nome embaralhado se lê dos dois lados do corte. */
    :host(.misterio) {
      isolation: isolate;
      background: linear-gradient(100deg, var(--paper) 50%, var(--ink) 50%);
      color: #fff;
      box-shadow:
        inset 0 0 0 1.5px rgb(21 21 21 / 0.82),
        0 1px 1.5px rgb(0 0 0 / 0.33);
    }
    :host(.misterio) > :not(.sr-only) {
      mix-blend-mode: difference;
    }
    /* no adesivo o rabisco vai cheio: a "diferença" já o clareia na metade de tinta */
    :host(.misterio) .txt {
      --rabisco-forca: 1;
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
  /** Sem spoilers: meio a meio, com o nome embaralhado (ver Settings.noSpoilers). */
  readonly masked = input(false);
  /** Embaralha diferente em cada ficha: o mesmo bônus não se repete igual pelo mural. */
  readonly seed = input('');
  /** Outro desenho no lugar do da cartela (a categoria de anotação com desenho escolhido). */
  readonly glyph = input<LucideIconData | null>(null);
  protected readonly icon = computed(() => (this.masked() ? ICON.ajuda : (this.glyph() ?? bonusIcon(this.bonus()))));
  protected readonly label = computed(() =>
    this.masked() ? scramble(this.bonus().label, `${this.seed()}:${this.bonus().id}`) : this.bonus().label,
  );
  protected readonly tilt = computed(() => {
    const i = this.index();
    return i === null ? 0 : TILTS[i % TILTS.length];
  });
}

/** A contagem curta dos bônus: "+2" em papel, "−1" em tinta, como dois adesivinhos. Sem spoilers, um só, meio a meio. */
@Component({
  selector: 'app-bonus-tally',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (masked()) {
      <span class="t misterio" aria-hidden="true"><span>?{{ bonuses().length }}</span></span>
      <span class="sr-only">{{ bonuses().length }} bônus</span>
    } @else {
    @if (tally().favor) {
      <span class="t favor" aria-hidden="true">+{{ tally().favor }}</span>
    }
    @if (tally().contra) {
      <span class="t contra" aria-hidden="true">−{{ tally().contra }}</span>
    }
    <span class="sr-only">{{ spoken() }}</span>
    }
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
    .misterio {
      isolation: isolate;
      background: linear-gradient(100deg, var(--paper) 50%, var(--ink) 50%);
      color: #fff;
      box-shadow: inset 0 0 0 1.5px rgb(21 21 21 / 0.82);
    }
    .misterio span {
      mix-blend-mode: difference;
    }
  `,
})
export class BonusTally {
  readonly bonuses = input.required<readonly Bonus[]>();
  /** Sem spoilers: só quantos são, sem dizer de que lado. */
  readonly masked = input(false);
  protected readonly tally = computed(() => bonusTally(this.bonuses()));
  protected readonly spoken = computed(() => spokenTally(this.bonuses()));
}

let uid = 0;

/**
 * Os bônus da ficha, no editor. Na ficha, só o que está colado (ou uma linha dizendo a regra) e o botão
 * "Colar bônus". A escolha abre por cima, numa ficha de prós e contras: as duas colunas lado a lado (A favor,
 * Contra), cada bônus numa linha só, em ordem alfabética, com o adesivo (o recorte picotado ou colado), a
 * caixinha de marcar e em quantas fichas do mural ele já foi usado; a busca no alto filtra as duas e, se o
 * escrito não for bônus nenhum, oferece colar em cada lado; no fim de cada coluna, "Escrever outro". A média
 * ao vivo fica no cabeçalho. No celular, as colunas viram duas abas. Cada toque cola ou descola na hora.
 */
@Component({
  selector: 'app-bonus-picker',
  imports: [BackdropClose, IconModule, Pin, BonusSticker, BonusTally],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'group', '[attr.aria-labelledby]': 'uid + "-t"' },
  template: `
    <div class="top">
      <p class="label" [id]="uid + '-t'">Bônus</p>
      @if (value().length) {
        <app-bonus-tally [bonuses]="value()" />
      }
      <button #trigger type="button" class="toggle" aria-haspopup="dialog" (click)="openSheet()">
        <lucide-icon [img]="StickerIcon" [size]="17" aria-hidden="true" />
        {{ value().length ? 'Mexer nos bônus' : 'Colar bônus' }}
      </button>
    </div>

    @if (value().length) {
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

    @if (open()) {
      <dialog
        #dialog
        class="sheet folha-bonus"
        [attr.aria-labelledby]="uid + '-titulo'"
        (close)="closed()"
        (backdropClose)="close()"
        (keydown.escape)="$event.stopPropagation()"
      >
        <div class="ficha cartolina" style="--stock: var(--stock-branco)" data-cor="branco">
          <app-pin class="pin" />
          <header class="head">
            <div class="titulos">
              <h2 [id]="uid + '-titulo'">Bônus{{ heading() ? ' de ' + heading() : '' }}</h2>
              <p class="sub">
                @if (final() !== null) {
                  <span class="media">Média <b>{{ fmt(final()) }}</b>@if (shift()) {<span class="delta"> ({{ shift() }} dos bônus)</span>}</span>
                }
                <span>{{ countLine() }}</span>
              </p>
            </div>
            <button type="button" class="icon-btn fecha" aria-label="Fechar" (click)="close()">
              <lucide-icon [img]="CloseIcon" [size]="22" aria-hidden="true" />
            </button>
          </header>

          <div class="busca-linha">
            <label class="busca">
              <lucide-icon class="lupa" [img]="SearchIcon" [size]="18" aria-hidden="true" />
              <input
                #search
                type="search"
                autocomplete="off"
                enterkeyhint="search"
                [maxLength]="maxLabel"
                placeholder="Procurar: bugs, trilha, final…"
                aria-label="Procurar bônus"
                [value]="query()"
                (input)="query.set($any($event.target).value)"
                (keydown.enter)="$event.preventDefault(); enter()"
                (keydown.escape)="clear($event)"
              />
            </label>
            <!-- no celular, uma coluna por vez -->
            <div class="abas" role="tablist" aria-label="Lado">
              @for (k of kinds; track k) {
                <button type="button" role="tab" class="aba" [attr.aria-selected]="side() === k" [attr.aria-controls]="uid + '-col-' + k" (click)="side.set(k)">
                  {{ kindLabels[k] }}
                  @if (count()[k]) {
                    <span class="aba-n">{{ count()[k] }}</span>
                  }
                </button>
              }
            </div>
          </div>

          <div class="body">
            <div class="colunas">
              @for (k of kinds; track k) {
                <section class="coluna" [class]="k" [class.aberta]="side() === k" [id]="uid + '-col-' + k" [attr.aria-labelledby]="uid + '-' + k">
                  <h3 class="coluna-titulo" [id]="uid + '-' + k">
                    <span>{{ kindLabels[k] }}</span>
                    <span class="regra">até {{ k === 'favor' ? '+0,25' : '−0,25' }} cada</span>
                  </h3>
                  <ul class="linhas">
                    @for (b of rows()[k]; track b.id) {
                      <li>
                        <button type="button" class="linha" [attr.aria-pressed]="chosen().has(b.id)" (click)="toggle(b)">
                          <span class="caixa" aria-hidden="true">
                            @if (chosen().has(b.id)) {
                              <lucide-icon [img]="CheckIcon" [size]="14" />
                            }
                          </span>
                          <app-bonus-sticker [bonus]="b" [ghost]="!chosen().has(b.id)" />
                          @if (use().get(b.id); as n) {
                            <span class="uso">{{ n }} {{ n === 1 ? 'ficha' : 'fichas' }}</span>
                          }
                        </button>
                      </li>
                    }
                    @if (fresh()[k]; as f) {
                      <li>
                        <button type="button" class="linha escrever" (click)="create(k, f)">
                          <lucide-icon [img]="PlusIcon" [size]="16" aria-hidden="true" />
                          <span>Colar “{{ f }}” {{ k === 'favor' ? 'a favor' : 'contra' }}</span>
                        </button>
                      </li>
                    } @else if (!query().trim()) {
                      <li>
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
                          <button type="button" class="linha escrever" [attr.data-write]="k" (click)="startWriting(k)">
                            <lucide-icon [img]="PlusIcon" [size]="16" aria-hidden="true" />
                            <span>Escrever outro</span>
                          </button>
                        }
                      </li>
                    } @else if (!rows()[k].length) {
                      <li class="nada">Nenhum {{ k === 'favor' ? 'a favor' : 'contra' }} com “{{ query().trim() }}”.</li>
                    }
                  </ul>
                </section>
              }
            </div>
          </div>

          <footer class="foot">
            <p class="pe-dica">Cada bônus conta como mais uma nota na média e mexe nela no máximo um quarto de ponto.</p>
            <div class="actions">
              <button type="button" class="btn-ink" (click)="close()">Pronto</button>
            </div>
          </footer>
        </div>
      </dialog>
    }
  `,
  styleUrl: './bonus-picker.scss',
})
export class BonusPicker {
  readonly value = model<Bonus[]>([]);
  /** A cartela pronta do mural. */
  readonly catalog = input.required<readonly Bonus[]>();
  /** Os bônus que a pessoa já escreveu em outras fichas do mural. */
  readonly library = input<readonly Bonus[]>([]);
  /** Em quantas fichas deste mural cada bônus está (pelo id). */
  readonly use = input<ReadonlyMap<string, number>>(new Map());
  /** O nome do jogo (do livro, do filme…), para o título da ficha dos bônus. */
  readonly heading = input('');
  /** A média com os bônus e quanto eles mexeram, ao vivo no cabeçalho. */
  readonly final = input<number | null>(null);
  readonly shift = input('');
  protected readonly fmt = formatScore;

  protected readonly StickerIcon = ICON.adesivo;
  protected readonly CloseIcon = ICON.fechar;
  protected readonly SearchIcon = ICON.buscar;
  protected readonly CheckIcon = ICON.pronto;
  protected readonly PlusIcon = ICON.adicionar;
  protected readonly kinds = BONUS_KINDS;
  protected readonly kindLabels = BONUS_KIND_LABEL;
  protected readonly maxLabel = BONUS_MAX_LABEL;
  protected readonly uid = `bonus-${++uid}`;

  protected readonly open = signal(false);
  protected readonly query = signal('');
  /** A coluna à vista no celular. */
  protected readonly side = signal<BonusKind>('favor');
  /** Qual lado está com o adesivo em branco aberto para escrever. */
  protected readonly writing = signal<BonusKind | null>(null);
  /** Escritos nesta ficha: continuam na lista mesmo se forem descolados antes de salvar. */
  private readonly written = signal<Bonus[]>([]);
  private readonly writeInput = viewChild<ElementRef<HTMLInputElement>>('write');
  private readonly search = viewChild<ElementRef<HTMLInputElement>>('search');
  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dialog');
  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  protected readonly chosen = computed(() => new Set(this.value().map((b) => b.id)));
  protected readonly sorted = computed(() => sortBonuses(this.value()));
  protected readonly count = computed(() => ({
    favor: this.value().filter((b) => b.kind === 'favor').length,
    contra: this.value().filter((b) => b.kind === 'contra').length,
  }));
  /** "2 a favor e 1 contra colados" / "Nenhum colado ainda". */
  protected readonly countLine = computed(() => {
    const { favor, contra } = this.count();
    if (!favor && !contra) return 'Nenhum colado ainda';
    const parts = [favor ? `${favor} a favor` : '', contra ? `${contra} contra` : ''].filter(Boolean);
    return `${parts.join(' e ')} ${favor + contra === 1 ? 'colado' : 'colados'}`;
  });

  /** Todos os de cada lado: a cartela pronta, os escritos em outras fichas e nesta, e os colados. */
  protected readonly options = computed<Record<BonusKind, Bonus[]>>(() => {
    const all = new Map<string, Bonus>();
    for (const b of [...this.catalog(), ...this.library(), ...this.written(), ...this.value()]) {
      if (!all.has(b.id)) all.set(b.id, b);
    }
    const list = [...all.values()];
    return { favor: list.filter((b) => b.kind === 'favor'), contra: list.filter((b) => b.kind === 'contra') };
  });

  /** As linhas de cada coluna, em ordem alfabética; procurando, só as que batem (cada palavra começa uma do nome). */
  protected readonly rows = computed<Record<BonusKind, Bonus[]>>(() => {
    const words = fold(this.query().trim()).split(/\s+/).filter(Boolean);
    const out = {} as Record<BonusKind, Bonus[]>;
    for (const k of BONUS_KINDS) {
      const list = [...this.options()[k]].sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
      out[k] = words.length
        ? list.filter((b) => {
            const keys = fold(b.label).split(/[\s-]+/);
            return words.every((w) => keys.some((key) => key.startsWith(w)));
          })
        : list;
    }
    return out;
  });

  /** O escrito, em cada lado onde ele ainda não é bônus nenhum: "Colar 'Chato no começo' contra". */
  protected readonly fresh = computed<Record<BonusKind, string | null>>(() => {
    const label = cleanBonusLabel(this.query());
    const out: Record<BonusKind, string | null> = { favor: null, contra: null };
    if (!label) return out;
    // o escrito que já é um bônus, de qualquer lado, não vira outro: colar "Muitos bugs" a favor quase sempre
    // é engano, e a linha que existe já está à vista na coluna dela
    const exists = BONUS_KINDS.some((k) => this.options()[k].some((b) => b.id === customBonusId(label, k) || fold(b.label) === fold(label)));
    if (exists) return out;
    for (const k of BONUS_KINDS) out[k] = label;
    return out;
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
    this.close();
  }

  /** O botão da ficha: a folha dos bônus entra na página e, desenhada, vai para a camada de cima. */
  protected openSheet(): void {
    this.open.set(true);
    afterNextRender(
      {
        write: () => {
          const el = this.dialog()?.nativeElement;
          if (!el || el.open) return;
          el.showModal();
          // no mouse o foco vai para a busca; no dedo fica no X do cabeçalho (o teclado não cobre a lista)
          if (matchMedia('(pointer: fine)').matches) this.search()?.nativeElement.focus();
        },
      },
      { injector: this.injector },
    );
  }

  close(): void {
    const el = this.dialog()?.nativeElement;
    if (el?.open) el.close();
    // o evento "close" do <dialog> só chega numa tarefa depois: a folha sai já
    this.closed();
  }

  /** Fechou (o Pronto, o X, o Esc ou o fundo): a busca e o adesivo em branco voltam ao começo. Uma vez só. */
  protected closed(): void {
    if (!this.open()) return;
    this.open.set(false);
    this.query.set('');
    this.writing.set(null);
    this.trigger().nativeElement.focus();
  }

  protected toggle(b: Bonus): void {
    this.value.update((list) => (list.some((x) => x.id === b.id) ? list.filter((x) => x.id !== b.id) : [...list, b]));
  }

  /** O "Colar" da busca: cola o escrito naquele lado, e a busca volta vazia para o próximo. */
  protected create(kind: BonusKind, label: string): void {
    this.add(kind, label);
    this.query.set('');
    this.side.set(kind);
    this.search()?.nativeElement.focus();
  }

  /**
   * Enter na busca (a folha mora dentro do formulário do editor: sem isto, o Enter salvaria a ficha): cola
   * o primeiro que bate, na coluna à vista no celular (no computador, A favor antes de Contra); o escrito
   * que não é bônus nenhum não cola sem a pessoa dizer o lado.
   */
  protected enter(): void {
    if (!this.query().trim()) return;
    const order: BonusKind[] = this.side() === 'contra' ? ['contra', 'favor'] : ['favor', 'contra'];
    const first = order.map((k) => this.rows()[k][0]).find((b) => !!b);
    if (!first) return;
    if (!this.chosen().has(first.id)) this.toggle(first);
    this.query.set('');
  }

  /** Esc com algo escrito limpa a busca (e não fecha a folha); vazia, o Esc fecha. */
  protected clear(e: Event): void {
    if (!this.query()) return;
    e.preventDefault();
    e.stopPropagation();
    this.query.set('');
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
      // Esc larga o adesivo em branco, sem fechar a folha
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
