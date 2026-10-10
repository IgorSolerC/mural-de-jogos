import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Hourglass, LucideAngularModule } from 'lucide-angular';
import { Clock } from '../core/clock';
import { Remaining, readCountdown, remaining, targetOf } from '../core/widgets';

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const MONTHS_LONG = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

type Unit = 'days' | 'hours' | 'minutes' | 'seconds';
const UNIT_NAMES: Record<Unit, [string, string]> = {
  days: ['dia', 'dias'],
  hours: ['hora', 'horas'],
  minutes: ['minuto', 'minutos'],
  seconds: ['segundo', 'segundos'],
};
const UNIT_SHORT: Record<Unit, string> = { days: 'd', hours: 'h', minutes: 'min', seconds: 's' };
const ORDER: Unit[] = ['days', 'hours', 'minutes', 'seconds'];

const pad = (n: number) => String(n).padStart(2, '0');
const plural = (n: number, u: Unit) => `${n} ${UNIT_NAMES[u][n === 1 ? 0 : 1]}`;

/**
 * O widget CONTADOR (ver core/widgets.ts): um bloquinho de calendário de mesa, desses de destacar,
 * colado na anotação com um pedaço de fita crepe. O papelão de cima diz "Faltam"; a folha da frente
 * tem o número grande da maior unidade que ainda falta (dias, depois horas, minutos, segundos), e
 * ao lado, na tinta da ficha, para quê é, o dia e o resto (07 h 23 min 12 s), andando.
 *
 * Quando o número muda, a folha da frente é arrancada e cai (no último minuto, uma por segundo).
 * Chegou o dia: o bloquinho vira a folha daquele dia (o mês no papelão, o dia no papel) com o
 * carimbo vermelho "Chegou!" ("É hoje!" no de todo ano, que no dia seguinte volta a contar).
 */
