import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { CloudAccount } from '../core/cloud-account';
import { ImageStore } from '../core/image-store';
import { ImageSync } from '../core/image-sync';
import { localImageId } from '../core/images';
import { LightStock, Stock, isDarkStock } from '../core/review';
import { CardFace, CardLook, LEVEL_LABEL, deckLook } from '../core/study';
import { FitTitle } from './fit-title';
import { ICON_CHOICE, IconModule } from './icons';
import { IconChoice } from '../core/icon-choices';

/**
 * A folha da Klee One (src/klee-one.scss, fora da página): o <link> entra na primeira carta que aparece,
 * e o navegador só baixa as fatias da letra dos caracteres japoneses e chineses que estiverem na tela.
 */
function loadKleeOne(): void {
  if (typeof document === 'undefined' || document.getElementById('folha-klee-one')) return;
  const link = document.createElement('link');
  link.id = 'folha-klee-one';
  link.rel = 'stylesheet';
  link.href = 'klee-one.css';
  document.head.append(link);
}

/** O baralho como a carta precisa: o nome, a cor (a argola, a fita), o ícone e o desenho. */
export interface CardDeck {
  name: string;
  color: LightStock;
  icon: IconChoice | null;
  look?: CardLook;
}

/** Os ids dos arcos do carimbo do Selo (um `<textPath>` por carta). */
let arcs = 0;

/**
 * A frente de uma carta de estudo (PLANO-ESTUDOS.md, 6.1), em pé, na proporção das cartas de baralho, no
 * desenho que o baralho escolheu (`look`, a Clássica sem escolha; pedido do usuário: "poder escolher por
 * baralho qual vai ser o estilo do flashcard"). Cinco releituras da carta de baralho (Clássica, Faixa de cor,
 * Cartolina inteira, Orelha, Baralho antigo) e cinco objetos de papelaria (Ficha de argola, Selo, Polaroid,
 * Ingresso, Ficha da biblioteca). Em todos: o título com a letra do tamanho do espaço que sobra
 * (ui/fit-title.ts), escrito à mão (o alfabeto na Permanent Marker, o japonês e o chinês na Klee One), o
 * subtítulo inteiro até quatro linhas e a cor da cartolina da anotação.
 *
 * `face` é o progresso (o nível, quando volta, o carimbo, as respostas e o número): na parede e na pilha. Sem
 * ele (a mesa de estudo, a aba Flashcard), cada desenho fica sem o que dependeria dele.
 */
