import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, inject, input, linkedSignal, output, viewChild } from '@angular/core';
import { chime, wakeChime } from '../core/chime';
import { POMODORO_CORNERS, POMODORO_PRESETS, POMODORO_SKINS } from '../core/pomodoro';
import { PomodoroStore } from '../core/pomodoro-store';
import { PomodoroTracks } from '../core/pomodoro-tracks-store';
import { BackdropClose } from './backdrop-close';
import { ICON, IconModule } from './icons';
import { MinutesRuler } from './minutes-ruler';
import { PomodoroDial } from './pomodoro-dial';
import { PomodoroTrackList } from './pomodoro-tracks';

/** As partes da folha: cada fita da prateleira abre uma. */
export type PomodoroPart = 'tempo' | 'musica' | 'relogio';

/** O tempo das skins da grade: um que mostra os quatro algarismos diferentes. */
const SAMPLE_MS = (18 * 60 + 42) * 1000;

/**
 * A folha dos ajustes do Pomodoro (PLANO-POMODORO-REWORK.md), aberta pelas fitas da prateleira da página. A ficha
 * de fichário dos diálogos, com a faixa do tomate; embaixo do título, a cartela de três adesivos (a do "Quem vê?"),
 * cada um com o que está valendo: Tempo (as réguas, os atalhos e o sininho), Música (a lista do aparelho) e Relógio
 * (as 12 skins e o canto da tela). Tudo vale na hora, até com o turno andando.
 */
