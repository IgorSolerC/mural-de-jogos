import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { CloudAccount } from '../core/cloud-account';
import { ImageStore } from '../core/image-store';
import { ImageSync } from '../core/image-sync';
import { localImageId } from '../core/images';
import { Stock, isDarkStock } from '../core/review';
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

/**
 * A frente de uma carta de estudo (PLANO-ESTUDOS.md, 6.1): uma cartolina clara, em pé, na proporção das
 * cartas de baralho, com um fio colorido recuado da beirada na cor da cartolina da anotação (a ideia da
 * terceira imagem do pedido), o miolo lavado dessa cor, o primeiro caractere do título nos cantos, como numa
 * carta de baralho, e dentro o título, a imagem e o subtítulo, juntos no meio.
 *
 * O título tem a letra do tamanho do espaço que sobra (ui/fit-title.ts), escrita à mão em tudo: o alfabeto
 * na Permanent Marker, o japonês e o chinês na Klee One, as outras escritas na letra do sistema. A carta
 * serve para estudar qualquer coisa, não só idiomas (pedido do usuário).
 *
 * `meta` é a linha impressa no pé, fora do fio (o nível e quando volta), só na parede do baralho.
 */
@Component({
  selector: 'app-study-card',
  imports: [FitTitle, IconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="carta" [class.com-pe]="!!meta()" [class.escura]="dark()" [class.neutra]="neutral()" [style.--fio]="fio()">
      <div class="painel" aria-hidden="true"></div>
      @for (pos of corners; track pos) {
        <span class="canto" [class]="'canto canto-' + pos" aria-hidden="true">
          <span class="indice">{{ corner() }}</span>
          @if (suit(); as s) {
            <lucide-icon class="naipe" [img]="iconOf[s]" [size]="12" />
          }
        </span>
      }
      <div class="miolo">
        @if (src(); as s) {
          <img class="imagem" [src]="s" alt="" loading="lazy" referrerpolicy="no-referrer" (error)="broken.set(true)" />
        }
        <div class="titulo-area" [appFitTitle]="title() + '|' + (subtitle() ?? '') + '|' + (src() ?? '')" [appFitTitleMax]="0.92">
          <p class="titulo" [class.frase]="phrase()" lang="und">{{ title() }}</p>
        </div>
        @if (subtitle(); as sub) {
          <p class="subtitulo">{{ sub }}</p>
        }
      </div>
      @if (meta(); as m) {
        <p class="pe">{{ m }}</p>
      }
    </div>
  `,
  styleUrl: './study-card.scss',
})
export class StudyCard {
  readonly title = input.required<string>();
  readonly subtitle = input<string | undefined>(undefined);
  readonly image = input<string | undefined>(undefined);
  /** A cartolina da anotação: o fio sai dela. */
  readonly stock = input<Stock | undefined>(undefined);
  readonly meta = input<string | null>(null);
  /** O naipe dos cantos: o ícone do baralho (sem ele, só o caractere). */
  readonly suit = input<IconChoice | null>(null);

  protected readonly corners = ['cima', 'baixo'] as const;
  protected readonly iconOf = ICON_CHOICE;

  private readonly images = inject(ImageStore);
  private readonly imageSync = inject(ImageSync);
  private readonly account = inject(CloudAccount);

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

  /** A cor da moldura: a cartolina da anotação; a branca e a cinza, uma tinta sépia (sumiriam no creme). */
  protected readonly fio = computed(() => {
    const s = this.stock() ?? 'amarelo';
    if (s === 'branco' || s === 'cinza') return '#9a7b55';
    return `var(--stock-${s})`;
  });
  /** Branca ou cinza: o miolo só um pouco lavado da sépia. */
  protected readonly neutral = computed(() => this.stock() === 'branco' || this.stock() === 'cinza');

  /** A cartolina escura: a moldura escura, e o miolo quase creme (a lavada ficaria barrenta). */
  protected readonly dark = computed(() => isDarkStock(this.stock()));

  /** Os caracteres do título (um kanji ou um emoji contam como um). */
  private readonly chars = computed(() => Array.from(this.title().trim()));
  /** O canto, como numa carta de baralho: o primeiro caractere do título. */
  protected readonly corner = computed(() => this.chars()[0]?.toLocaleUpperCase('pt-BR') ?? '');
  /** Mais de 10 caracteres é pergunta ou frase: escrita à mão, para ler (até 10, a pincel). */
  protected readonly phrase = computed(() => this.chars().length > 10);

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