@Component({
  selector: 'app-countdown',
  imports: [LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (state(); as s) {
      <div class="contador" [class.chegou]="s.r.past" role="timer" [attr.aria-label]="spoken()">
        <div class="bloco" aria-hidden="true">
          <span class="fita"></span>
          <span class="papelao">{{ s.r.past ? s.month : s.big.n === 1 ? 'Falta' : 'Faltam' }}</span>
          <span class="folhas">
            <span class="folha" [class.longo]="s.big.text.length === 3" [class.longuissimo]="s.big.text.length > 3">
              <span class="num">{{ s.big.text }}</span>
              <span class="unid">{{ s.big.unit }}</span>
            </span>
            @if (fallen(); as f) {
              <!-- a folha de antes, arrancada: cai na frente da nova -->
              <span class="folha caindo" [class.longo]="f.text.length === 3" [class.longuissimo]="f.text.length > 3" (animationend)="fallen.set(null)">
                <span class="num">{{ f.text }}</span>
                <span class="unid">{{ f.unit }}</span>
              </span>
            }
          </span>
          @if (s.r.past) {
            <span class="carimbo">{{ s.yearly ? 'É hoje!' : 'Chegou!' }}</span>
          }
        </div>
        <div class="lado" aria-hidden="true">
          <span class="nome">{{ s.title || s.dateShort }}</span>
          <span class="quando">
            @if (s.r.past && !s.yearly) {
              Foi em
            }
            {{ s.title ? s.dateShort : '' }}{{ s.title && s.time ? ' · ' : '' }}{{ s.time }}{{ s.yearly ? (s.title || s.time ? ' · ' : '') + 'todo ano' : '' }}
            @if (s.soon) {
              <span class="logo">{{ s.soon }}</span>
            }
          </span>
          @if (s.r.past) {
            <span class="resto passado">{{ s.ago }}</span>
          } @else if (s.rest.length) {
            <span class="resto">
              @for (p of s.rest; track p.u) {
                <span class="peca"><span class="n">{{ p.n }}</span><span class="u">{{ p.u }}</span></span>
              }
            </span>
          }
        </div>
      </div>
    } @else {
      <!-- sem uma data que exista: o contador em branco diz como escrever -->
      <div class="contador quebrado" role="note">
        <span class="vazio-icone" aria-hidden="true"><lucide-icon [img]="EmptyIcon" [size]="22" [strokeWidth]="2.4" /></span>
        <span class="lado">
          <span class="nome">Contador sem data</span>
          <span class="dica">
            @if (broken(); as b) {
              “{{ b }}” não é um dia que ele entenda.
            }
            Escreva assim: <code>19/11/2026 18:00</code>
          </span>
        </span>
      </div>
    }
  `,
  styles: `
    :host {
      /* a peça ocupa linhas inteiras da pauta: o texto de baixo continua em cima das linhas azuis */
      min-height: calc(var(--line, 1.5em) * 4);
      min-height: round(up, 5.7em, var(--line, 1.5em));
      display: flex;
      align-items: center;
      white-space: normal;
    }
    .contador {
      display: flex;
      align-items: center;
      gap: 0.85em;
      min-width: 0;
      max-width: 100%;
    }

    /* ===== O bloquinho: papelão vermelho em cima, as folhas embaixo, preso com fita crepe ===== */
    .bloco {
      position: relative;
      isolation: isolate;
      flex: none;
      display: grid;
      width: 4.4em;
      margin: 0.35em 0 0.55em 0.15em;
      rotate: -2.2deg;
      filter: drop-shadow(0 1px 1px rgb(0 0 0 / 0.28)) drop-shadow(0 4px 5px rgb(0 0 0 / 0.2));
    }
    .papelao {
      position: relative;
      z-index: 2;
      display: block;
      /* o alto do papelão é da fita: a palavra fica embaixo dela */
      padding: 0.62em 0.2em 0.28em;
      border-radius: 2px 2px 0 0;
      background:
        linear-gradient(rgb(255 255 255 / 0.12), transparent 40%),
        #a51c1b;
      color: #fbf6ea;
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.6em;
      line-height: 1;
      letter-spacing: 0.14em;
      text-align: center;
      text-transform: uppercase;
      box-shadow: inset 0 -1px 0 rgb(0 0 0 / 0.25);
    }
    /* as folhas: a da frente e duas embaixo dela, que aparecem só na beirada (o bloco é grosso) */
    .folhas {
      position: relative;
      display: grid;
    }
    .folhas::before,
    .folhas::after {
      content: '';
      position: absolute;
      inset: 0;
      z-index: -1;
      border-radius: 0 0 2px 2px;
      background: #ece5d4;
      translate: 0.5px 2.5px;
      rotate: 0.8deg;
    }
    .folhas::after {
      z-index: -2;
      background: #ddd4bf;
      translate: -0.5px 5px;
      rotate: -1deg;
    }
    .folha {
      grid-area: 1 / 1;
      display: grid;
      justify-items: center;
      align-content: center;
      padding: 0.18em 0.15em 0.3em;
      border-radius: 0 0 2px 2px;
      background: #fffdf6;
      color: #151515;
      /* o picote de destacar, logo embaixo do papelão */
      border-top: 1.5px dotted rgb(21 21 21 / 0.3);
    }
    .num {
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 2.15em;
      line-height: 1;
      letter-spacing: -0.02em;
      font-variant-numeric: tabular-nums;
    }
    .longo .num {
      font-size: 1.75em;
      line-height: 1.15;
    }
    .longuissimo .num {
      font-size: 1.38em;
      line-height: 1.45;
    }
    .unid {
      margin-top: 0.1em;
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.58em;
      line-height: 1;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: #6d2321;
    }
    /* a fita crepe por cima do papelão, colando o bloquinho na anotação */
    .fita {
      position: absolute;
      top: -0.36em;
      left: 50%;
      z-index: 3;
      width: 2.3em;
      height: 0.62em;
      translate: -50% 0;
      rotate: 5deg;
      background: rgb(222 205 160 / 0.86);
      box-shadow: 0 1px 1px rgb(0 0 0 / 0.18);
      /* as pontas rasgadas à mão */
      -webkit-mask: linear-gradient(90deg, transparent 0, #000 2px calc(100% - 2px), transparent 100%);
      mask: linear-gradient(90deg, transparent 0, #000 2px calc(100% - 2px), transparent 100%);
    }

    /* ===== A folha arrancada: dobra no picote de cima e cai, girando ===== */
    .caindo {
      z-index: 1;
      transform-origin: 85% 0;
      animation: arranca 620ms cubic-bezier(0.5, 0, 0.75, 0) forwards;
      pointer-events: none;
    }
    @keyframes arranca {
      0% {
        transform: none;
        opacity: 1;
      }
      30% {
        transform: rotate(-7deg) translateY(1px);
        opacity: 1;
      }
      100% {
        transform: rotate(-24deg) translate(-0.6em, 2.6em);
        opacity: 0;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .caindo {
        display: none;
      }
    }

    /* ===== Chegou: a folha do dia, com o carimbo vermelho torto por cima ===== */
    .carimbo {
      position: absolute;
      left: 50%;
      top: 58%;
      z-index: 4;
      padding: 0.16em 0.32em 0.12em;
      translate: -50% -50%;
      rotate: -16deg;
      border: 2px solid rgb(184 29 28 / 0.88);
      border-radius: 3px;
      color: rgb(184 29 28 / 0.92);
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.66em;
      line-height: 1;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      white-space: nowrap;
      background: rgb(255 253 246 / 0.7);
      /* a tinta do carimbo falha um pouco, como borracha de verdade */
      -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='24'%3E%3Cfilter id='f'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' seed='7'/%3E%3CfeColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 -2.4 1.9'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23f)'/%3E%3C/svg%3E");
      mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='24'%3E%3Cfilter id='f'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' seed='7'/%3E%3CfeColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 -2.4 1.9'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23f)'/%3E%3C/svg%3E");
      animation: carimba 420ms var(--ease-physical) both;
    }
    @keyframes carimba {
      from {
        opacity: 0;
        scale: 1.5;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .carimbo {
        animation: none;
      }
    }
    /* o dia que passou fica apagado embaixo do carimbo, que é o que se lê */
    .chegou .num,
    .chegou .unid {
      opacity: 0.3;
    }

    /* ===== Ao lado, na tinta da ficha: para quê, o dia e o resto ===== */
    .lado {
      display: grid;
      align-content: center;
      gap: 0.12em;
      min-width: 0;
    }
    .nome {
      display: -webkit-box;
      overflow: hidden;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      font-family: var(--f-marker);
      font-size: 1.08em;
      line-height: 1.12;
      overflow-wrap: anywhere;
      text-wrap: balance;
    }
    .quando {
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.74em;
      line-height: 1.25;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    .quando:empty {
      display: none;
    }
    /* "é hoje!", "amanhã!": escrito à mão do lado, meio torto */
    .logo {
      display: inline-block;
      margin-left: 0.35em;
      font-family: var(--f-hand);
      font-weight: 700;
      font-size: 1.32em;
      line-height: 1;
      letter-spacing: 0;
      text-transform: none;
      rotate: -4deg;
    }
    .resto {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 0 0.42em;
      font-family: var(--f-label);
      font-weight: 800;
      line-height: 1.15;
      font-variant-numeric: tabular-nums;
    }
    .peca .n {
      font-size: 1.12em;
    }
    .peca .u {
      margin-left: 0.08em;
      font-size: 0.72em;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      opacity: 0.82;
    }
    .resto.passado {
      font-family: var(--f-hand);
      font-weight: 400;
      font-size: 0.95em;
    }

    /* ===== Sem data: o contorno tracejado de onde ele vai ficar ===== */
    .quebrado {
      gap: 0.7em;
      padding: 0.45em 0.8em 0.45em 0.6em;
      border: 2px dashed color-mix(in srgb, currentColor 45%, transparent);
      border-radius: 3px;
    }
    .vazio-icone {
      display: grid;
      opacity: 0.7;
    }
    .quebrado .nome {
      font-size: 0.98em;
    }
    .dica {
      font-family: var(--f-ui);
      font-size: 0.8em;
      line-height: 1.3;
      opacity: 0.86;
    }
    .dica code {
      font-family: 'Courier New', ui-monospace, monospace;
      font-weight: 700;
    }
  `,
})
export class Countdown {
  /** Os parâmetros como foram escritos no texto. */
  readonly args = input.required<readonly string[]>();

  protected readonly EmptyIcon = Hourglass;
  private readonly clock = inject(Clock);

  constructor() {
    this.clock.use();
    // o número da folha mudou: a de antes é arrancada (não na primeira vez, nem trocando de contador)
    let last: { key: string; text: string; unit: string } | null = null;
    effect(() => {
      const s = this.state();
      const key = this.args().join('|');
      const now = s && !s.r.past ? { key, text: s.big.text, unit: s.big.unit } : null;
      const prev = last;
      last = now;
      if (prev && now && prev.key === now.key && (prev.text !== now.text || prev.unit !== now.unit)) {
        untracked(() => this.fallen.set({ text: prev.text, unit: prev.unit }));
      }
    });
  }

  /** A folha que está caindo (a de antes). */
  protected readonly fallen = signal<{ text: string; unit: string } | null>(null);

  private readonly parsed = computed(() => readCountdown(this.args()));
  /** No contador sem data, o que está escrito no lugar dela (o primeiro parâmetro). */
  protected readonly broken = computed(() => this.args()[0] ?? '');

  protected readonly state = computed(() => {
    const { when, title } = this.parsed();
    if (!when) return null;
    const now = this.clock.now();
    const target = targetOf(when, now);
    const r = remaining(target, now);
    const at = new Date(target);
    const yearly = when.year === null;
    const big = this.bigOf(r, at);
    return {
      r,
      title,
      yearly,
      big,
      month: MONTHS[at.getMonth()],
      dateShort: `${at.getDate()} ${MONTHS[at.getMonth()]}` + (yearly ? '' : ` ${at.getFullYear()}`),
      time: when.timed ? `${pad(when.hour)}:${pad(when.minute)}` : '',
      rest: r.past ? [] : this.restOf(r, big.u),
      ago: r.past ? this.agoOf(r, yearly) : '',
      soon: r.past ? '' : this.soonOf(at, now),
    };
  });

  /** A folha: a maior unidade que ainda falta; chegou, o dia do mês. */
  private bigOf(r: Remaining, at: Date): { n: number; text: string; unit: string; u: Unit | null } {
    if (r.past) return { n: at.getDate(), text: String(at.getDate()), unit: WEEKDAYS[at.getDay()], u: null };
    const u = ORDER.find((k) => r[k] > 0) ?? 'seconds';
    const n = r[u];
    return { n, text: String(n), unit: UNIT_NAMES[u][n === 1 ? 0 : 1], u };
  }

  /** O que vem depois da unidade da folha, com dois algarismos: 07 h 23 min 12 s. */
  private restOf(r: Remaining, u: Unit | null): { n: string; u: string }[] {
    const from = u ? ORDER.indexOf(u) + 1 : 0;
    return ORDER.slice(from).map((k) => ({ n: pad(r[k]), u: UNIT_SHORT[k] }));
  }

  private agoOf(r: Remaining, yearly: boolean): string {
    if (yearly) return 'Hoje. Amanhã volta a contar para o ano que vem.';
    const u = ORDER.find((k) => r[k] > 0 && k !== 'seconds');
    return u ? `há ${plural(r[u], u)}` : 'agora há pouco';
  }

  /** "é hoje!" e "amanhã!", pelo dia do calendário (não pelas 24 horas). */
  private soonOf(at: Date, now: number): string {
    const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const diff = Math.round((day(at) - day(new Date(now))) / 86_400_000);
    return diff === 0 ? 'é hoje!' : diff === 1 ? 'amanhã!' : '';
  }

  /** O que o leitor de tela diz: de minuto em minuto (não a cada segundo). */
  protected readonly spoken = computed(() => {
    const { when, title } = this.parsed();
    if (!when) return '';
    const now = Math.floor(this.clock.now() / 60_000) * 60_000;
    const target = targetOf(when, now);
    const r = remaining(target, now);
    const at = new Date(target);
    const date = `${at.getDate()} de ${MONTHS_LONG[at.getMonth()]}` + (when.year === null ? '' : ` de ${at.getFullYear()}`) + (when.timed ? ` às ${pad(when.hour)}:${pad(when.minute)}` : '');
    const name = title ? `Contador: ${title}. ` : 'Contador. ';
    if (r.past) return name + (when.year === null ? `É hoje, ${date}.` : `Chegou em ${date}.`);
    const parts = ORDER.filter((k) => k !== 'seconds' && r[k] > 0)
      .slice(0, 2)
      .map((k) => plural(r[k], k));
    const left = parts.length ? parts.join(' e ') : 'menos de 1 minuto';
    // concorda com o primeiro, como o papelão: "Falta 1 dia e 3 horas", "Faltam 2 dias"
    const one = !parts.length || parts[0].startsWith('1 ');
    return `${name}${one ? 'Falta' : 'Faltam'} ${left}, até ${date}${when.year === null ? ' (todo ano)' : ''}.`;
  });
}
