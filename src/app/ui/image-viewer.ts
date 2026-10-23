import { ApplicationRef, ChangeDetectionStrategy, Component, ElementRef, EnvironmentInjector, createComponent, input, viewChild } from '@angular/core';
import { ICON, IconModule } from './icons';
import { BackdropClose } from './backdrop-close';
import { reducedMotion } from '../core/motion';
import type { Frame } from '../core/widgets';

/** A foto a ampliar, como está colada no texto. */
export interface ImageView {
  url: string;
  caption: string;
  frame: Frame;
  /** A largura sobre a altura da foto. */
  ratio: number;
  /**
   * Até onde a ampliada cresce, em pixels (0: até a tela): a largura do arquivo (mais que ela, a foto
   * borra), ou uma vez e meia a da colada, para a foto pequena ainda crescer.
   */
  natural: number;
  /** A foto colada (o papel inteiro, `.foto`): a ampliada sai dela e volta para ela. */
  from: HTMLElement;
}

const DURATION = 380;
/** O véu e a etiqueta: o tempo das folhas (--t-ui). */
const FADE = 160;
const EASE = 'cubic-bezier(0.16, 1, 0.3, 1)';

/**
 * A foto ampliada (o widget IMAGEM, ver ui/glued-media.ts): o broche de ampliar descola a foto do
 * texto e ela vem para o meio da tela, reta e do maior tamanho que cabe (até a largura do
 * arquivo: mais que isso, ela borra), com a mesma moldura (a borda branca, a polaroide com a
 * legenda, o recorte rente) e a legenda na etiqueta, que chega no fim do voo. Por trás, o véu escuro
 * das folhas.
 *
 * Fecha no broche do X (no canto da foto, como o de ampliar), no Esc, tocando no fundo ou na própria
 * foto; ela volta para o lugar dela no texto. Enquanto está ampliada, a colada (com a etiqueta e o
 * broche) some: é a mesma foto, que saiu dali.
 *
 * Montada no `body`, fora do texto (ver showImage): dentro da ficha do mural, o texto deixa o toque
 * passar e um clique subiria até a ficha, que abriria a leitura.
 */
