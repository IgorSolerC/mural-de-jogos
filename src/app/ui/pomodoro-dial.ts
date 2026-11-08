import { ChangeDetectionStrategy, Component, computed, input, linkedSignal } from '@angular/core';
import { PomodoroPhase, PomodoroSkin, clockText } from '../core/pomodoro';
import { SEGMENTS, segmentsOf } from './seven-segment';
import { NgTemplateOutlet } from '@angular/common';

/** Uma plaquinha do placar: a que está à mostra e a de antes (diferentes enquanto ela vira). */
interface Flap {
  key: string;
  cur: string;
  old: string;
}

/** Quantos tracinhos o bilhete, a lousa e o Dymo desenham para o andamento. */
const MARKS = 5;

/**
 * O mostrador do Pomodoro (PLANO-POMODORO.md, seção 6), em 12 skins. Um desenho só para o relógio do canto, a
 * vitrine da página e a cartela de escolha: tudo mede em em da letra do host (`--dial`), então muda de tamanho
 * sem mudar de forma. Todas mostram o tempo, a fase (em palavra, nunca só na cor), o andamento e o pausado.
 *
 * O mostrador é só desenho (`aria-hidden`): quem o põe na tela diz o tempo ao leitor de tela, por minuto.
 */
@Component({
  selector: 'app-pomodoro-dial',
  imports: [NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    'aria-hidden': 'true',
    '[class]': "'d-' + skin()",
    '[class.pausa]': "phase() === 'pausa'",
    '[class.parado]': '!running()',
    '[class.pausado]': 'paused()',
    '[style.--p]': 'progress()',
    '[attr.data-tempo]': 'time()',
  },
  styleUrl: './pomodoro-dial.scss',
  template: `
    @switch (skin()) {
      @case ('tomate') {
        <div class="tomate">
          <span class="fruta"></span>
          <svg class="cabinho" viewBox="0 0 40 40">
            <path d="M20 21 L9 12 L18 15.5 L14 5 L21 13.5 L27 4.5 L24.5 15 L33 10 L23 20.5 Z" />
            <path class="talo" d="M20 16 C20.4 11 21.6 8 24 6" />
          </svg>
          <span class="visor">{{ time() }}</span>
          <span class="fase">{{ phaseWord() }}</span>
        </div>
      }
      @case ('bilhete') {
        <div class="bilhete">
          <span class="fita"></span>
          <span class="fase">{{ paused() ? 'parado' : phase() === 'estudo' ? 'estudando' : 'pausa!' }}</span>
          <span class="tempo mao"><ng-container *ngTemplateOutlet="letras" /></span>
          <span class="riscos">
            @for (on of marks(); track $index) {
              <i [class.feito]="on"></i>
            }
          </span>
        </div>
      }
      @case ('placar') {
        <div class="placar">
          <span class="topo"><i class="lampada"></i>{{ phaseWord() }}</span>
          <span class="celas">
            @for (f of flaps(); track f.key) {
              @if (f.cur === ':') {
                <span class="dois-pontos"><i></i><i></i></span>
              } @else {
                <span class="cela">
                  <span class="meia cima"><span class="letra">{{ f.cur }}</span></span>
                  <span class="meia baixo"><span class="letra">{{ f.cur }}</span></span>
                  @if (f.cur !== f.old) {
                    <span class="meia baixo velha"><span class="letra">{{ f.old }}</span></span>
                    <span class="meia baixo sobe"><span class="letra">{{ f.cur }}</span></span>
                    <span class="meia cima cai"><span class="letra">{{ f.old }}</span></span>
                  }
                </span>
              }
            }
          </span>
          <span class="trilho"><i></i></span>
        </div>
      }
      @case ('neon') {
        <div class="neon">
          <span class="fase">{{ phaseWord() }}</span>
          <ng-container *ngTemplateOutlet="digitos" />
          <span class="trilho"><i></i></span>
        </div>
      }
      @case ('lcd') {
        <div class="lcd">
          <span class="pulseira esq"></span>
          <span class="pulseira dir"></span>
          <span class="caixa">
            <span class="marca">FOCO·W</span>
            <span class="visor">
              <span class="icones">
                <b class="palavra">{{ phaseWord() }}</b>
                <span class="bateria">
                  @for (on of marks(); track $index) {
                    <i [class.on]="!on"></i>
                  }
                </span>
              </span>
              <ng-container *ngTemplateOutlet="digitos" />
            </span>
          </span>
        </div>
      }
      @case ('lousa') {
        <div class="lousa">
          <span class="quadro">
            <span class="fase">{{ phaseWord() }}</span>
            <span class="tempo mao"><ng-container *ngTemplateOutlet="letras" /></span>
            <span class="riscos">
              @for (on of marks(); track $index) {
                <i [class.feito]="on"></i>
              }
            </span>
          </span>
          <span class="giz"></span>
        </div>
      }
      @case ('ampulheta') {
        <div class="ampulheta">
          <svg class="vidro" viewBox="0 0 60 96">
            <defs>
              <clipPath [attr.id]="clipId + 'c'"><path d="M10 8 H50 C50 30 33 40 32 48 C33 56 50 66 50 88 H10 C10 66 27 56 28 48 C27 40 10 30 10 8 Z" /></clipPath>
            </defs>
            <g [attr.clip-path]="'url(#' + clipId + 'c)'">
              <rect class="areia" x="0" [attr.y]="8 + 40 * progress()" width="60" [attr.height]="40 * (1 - progress())" />
              <path class="areia" [attr.d]="pile()" />
              @if (running()) {
                <rect class="fio" x="29.2" y="46" width="1.6" height="42" />
              }
            </g>
            <path class="contorno" d="M10 8 H50 C50 30 33 40 32 48 C33 56 50 66 50 88 H10 C10 66 27 56 28 48 C27 40 10 30 10 8 Z" />
            <rect class="tampa" x="4" y="2" width="52" height="7" rx="2" />
            <rect class="tampa" x="4" y="87" width="52" height="7" rx="2" />
            <rect class="pau" x="6.5" y="9" width="3" height="78" />
            <rect class="pau" x="50.5" y="9" width="3" height="78" />
          </svg>
          <span class="etiqueta">
            <span class="tempo">{{ time() }}</span>
            <span class="fase">{{ phaseWord() }}</span>
          </span>
        </div>
      }
      @case ('cassete') {
        <div class="cassete">
          <span class="adesivo">
            <span class="lado">{{ phase() === 'estudo' ? 'A' : 'B' }}</span>
            <span class="tempo mao"><ng-container *ngTemplateOutlet="letras" /></span>
            <span class="fase">{{ phaseWord() }}</span>
          </span>
          <span class="janela">
            <span class="carretel esq" [style.--rolo]="1 - progress()"><i></i></span>
            <span class="carretel dir" [style.--rolo]="progress()"><i></i></span>
          </span>
          <span class="base"></span>
        </div>
      }
      @case ('vinil') {
        <div class="vinil">
          <span class="disco"><span class="selo"><i></i></span></span>
          <span class="braco"><i></i></span>
          <span class="etiqueta">
            <span class="tempo">{{ time() }}</span>
            <span class="fase">{{ phaseWord() }}</span>
          </span>
        </div>
      }
      @case ('disco') {
        <div class="disco-timer">
          <span class="mostrador">
            <span class="fatia"></span>
            <span class="pino"></span>
          </span>
          <span class="tempo">{{ time() }}</span>
          <span class="fase">{{ phaseWord() }}</span>
        </div>
      }
      @case ('dymo') {
        <div class="dymo">
          <i class="tacha esq"></i>
          <i class="tacha dir"></i>
          <span class="fita fase">{{ phaseWord() }}</span>
          <span class="fita tempo">{{ time() }}</span>
          <span class="fita andamento">
            @for (on of marks(); track $index) {
              <i [class.feito]="on"></i>
            }
          </span>
        </div>
      }
      @default {
        <div class="broche">
          <span class="lata">
            <span class="face">
              <span class="tempo">{{ time() }}</span>
              <span class="fase">{{ phaseWord() }}</span>
            </span>
          </span>
        </div>
      }
    }

    <!-- o tempo à mão (marcador, giz): cada letra numa casa da mesma largura, para o número não dançar -->
    <ng-template #letras>
      @for (c of chars(); track $index) {
        <i [class.dp]="c === ':'">{{ c }}</i>
      }
    </ng-template>

    <ng-template #digitos>
      <span class="algs">
        @for (c of chars(); track $index) {
          @if (c === ':') {
            <span class="pontos"><i></i><i></i></span>
          } @else {
            <svg class="seg" viewBox="0 0 12 20">
              @for (on of segmentsOf(c); track $index) {
                <polygon [attr.points]="SEGMENTS[$index]" [class.aceso]="on" />
              }
            </svg>
          }
        }
      </span>
    </ng-template>
  `,
})
export class PomodoroDial {
  readonly skin = input.required<PomodoroSkin>();
  /** O que falta da fase (ms). */
  readonly ms = input.required<number>();
  /** A duração da fase (ms). */
  readonly total = input.required<number>();
  readonly phase = input<PomodoroPhase>('estudo');
  readonly paused = input(false);
  /** Desligado: o relógio parado, pronto para começar. */
  readonly idle = input(false);