@Component({
  selector: 'app-pomodoro-sheet',
  imports: [BackdropClose, IconModule, MinutesRuler, PomodoroDial, PomodoroTrackList],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dialog class="sheet pomodoro-folha" aria-labelledby="pomodoro-folha-titulo" (close)="closed.emit()" (backdropClose)="close()">
      <div class="ficha" style="--stock: var(--stock-vermelho)">
        <header class="head">
          <div class="titulos">
            <h2 id="pomodoro-folha-titulo">Ajustes do Pomodoro</h2>
            <p class="sub">Valem na hora, até com o turno andando</p>
          </div>
          <button type="button" class="icon-btn fecha" aria-label="Fechar" (click)="close()">
            <lucide-icon [img]="ICON.fechar" [size]="22" aria-hidden="true" />
          </button>
        </header>

        <div class="partes" role="group" aria-label="O que ajustar">
          @for (p of PARTS; track p.id) {
            <button type="button" class="parte" [attr.aria-pressed]="part() === p.id" aria-controls="pomodoro-folha-miolo" (click)="part.set(p.id)">
              <lucide-icon [img]="p.icon" [size]="20" aria-hidden="true" />
              <span class="parte-nome">{{ p.label }}</span>
              <span class="parte-valor">{{ values()[p.id] }}</span>
            </button>
          }
        </div>

        <div class="body" id="pomodoro-folha-miolo">
          @switch (part()) {
            @case ('tempo') {
              <h3 class="sr-only">Tempo</h3>
              <div class="reguas">
                <app-minutes-ruler label="Estudo" inputId="pomodoro-estudo" tone="estudo" [value]="s().study" (changed)="store.setMinutes('estudo', $event)" />
                <app-minutes-ruler label="Pausa" inputId="pomodoro-pausa" tone="pausa" [value]="s().rest" (changed)="store.setMinutes('pausa', $event)" />
              </div>
              <div class="atalhos" role="group" aria-label="Tempos prontos">
                @for (p of PRESETS; track p.label) {
                  <button type="button" class="atalho" [attr.aria-pressed]="s().study === p.study && s().rest === p.rest" (click)="store.preset(p.study, p.rest)">
                    {{ p.label }} <span class="minutos">{{ p.study }}/{{ p.rest }}</span>
                  </button>
                }
              </div>
              <div class="linha sino">
                <div class="linha-texto">
                  <span class="linha-titulo">Sininho na troca</span>
                  <span class="linha-desc">Dois toques: subindo na volta ao estudo, descendo na pausa. Segue o volume do site.</span>
                </div>
                <button type="button" class="ouvir" (click)="testChime()">
                  <lucide-icon [img]="ICON.sino" [size]="18" aria-hidden="true" />
                  Ouvir
                </button>
              </div>
            }
            @case ('musica') {
              <h3 class="sr-only">Música</h3>
              <div class="linha">
                <div class="linha-texto">
                  <span class="linha-titulo" id="pomodoro-musica-nome">Música no estudo</span>
                  <span class="linha-desc">Some devagar na pausa e volta de onde parou.</span>
                </div>
                <button type="button" class="interruptor" role="switch" [attr.aria-checked]="s().music" aria-labelledby="pomodoro-musica-nome" (click)="store.setMusic(!s().music)">
                  <span class="bolinha"></span>
                </button>
              </div>
              @if (s().music) {
                <app-pomodoro-tracks />
              }
            }
            @case ('relogio') {
              <h3 class="sr-only">Relógio</h3>
              <div class="skins" role="radiogroup" aria-label="O relógio do Pomodoro">
                @for (k of SKINS; track k.value) {
                  <button type="button" class="skin" role="radio" [attr.aria-checked]="s().skin === k.value" (click)="store.setSkin(k.value)">
                    <span class="skin-palco"><app-pomodoro-dial [skin]="k.value" [ms]="SAMPLE_MS" [total]="SAMPLE_TOTAL" phase="estudo" [idle]="true" /></span>
                    <span class="skin-nome">{{ k.label }}</span>
                  </button>
                }
              </div>
              <div class="cantos">
                <div class="linha-texto">
                  <span class="linha-titulo" id="pomodoro-canto-nome">Canto da tela</span>
                  <span class="linha-desc">Onde o relógio fica nas outras páginas. Também dá para arrastá-lo.</span>
                </div>
                <div class="tela" role="radiogroup" aria-labelledby="pomodoro-canto-nome">
                  @for (c of CORNERS; track c.value) {
                    <button type="button" class="canto" [class]="'canto-' + c.value" role="radio" [attr.aria-checked]="s().corner === c.value" [attr.aria-label]="c.label" [title]="c.label" (click)="store.setCorner(c.value)">
                      <span class="ponto"></span>
                    </button>
                  }
                </div>
              </div>
            }
          }
        </div>
      </div>
    </dialog>
  `,
  styleUrl: './pomodoro-sheet.scss',
})
export class PomodoroSheet {
  /** A parte que abre (a da fita tocada). */
  readonly start = input<PomodoroPart>('tempo');
  readonly closed = output<void>();

  protected readonly store = inject(PomodoroStore);
  private readonly tracks = inject(PomodoroTracks);
  protected readonly s = this.store.save;

  protected readonly ICON = ICON;
  protected readonly SKINS = POMODORO_SKINS;
  protected readonly CORNERS = POMODORO_CORNERS;
  protected readonly PRESETS = POMODORO_PRESETS;
  protected readonly SAMPLE_MS = SAMPLE_MS;
  protected readonly SAMPLE_TOTAL = 25 * 60_000;
  protected readonly PARTS = [
    { id: 'tempo' as const, label: 'Tempo', icon: ICON.cronometro },
    { id: 'musica' as const, label: 'Música', icon: ICON.musica },
    { id: 'relogio' as const, label: 'Relógio', icon: ICON.relogio },
  ];

  protected readonly part = linkedSignal(() => this.start());

  /** O que está valendo, embaixo do nome de cada adesivo. */
  protected readonly values = computed<Record<PomodoroPart, string>>(() => {
    const s = this.s();
    const n = this.tracks.tracks().length;
    return {
      tempo: `${s.study}/${s.rest} min`,
      // sem nenhuma na lista, toca a rádio lofi de sempre
      musica: !s.music ? 'desligada' : n === 0 ? 'rádio lofi' : n === 1 ? '1 música' : `${n} músicas`,
      relogio: POMODORO_SKINS.find((k) => k.value === s.skin)?.label ?? '',
    };
  });

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  constructor() {
    afterNextRender(() => {
      const el = this.dialog().nativeElement;
      el.showModal();
      el.querySelector<HTMLElement>('.fecha')?.focus();
    });
  }

  /** O sininho de amostra (o da próxima troca), para ouvir antes e acordar o som da página. */
  protected testChime(): void {
    wakeChime();
    const s = this.s();
    const next = s.on && s.phase === 'pausa' ? 'estudo' : 'pausa';
    setTimeout(() => chime(next), 60);
  }

  close(): void {
    this.dialog().nativeElement.close();
  }
}
