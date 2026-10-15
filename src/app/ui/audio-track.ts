import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, computed, effect, inject, input, linkedSignal, signal, untracked, viewChild } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { LucideAngularModule, VolumeOff } from 'lucide-angular';
import { soundVolume } from '../core/volume';
import { httpsUrl, parseAudio, readAudio } from '../core/widgets';
import { EmbedBridge, EmbedReport } from './embed-bridge';
import { snapToLines } from './line-snap';
import { Warmable, warmups } from './sound-warmup';
import { VolumeKnob } from './volume-knob';

/** Só uma faixa toca por vez: a que começa para a de antes. */
let sounding: AudioTrack | null = null;

/** "3:07", "1:02:09"; sem a duração, "–:––". */
function clock(s: number): string {
  if (!Number.isFinite(s) || s < 0) return '–:––';
  const t = Math.floor(s);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const ss = String(t % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/**
 * O player de fora, de quem ainda não tocou: nenhum (`cold`), montado escondido e calado, enchendo o
 * começo da faixa (`warming`), parado no começo com o som já ali (`warm`), e o da pessoa (`live`).
 */
type Phase = 'cold' | 'warming' | 'warm' | 'live';

/** Entre um aviso e outro do player de fora, o tempo à mostra anda sozinho até este tanto (s). */
const AHEAD = 0.6;

/** Os carretéis da fita: o raio do rolo de fita em cada um (o da esquerda esvazia, o da direita enche). */
const HUB = 10;
const FULL = 23;
const pack = (share: number) => Math.sqrt(HUB * HUB + (FULL * FULL - HUB * HUB) * Math.min(1, Math.max(0, share)));

/**
 * O widget ÁUDIO (ver core/widgets.ts): uma faixa para tocar ali mesmo, de um arquivo de som (ou de
 * vídeo, que toca só o som) ou do som de um vídeo do YouTube ou do Vimeo. Três jeitos:
 *
 * - a FITA CASSETE: a fita de plástico preto com a etiqueta escrita à mão; pela janela, os rolos de
 *   fita passam de um carretel para o outro conforme a faixa anda, e os carretéis giram tocando.
 *   Embaixo, as teclas do toca-fitas (voltar, tocar, avançar) e o contador. Arrastar na janela anda
 *   na fita.
 * - o SIMPLES: uma tira de papel com o botão de tocar, o nome, a barra de arrastar e o tempo.
 * - o VINIL: a capa (a foto do vídeo, ou um envelope pardo com o nome escrito a pincel) com o disco
 *   saindo pela metade; o botão de tocar fica no meio do disco, que gira tocando.
 *
 * O som do YouTube e do Vimeo vem do player deles, escondido atrás do widget, que obedece por
 * mensagem (tocar, parar, pular, volume: ver ui/embed-bridge.ts). Quem fica na tela tem o player
 * aquecido sem ninguém ver (ui/sound-warmup.ts): o começo da faixa já está carregado quando a pessoa
 * aperta o play. A peça é colada (`data-colado`): o estrago da ficha nunca a come.
 *
 * Com o mouse em cima, o adesivo do alto-falante abre o volume de todo som do site (ui/volume-knob.ts).
 *
 * O vinil também é a capa das fichas do mural de músicas (ver ui/record-cover.ts): a peça `bare`,
 * solta do texto, com a capa do álbum (`art`) e sem a barra.
 */
@Component({
  selector: 'app-audio-track',
  imports: [LucideAngularModule, NgTemplateOutlet, VolumeKnob],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.solta]': 'bare()' },
  template: `
    @let a = info();
    <div class="peca">
    @if (problem(); as why) {
      <span class="falha">
        <lucide-icon [img]="MuteIcon" [size]="22" [strokeWidth]="2.2" aria-hidden="true" />
        <span class="falha-nome">{{ why }}</span>
        @if (host()) {
          <span class="falha-host">{{ host() }}</span>
        }
      </span>
    } @else {
      <div
        class="faixa"
        [class]="'faixa som jeito-' + a.look"
        [class.tocando]="playing()"
        [class.esperando]="waiting()"
        [style.--p]="share()"
        [style.--giro.deg]="tilt()"
        role="group"
        [attr.aria-label]="'Faixa' + (a.title ? ': ' + a.title : '')"
      >
        @switch (a.look) {
          @case ('fita') {
            <div class="cassete" data-colado>
              <svg class="cassete-corpo" viewBox="0 0 200 127" aria-hidden="true">
                <rect class="casco" x="1" y="1" width="198" height="125" rx="6" />
                <rect class="casco-friso" x="4.5" y="4.5" width="191" height="118" rx="4" />
                <!-- pela janela: o fundo, os rolos de fita e os carretéis (a etiqueta cobre o resto dos rolos) -->
                <rect class="fundo-janela" x="58" y="50" width="84" height="26" />
                <circle class="rolo" cx="77" cy="63" [attr.r]="reelLeft()" />
                <circle class="rolo" cx="123" cy="63" [attr.r]="reelRight()" />
                @for (cx of [77, 123]; track cx) {
                  <g class="carretel" [style.transform-origin]="cx + 'px 63px'">
                    <circle class="cubo" [attr.cx]="cx" cy="63" r="7.5" />
                    <circle class="furo" [attr.cx]="cx" cy="63" r="4.6" />
                    @for (deg of [0, 60, 120, 180, 240, 300]; track deg) {
                      <rect class="dente" [attr.x]="cx - 0.8" y="57.6" width="1.6" height="2.4" [attr.transform]="'rotate(' + deg + ' ' + cx + ' 63)'" />
                    }
                  </g>
                }
                <path
                  class="etiqueta"
                  fill-rule="evenodd"
                  d="M12 12a3 3 0 0 1 3-3h170a3 3 0 0 1 3 3v72a3 3 0 0 1-3 3H15a3 3 0 0 1-3-3z M62 50h76a4 4 0 0 1 4 4v18a4 4 0 0 1-4 4H62a4 4 0 0 1-4-4V54a4 4 0 0 1 4-4z"
                />
                <line class="pauta" x1="22" y1="22" x2="178" y2="22" />
                <line class="pauta" x1="22" y1="33" x2="178" y2="33" />
                <line class="pauta" x1="22" y1="44" x2="178" y2="44" />
                <rect class="faixa-cor" x="12" y="53" width="43" height="20" />
                <rect class="faixa-cor" x="145" y="53" width="43" height="20" />
                <text class="lado" x="21" y="69.5">A</text>
                <text class="duracao" x="180" y="66.5" text-anchor="end">{{ duration() ? clock(duration()) : '' }}</text>
                <rect class="vidro" x="58" y="50" width="84" height="26" rx="4" />
                <path class="vidro-brilho" d="M70 50h10l-8 26h-10z" />
                <!-- a boca de baixo, por onde a fita encosta na cabeça do toca-fitas -->
                <path class="boca" d="M46 125.5 54 99h92l8 26.5z" />
                <circle class="buraco" cx="68" cy="112" r="3.6" />
                <circle class="buraco" cx="132" cy="112" r="3.6" />
                <rect class="fita-exposta" x="72" y="121.6" width="56" height="2.4" />
                @for (s of screws; track $index) {
                  <circle class="parafuso" [attr.cx]="s[0]" [attr.cy]="s[1]" r="2.5" />
                  <line class="fenda" [attr.x1]="s[0] - 1.6" [attr.y1]="s[1] + 0.6" [attr.x2]="s[0] + 1.6" [attr.y2]="s[1] - 0.6" />
                }
              </svg>
              @if (a.title) {
                <span class="etiqueta-nome">{{ a.title }}</span>
              }
              <input
                class="arrastar tocavel"
                type="range"
                min="0"
                [max]="duration() || 1"
                step="1"
                [value]="shown()"
                [disabled]="!duration()"
                aria-label="Onde está a fita"
                [attr.aria-valuetext]="spokenTime()"
                [title]="duration() ? 'Arraste para andar na fita' : ''"
                (input)="scrubTo($event)"
                (change)="commitScrub($event)"
                (keydown)="onSeekKey($event)"
                (click)="$event.stopPropagation()"
              />
              <span class="janela-foco" aria-hidden="true"></span>
              <ng-container *ngTemplateOutlet="volume" />
            </div>
            <div class="deck">
              <span class="teclas">
                <button type="button" class="tecla tocavel" aria-label="Voltar 10 segundos" title="Voltar 10 s" [disabled]="!duration()" (click)="nudge($event, -10)">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11.5 6.6v10.8L3.8 12zM20.2 6.6v10.8L12.5 12z" /></svg>
                </button>
                <button type="button" class="tecla tecla-tocar tocavel" [class.baixa]="playing() || waiting()" [attr.aria-label]="playLabel()" [attr.aria-pressed]="playing()" (click)="toggle($event)">
                  <ng-container *ngTemplateOutlet="playIcon" />
                </button>
                <button type="button" class="tecla tocavel" aria-label="Avançar 10 segundos" title="Avançar 10 s" [disabled]="!duration()" (click)="nudge($event, 10)">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12.5 6.6v10.8L20.2 12zM3.8 6.6v10.8L11.5 12z" /></svg>
                </button>
              </span>
              <span class="contagem" aria-hidden="true">{{ clock(shown()) }}<small> / {{ duration() ? clock(duration()) : '–:––' }}</small></span>
            </div>
          }
          @case ('vinil') {
            @let capa = cover();
            <div class="vitrola">
              <div class="disco" data-colado>
                <span class="sulcos">
                  <span class="selo"><span class="selo-a">Lado A</span><span class="selo-b">Estéreo</span></span>
                </span>
                <span class="disco-brilho" aria-hidden="true"></span>
                @if (playable()) {
                  <button type="button" class="tocar-disco tocavel" [attr.aria-label]="playLabel()" [attr.aria-pressed]="playing()" (click)="toggle($event)">
                    <ng-container *ngTemplateOutlet="playIcon" />
                  </button>
                }
              </div>
              <div class="capa" data-colado [class.parda]="!capa">
                @if (capa) {
                  <img [class.arte]="capa === art()" [src]="capa" alt="" referrerpolicy="no-referrer" decoding="async" (error)="coverFailed.set(true)" />
                  @if (a.title) {
                    <span class="capa-adesivo">{{ a.title }}</span>
                  }
                } @else {
                  <span class="capa-nome">{{ sleeve() || a.title || 'Lado A' }}</span>
                }
                <span class="capa-gasta" aria-hidden="true"></span>
                <ng-container *ngTemplateOutlet="volume" />
              </div>
            </div>
            @if (!bare() || withBar()) {
              <div class="pe">
                <ng-container *ngTemplateOutlet="bar" />
              </div>
            }
          }
          @default {
            <div class="tira" data-colado>
              <button type="button" class="tocar-tira tocavel" [attr.aria-label]="playLabel()" [attr.aria-pressed]="playing()" (click)="toggle($event)">
                <ng-container *ngTemplateOutlet="playIcon" />
              </button>
              <span class="tira-meio">
                <span class="tira-nome">{{ a.title || host() }}</span>
                <ng-container *ngTemplateOutlet="bar" />
              </span>
              <ng-container *ngTemplateOutlet="volume" />
            </div>
          }
        }
        @if (stuck()) {
          <p class="aviso" [class.sr-only]="bare()" role="status">Não começou a tocar. Toque de novo.</p>
        }
      </div>
    }
    </div>

    <!-- o som de verdade: o arquivo no tocador do navegador, ou o player de fora, escondido atrás -->
    @if (source(); as s) {
      @if (s.kind === 'file') {
        <audio
          #sound
          [src]="s.url"
          preload="metadata"
          (loadedmetadata)="onDuration($any($event.target).duration)"
          (durationchange)="onDuration($any($event.target).duration)"
          (timeupdate)="onFileTime($any($event.target).currentTime)"
          (playing)="onState('playing')"
          (waiting)="onState('waiting')"
          (pause)="onState('paused')"
          (ended)="onState('ended')"
          (error)="failed.set(true)"
        ></audio>
      } @else if (embed(); as e) {
        <iframe #frame class="motor" [src]="e" title="" tabindex="-1" aria-hidden="true" allow="autoplay; encrypted-media" referrerpolicy="strict-origin-when-cross-origin" (load)="bridge?.loaded()"></iframe>
      }
    }

    <!-- o alto-falante, num canto da peça (só de quem tem som para tocar) -->
    <ng-template #volume>
      @if (playable()) {
        <app-volume-knob class="volume" />
      }
    </ng-template>

    <ng-template #playIcon>
      @if (waiting()) {
        <span class="aro" aria-hidden="true"></span>
      } @else if (playing()) {
        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6.2" y="5" width="4.1" height="14" rx="1.2" /><rect x="13.7" y="5" width="4.1" height="14" rx="1.2" /></svg>
      } @else {
        <svg class="triangulo" viewBox="0 0 24 24" aria-hidden="true"><path d="M8.6 5.6c0-.9 1-1.5 1.8-1l9 6.4c.7.5.7 1.5 0 2l-9 6.4c-.8.5-1.8 0-1.8-1z" /></svg>
      }
    </ng-template>

    <ng-template #bar>
      <span class="trilho">
        <input
          class="barra tocavel"
          type="range"
          min="0"
          [max]="duration() || 1"
          step="1"
          [value]="shown()"
          [disabled]="!duration()"
          aria-label="Onde está a faixa"
          [attr.aria-valuetext]="spokenTime()"
          (input)="scrubTo($event)"
          (change)="commitScrub($event)"
          (keydown)="onSeekKey($event)"
          (click)="$event.stopPropagation()"
        />
        <span class="tempo" aria-hidden="true">{{ clock(shown()) }} / {{ duration() ? clock(duration()) : '–:––' }}</span>
      </span>
    </ng-template>
  `,
  styles: `
    @use 'vinyl';

    :host {
      position: relative;
      display: block;
      container-type: inline-size;
      /* a peça ocupa linhas inteiras da pauta (a altura final vem do tamanho dela, ver o construtor) */
      padding: 0.45em 0 0.6em;
      box-sizing: border-box;
      white-space: normal;
    }
    .faixa {
      width: fit-content;
      max-width: 100%;
    }
    button {
      -webkit-tap-highlight-color: transparent;
    }
    svg {
      display: block;
    }

    /* ===== Os botões de tocar: o triângulo, as duas barras e, esperando o som, o aro de caneta ===== */
    .triangulo {
      margin-left: 0.08em;
    }
    .aro {
      display: block;
      width: 0.95em;
      height: 0.95em;
      border: 0.16em solid currentColor;
      border-right-color: transparent;
      border-radius: 50%;
      box-sizing: border-box;
      animation: aro-gira 700ms linear infinite;
    }
    @keyframes aro-gira {
      to {
        rotate: 1turn;
      }
    }

    /* ===== A barra de arrastar: um risco fino de tinta, a parte tocada cheia, a bolinha onde está ===== */
    .trilho {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: 0.6em;
      min-width: 0;
    }
    .barra {
      --cor: currentColor;
      appearance: none;
      -webkit-appearance: none;
      display: block;
      width: 100%;
      min-width: 0;
      height: 1.5em;
      margin: 0;
      padding: 0;
      background: transparent;
      color: inherit;
      cursor: pointer;
    }
    .barra::-webkit-slider-runnable-track {
      height: 0.26em;
      border-radius: 0.13em;
      background: linear-gradient(to right, var(--cor) calc(var(--p) * 100%), color-mix(in srgb, var(--cor) 24%, transparent) 0);
    }
    .barra::-moz-range-track {
      height: 0.26em;
      border-radius: 0.13em;
      background: color-mix(in srgb, var(--cor) 24%, transparent);
    }
    .barra::-moz-range-progress {
      height: 0.26em;
      border-radius: 0.13em;
      background: var(--cor);
    }
    .barra::-webkit-slider-thumb {
      -webkit-appearance: none;
      width: 0.95em;
      height: 0.95em;
      margin-top: -0.345em;
      border: 0;
      border-radius: 50%;
      background: var(--cor);
      transition: scale var(--t-ui) var(--ease-ui);
    }
    .barra::-moz-range-thumb {
      width: 0.95em;
      height: 0.95em;
      border: 0;
      border-radius: 50%;
      background: var(--cor);
      transition: scale var(--t-ui) var(--ease-ui);
    }
    .barra:not(:disabled):hover::-webkit-slider-thumb,
    .barra:not(:disabled):active::-webkit-slider-thumb {
      scale: 1.2;
    }
    .barra:not(:disabled):hover::-moz-range-thumb,
    .barra:not(:disabled):active::-moz-range-thumb {
      scale: 1.2;
    }
    .barra:disabled {
      cursor: default;
    }
    .barra:disabled::-webkit-slider-thumb {
      opacity: 0;
    }
    .barra:disabled::-moz-range-thumb {
      opacity: 0;
    }
    .barra:focus-visible {
      outline: 2.5px solid currentColor;
      outline-offset: 2px;
      border-radius: 2px;
    }
    .tempo {
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.8em;
      letter-spacing: 0.02em;
      line-height: 1;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }

    /* ===== O SIMPLES: uma tira de papel colada reta, o botão de tinta, o nome, a barra e o tempo =====
       A tira tem a altura do tamanho (ver note-widget.ts), e o botão cresce com ela; o nome e o tempo,
       pouco (--letra-tam) */
    .jeito-simples {
      --d: max(2.2em, min(calc((var(--widget-alto, 3.4em) - 1.05em) * 0.6), 40cqw));
      display: grid;
      width: min(100%, calc(var(--d) + 16em));
      min-height: calc(var(--widget-alto, 3.4em) - 1.05em);
    }
    .tira {
      font-size: calc(1em * var(--letra-tam, 1));
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      align-items: center;
      gap: 0.75em;
      padding: 0.38em 0.85em 0.36em 0.55em;
      border-radius: 2px;
      background: #fbfaf6;
      color: #151515;
      box-shadow:
        0 1px 1px rgb(0 0 0 / 0.3),
        0 3px 6px -2px rgb(0 0 0 / 0.26);
    }
    .tocar-tira {
      display: grid;
      place-items: center;
      width: var(--d);
      height: var(--d);
      padding: 0;
      border: 0;
      border-radius: 50%;
      background: #151515;
      color: #fbfaf6;
      font-size: 1em;
      cursor: pointer;
      transition: scale var(--t-ui) var(--ease-ui);
    }
    .tocar-tira svg {
      width: calc(var(--d) * 0.5);
      height: calc(var(--d) * 0.5);
      fill: currentColor;
    }
    .tocar-tira:hover {
      scale: 1.06;
    }
    .tocar-tira:active {
      scale: 0.96;
    }
    .tocar-tira:focus-visible {
      outline: 2.5px solid #151515;
      outline-offset: 3px;
    }
    .tira-meio {
      display: grid;
      min-width: 0;
    }
    .tira-nome {
      overflow: hidden;
      font-family: var(--f-ui);
      font-weight: 600;
      font-size: 0.82em;
      line-height: 1.3;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .tira .trilho {
      margin-top: -0.1em;
    }
    .tira {
      position: relative;
    }

    /* ===== O alto-falante: um adesivo no canto de cima, à direita (ver ui/volume-knob.ts) =====
       Na tira, meio para fora da quina (o nome e o tempo ficam à mostra); na fita, na quina do
       plástico; no vinil, dentro da capa (que corta o que passa dela) */
    .volume {
      position: absolute;
      z-index: 3;
      top: 6px;
      right: 6px;
    }
    .tira .volume {
      top: -11px;
      right: -11px;
    }

    /* ===== A FITA CASSETE: o desenho da fita (tamanho em em de --w), as teclas e o contador ===== */
    .jeito-fita {
      /* a largura da fita: a que dá a altura do tamanho (ver note-widget.ts), até a da linha. A fita
         mais as teclas têm 0,8 da largura de altura; a fita sozinha, 0,64 (com folga, para
         não passar da linha por um pixel). As teclas não ficam
         menores que 0,42 da letra (o último termo: a fita pequena deixa o lugar delas) */
      --w: min(100cqw, calc((var(--widget-alto, 22em) - 1.05em) / 0.81), calc((var(--widget-alto, 22em) - 1.05em - 1.25em) / 0.645));
      container: fita / inline-size;
      width: var(--w);
      rotate: var(--giro);
    }
    .cassete {
      position: relative;
      /* tudo dentro mede em em de um vigésimo da fita */
      font-size: calc(var(--w) / 20);
      width: 20em;
      filter: drop-shadow(0 1px 1px rgb(0 0 0 / 0.35)) drop-shadow(0 3px 4px rgb(0 0 0 / 0.28));
    }
    .cassete-corpo {
      width: 100%;
      height: auto;
    }
    .casco {
      fill: #2a282d;
    }
    .casco-friso {
      fill: none;
      stroke: rgb(255 255 255 / 0.07);
      stroke-width: 1;
    }
    .fundo-janela {
      fill: #121014;
    }
    .rolo {
      fill: #4b301e;
      stroke: #2d1c11;
      stroke-width: 0.6;
    }
    .cubo {
      fill: #efeae0;
    }
    .furo {
      fill: #121014;
    }
    .dente {
      fill: #efeae0;
    }
    .carretel {
      transform-box: view-box;
      animation: carretel 2.6s linear infinite;
      animation-play-state: paused;
    }
    .tocando .carretel {
      animation-play-state: running;
    }
    @keyframes carretel {
      to {
        transform: rotate(-360deg);
      }
    }
    .etiqueta {
      fill: #f4ecd6;
    }
    .pauta {
      stroke: #9fb0cc;
      stroke-width: 0.6;
    }
    .faixa-cor {
      fill: #df6a2c;
    }
    .lado {
      fill: #f4ecd6;
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 17px;
    }
    .duracao {
      fill: #f4ecd6;
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 9px;
      letter-spacing: 0.04em;
    }
    .vidro {
      fill: rgb(70 50 60 / 0.16);
      stroke: #19171b;
      stroke-width: 1.4;
    }
    .vidro-brilho {
      fill: rgb(255 255 255 / 0.1);
    }
    .boca {
      fill: #232126;
      stroke: rgb(255 255 255 / 0.06);
      stroke-width: 0.8;
    }
    .buraco {
      fill: #0b0a0c;
    }
    .fita-exposta {
      fill: #4b301e;
    }
    .parafuso {
      fill: #a29e96;
    }
    .fenda {
      stroke: #4c4943;
      stroke-width: 0.7;
    }
    /* o nome escrito à caneta nas linhas da etiqueta (duas, no máximo) */
    .etiqueta-nome {
      position: absolute;
      left: 11%;
      right: 11%;
      top: 9.2%;
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      overflow: hidden;
      color: #1d2a6b;
      font-family: var(--f-hand);
      font-size: 1.12em;
      line-height: 1em;
      overflow-wrap: anywhere;
      pointer-events: none;
    }
    /* arrastar na janela anda na fita (o controle é invisível; o foco desenha a janela) */
    .arrastar {
      position: absolute;
      left: 29%;
      top: 39.4%;
      width: 42%;
      height: 20.5%;
      margin: 0;
      opacity: 0;
      cursor: grab;
    }
    .arrastar:active {
      cursor: grabbing;
    }
    .arrastar:disabled {
      cursor: default;
    }
    .janela-foco {
      position: absolute;
      left: 29%;
      top: 39.4%;
      width: 42%;
      height: 20.5%;
      border-radius: 0.4em;
      pointer-events: none;
    }
    .arrastar:focus-visible + .janela-foco {
      outline: 3px solid var(--hi);
      outline-offset: 2px;
    }
    /* o toca-fitas: três teclas de metal, a de tocar fica afundada tocando, e o contador */
    .deck {
      /* as teclas e o contador crescem e encolhem junto com a fita, até um mínimo para o dedo */
      font-size: max(calc(var(--w) / 17), 0.42em);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.6em;
      margin-top: 0.45em;
    }
    .teclas {
      display: flex;
      gap: 2px;
      padding: 2px;
      border-radius: 3px;
      background: #1c1b1e;
      box-shadow: 0 1px 2px rgb(0 0 0 / 0.35);
    }
    .tecla {
      display: grid;
      place-items: center;
      width: 2.5em;
      height: 1.95em;
      padding: 0;
      border: 0;
      border-bottom: 0.2em solid #8d887e;
      border-radius: 2px 2px 3px 3px;
      background: linear-gradient(#f2efe9, #d3cec4);
      color: #151515;
      font-size: 1em;
      cursor: pointer;
      transition:
        translate var(--t-ui) var(--ease-ui),
        border-bottom-width var(--t-ui) var(--ease-ui);
    }
    .tecla svg {
      width: 1em;
      height: 1em;
      fill: currentColor;
    }
    .tecla:hover:not(:disabled) {
      background: linear-gradient(#fbf9f5, #ddd8ce);
    }
    .tecla:active:not(:disabled),
    .tecla.baixa {
      translate: 0 0.14em;
      border-bottom-width: 0.06em;
      background: linear-gradient(#d9d4ca, #ebe7e0);
    }
    .tecla:disabled {
      color: rgb(21 21 21 / 0.4);
      cursor: default;
    }
    .tecla:focus-visible {
      outline: 3px solid var(--hi);
      outline-offset: 1px;
      position: relative;
      z-index: 1;
    }
    .tecla-tocar {
      width: 3em;
    }
    /* o contador do toca-fitas: os números claros na janelinha preta */
    .contagem {
      padding: 0.3em 0.5em 0.25em;
      border-radius: 2px;
      background: #141316;
      box-shadow: inset 0 1px 2px rgb(0 0 0 / 0.7);
      color: #f3efe6;
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.86em;
      line-height: 1;
      letter-spacing: 0.03em;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    /* a fita estreita (as teclas no mínimo): só as teclas; o tempo continua na barra de arrastar, para
       o leitor de tela */
    @container fita (width < 7.2em) {
      .contagem {
        display: none;
      }
      .deck {
        justify-content: center;
      }
    }
    /* e a mais estreita ainda (o mini na ficha do mural): só a tecla de tocar */
    @container fita (width < 4.6em) {
      .tecla:not(.tecla-tocar) {
        display: none;
      }
    }
    .contagem small {
      font-size: 1em;
      color: rgb(243 239 230 / 0.6);
    }

    /* ===== O VINIL: a capa e o disco saindo pela metade (tamanho em em de --s, a capa = 10em) ===== */
    .jeito-vinil {
      /* o lado da capa: a altura do tamanho (ver note-widget.ts) menos a linha da barra, até o que cabe
         na linha (o disco sai 7,2 capas de dez para fora) */
      --s: min(calc(100cqw / 1.72), calc(var(--widget-alto, 22em) - 1.05em - 2.1em));
      width: calc(var(--s) * 1.72);
    }
    @include vinyl.record;

    /* A peça solta (a capa das fichas de música): só o vinil, do tamanho da caixa onde está, reto (o
       torto é o da foto colada na ficha). A capa do álbum já é quadrada: não tem as tarjas do YouTube */
    :host(.solta) {
      padding: 0;
    }
    :host(.solta) .jeito-vinil {
      --s: calc(100cqw / 1.72);
      width: 100%;
    }
    .capa img.arte {
      scale: none;
    }
    .pe {
      display: grid;
      gap: 0.1em;
      margin-top: 0.4em;
    }
    /* Com lugar na linha: o tempo e a barra vão para o lado do disco, em pé, e o vinil fica com a
       altura toda do tamanho (como a foto e a fita do mesmo tamanho). O lugar que faz o disco ao lado
       ficar maior que com a barra embaixo depende do tamanho (ao lado, ele precisa de 1,72 vezes a
       altura, mais os 7,4em da coluna da barra). O grande fica com o lugar do médio: na ficha do mural
       ele tem a altura do médio, e a barra embaixo o deixaria menor que ele */
    @each $tam, $min in (mini: 9.7em, pequeno: 14.9em, medio: 20em, grande: 20em) {
      @container (min-width: #{$min}) {
        :host-context(.tam-#{$tam}) .jeito-vinil {
          --s: min(calc(var(--widget-alto, 22em) - 1.05em), calc((100cqw - 7.4em) / 1.72));
          display: flex;
          align-items: flex-end;
          gap: 0.9em;
          width: auto;
        }
        :host-context(.tam-#{$tam}) .jeito-vinil .vitrola {
          flex: none;
        }
        :host-context(.tam-#{$tam}) .jeito-vinil .pe {
          flex: none;
          width: 6.5em;
          margin: 0 0 0.3em;
        }
        :host-context(.tam-#{$tam}) .jeito-vinil .trilho {
          grid-template-columns: minmax(0, 1fr);
          gap: 0.35em;
        }
        :host-context(.tam-#{$tam}) .jeito-vinil .tempo {
          order: -1;
        }
      }
    }

    .aviso {
      margin: 0.3em 0 0;
      font-family: var(--f-hand);
      font-size: 0.9em;
      line-height: 1.25;
    }

    /* o player de fora, que só dá o som: atrás de tudo, sem aparecer nem pegar o toque */
    .motor {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      border: 0;
      opacity: 0;
      pointer-events: none;
    }

    /* ===== Não toca: o lugar da faixa, tracejado ===== */
    .falha {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      align-items: center;
      gap: 0 0.6em;
      width: fit-content;
      max-width: 100%;
      box-sizing: border-box;
      padding: 0.3em 0.6em;
      border: 2px dashed color-mix(in srgb, currentColor 45%, transparent);
      border-radius: 2px;
    }
    .falha lucide-icon {
      grid-row: span 2;
      opacity: 0.7;
    }
    .falha-nome {
      font-family: var(--f-marker);
      font-size: 0.95em;
    }
    .falha-host {
      font-family: var(--f-ui);
      font-size: 0.8em;
      opacity: 0.86;
      overflow-wrap: anywhere;
    }

    @media (prefers-reduced-motion: reduce) {
      .carretel,
      .sulcos,
      .aro {
        animation: none;
      }
      .aro {
        border-right-color: currentColor;
        opacity: 0.6;
      }
      .disco,
      .tecla {
        transition: none;
      }
    }
  `,
})
export class AudioTrack implements Warmable {
  /** Os parâmetros como foram escritos no texto. */
  readonly args = input.required<readonly string[]>();
  /** A capa do vinil, quando não é a foto do vídeo: a do álbum, nas fichas de música. */
  readonly art = input<string | null>(null);
  /**
   * A peça solta do texto (a capa das fichas de música): só o vinil, sem a barra de arrastar, do
   * tamanho da caixa onde está. O disco aparece mesmo sem som para tocar (aí, sem o botão).
   */
  readonly bare = input(false);
  /** Começa tocando: a peça só foi montada porque a pessoa pediu para tocar (ver ui/record-cover.ts). */
  readonly autoplay = input(false);
  /** A peça solta com a barra de arrastar embaixo do vinil (na leitura da ficha). */
  readonly withBar = input(false);
  /** O que vai escrito no envelope pardo (sem foto) quando não é o nome da faixa: o nome do disco. */
  readonly sleeve = input('');
  /** O nome que o botão de tocar diz ao leitor de tela, quando a faixa não tem nome escrito. */
  readonly spoken = input('');

  protected readonly MuteIcon = VolumeOff;
  protected readonly clock = clock;
  /** Os parafusos da fita: os quatro cantos e o do meio, embaixo. */
  protected readonly screws = [
    [8, 8],
    [192, 8],
    [8, 119],
    [192, 119],
    [100, 112],
  ] as const;

  private readonly sanitizer = inject(DomSanitizer);
  private readonly sound = viewChild<ElementRef<HTMLAudioElement>>('sound');
  private readonly frame = viewChild<ElementRef<HTMLIFrameElement>>('frame');

  protected readonly info = computed(() => readAudio(this.args()));
  // de cada link: trocar o link começa de novo, parado, sem o erro nem o tempo do de antes
  private readonly url = computed(() => this.info().url);
  /** Do link, e só dele: mexer no nome não remonta o player (o de fora recarregaria e tocaria de novo). */
  protected readonly source = computed(() => parseAudio(this.url()));
  /** Onde a faixa começa: o `t=` do link do YouTube, ou o começo. */
  private readonly startAt = computed(() => {
    const s = this.source();
    return s?.kind === 'youtube' ? s.start : 0;
  });
  /** O player de fora está montado (aquecido, ou chamado no play). */
  private readonly mounted = linkedSignal({ source: this.url, computation: () => false });
  protected readonly playing = linkedSignal({ source: this.url, computation: () => false });
  /** Pediu para tocar e o som ainda não veio (carregando). */
  protected readonly waiting = linkedSignal({ source: this.url, computation: () => false });
  protected readonly failed = linkedSignal({ source: this.url, computation: () => false });
  /** Pediu para tocar e não veio nada (o navegador não deixou o player de fora tocar sozinho). */
  protected readonly stuck = linkedSignal({ source: this.url, computation: () => false });
  /** Onde a faixa está (de cada link: trocar o link volta para o começo dele). */
  protected readonly time = linkedSignal({ source: this.url, computation: () => untracked(this.startAt) });
  protected readonly duration = linkedSignal({ source: this.url, computation: () => 0 });
  protected readonly coverFailed = linkedSignal({ source: this.url, computation: () => false });
  /** Arrastando a barra: onde a pessoa está soltando (o player só pula quando ela solta). */
  private readonly scrub = signal<number | null>(null);

  /** O tempo à mostra: o do arrasto, enquanto arrasta. */
  protected readonly shown = computed(() => this.scrub() ?? this.time());
  protected readonly share = computed(() => (this.duration() ? Math.min(1, this.shown() / this.duration()) : 0));
  protected readonly reelLeft = computed(() => pack(1 - this.share()));
  protected readonly reelRight = computed(() => pack(this.share()));
  protected readonly spokenTime = computed(() => `${clock(this.shown())} de ${this.duration() ? clock(this.duration()) : 'duração desconhecida'}`);
  protected readonly playLabel = computed(() => {
    const t = this.info().title || this.spoken();
    return this.playing() || this.waiting() ? `Pausar${this.spoken() ? ': ' + t : ''}` : `Tocar${t ? ': ' + t : ''}`;
  });

  /** O que não deixa a faixa aparecer (sem link, link sem https, link que não toca aqui, não abriu). */
  protected readonly broken = computed(() => {
    const { url } = this.info();
    if (!url) return 'Áudio sem link';
    if (!httpsUrl(url)) return 'O link precisa começar com https://';
    if (!this.source()) return 'Esse som não toca aqui';
    if (this.failed()) return 'O som não abriu';
    return '';
  });
  /** O aviso no lugar da faixa. A peça solta nunca vira aviso: sem som, fica o disco parado. */
  protected readonly problem = computed(() => (this.bare() ? '' : this.broken()));
  /** Tem som para tocar: o botão do disco aparece. */
  protected readonly playable = computed(() => !!this.source() && !this.failed());
  protected readonly host = computed(() => {
    try {
      return new URL(this.info().url).hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
  });
  /**
   * A capa do vinil: a que veio de fora (`art`) ou a foto do vídeo do YouTube (o Vimeo e os arquivos
   * ficam no envelope pardo).
   */
  protected readonly cover = computed(() => {
    if (this.coverFailed()) return null;
    const s = this.source();
    return this.art() ?? (s?.kind === 'youtube' ? `https://i.ytimg.com/vi/${s.id}/hqdefault.jpg` : null);
  });
  /** O giro da fita e do vinil, do link: entre 0,5 e 1,5 grau, para um lado ou para o outro. */
  protected readonly tilt = computed(() => {
    if (this.info().look === 'simples' || this.bare()) return 0;
    let h = 0;
    for (const ch of this.info().url) h = (h * 31 + ch.charCodeAt(0)) | 0;
    const mag = 0.5 + (Math.abs(h) % 100) / 100;
    return h & 1 ? mag : -mag;
  });

  /**
   * O endereço do player de fora, montado só a partir do id conferido (nunca o link como foi
   * escrito). Ele sempre chega calado e parado: quem toca e solta o som é o pedido por mensagem (o
   * aquecimento toca calado; o play da pessoa solta o som no volume do site).
   */
  protected readonly embed = computed<SafeResourceUrl | null>(() => {
    const s = this.source();
    if (!s || s.kind === 'file' || !this.mounted()) return null;
    const url =
      s.kind === 'youtube'
        ? `https://www.youtube-nocookie.com/embed/${s.id}?enablejsapi=1&autoplay=0&mute=1&controls=0&disablekb=1&playsinline=1&rel=0&origin=${encodeURIComponent(location.origin)}${s.start ? `&start=${s.start}` : ''}`
        : `https://player.vimeo.com/video/${s.id}?autoplay=0&muted=1&dnt=1&controls=0&playsinline=1${s.hash ? `&h=${s.hash}` : ''}`;
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  });

  /** A conversa com o player de fora montado. */
  protected bridge: EmbedBridge | null = null;
  private phase: Phase = 'cold';
  /** O último tempo que o player de fora contou, e quando. */
  private base = { t: 0, at: 0 };
  /** Onde o player de fora está parado (o play só pula quando a pessoa quer outro lugar). */
  private parked = 0;
  /** Logo depois de pular ou de tocar: os avisos de tempo de antes do pulo, atrasados, não valem. */
  private hold = { t: 0, until: 0 };
  /** Quando a pessoa apertou o play: um "parado" atrasado, de antes, não desfaz o pedido. */
  private playedAt = 0;
  private raf = 0;
  private startWatch = 0;
  /** A peça está na tela (para o aquecimento). */
  private inView = false;

  constructor() {
    snapToLines('.peca', () => this.bare());
    const el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    let io: IntersectionObserver | null = null;
    afterNextRender(() => {
      if (this.autoplay()) this.play();
      if (typeof IntersectionObserver === 'undefined') return;
      io = new IntersectionObserver(
        (entries) => {
          this.inView = entries[entries.length - 1].isIntersecting;
          warmups.seen(this, this.inView && this.warmable());
        },
        { rootMargin: '120px 0px' },
      );
      io.observe(el);
    });
    // trocou o link: o player de fora de antes some (o iframe sai junto com o embed), começa do zero,
    // e o novo entra na fila do aquecimento se a peça está na tela
    effect(() => {
      this.url();
      untracked(() => {
        const was = this.bridge !== null;
        this.resetEmbed();
        if (was) warmups.unmounted(this);
        warmups.seen(this, false);
        if (this.inView && this.warmable()) warmups.seen(this, true);
      });
    });
    // tocando, o tempo anda a cada quadro (o do arquivo vem dele; o de fora, contado desde o último aviso)
    effect(() => {
      if (this.playing()) untracked(() => this.loop());
    });
    // o volume do site: na hora, no que toca (o player aquecido continua calado até o play)
    effect(() => {
      const v = soundVolume();
      const audio = this.sound()?.nativeElement;
      untracked(() => {
        if (audio) audio.volume = v;
        else if (this.phase === 'live') this.bridge?.send({ do: 'volume', v });
      });
    });
    inject(DestroyRef).onDestroy(() => {
      io?.disconnect();
      warmups.forget(this);
      this.resetEmbed();
      this.sound()?.nativeElement.pause();
      if (sounding === this) sounding = null;
    });
  }

  /** Só o player de fora se aquece (o arquivo já carrega o começo sozinho) e só o widget do texto. */
  private warmable(): boolean {
    const s = this.source();
    return !!s && s.kind !== 'file' && !this.bare() && !this.failed();
  }

  // ===== O aquecimento (ver ui/sound-warmup.ts) =====

  warmUp(): void {
    if (!this.warmable() || this.mounted()) {
      warmups.done(this);
      return;
    }
    this.phase = 'warming';
    this.mount();
  }

  coolDown(): boolean {
    if (this.phase === 'live' && (this.playing() || this.waiting())) return false;
    this.resetEmbed();
    this.mounted.set(false);
    return true;
  }

  /** O player de fora entra (calado e parado, no começo da faixa). */
  private mount(): void {
    const s = this.source();
    if (!s || s.kind === 'file') return;
    if (!this.bridge) this.bridge = new EmbedBridge(s.kind, () => this.frame()?.nativeElement, (r) => this.onReport(r));
    if (!this.mounted()) {
      this.parked = this.startAt();
      this.mounted.set(true);
      warmups.mounted(this);
    }
  }

  /** Aqueceu (ou desistiu): o próximo da fila pode vir. */
  private warmed(): void {
    if (this.phase === 'warming') this.phase = 'warm';
    warmups.done(this);
  }

  // ===== O que a pessoa faz =====

  protected toggle(e: Event): void {
    e.preventDefault();
    e.stopPropagation();
    if (this.playing() || this.waiting()) this.pause();
    else this.play();
  }

  private play(): void {
    const s = this.source();
    if (!s) return;
    if (sounding && sounding !== this) sounding.pause();
    sounding = this;
    this.stuck.set(false);
    this.waiting.set(true);
    // acabou: tocar de novo começa do começo
    const restart = this.duration() > 0 && this.time() >= this.duration() - 0.5;
    if (s.kind === 'file') {
      const el = this.sound()?.nativeElement;
      if (!el) return;
      if (restart) el.currentTime = 0;
      el.play().catch(() => {
        // o navegador não deixou (ou o arquivo não abriu: o erro chega pelo (error))
        this.waiting.set(false);
      });
      return;
    }
    // aquecendo ainda: a pessoa assume daqui (o que chegou do começo já serve)
    const was = this.phase;
    this.phase = 'live';
    this.mount();
    if (was === 'warming') warmups.done(this);
    const from = restart ? 0 : this.time();
    const now = performance.now();
    // os pedidos esperam o player ficar pronto, se ele está chegando agora
    if (restart || Math.abs(from - this.parked) > 0.25) this.bridge!.send({ do: 'seek', t: from });
    this.bridge!.send({ do: 'volume', v: soundVolume() });
    this.bridge!.send({ do: 'play' });
    this.parked = from;
    this.base = { t: from, at: now };
    this.hold = { t: from, until: now + 2500 };
    this.playedAt = now;
    this.time.set(from);
    clearTimeout(this.startWatch);
    this.startWatch = window.setTimeout(() => {
      if (this.waiting() && !this.playing()) {
        this.waiting.set(false);
        this.stuck.set(true);
      }
    }, 9000);
  }

  pause(): void {
    const s = this.source();
    if (s?.kind === 'file') this.sound()?.nativeElement.pause();
    else if (this.bridge) {
      this.bridge.send({ do: 'pause' });
      this.parked = this.time();
    }
    this.playing.set(false);
    this.waiting.set(false);
    clearTimeout(this.startWatch);
  }

  protected nudge(e: Event, by: number): void {
    e.preventDefault();
    e.stopPropagation();
    this.seek(this.time() + by);
  }

  protected scrubTo(e: Event): void {
    const t = Number((e.target as HTMLInputElement).value);
    // o arquivo pula na hora; o player de fora, quando a pessoa solta
    if (this.source()?.kind === 'file') this.seek(t);
    else this.scrub.set(t);
  }

  protected commitScrub(e: Event): void {
    this.scrub.set(null);
    this.seek(Number((e.target as HTMLInputElement).value));
  }

  /** As setas andam 5 segundos (o passo da barra, de 1, seria miúdo demais). */
  protected onSeekKey(e: KeyboardEvent): void {
    const by = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 5 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -5 : 0;
    if (!by || !this.duration()) return;
    e.preventDefault();
    this.seek(this.time() + by);
  }

  private seek(to: number): void {
    const d = this.duration();
    if (!d) return;
    const t = Math.min(Math.max(0, to), d);
    const s = this.source();
    const now = performance.now();
    if (s?.kind === 'file') {
      const el = this.sound()?.nativeElement;
      if (el) el.currentTime = t;
    } else if (this.bridge) {
      // o player aquecido também pula (parado): o play não precisa pular de novo
      this.bridge.send({ do: 'seek', t });
      this.parked = t;
      this.hold = { t, until: now + 2500 };
    }
    this.base = { t, at: now };
    this.time.set(t);
  }

  // ===== O que o som conta =====

  protected onDuration(d: number): void {
    if (Number.isFinite(d) && d > 0) this.duration.set(d);
  }

  protected onFileTime(t: number): void {
    if (!this.playing()) this.time.set(t);
  }

  protected onState(state: 'playing' | 'waiting' | 'paused' | 'ended'): void {
    if (state === 'playing') {
      const now = performance.now();
      // o tempo do player de fora vem do último aviso; parado há tempo, recomeça a conta daqui
      if (this.sound() || now - this.base.at > 300) this.base = { t: this.time(), at: now };
      this.playing.set(true);
      this.waiting.set(false);
      this.stuck.set(false);
      clearTimeout(this.startWatch);
    } else if (state === 'waiting') {
      if (this.playing()) this.waiting.set(true);
    } else {
      this.playing.set(false);
      this.waiting.set(false);
      this.parked = this.time();
      if (state === 'ended' && this.duration()) this.time.set(this.duration());
    }
  }

  /** O que o player de fora contou (ver ui/embed-bridge.ts). */
  private onReport(r: EmbedReport): void {
    if (r.error) {
      if (!this.playing()) this.failed.set(true);
      if (this.phase === 'warming') this.warmed();
      return;
    }
    if (r.duration) this.onDuration(r.duration);
    if (this.phase === 'warming') {
      // pronto: toca calado, para encher o começo; o tempo andou: o começo está aí, para e volta
      if (r.ready) this.bridge?.send({ do: 'play' });
      else if (r.state === 'playing') {
        this.bridge?.send({ do: 'pause' });
        this.bridge?.send({ do: 'seek', t: this.startAt() });
        this.parked = this.startAt();
        this.warmed();
      }
      return;
    }
    // aquecido e parado: o que ele conta (o eco do aquecimento) não muda nada aqui
    if (this.phase !== 'live') return;
    const now = performance.now();
    if (r.time !== undefined) {
      // logo depois de um pulo, um aviso longe de onde a pessoa pediu é de antes do pulo
      const stale = now < this.hold.until && Math.abs(r.time - this.hold.t) > 1.5;
      if (!stale) {
        if (now < this.hold.until) this.hold.until = 0;
        this.base = { t: r.time, at: now };
        if (!this.playing()) this.time.set(r.time);
      }
    }
    if (!r.state) return;
    // o "parado" atrasado de antes do play não desfaz o pedido
    if ((r.state === 'paused' || r.state === 'ended') && this.waiting() && now - this.playedAt < 600) return;
    this.onState(r.state);
  }

  private loop(): void {
    cancelAnimationFrame(this.raf);
    const tick = () => {
      this.raf = 0;
      if (!this.playing()) return;
      const el = this.sound()?.nativeElement;
      if (!this.waiting()) {
        let t: number;
        if (el) t = el.currentTime;
        else {
          // anda sozinho entre os avisos, mas só um pouco: um aviso que atrasa (o player engasgou sem
          // dizer) para o tempo à mostra em vez de deixá-lo correr na frente e depois voltar
          t = this.base.t + Math.min(AHEAD, Math.max(0, (performance.now() - this.base.at) / 1000));
          const cur = this.time();
          if (t < cur && cur - t < AHEAD + 0.1) t = cur;
        }
        const d = this.duration();
        this.time.set(d ? Math.min(t, d) : t);
      }
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  // ===== O player de fora =====

  private resetEmbed(): void {
    this.bridge?.destroy();
    this.bridge = null;
    this.phase = 'cold';
    this.hold = { t: 0, until: 0 };
    clearTimeout(this.startWatch);
    cancelAnimationFrame(this.raf);
  }
}