  protected readonly SEGMENTS = SEGMENTS;
  protected readonly segmentsOf = segmentsOf;
  /** O id do recorte da ampulheta: um por mostrador (vários na mesma página, na cartela). */
  protected readonly clipId = `ampulheta-${++uid}-`;

  protected readonly time = computed(() => clockText(this.ms()));
  protected readonly chars = computed(() => [...this.time()]);
  protected readonly running = computed(() => !this.idle() && !this.paused());
  protected readonly progress = computed(() => {
    const total = this.total();
    if (this.idle() || total <= 0) return 0;
    return Math.round(Math.min(1, Math.max(0, 1 - this.ms() / total)) * 1000) / 1000;
  });
  /** A palavra da fase; pausado é "parado" (e não "pausado", que se confundiria com a pausa). */
  protected readonly phaseWord = computed(() => (this.paused() ? 'parado' : this.phase() === 'estudo' ? 'estudo' : 'pausa'));
  /** Os tracinhos feitos de cinco (o bilhete, a lousa, o relógio de pulso, o Dymo). */
  protected readonly marks = computed(() => {
    const done = Math.floor(this.progress() * MARKS + 1e-9);
    return Array.from({ length: MARKS }, (_, i) => i < done);
  });

  /** O monte de areia de baixo da ampulheta: cresce do fundo com o andamento. */
  protected readonly pile = computed(() => {
    const h = 34 * this.progress();
    const base = 88;
    const top = base - h;
    return `M8 ${base} L8 ${base - h * 0.35} Q30 ${top - 4} 52 ${base - h * 0.35} L52 ${base} Z`;
  });

  /**
   * As plaquinhas do placar: cada algarismo que mudou ganha uma plaquinha nova (a `key` muda), que vira
   * uma vez da de antes para a de agora.
   */
  protected readonly flaps = linkedSignal<string, Flap[]>({
    source: this.time,
    computation: (cur, prev) => {
      const before = prev?.source ?? cur;
      const pad = Math.max(cur.length, before.length);
      const c = cur.padStart(pad, ' ');
      const o = before.padStart(pad, ' ');
      return [...c].map((ch, i) => ({ key: `${i}:${ch}:${o[i]}`, cur: ch, old: o[i] === ':' ? ch : o[i] })).filter((f) => f.cur !== ' ');
    },
  });
}

let uid = 0;
