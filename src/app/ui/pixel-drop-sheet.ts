import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, input, output, signal, viewChild } from '@angular/core';
import { PIXEL_MAX, PixelArt, readPixelArt } from '../core/pixel-art';
import { PixelScale, Rgba, imageArt, pixelSized, scaleFor, scaledSize } from '../core/pixel-import';
import { plural } from '../core/text';
import { BackdropClose } from './backdrop-close';
import { ICON, IconModule } from './icons';
import { Pin } from './pin';
import { PixelThumb } from './pixel-thumb';

/** Uma imagem solta maior que 64 × 64: a pergunta é se ela é uma pixel art ampliada. */
export interface DroppedBig {
  key: string;
  title: string;
  /** O endereço da imagem do arquivo (a miniatura de como ela veio); quem abriu a folha o solta. */
  url: string;
  /** A imagem lida (a que não parece ampliada pode vir já encolhida: os passos à mão contam nela). */
  img: Rgba;
  /** O tamanho dela, como veio. */
  w: number;
  h: number;
  /** O passo que o site adivinhou (null: não parece ampliada). */
  guess: PixelScale | null;
}

/** A resposta de cada uma: ampliada (com o passo) ou do tamanho dela. */
type Choice = { as: 'ampliada'; k: number } | { as: 'tamanho' };

/** A caixa das prévias, e o lado da menor delas (uma de 7 × 7 ao lado de uma de 256 sumiria). */
const PREVIEW_BOX = 72;
const PREVIEW_MIN = 22;

/** O maior passo que se escolhe à mão (mais que isso, nenhuma pixel art). */
const STEP_MAX = 64;

let uid = 0;

/**
 * A pergunta das imagens grandes (PLANO-SOLTAR-IMAGENS.md, rodada 4): numa soltada, as maiores que 64 × 64 vêm aqui,
 * todas numa folha só, cada uma com as duas respostas em cartões e a prévia de como fica: "Pixel art ampliada" (cada
 * ponto com N × N pixels, o N que o site adivinhou, ajustável) ou "Do tamanho dela" (cada pixel um ponto). As duas
 * param no teto de 256 × 256. A adivinhada já vem escolhida; Trazer leva todas da soltada (as pequenas também). A
 * ficha de fichário do "Trazer das anotações"; os cartões, os do "Trazer a imagem" do ateliê (ui/_trazer-cartao.scss).
 */