@Component({
  selector: 'app-image-viewer',
  imports: [IconModule, BackdropClose],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let v = view();
    <dialog #dialog class="ampliada" [attr.aria-label]="v.caption ? 'Imagem: ' + v.caption : 'Imagem ampliada'" (backdropClose)="close()" (cancel)="$event.preventDefault(); close()">
      <figure class="colagem" [class]="'colagem moldura-' + v.frame" [style.--prop]="v.ratio" [style.--nat]="v.natural ? v.natural + 'px' : null">
        <span #photo class="foto" (click)="close()">
          <img [src]="v.url" [alt]="v.caption || 'Imagem colada na anotação'" referrerpolicy="no-referrer" decoding="async" />
          <span class="reflexo" aria-hidden="true"></span>
          @if (v.frame === 'polaroid') {
            <figcaption class="legenda-polaroide">{{ v.caption }}</figcaption>
          }
          <button #shut type="button" class="fechar" aria-label="Fechar a imagem" title="Fechar" (click)="$event.stopPropagation(); close()">
            <span class="face"><lucide-icon [img]="CloseIcon" [size]="18" aria-hidden="true" /></span>
          </button>
        </span>
        @if (v.frame !== 'polaroid' && v.caption) {
          <figcaption #label class="etiqueta-lugar"><span class="etiqueta"><span class="etiqueta-papel" aria-hidden="true"></span>{{ v.caption }}</span></figcaption>
        }
      </figure>
    </dialog>
  `,
  styles: `
    @use 'broche';

    /* o diálogo é a tela inteira (o toque fora da foto é no fundo e fecha); a foto fica no meio */
    .ampliada {
      --margem: 36px;
      box-sizing: border-box;
      width: 100vw;
      max-width: none;
      height: 100dvh;
      max-height: none;
      margin: 0;
      padding: var(--margem);
      border: 0;
      outline: none;
      background: transparent;
      color: #151515;
      overflow: hidden;
    }
    .ampliada[open] {
      display: grid;
      place-items: center;
    }
    .ampliada::backdrop {
      background: rgb(8 8 10 / 0.72);
    }
    @media (max-width: 600px) {
      .ampliada {
        --margem: 22px;
      }
    }

    /* ===== A foto, como a colada (ui/glued-media.ts), no tamanho da tela =====
       --pad: a borda dos dois lados; --reserva: o que a moldura e a etiqueta tomam da altura */
    .colagem {
      --pad: 22px;
      --reserva: 22px;
      display: grid;
      justify-items: center;
      margin: 0;
      max-width: 100%;
    }
    .colagem.moldura-polaroid {
      --pad: 36px;
      --reserva: calc(18px + clamp(48px, 9dvh, 76px));
    }
    .colagem.moldura-recorte {
      --pad: 0px;
      --reserva: 0px;
    }
    .colagem:has(> .etiqueta-lugar) {
      --reserva: 60px;
    }
    .colagem.moldura-recorte:has(> .etiqueta-lugar) {
      --reserva: 44px;
    }
    .foto {
      position: relative;
      display: grid;
      box-sizing: border-box;
      width: min(calc(100vw - 2 * var(--margem)), calc((100dvh - 2 * var(--margem) - var(--reserva)) * var(--prop, 1.333) + var(--pad)), calc(var(--nat, 100vw) + var(--pad)));
      padding: 11px;
      background: #fbfaf6;
      border-radius: 2px;
      cursor: zoom-out;
      box-shadow:
        0 2px 3px rgb(0 0 0 / 0.4),
        0 24px 48px -16px rgb(0 0 0 / 0.7);
    }
    .moldura-polaroid .foto {
      padding: 18px 18px 0;
    }
    .moldura-recorte .foto {
      padding: 0;
      background: transparent;
    }
    img,
    .reflexo {
      grid-area: 1 / 1;
      border-radius: 1px;
    }
    img {
      display: block;
      width: 100%;
      height: auto;
      background: #efe9dc;
    }
    /* o brilho do papel fotográfico, o mesmo da colada */
    .reflexo {
      pointer-events: none;
      background: linear-gradient(118deg, transparent 32%, rgb(255 255 255 / 0.16) 44%, transparent 56%, transparent 70%, rgb(255 255 255 / 0.07) 78%, transparent 86%);
    }
    .legenda-polaroide {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: clamp(48px, 9dvh, 76px);
      padding: 0 12px;
      font-family: var(--f-hand);
      font-size: clamp(1.1rem, 2.6dvh, 1.5rem);
      line-height: 1.15;
      text-align: center;
      overflow-wrap: anywhere;
    }
    /* a etiqueta: o pedaço de papel recortado, colado meio por cima do pé da foto */
    .etiqueta-lugar {
      position: relative;
      z-index: 1;
      width: 0;
      min-width: 100%;
      margin-top: -14px;
      padding: 0 12px 0 18px;
      box-sizing: border-box;
    }
    .etiqueta {
      position: relative;
      display: inline-block;
      max-width: max(100%, 16em);
      padding: 0.3em 0.7em 0.24em;
      box-sizing: border-box;
      font-family: var(--f-hand);
      font-size: 1.1rem;
      line-height: 1.25;
      overflow-wrap: anywhere;
      rotate: 1.2deg;
      isolation: isolate;
      filter: drop-shadow(0 1px 1px rgb(0 0 0 / 0.3)) drop-shadow(0 2px 3px rgb(0 0 0 / 0.16));
    }
    .etiqueta-papel {
      position: absolute;
      inset: 0;
      z-index: -1;
      background:
        repeating-linear-gradient(94deg, rgb(0 0 0 / 0.018) 0 1px, transparent 1px 4px),
        #fbfaf6;
      clip-path: polygon(0.6% 3%, 99% 0, 100% 96%, 1.2% 100%);
    }

    /* ===== O broche do X: o mesmo de ampliar, preso no canto de cima da foto ===== */
    .fechar {
      @include broche.lata;
      position: absolute;
      top: -13px;
      right: -13px;
      z-index: 2;
      width: 30px;
      height: 30px;
    }
    .fechar lucide-icon {
      display: block;
      translate: 0 -0.5px;
    }
  `,
})
export class ImageViewer {
  readonly view = input.required<ImageView>();
  /** Fechou de vez (a foto já voltou para o lugar): quem montou, desmonta. */
  onClosed: () => void = () => {};

  protected readonly CloseIcon = ICON.fechar;
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly photo = viewChild.required<ElementRef<HTMLElement>>('photo');
  private readonly shut = viewChild.required<ElementRef<HTMLButtonElement>>('shut');
  private readonly label = viewChild<ElementRef<HTMLElement>>('label');
  private closing = false;

  open(): void {
    const dialog = this.dialog().nativeElement;
    dialog.showModal();
    this.shut().nativeElement.focus({ preventScroll: true });
    const from = this.view().from;
    const flight = this.flight(from);
    // a colada some (a foto, a etiqueta e o broche): é a mesma foto, que saiu dali
    this.glued(from).style.opacity = '0';
    if (!flight) return;
    this.photo().nativeElement.animate([{ transform: flight, boxShadow: '0 1px 1px rgb(0 0 0 / 0.32)' }, { transform: 'none' }], { duration: DURATION, easing: EASE });
    // a etiqueta é colada quando a foto chega
    this.label()?.nativeElement.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FADE, delay: DURATION - FADE, easing: 'linear', fill: 'backwards' });
    this.fadeBackdrop(0, 1);
  }

  close(): void {
    if (this.closing) return;
    this.closing = true;
    const from = this.view().from;
    const done = (): void => {
      this.glued(from).style.removeProperty('opacity');
      this.dialog().nativeElement.close();
      this.onClosed();
    };
    // de volta para o lugar dela, se ele ainda está na tela; senão, só some
    const flight = from.isConnected ? this.flight(from) : null;
    const photo = this.photo().nativeElement;
    const back = flight
      ? photo.animate([{ transform: 'none' }, { transform: flight }], { duration: DURATION * 0.8, easing: EASE, fill: 'forwards' })
      : reducedMotion() || typeof photo.animate !== 'function'
        ? null
        : photo.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, easing: 'linear', fill: 'forwards' });
    if (!back) return done();
    // a etiqueta sai antes de a foto voar; o véu some junto com o fim do voo
    if (flight) this.label()?.nativeElement.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 100, easing: 'linear', fill: 'forwards' });
    this.fadeBackdrop(1, 0, Math.max(0, (back.effect?.getTiming().duration as number) - FADE));
    back.finished.then(done, done);
  }

  /** A peça colada inteira: a foto, a etiqueta da legenda e o broche de ampliar. */
  private glued(from: HTMLElement): HTMLElement {
    return from.closest<HTMLElement>('figure') ?? from;
  }

  /**
   * O caminho da ampliada até a colada: onde ela está, do tamanho e no giro dela. Sem movimento (pedido
   * no sistema, ou a colada fora da tela), nada: a ampliada só aparece.
   */
  private flight(from: HTMLElement): string | null {
    const photo = this.photo().nativeElement;
    if (reducedMotion() || typeof photo.animate !== 'function') return null;
    const a = from.getBoundingClientRect();
    if (!a.width || a.bottom < 0 || a.top > innerHeight || a.right < 0 || a.left > innerWidth) return null;
    const b = photo.getBoundingClientRect();
    if (!b.width) return null;
    // a colada é girada: o retângulo dela é o da caixa em volta; o tamanho de verdade é o do layout
    const s = from.offsetWidth / photo.offsetWidth;
    const dx = a.left + a.width / 2 - (b.left + b.width / 2);
    const dy = a.top + a.height / 2 - (b.top + b.height / 2);
    const tilt = getComputedStyle(from).rotate;
    return `translate(${dx}px, ${dy}px) rotate(${tilt === 'none' ? '0deg' : tilt}) scale(${s})`;
  }

  /** O véu entra e sai como o das folhas (160 ms). */
  private fadeBackdrop(start: number, end: number, delay = 0): void {
    try {
      this.dialog().nativeElement.animate([{ opacity: start }, { opacity: end }], { duration: FADE, delay, easing: 'linear', fill: 'both', pseudoElement: '::backdrop' });
    } catch {
      // sem animar o fundo (o navegador não deixa): ele só aparece
    }
  }
}

/** Amplia a foto colada: monta o visor no `body`, abre, e desmonta quando ele fecha. */
export function showImage(view: ImageView, env: EnvironmentInjector, app: ApplicationRef): void {
  const ref = createComponent(ImageViewer, { environmentInjector: env });
  ref.setInput('view', view);
  ref.instance.onClosed = () => {
    app.detachView(ref.hostView);
    ref.destroy();
  };
  app.attachView(ref.hostView);
  document.body.appendChild(ref.location.nativeElement);
  ref.changeDetectorRef.detectChanges();
  ref.instance.open();
}