@Component({
  selector: 'app-study-card',
  imports: [FitTitle, IconModule, NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-template #titulo>
      <div class="titulo-area" [appFitTitle]="fitKey()" [appFitTitleMax]="0.92">
        <p class="titulo" [class.frase]="phrase()" lang="und">{{ title() }}</p>
      </div>
    </ng-template>
    <ng-template #foto>
      @if (src(); as s) {
        <div class="foto"><img class="imagem" [src]="s" alt="" loading="lazy" referrerpolicy="no-referrer" (error)="broken.set(true)" /></div>
      }
    </ng-template>
    <ng-template #sub>
      @if (subtitle(); as s) {
        <p class="subtitulo">{{ s }}</p>
      }
    </ng-template>
    <ng-template #icone>
      @if (deck()?.icon; as i) {
        <lucide-icon class="ic" [img]="iconOf[i]" [size]="12" aria-hidden="true" />
      }
    </ng-template>

    <div
      class="carta"
      [class]="'carta look-' + shown()"
      [class.escura]="dark()"
      [class.sepia]="neutral()"
      [attr.data-nivel]="face()?.level ?? null"
      [style.--c]="'var(--stock-' + (stock() ?? 'amarelo') + ')'"
      [style.--fio]="fio()"
      [style.--baralho]="'var(--stock-' + (deck()?.color ?? 'vermelho') + ')'"
    >
      @switch (shown()) {
        @case ('faixa') {
          <div class="face">
            <div class="faixa">
              <ng-container *ngTemplateOutlet="icone" />
              <b class="nome">{{ deckName() }}</b>
              @if (number(); as n) {
                <span class="num">Nº {{ n }}</span>
              }
            </div>
            <div class="corpo">
              <ng-container *ngTemplateOutlet="foto" /><ng-container *ngTemplateOutlet="titulo" /><ng-container *ngTemplateOutlet="sub" />
            </div>
            @if (face(); as f) {
              <p class="pe">
                <span class="nivel-tinta"><i></i>{{ levelLabel() }}</span>
                @if (f.level !== 'desconhecida') {
                  <span class="volta">{{ back() }}</span>
                }
              </p>
            }
          </div>
        }
        @case ('cartolina') {
          <div class="face"></div>
          @if (deckName()) {
            <span class="dymo">{{ deckName() }}</span>
          }
          <span class="canto canto-cima" aria-hidden="true">{{ corner() }}</span>
          <span class="canto canto-baixo" aria-hidden="true">{{ corner() }}</span>
          <div class="corpo">
            <ng-container *ngTemplateOutlet="foto" /><ng-container *ngTemplateOutlet="titulo" /><ng-container *ngTemplateOutlet="sub" />
          </div>
          @if (face(); as f) {
            <p class="pe">
              <span class="nivel-tinta"><i></i>{{ levelLabel() }}@if (f.level !== 'desconhecida') { · {{ back() }} }</span>
            </p>
          }
        }
        @case ('orelha') {
          <div class="face"></div>
          <div class="dobra" aria-hidden="true"><i></i></div>
          <div class="topo">
            <b class="nome">{{ deckName() }}</b>
            @if (face()) {
              <span class="selo-nivel">{{ levelLabel() }}</span>
            }
          </div>
          <div class="regua" aria-hidden="true"></div>
          <div class="corpo">
            <ng-container *ngTemplateOutlet="foto" /><ng-container *ngTemplateOutlet="titulo" /><ng-container *ngTemplateOutlet="sub" />
          </div>
          @if (face()) {
            <p class="pe">{{ back() }}</p>
          }
        }
        @case ('antigo') {
          <div class="face"></div>
          <div class="moldura" aria-hidden="true"></div>
          <span class="canto canto-cima" aria-hidden="true">{{ corner() }}</span>
          <span class="canto canto-baixo" aria-hidden="true">{{ corner() }}</span>
          @if (deckName()) {
            <span class="fita fita-cima">{{ deckName() }}</span>
          }
          <div class="corpo">
            <ng-container *ngTemplateOutlet="foto" /><ng-container *ngTemplateOutlet="titulo" />
            @if (subtitle()) {
              <span class="losango" aria-hidden="true"><i></i></span>
            }
            <ng-container *ngTemplateOutlet="sub" />
          </div>
          @if (face(); as f) {
            <p class="pe fita fita-baixo"><i></i>{{ levelLabel() }}@if (f.level !== 'desconhecida') { · {{ f.when === 'agora' || f.when === 'hoje' ? f.when : f.stamp }} }</p>
          }
        }
        @case ('argola') {
          <svg class="anel tras" viewBox="0 0 100 140" aria-hidden="true"><path class="sombra" d="M13 14 A5.6 13 0 0 1 13 -12" /></svg>
          <div class="papel">
            <div class="pauta" aria-hidden="true"></div>
            <div class="cab">
              <b class="nome">{{ deckName() }}</b>
              @if (face()) {
                <span class="pe">{{ pencil() }}</span>
              }
            </div>
            @if (face()) {
              <i class="bolinha" aria-hidden="true"></i>
            }
            <div class="corpo">
              <ng-container *ngTemplateOutlet="foto" /><ng-container *ngTemplateOutlet="titulo" /><ng-container *ngTemplateOutlet="sub" />
            </div>
          </div>
          <svg class="anel frente" viewBox="0 0 100 140" aria-hidden="true">
            <path class="cor" d="M13 -12 A5.6 13 0 0 1 13 14" />
            <path class="brilho" d="M14.5 -10.5 A4.6 11.6 0 0 1 17.6 4" />
          </svg>
        }
        @case ('selo') {
          <div class="selo">
            <div class="campo">
              <div class="corpo">
                <ng-container *ngTemplateOutlet="foto" /><ng-container *ngTemplateOutlet="titulo" /><ng-container *ngTemplateOutlet="sub" />
              </div>
              <div class="emblema"><ng-container *ngTemplateOutlet="icone" /><b class="nome">{{ deckName() }}</b></div>
            </div>
          </div>
          @if (face(); as f) {
            @if (f.level !== 'desconhecida') {
              <svg class="carimbo pe" [class.hoje]="due()" viewBox="0 0 100 140" role="img" [attr.aria-label]="back()">
                <defs><path [attr.id]="arc" d="M66.4 19 a12.6 12.6 0 1 1 25.2 0 a12.6 12.6 0 1 1 -25.2 0" /></defs>
                <g transform="rotate(-14 79 19)">
                  <circle cx="79" cy="19" r="17" stroke-width="0.9" />
                  <circle cx="79" cy="19" r="15.8" stroke-width="0.45" />
                  <circle cx="79" cy="19" r="9.4" stroke-width="0.45" />
                  <text font-size="3.9" letter-spacing="0.3"><textPath [attr.href]="'#' + arc" textLength="76" lengthAdjust="spacing">{{ postmark() }}</textPath></text>
                  <text x="79" y="20.4" font-size="8" text-anchor="middle">{{ stampDay() }}</text>
                  <text x="79" y="25.2" font-size="3.5" letter-spacing="0.5" text-anchor="middle">{{ stampMonth() }}</text>
                </g>
                <path class="onda" stroke-width="0.8" d="M28 12 q3.2 -2.2 6.4 0 t6.4 0 t6.4 0 t6.4 0 t6.4 0" />
                <path class="onda" stroke-width="0.8" d="M28 17.5 q3.2 -2.2 6.4 0 t6.4 0 t6.4 0 t6.4 0 t6.4 0" />
                <path class="onda" stroke-width="0.8" d="M28 23 q3.2 -2.2 6.4 0 t6.4 0 t6.4 0 t6.4 0 t6.4 0" />
              </svg>
            }
          }
        }
        @case ('polaroid') {
          <div class="pola">
            @if (src(); as s) {
              <div class="foto-pola imagem"><img [src]="s" alt="" loading="lazy" referrerpolicy="no-referrer" (error)="broken.set(true)" /></div>
              <div class="margem">
                <ng-container *ngTemplateOutlet="titulo" /><ng-container *ngTemplateOutlet="sub" />
                @if (face()) {
                  <p class="pe">{{ pencil() }}</p>
                }
              </div>
            } @else {
              <div class="foto-pola"><ng-container *ngTemplateOutlet="titulo" /></div>
              <div class="margem">
                <ng-container *ngTemplateOutlet="sub" />
                <span class="espaco"></span>
                @if (face()) {
                  <p class="pe">{{ pencil() }}</p>
                }
              </div>
            }
          </div>
          @if (deckName()) {
            <div class="fita-washi"><span>{{ deckName() }}</span></div>
          }
        }
        @case ('ingresso') {
          <div class="bilhete">
            <div class="principal">
              <div class="cab">
                <ng-container *ngTemplateOutlet="icone" />
                <b class="nome">{{ deckName() }}</b>
                @if (number(); as n) {
                  <span class="num">Nº {{ n }}</span>
                }
              </div>
              <div class="corpo">
                <ng-container *ngTemplateOutlet="foto" /><ng-container *ngTemplateOutlet="titulo" /><ng-container *ngTemplateOutlet="sub" />
              </div>
            </div>
            <div class="picote" aria-hidden="true"></div>
            <div class="canhoto pe">
              @if (face(); as f) {
                <div class="campo">
                  <small>Nível</small><b><i></i>{{ levelLabel() }}</b>
                </div>
                <div class="campo">
                  <small>Volta</small>
                  @if (f.level === 'desconhecida') {
                    <b>—</b><em>ainda não estudada</em>
                  } @else if (due()) {
                    <b class="hoje">{{ f.when === 'agora' ? 'Agora' : 'Hoje' }}</b><em>{{ f.stamp.toLocaleLowerCase('pt-BR') }}</em>
                  } @else {
                    <b>{{ f.stamp }}</b><em>{{ f.when }}</em>
                  }
                </div>
              } @else {
                <div class="campo"><small>Baralho</small><b>{{ deckName() || '—' }}</b></div>
              }
            </div>
          </div>
        }
        @case ('biblioteca') {
          <div class="ficha">
            <div class="faixa">
              <ng-container *ngTemplateOutlet="icone" />
              <b class="nome">{{ deckName() }}</b>
              @if (number(); as n) {
                <span class="num">Nº {{ n }}</span>
              }
            </div>
            <div class="corpo">
              <ng-container *ngTemplateOutlet="foto" /><ng-container *ngTemplateOutlet="titulo" /><ng-container *ngTemplateOutlet="sub" />
            </div>
            <div class="datas pe">
              <div class="th"><span>Revisão</span><span>Vista</span></div>
              @for (row of rows(); track $index) {
                <div class="tr">
                  @switch (row.kind) {
                    @case ('vista') {
                      <span><b class="data" [style.--g]="row.tilt + 'deg'">{{ row.text }}</b></span>
                      <span class="marca" [class.errou]="!row.ok" [attr.aria-label]="row.ok ? 'acertou' : 'errou'">
                        <svg viewBox="0 0 10 10" aria-hidden="true">
                          @if (row.ok) {
                            <path d="M1 5.6 L3.8 8.4 L9.2 1.2" />
                          } @else {
                            <path d="M1.6 1.8 L8.6 8.6 M8.4 1.4 L1.8 8.8" />
                          }
                        </svg>
                      </span>
                    }
                    @case ('volta') {
                      <span><b class="data volta" [style.--g]="row.tilt + 'deg'">{{ row.text }}</b></span><span></span>
                    }
                    @case ('nunca') {
                      <span><i class="nunca">ainda não estudada</i></span><span></span>
                    }
                    @default {
                      <span></span><span></span>
                    }
                  }
                </div>
              }
            </div>
          </div>
        }
        @default {
          <div class="face"></div>
          <div class="moldura" aria-hidden="true"></div>
          <span class="canto canto-cima" aria-hidden="true">{{ corner() }}</span>
          <span class="canto canto-baixo" aria-hidden="true">{{ corner() }}</span>
          @if (deckName()) {
            <span class="nome">{{ deckName() }}</span>
          }
          <div class="corpo">
            <ng-container *ngTemplateOutlet="foto" /><ng-container *ngTemplateOutlet="titulo" /><ng-container *ngTemplateOutlet="sub" />
          </div>
          @if (face(); as f) {
            <p class="pe">
              <span class="selo-nivel">{{ levelLabel() }}</span>
              @if (f.level !== 'desconhecida') {
                <span class="volta">{{ back() }}</span>
              }
            </p>
          }
        }
      }
    </div>
  `,
  styleUrls: ['./study-card.scss', './study-card-objetos.scss'],
})
export class StudyCard {
  readonly title = input.required<string>();
  readonly subtitle = input<string | undefined>(undefined);
  readonly image = input<string | undefined>(undefined);
  /** A cartolina da anotação: a cor da carta sai dela. */
  readonly stock = input<Stock | undefined>(undefined);
  /** O baralho: o nome, a cor, o ícone e o desenho. */
  readonly deck = input<CardDeck | null>(null);
  /** Um desenho no lugar do do baralho (as prévias da folha do baralho). */
  readonly look = input<CardLook | undefined>(undefined);
  /** O progresso, nos lugares que o mostram (a parede e a pilha). */
  readonly face = input<CardFace | null>(null);

  protected readonly iconOf = ICON_CHOICE;
  protected readonly arc = `carimbo-${++arcs}`;

  private readonly images = inject(ImageStore);
  private readonly imageSync = inject(ImageSync);
  private readonly account = inject(CloudAccount);

  protected readonly shown = computed<CardLook>(() => this.look() ?? deckLook(this.deck()));

  protected readonly broken = signal(false);
  private readonly localId = computed(() => localImageId(this.image() ?? ''));
  private readonly localSrc = signal<string | null>(null);
  /** O que vai no `<img>`: o link, a guardada pelo Murall quando ela chega, ou nada (sem imagem, ou quebrada). */
  protected readonly src = computed(() => {
    if (this.broken()) return null;
    const url = this.image();
    if (!url) return null;
    return this.localId() ? this.localSrc() : url;
  });
  protected readonly fitKey = computed(() => `${this.shown()}|${this.title()}|${this.subtitle() ?? ''}|${this.src() ?? ''}`);

  /** A cor dos fios e das molduras: a cartolina da anotação; a branca e a cinza, uma tinta sépia (sumiriam no creme). */
  protected readonly fio = computed(() => (this.neutral() ? '#9a7b55' : `var(--stock-${this.stock() ?? 'amarelo'})`));
  protected readonly neutral = computed(() => this.stock() === 'branco' || this.stock() === 'cinza');
  /** A cartolina escura: a tinta clara onde o desenho imprime na cor da cartolina. */
  protected readonly dark = computed(() => isDarkStock(this.stock()));

  /** Os caracteres do título (um kanji ou um emoji contam como um). */
  private readonly chars = computed(() => Array.from(this.title().trim()));
  /** O canto, como numa carta de baralho: o primeiro caractere do título. */
  protected readonly corner = computed(() => this.chars()[0]?.toLocaleUpperCase('pt-BR') ?? '');
  /** Mais de 10 caracteres é pergunta ou frase: escrita à mão, para ler (até 10, a pincel). */
  protected readonly phrase = computed(() => this.chars().length > 10);

  protected readonly deckName = computed(() => this.deck()?.name ?? '');
  protected readonly number = computed(() => {
    const n = this.face()?.number;
    return n ? String(n).padStart(2, '0') : null;
  });
  protected readonly levelLabel = computed(() => LEVEL_LABEL[this.face()?.level ?? 'desconhecida']);
  /** Quando volta, numa frase curta ("volta em 3 dias"); a nunca estudada, "ainda não estudada". */
  protected readonly back = computed(() => {
    const f = this.face();
    if (!f) return '';
    return f.level === 'desconhecida' ? 'ainda não estudada' : `volta ${f.when}`;
  });
  /** A lápis (a Ficha de argola, a Polaroid): o nível e quando volta; a nunca estudada, só isso. */
  protected readonly pencil = computed(() => {
    const f = this.face();
    if (!f) return '';
    return f.level === 'desconhecida' ? this.back() : `${this.levelLabel().toLocaleLowerCase('pt-BR')} · ${this.back()}`;
  });
  /** É para agora ou para hoje: o carimbo e o canhoto em vermelho. */
  protected readonly due = computed(() => {
    const w = this.face()?.when;
    return w === 'agora' || w === 'hoje';
  });
  protected readonly stampDay = computed(() => this.face()?.stamp.split(' ')[0] ?? '');
  protected readonly stampMonth = computed(() => this.face()?.stamp.split(' ')[1] ?? '');
  /** O texto em volta do carimbo do Selo: o baralho e quando volta. */
  protected readonly postmark = computed(() => `${this.deckName().toLocaleUpperCase('pt-BR')} · ${this.back().toLocaleUpperCase('pt-BR')} ·`);

  /**
   * As linhas da Ficha da biblioteca, sempre quatro: as últimas respostas (a vez, carimbada, e o certo ou o
   * errado), depois a data em que volta, em vermelho; a nunca estudada diz isso a lápis.
   */
  protected readonly rows = computed(() => {
    const f = this.face();
    type Row = { kind: 'vista' | 'volta' | 'nunca' | 'vazia'; text: string; ok: boolean; tilt: number };
    const tilts = [-2.6, 1.8, -1, 2.4];
    const out: Row[] = [];
    if (f) {
      if (f.level === 'desconhecida') out.push({ kind: 'nunca', text: '', ok: true, tilt: 0 });
      else {
        const marks = f.marks.slice(-3);
        [...marks].forEach((m, i) => out.push({ kind: 'vista', text: `${f.seen - marks.length + i + 1}ª`, ok: m === '1', tilt: tilts[i] }));
        out.push({ kind: 'volta', text: this.due() ? f.when.toLocaleUpperCase('pt-BR') : f.stamp, ok: true, tilt: tilts[out.length % 4] });
      }
    }
    while (out.length < 4) out.push({ kind: 'vazia', text: '', ok: true, tilt: 0 });
    return out.slice(-4);
  });

  constructor() {
    loadKleeOne();
    // outra imagem: tenta de novo, sem o "quebrada" da de antes
    effect(() => {
      this.image();
      untracked(() => this.broken.set(false));
    });
    // a guardada pelo Murall: procura no aparelho; sem ela aqui, desce da nuvem (com a sessão)
    effect((onCleanup) => {
      const id = this.localId();
      this.images.version();
      this.imageSync.round();
      const signedIn = this.account.signedIn();
      if (!id) return untracked(() => this.localSrc.set(null));
      let alive = true;
      onCleanup(() => (alive = false));
      void this.images
        .url(id)
        .then((url) => url ?? (signedIn ? this.imageSync.fetch(id) : null))
        .then((url) => alive && this.localSrc.set(url));
    });
  }
}