@Component({
  selector: 'app-pixel-drop-sheet',
  imports: [BackdropClose, IconModule, Pin, PixelThumb],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dialog class="sheet ficha-lugar massa soltar" [attr.aria-labelledby]="id + '-t'" (close)="closed.emit()" (backdropClose)="close()">
      <div class="ficha cartolina" [style.--stock]="'var(--stock-branco)'" data-cor="branco">
        <app-pin class="pin" />
        <header class="head">
          <div class="titulos">
            <h2 [id]="id + '-t'">{{ items().length === 1 ? 'É uma pixel art ampliada?' : 'São pixel arts ampliadas?' }}</h2>
            <p class="sub">
              <lucide-icon [img]="ImageIcon" [size]="14" aria-hidden="true" />{{ subtitle() }}
            </p>
          </div>
          <button type="button" class="icon-btn fecha" aria-label="Fechar" (click)="close()">
            <lucide-icon [img]="CloseIcon" [size]="22" aria-hidden="true" />
          </button>
        </header>

        <div class="body">
          <p class="vale">Ampliada, cada ponto da pixel art virou um quadradinho de pixels: ela volta ao tamanho de verdade. Nenhuma passa de {{ MAX }} × {{ MAX }} pontos.</p>
          <ul class="soltas" role="list">
            @for (it of items(); track it.key; let i = $index) {
              @let c = choiceOf(it);
              @let pv = previews().get(it.key)!;
              <li class="solta">
                <p class="solta-nome">
                  <img class="solta-foto" alt="" [src]="it.url" />
                  <span class="solta-txt">
                    <span class="solta-titulo" [id]="id + '-n' + i">{{ it.title || 'Sem título' }}</span>
                    <span class="solta-tam">{{ it.w }} × {{ it.h }} pixels</span>
                  </span>
                </p>
                <div class="trazer-escolhas" role="radiogroup" [attr.aria-labelledby]="id + '-n' + i">
                  <!-- a ampliada: o cartão com o passo embaixo, fora do rótulo do botão de rádio (um botão dentro de
                       um rótulo não vale, e o leitor de tela juntaria tudo no nome da resposta) -->
                  <div class="trazer-cartao com-passo" [class.on]="c.as === 'ampliada'">
                    <label class="cartao-escolha">
                      <input type="radio" [name]="id + '-como' + i" [checked]="c.as === 'ampliada'" (change)="choose(it, { as: 'ampliada', k: stepOf(it) })" />
                      <span class="trazer-previa" aria-hidden="true"><app-pixel-thumb [art]="pv.ampliada" [style.width.px]="pv.aw" [style.height.px]="pv.ah" /></span>
                      <span class="trazer-texto">
                        <span class="trazer-titulo">Pixel art ampliada@if (it.guess) {<span class="achou"> · o site achou</span>}</span>
                        <span class="trazer-desc">{{ scaledText(it) }}</span>
                      </span>
                    </label>
                    <div class="passo" role="group" [attr.aria-label]="'Pixels por ponto de ' + (it.title || 'Sem título')">
                      <span class="passo-nome" aria-hidden="true">Pixels por ponto</span>
                      <span class="passo-ctl">
                        <button type="button" class="passo-btn" [disabled]="stepOf(it) <= 2" [attr.aria-label]="'Menos pixels por ponto (agora ' + stepLabel(it) + ')'" (click)="step(it, -1)">
                          <lucide-icon [img]="LessIcon" [size]="16" aria-hidden="true" />
                        </button>
                        <span class="passo-n" aria-live="polite">{{ stepLabel(it) }}</span>
                        <button type="button" class="passo-btn" [disabled]="stepOf(it) >= stepMax(it)" [attr.aria-label]="'Mais pixels por ponto (agora ' + stepLabel(it) + ')'" (click)="step(it, 1)">
                          <lucide-icon [img]="MoreIcon" [size]="16" aria-hidden="true" />
                        </button>
                      </span>
                    </div>
                  </div>
                  <label class="trazer-cartao" [class.on]="c.as === 'tamanho'">
                    <input type="radio" [name]="id + '-como' + i" [checked]="c.as === 'tamanho'" (change)="choose(it, { as: 'tamanho' })" />
                    <span class="trazer-previa" aria-hidden="true"><app-pixel-thumb [art]="pv.tamanho" [style.width.px]="pv.tw" [style.height.px]="pv.th" /></span>
                    <span class="trazer-texto">
                      <span class="trazer-titulo">Do tamanho dela</span>
                      <span class="trazer-desc">{{ plainText(it) }}</span>
                    </span>
                  </label>
                </div>
              </li>
            }
          </ul>
        </div>

        <footer class="foot">
          <div class="fim">
            <button type="button" class="btn-quiet" (click)="close()">Cancelar</button>
            @if (small()) {
              <!-- as pequenas não precisam da resposta: dá para trazer só elas -->
              <button type="button" class="btn-quiet" (click)="bringSmall()">Só {{ small() === 1 ? 'a pequena' : 'as ' + small() + ' pequenas' }}</button>
            }
            <button type="button" class="btn-ink aplicar" (click)="bring()">Trazer {{ total() }}</button>
          </div>
        </footer>
      </div>
    </dialog>
  `,
  styleUrls: ['./organize-sheet.scss', './bulk-edit-sheet.scss', './pixel-drop-sheet.scss'],
})
export class PixelDropSheet {
  readonly items = input.required<readonly DroppedBig[]>();
  /** As pequenas (até 64 × 64) da mesma soltada: vêm junto, sem pergunta. */
  readonly small = input(0);
  /** Para onde vão ("Bichos", "a galeria"). */
  readonly where = input('a galeria');
  /** O passo de cada uma (sem ampliação: um pixel por ponto); a que fica de fora não vem no mapa. */
  readonly brought = output<ReadonlyMap<string, PixelScale>>();
  readonly closed = output<void>();

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  protected readonly id = `pixel-soltar-${++uid}`;
  protected readonly MAX = PIXEL_MAX;
  protected readonly ImageIcon = ICON.imagem;
  protected readonly CloseIcon = ICON.fechar;
  protected readonly LessIcon = ICON.tirar;
  protected readonly MoreIcon = ICON.adicionar;

  /** As respostas que a pessoa mudou (as outras: a adivinhada já escolhida; sem palpite, do tamanho dela). */
  protected readonly choices = signal<ReadonlyMap<string, Choice>>(new Map());

  constructor() {
    afterNextRender(() => this.dialog().nativeElement.showModal());
  }

  protected choiceOf(it: DroppedBig): Choice {
    return this.choices().get(it.key) ?? (it.guess ? { as: 'ampliada', k: Math.max(it.guess.kx, it.guess.ky) } : { as: 'tamanho' });
  }

  protected readonly subtitle = computed(() => {
    const n = this.items().length;
    const big = `${plural(n, 'imagem maior', 'imagens maiores')} que 64 × 64`;
    return `${big}${this.small() ? ` · mais ${plural(this.small(), 'pequena vem', 'pequenas vêm')} junto` : ''} · para ${this.where()}`;
  });
  protected readonly total = computed(() => plural(this.items().length + this.small(), 'pixel art', 'pixel arts'));

  /** O passo de agora no cartão da ampliada (o escolhido, o adivinhado, ou o que deixa a obra com até 64 pontos). */
  protected stepOf(it: DroppedBig): number {
    const c = this.choiceOf(it);
    if (c.as === 'ampliada') return c.k;
    return it.guess ? Math.max(it.guess.kx, it.guess.ky) : Math.min(this.stepMax(it), Math.max(2, Math.ceil(Math.max(it.img.w, it.img.h) / 64)));
  }

  protected stepMax(it: DroppedBig): number {
    // (o palpite maior que o teto do passo continua alcançável)
    const guess = it.guess ? Math.max(it.guess.kx, it.guess.ky) : 0;
    return Math.max(2, Math.min(Math.max(STEP_MAX, guess), it.img.w, it.img.h));
  }

  /** O passo da ampliada: o adivinhado, enquanto é o mesmo (os pontos que não são quadrados também). */
  private scaleOf(it: DroppedBig, k: number): PixelScale {
    return it.guess && Math.max(it.guess.kx, it.guess.ky) === k ? it.guess : scaleFor(it.img, k, it.guess);
  }

  protected stepLabel(it: DroppedBig): string {
    const s = this.scaleOf(it, this.stepOf(it));
    return s.kx === s.ky ? `${s.kx} × ${s.kx}` : `${s.kx} × ${s.ky}`;
  }

  protected step(it: DroppedBig, by: number): void {
    const k = Math.max(2, Math.min(this.stepMax(it), this.stepOf(it) + by));
    this.choose(it, { as: 'ampliada', k });
  }

  protected choose(it: DroppedBig, c: Choice): void {
    this.choices.update((m) => new Map(m).set(it.key, c));
  }

  /** "Vira 32 × 32 pontos" (e o teto, quando ele encolhe). */
  private sizeText(w: number, h: number): string {
    const cap = Math.max(w, h) > PIXEL_MAX;
    const k = PIXEL_MAX / Math.max(w, h);
    return cap ? `vira ${Math.max(1, Math.round(w * k))} × ${Math.max(1, Math.round(h * k))} pontos (encolhida até o teto de ${PIXEL_MAX})` : `vira ${w} × ${h} pontos`;
  }

  protected scaledText(it: DroppedBig): string {
    const size = scaledSize(it.img.w, it.img.h, this.scaleOf(it, this.stepOf(it)));
    return `Cada quadradinho volta a ser um ponto: ${this.sizeText(size.w, size.h)}.`;
  }

  protected plainText(it: DroppedBig): string {
    return `Cada pixel vira um ponto: ${this.sizeText(it.w, it.h)}.`;
  }

  /**
   * As prévias de cada resposta (a da ampliada muda com o passo): cada uma feita uma vez por imagem e passo, para o
   * − e o + de uma não refazerem as das outras.
   */
  private readonly made = new Map<string, PixelArt>();
  private previewOf(it: DroppedBig, s: PixelScale | null): PixelArt {
    const key = s ? `${it.key}|${s.kx},${s.ky},${s.ox},${s.oy}` : `${it.key}|tamanho`;
    let art = this.made.get(key);
    if (!art) this.made.set(key, (art = artOf(s ? pixelSized(it.img, s) : pixelSized(it.img))));
    return art;
  }
  /**
   * As duas prévias na mesma medida (os mesmos pixels de tela por ponto, a maior enchendo a caixa): a de 7 × 7 sai
   * pequena e a de 84 × 84 grande, e a diferença das respostas se vê. A menor nunca fica abaixo de `PREVIEW_MIN`.
   */
  protected readonly previews = computed(() => {
    const out = new Map<string, { ampliada: PixelArt; tamanho: PixelArt; aw: number; ah: number; tw: number; th: number }>();
    for (const it of this.items()) {
      const ampliada = this.previewOf(it, this.scaleOf(it, this.stepOf(it)));
      const tamanho = this.previewOf(it, null);
      const k = PREVIEW_BOX / Math.max(ampliada.w, ampliada.h, tamanho.w, tamanho.h);
      const side = (a: PixelArt, n: number) => Math.max(n * k, (PREVIEW_MIN * n) / Math.max(a.w, a.h));
      out.set(it.key, { ampliada, tamanho, aw: side(ampliada, ampliada.w), ah: side(ampliada, ampliada.h), tw: side(tamanho, tamanho.w), th: side(tamanho, tamanho.h) });
    }
    return out;
  });

  protected bring(): void {
    const out = new Map<string, PixelScale>();
    for (const it of this.items()) {
      const c = this.choiceOf(it);
      out.set(it.key, c.as === 'ampliada' ? this.scaleOf(it, c.k) : { kx: 1, ky: 1, ox: 0, oy: 0 });
    }
    this.brought.emit(out);
    this.close();
  }

  /** Só as pequenas da soltada: nenhuma grande no mapa. */
  protected bringSmall(): void {
    this.brought.emit(new Map());
    this.close();
  }

  protected close(): void {
    const el = this.dialog().nativeElement;
    if (el.open) el.close();
    else this.closed.emit();
  }
}

/** A obra de uma imagem pronta, lida para a miniatura (toda transparente: um ponto vazio). */
function artOf(img: Rgba): PixelArt {
  return readPixelArt(imageArt(img) ?? ['1x1']);
}
