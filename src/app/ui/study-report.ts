import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { recallNow, studyDay } from '../core/fsrs';
import { LEVEL_LABEL, levelOf, whenLabel } from '../core/study';
import { StudyStore } from '../core/study-store';
import { ICON, IconModule } from './icons';

const MONTHS = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];

/**
 * O boletim de uma carta dos Estudos (PLANO-ESTUDOS.md, 6.8): o nível num selo impresso, quando volta, quantas
 * vezes foi vista e quantas acertou e errou, a chance de lembrar agora (o R do FSRS) e as últimas respostas
 * como riscos de contagem a lápis. Na aba Flashcard do editor e na folha da carta.
 */
@Component({
  selector: 'app-study-report',
  imports: [IconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (data(); as d) {
      <div class="boletim">
        <p class="topo">
          <span class="nivel" [attr.data-nivel]="d.level"><span class="sr-only">Nível: </span>{{ d.levelLabel }}</span>
          <span class="volta">{{ d.when }}</span>
          @if (d.date) {
            <span class="data">{{ d.date }}</span>
          }
        </p>
        @if (d.seen) {
          <p class="contas">
            Vista {{ d.seen === 1 ? '1 vez' : d.seen + ' vezes' }} · acertou {{ d.right }} · errou {{ d.wrong }}
          </p>
          <p class="chance">Chance de lembrar agora: <strong>{{ d.recall }}%</strong></p>
          <p class="marcas">
            <span class="sr-only">As últimas respostas: {{ d.spoken }}</span>
            @for (m of d.marks; track $index) {
              <lucide-icon class="marca" [class.errou]="!m" [img]="m ? RightIcon : WrongIcon" [size]="15" aria-hidden="true" />
            }
          </p>
        } @else {
          <p class="contas">Entra quando chegar a vez dela, com as novas do baralho.</p>
        }
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .boletim {
      display: grid;
      gap: 6px;
    }
    p {
      margin: 0;
    }
    .topo {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px 10px;
    }
    /* o nível: o selo impresso das observações do Kanban, na tinta do nível (as dos montes dos Estudos) */
    .nivel {
      --imp: #151515;
      display: inline-flex;
      align-items: center;
      min-height: 22px;
      padding: 4px 8px 3px;
      border-radius: 2px;
      background:
        linear-gradient(var(--imp), var(--imp)) 0 2px / 100% 1.5px no-repeat,
        linear-gradient(var(--imp), var(--imp)) 0 calc(100% - 2px) / 100% 1.5px no-repeat,
        var(--paper);
      color: var(--imp);
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.74rem;
      letter-spacing: 0.09em;
      text-transform: uppercase;
      filter: drop-shadow(0 1px 1px rgb(0 0 0 / 0.3));
      rotate: -1.5deg;
    }
    .nivel[data-nivel='desconhecida'] {
      --imp: #5f5a52;
      border: 1.5px dashed #5f5a52;
      background: transparent;
      filter: none;
    }
    .nivel[data-nivel='nova'] {
      --imp: #1f4fc4;
    }
    .nivel[data-nivel='aprendendo'] {
      --imp: #b24a06;
    }
    .nivel[data-nivel='dominada'] {
      --imp: #0d6b3c;
    }
    .volta {
      font-family: var(--f-hand);
      font-weight: 700;
      font-size: 1.08rem;
    }
    .data {
      font-family: var(--f-label);
      font-weight: 700;
      font-size: 0.78rem;
      letter-spacing: 0.1em;
      color: var(--ink-2);
      font-variant-numeric: tabular-nums;
    }
    .contas {
      font-family: var(--f-label);
      font-weight: 700;
      font-size: 0.88rem;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: var(--ink-2);
    }
    .chance {
      font-family: var(--f-hand);
      font-size: 1.02rem;

      strong {
        font-family: var(--f-label);
        font-weight: 800;
        font-size: 1.1rem;
        font-variant-numeric: tabular-nums;
      }
    }
    /* as últimas respostas, da mais antiga para a mais nova: tiques a lápis, o erro em vermelho */
    .marcas {
      display: flex;
      flex-wrap: wrap;
      gap: 1px;
      color: #4b4740;
    }
    .marca {
      display: inline-flex;
    }
    .marca.errou {
      color: var(--red-deep);
    }
  `,
})
export class StudyReport {
  /** O id da anotação da carta. */
  readonly note = input.required<string>();

  protected readonly RightIcon = ICON.pronto;
  protected readonly WrongIcon = ICON.fechar;

  private readonly study = inject(StudyStore);

  protected readonly data = computed(() => {
    const card = this.study.cardOf().get(this.note());
    if (!card) return null;
    const now = this.study.now();
    const level = levelOf(card.srs);
    const due = new Date(card.srs.due);
    const studied = card.srs.state !== 'nova';
    const marks = [...card.stats.marks].map((m) => m === '1');
    return {
      level,
      levelLabel: LEVEL_LABEL[level],
      when: studied ? `Volta ${whenLabel(card.srs, now)}` : 'Nunca estudada',
      // a data só quando é outro dia (a vencida "volta hoje", sem a data de quando venceu)
      date: card.srs.state === 'revisao' && studyDay(due) > studyDay(now) ? `${String(due.getDate()).padStart(2, '0')} ${MONTHS[due.getMonth()]}` : '',
      seen: card.stats.seen,
      right: card.stats.right,
      wrong: card.stats.wrong,
      recall: Math.round(recallNow(card.srs, now) * 100),
      marks,
      spoken: marks.map((m) => (m ? 'acertou' : 'errou')).join(', '),
    };
  });
}
