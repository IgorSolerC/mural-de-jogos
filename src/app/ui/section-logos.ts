import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { CUTOUT_STYLES } from '../core/clipping';
import { MONTHS_SHORT } from '../core/dates';

/**
 * O título da Wishlist, letra por letra, cada uma recortada de uma revista (índice em
 * `CUTOUT_STYLES`). Escolhido à mão, não sorteado: é o cabeçalho, tem de ficar bom sempre.
 */
const MASTHEAD: readonly { t: string; s: number; tilt: number; dy: number; size: number; clip: string }[] = [
  { t: 'W', s: 1, tilt: -6, dy: 2, size: 1.08, clip: 'polygon(2px 0, 100% 3px, calc(100% - 2px) 100%, 0 calc(100% - 2px))' },
  { t: 'i', s: 2, tilt: 4, dy: -3, size: 1.02, clip: 'polygon(0 2px, calc(100% - 3px) 0, 100% calc(100% - 1px), 3px 100%)' },
  { t: 'S', s: 3, tilt: -2, dy: 4, size: 0.92, clip: 'polygon(3px 1px, 100% 0, calc(100% - 1px) calc(100% - 3px), 0 100%)' },
  { t: 'h', s: 0, tilt: 5, dy: -1, size: 1.1, clip: 'polygon(0 0, calc(100% - 2px) 2px, 100% 100%, 2px calc(100% - 2px))' },
  { t: 'L', s: 6, tilt: -4, dy: 3, size: 0.98, clip: 'polygon(1px 3px, 100% 0, calc(100% - 3px) 100%, 0 calc(100% - 1px))' },
  { t: 'i', s: 5, tilt: 3, dy: -2, size: 1.06, clip: 'polygon(2px 0, calc(100% - 1px) 1px, 100% calc(100% - 3px), 0 100%)' },
  { t: 's', s: 8, tilt: -5, dy: 2, size: 0.95, clip: 'polygon(0 1px, 100% 3px, calc(100% - 2px) 100%, 2px calc(100% - 1px))' },
  { t: 'T', s: 4, tilt: 6, dy: -2, size: 1.04, clip: 'polygon(3px 0, 100% 2px, 100% calc(100% - 2px), 0 100%)' },
];

/**
 * O logo da Wishlist: o nome recortado como um bilhete de resgate, oito letras de oito revistas.
 * O tamanho vem do `font-size` de quem usa.
 */
@Component({
  selector: 'app-wishlist-logo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="letras" aria-hidden="true">
      @for (l of masthead; track $index) {
        <span
          class="letra"
          [class]="'fonte-' + styles[l.s].font"
          [class.caps]="styles[l.s].caps"
          [style.background]="styles[l.s].bg"
          [style.color]="styles[l.s].ink"
          [style.clip-path]="l.clip"
          [style.rotate.deg]="l.tilt"
          [style.translate]="'0 ' + l.dy + 'px'"
          [style.font-size.em]="l.size"
          >{{ l.t }}</span
        >
      }
    </span>
  `,
  styles: `
    :host {
      display: inline-block;
      line-height: 1;
      rotate: -1.5deg;
    }
    .letras {
      display: flex;
      align-items: center;
      gap: 3px;
    }
    .letra {
      display: inline-block;
      min-width: 0.9em;
      padding: 0.1em 0.16em 0.06em;
      text-align: center;
      line-height: 1;
      filter: drop-shadow(0 1px 1px rgb(0 0 0 / 0.4)) drop-shadow(0 4px 5px rgb(0 0 0 / 0.3));
    }
    .letra.fonte-didone {
      font-family: var(--f-didone);
    }
    .letra.fonte-serif {
      font-family: var(--f-serif);
      font-size: 1.04em;
    }
    .letra.fonte-serif-it {
      font-family: var(--f-serif);
      font-style: italic;
      font-size: 1.06em;
    }
    .letra.fonte-label {
      font-family: var(--f-label);
      font-weight: 800;
      font-style: italic;
      padding-top: 0.14em;
    }
    .letra.caps {
      text-transform: uppercase;
    }
  `,
})
export class WishlistLogo {
  protected readonly masthead = MASTHEAD;
  protected readonly styles = CUTOUT_STYLES;
}

/**
 * O logo do Pra depois: a etiqueta escolar da capa do caderno, moldura impressa em azul, o campo
 * pautado e "Pra resenhar depois" escrito a pincel.
 */
@Component({
  selector: 'app-queue-logo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="etiqueta-campo" aria-hidden="true">
      <span class="etiqueta-rotulo">Matéria</span>
      <span class="etiqueta-escrito">Pra resenhar depois</span>
    </span>
  `,
  styles: `
    :host {
      position: relative;
      display: inline-block;
      padding: 9px 12px 10px;
      rotate: -1.6deg;
      background: #fdfcf7;
      border-radius: 6px;
      filter: drop-shadow(0 1px 1px rgb(0 0 0 / 0.35)) drop-shadow(0 6px 8px rgb(0 0 0 / 0.4));
    }
    /* a moldura impressa: fio duplo, com os cantinhos recortados para dentro */
    :host::before {
      content: '';
      position: absolute;
      inset: 4px;
      border: 2px solid #3a67b8;
      border-radius: 4px;
      box-shadow:
        inset 0 0 0 2px #fdfcf7,
        inset 0 0 0 3px rgb(58 103 184 / 0.55);
      pointer-events: none;
    }
    .etiqueta-campo {
      position: relative;
      display: flex;
      align-items: baseline;
      gap: 10px;
      padding: 6px 14px 4px;
    }
    .etiqueta-rotulo {
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.8rem;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: #3a67b8;
    }
    /* escrito na linha pontilhada do campo */
    .etiqueta-escrito {
      padding: 0 4px 2px;
      background: radial-gradient(circle, rgb(58 103 184 / 0.6) 0.9px, transparent 1.2px) 0 100% / 5px 3px repeat-x;
      color: var(--ink);
      font-family: var(--f-marker);
      font-weight: 400;
      font-size: 1.7em;
      line-height: 1.1;
      white-space: nowrap;
    }
  `,
})
export class QueueLogo {}

/**
 * O logo do mural de resenhas: a etiqueta dupla das fichas (a Média em papel, o veredito no canhoto
 * preto, unidos pelo picote), com palavras no lugar dos números: "Análises" impresso no papel e o
 * mural no canhoto ("de jogos"), para nunca parecer uma nota.
 */
@Component({
  selector: 'app-reviews-logo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="papel" aria-hidden="true">Análises</span>
    <span class="canhoto" aria-hidden="true">de {{ plural() }}</span>
  `,
  styles: `
    :host {
      --notch: 5px;
      display: inline-flex;
      align-items: stretch;
      height: 52px;
      rotate: -1.4deg;
      filter: drop-shadow(0 1px 1px rgb(0 0 0 / 0.35)) drop-shadow(0 6px 8px rgb(0 0 0 / 0.4));
    }
    .papel {
      display: flex;
      align-items: center;
      padding: 3px 14px 0 13px;
      border-radius: 3px 0 0 3px;
      background: var(--paper-grain), var(--paper);
      color: var(--ink);
      font-family: var(--f-label);
      font-style: italic;
      font-weight: 800;
      font-size: 2.3rem;
      letter-spacing: -0.01em;
      line-height: 1;
      text-transform: uppercase;
    }
    /* o canhoto: tinta preta com letras de papel, destacável no picote, com os entalhes */
    .canhoto {
      display: flex;
      align-items: center;
      padding: 1px 16px 0 14px;
      border-left: 2px dotted rgb(255 255 255 / 0.5);
      border-radius: 0 3px 3px 0;
      background: var(--ink);
      color: var(--paper);
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 1rem;
      letter-spacing: 0.1em;
      line-height: 1;
      text-transform: uppercase;
      white-space: nowrap;
      mask:
        radial-gradient(circle at 0 0, #0000 var(--notch), #000 calc(var(--notch) + 0.5px)) top / 100% 51% no-repeat,
        radial-gradient(circle at 0 100%, #0000 var(--notch), #000 calc(var(--notch) + 0.5px)) bottom / 100% 51% no-repeat;
    }
  `,
})
export class ReviewsLogo {
  /** O mural, no plural ("jogos", "livros"). */
  readonly plural = input.required<string>();
}

/**
 * O logo das Anotações: a folha de cima de um bloco de espiral de repórter, a espiral de arame
 * passando pelos furos e "Anotações" escrito a pincel na primeira pauta.
 */
@Component({
  selector: 'app-notes-logo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="espiral" aria-hidden="true">
      @for (c of coils; track c) {
        <span class="volta"></span>
      }
    </span>
    <span class="escrito" aria-hidden="true">Anotações</span>
  `,
  styles: `
    :host {
      position: relative;
      display: inline-flex;
      align-items: flex-end;
      box-sizing: border-box;
      height: 48px;
      margin-top: 4px;
      padding: 0 19px 6px 17px;
      rotate: 1.3deg;
      border-radius: 1px 1px 3px 3px;
      /* a pauta azul clara, com a primeira linha embaixo do nome */
      background:
        linear-gradient(transparent calc(100% - 8px), rgb(58 103 184 / 0.34) calc(100% - 8px) calc(100% - 7px), transparent calc(100% - 7px)),
        repeating-linear-gradient(transparent 0 10px, rgb(58 103 184 / 0.15) 10px 11px),
        var(--paper-grain),
        #fdfcf6;
      filter: drop-shadow(0 1px 1px rgb(0 0 0 / 0.35)) drop-shadow(0 6px 8px rgb(0 0 0 / 0.4));
    }
    /* a espiral: as voltas de arame saem por cima da folha, cada uma passando por um furo */
    .espiral {
      position: absolute;
      top: -5px;
      left: 8px;
      right: 8px;
      display: flex;
      justify-content: space-evenly;
      pointer-events: none;
    }
    .volta {
      position: relative;
      width: 4px;
      height: 12px;
      border-radius: 2px;
      background: linear-gradient(90deg, #7c838b, #eef1f3 45%, #a7adb4 70%, #6c737a);
      box-shadow: 0 1px 1px rgb(0 0 0 / 0.45);

      /* o furo na folha, embaixo do arame */
      &::before {
        content: '';
        position: absolute;
        z-index: -1;
        top: 7px;
        left: -1.5px;
        width: 7px;
        height: 6px;
        border-radius: 50%;
        background: #26231f;
      }
    }
    .escrito {
      position: relative;
      color: var(--ink);
      font-family: var(--f-marker);
      font-weight: 400;
      font-size: 1.78rem;
      line-height: 1;
      white-space: nowrap;
    }
  `,
})
export class NotesLogo {
  protected readonly coils = Array.from({ length: 11 }, (_, i) => i);
}

/**
 * O logo do Kanban: um quadro branco pequeno de moldura de alumínio, "Kanban" escrito com o pincel
 * de quadro (com a sombra do que já foi apagado) e um post-it colado no canto.
 */
@Component({
  selector: 'app-kanban-logo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="escrito" aria-hidden="true">Kanban</span>
    <span class="postit" aria-hidden="true"></span>
  `,
  styles: `
    :host {
      position: relative;
      display: inline-flex;
      align-items: center;
      box-sizing: border-box;
      height: 52px;
      padding: 0 28px 0 19px;
      rotate: -1.2deg;
      border: 4px solid transparent;
      border-radius: 4px;
      background:
        /* o que foi apagado e deixou sombra no quadro */
        radial-gradient(ellipse 38% 34% at 72% 62%, rgb(90 100 110 / 0.1), transparent 70%) padding-box,
        radial-gradient(ellipse 30% 28% at 24% 30%, rgb(90 100 110 / 0.08), transparent 70%) padding-box,
        /* o brilho do esmalte */
        linear-gradient(158deg, #ffffff 0 34%, #eef1f4 34% 56%, #fafbfc 56%) padding-box,
        /* a moldura de alumínio escovado */
        linear-gradient(180deg, #eef0f2, #a3aab1 48%, #c9ced3 52%, #8b9299) border-box;
      filter: drop-shadow(0 1px 1px rgb(0 0 0 / 0.4)) drop-shadow(0 6px 8px rgb(0 0 0 / 0.4));
    }
    .escrito {
      color: #1b1d20;
      font-family: var(--f-marker);
      font-weight: 400;
      font-size: 1.86rem;
      line-height: 1;
      letter-spacing: 0.01em;
      white-space: nowrap;
    }
    /* o post-it rosa no canto de cima, por cima da moldura */
    .postit {
      position: absolute;
      top: -9px;
      right: -9px;
      width: 19px;
      height: 19px;
      rotate: 9deg;
      background: linear-gradient(160deg, #ff9fc2, #f97fae);
      box-shadow: 0 2px 2px rgb(0 0 0 / 0.3);
      clip-path: polygon(0 0, 100% 0, 100% 78%, 80% 100%, 0 100%);
    }
  `,
})
export class KanbanLogo {}

/**
 * O logo do Calendário: um papelzinho batido com o carimbo datador, em tinta violeta, com
 * "Calendário" em cima e a data de hoje embaixo (a de verdade, que vira à meia-noite).
 */
@Component({
  selector: 'app-calendar-logo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="carimbo" aria-hidden="true">
      <span class="titulo">Calendário</span>
      <span class="data">{{ stamp() }}</span>
    </span>
  `,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      box-sizing: border-box;
      height: 52px;
      padding: 0 13px;
      rotate: 1.6deg;
      border-radius: 2px;
      background: var(--paper-grain), #fbfaf5;
      filter: drop-shadow(0 1px 1px rgb(0 0 0 / 0.35)) drop-shadow(0 6px 8px rgb(0 0 0 / 0.4));
    }
    /* batido meio torto, a moldura dupla e a tinta falhando */
    .carimbo {
      display: grid;
      justify-items: center;
      gap: 2px;
      padding: 6px 12px 5px;
      rotate: -3.5deg;
      position: relative;
      border: 2px solid currentColor;
      border-radius: 5px;
      color: #5b3c9e;
      font-family: var(--f-label);
      font-weight: 800;
      line-height: 1;
      text-transform: uppercase;
      /* a erosão da tinta: os pontinhos onde a borracha não pegou */
      -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='60'%3E%3Cfilter id='f'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' seed='7'/%3E%3CfeColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 -3.4 0 0 0 2.95'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23f)'/%3E%3C/svg%3E");
      mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='60'%3E%3Cfilter id='f'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' seed='7'/%3E%3CfeColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 -3.4 0 0 0 2.95'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23f)'/%3E%3C/svg%3E");
    }
    /* o fio de dentro da moldura dupla (fora da borda, a máscara cortaria) */
    .carimbo::before {
      content: '';
      position: absolute;
      inset: 2px;
      border: 1px solid currentColor;
      border-radius: 3px;
    }
    .titulo {
      /* a última letra não fica com o espaço sobrando à direita */
      margin-right: -0.22em;
      font-size: 0.7rem;
      letter-spacing: 0.22em;
    }
    .data {
      font-size: 1.2rem;
      letter-spacing: 0.06em;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
  `,
})
export class CalendarLogo {
  /** O dia de hoje, `AAAA-MM-DD`. */
  readonly day = input.required<string>();

  protected readonly stamp = computed(() => {
    const [y, m, d] = this.day().split('-').map(Number);
    return `${String(d).padStart(2, '0')} ${MONTHS_SHORT[m - 1]} ${y}`;
  });
}

/**
 * O logo de Extras: um tíquete de fliperama, vermelho, com os entalhes nas laterais, o fio impresso
 * em volta e o canhoto do outro lado do picote ("Vale 1 rodada"). A sombra fica no host e o recorte
 * no bilhete, dentro dele: a máscara apagaria a sombra.
 */
@Component({
  selector: 'app-extras-logo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="bilhete" aria-hidden="true">
      <span class="nome">Extras</span>
      <span class="canhoto"><span>Vale</span><span>1 rodada</span></span>
    </span>
  `,
  styles: `
    :host {
      display: inline-flex;
      rotate: -2deg;
      filter: drop-shadow(0 1px 1px rgb(0 0 0 / 0.35)) drop-shadow(0 6px 8px rgb(0 0 0 / 0.4));
    }
    .bilhete {
      --notch: 6px;
      position: relative;
      display: inline-flex;
      align-items: stretch;
      box-sizing: border-box;
      height: 52px;
      color: #fbefd6;
      background: var(--paper-grain), linear-gradient(180deg, #d93a2f, #c22d24);
      /* a fibra do papel escurece o vermelho, não desbota */
      background-blend-mode: multiply;
      mask:
        radial-gradient(circle at 0 50%, #0000 var(--notch), #000 calc(var(--notch) + 0.5px)) left / 51% 100% no-repeat,
        radial-gradient(circle at 100% 50%, #0000 var(--notch), #000 calc(var(--notch) + 0.5px)) right / 51% 100% no-repeat;

      /* o fio impresso em volta */
      &::before {
        content: '';
        position: absolute;
        inset: 4px;
        border: 1.5px solid rgb(251 239 214 / 0.8);
        border-radius: 2px;
        pointer-events: none;
      }
    }
    .nome {
      display: flex;
      align-items: center;
      padding: 1px 12px 0 18px;
      font-family: var(--f-didone);
      font-size: 1.78rem;
      letter-spacing: 0.05em;
      line-height: 1;
      text-transform: uppercase;
    }
    .canhoto {
      display: grid;
      align-content: center;
      justify-items: center;
      gap: 2px;
      padding: 0 16px 0 11px;
      border-left: 2px dashed rgb(251 239 214 / 0.75);
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.74rem;
      letter-spacing: 0.12em;
      line-height: 1;
      text-transform: uppercase;
      white-space: nowrap;
    }
  `,
})
export class ExtrasLogo {}
