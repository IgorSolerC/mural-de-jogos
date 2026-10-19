import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, inject, output, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CalendarSync, LucideAngularModule, RefreshCw, Unlink, X } from 'lucide-angular';
import { longDay } from '../core/calendar';
import { localDay } from '../core/dates';
import { GoogleAgenda } from '../core/google-agenda-sync';
import { BackdropClose } from './backdrop-close';
import { Busy } from './busy';
import { Confirm } from './confirm';
import { Pin } from './pin';

/**
 * A folha do Google Agenda, aberta pela pasta do Calendário: o que ligar faz, o botão de ligar (a janela
 * do Google), e ligada, desde quando, a última sincronização, o que ficou só no Google, "Sincronizar
 * agora" e "Desconectar" (com a confirmação).
 */
@Component({
  selector: 'app-google-agenda-sheet',
  imports: [BackdropClose, Busy, LucideAngularModule, Pin, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dialog class="sheet google-agenda" aria-labelledby="ga-titulo" (close)="closed.emit()" (backdropClose)="close()">
      <div class="ficha cartolina" data-cor="azul" style="--stock: var(--stock-azul)">
        <app-pin class="pin" color="#f4f4f0" />
        <header class="head">
          <div class="titulos">
            <h2 id="ga-titulo">Google Agenda</h2>
            <p class="sub">A sua agenda principal, nos dois sentidos</p>
          </div>
          <button type="button" class="icon-btn fecha" aria-label="Fechar" (click)="close()">
            <lucide-icon [img]="CloseIcon" [size]="22" [strokeWidth]="2.6" aria-hidden="true" />
          </button>
        </header>

        <div class="body">
          @switch (google.status()) {
            @case ('fora') {
              <p class="texto">Para ligar o Google Agenda, entre na sua conta do Murall em <a routerLink="/ajustes" [queryParams]="{ aba: 'conta' }" (click)="close()">Ajustes › Conta</a>.</p>
            }
            @case ('indisponivel') {
              <p class="texto">O Google Agenda ainda não está disponível para a sua conta.</p>
            }
            @case ('ligada') {
              <section class="grupo" aria-labelledby="ga-estado-t">
                <h3 class="grupo-titulo" id="ga-estado-t">Ligado</h3>
                <p class="estado">
                  <lucide-icon class="estado-icone" [img]="SyncIcon" [size]="20" [strokeWidth]="2.4" aria-hidden="true" />
                  <span>{{ sinceLine() }}</span>
                </p>
                <p class="texto ralo" aria-live="polite">{{ google.syncing() ? 'Sincronizando…' : lastLine() }}</p>
                @if (skippedLine(); as s) {
                  <p class="nota-papel">{{ s }}</p>
                }
              </section>
              <div class="acoes-linha">
                <button type="button" class="papel" [appBusy]="google.syncing()" (click)="google.sync()">
                  <lucide-icon [img]="RefreshIcon" [size]="16" [strokeWidth]="2.6" aria-hidden="true" />
                  Sincronizar agora
                </button>
                <button type="button" class="papel perigo" (click)="disconnect()">
                  <lucide-icon [img]="UnlinkIcon" [size]="16" [strokeWidth]="2.6" aria-hidden="true" />
                  Desconectar
                </button>
              </div>
            }
            @default {
              <section class="grupo" aria-labelledby="ga-como-t">
                <h3 class="grupo-titulo" id="ga-como-t">Como funciona</h3>
                <ul class="pontos">
                  <li>Os lembretes do Murall aparecem na sua agenda do Google, com o horário, a repetição e a cor.</li>
                  <li>Os eventos da sua agenda, de 30 dias atrás em diante, aparecem no Calendário do Murall.</li>
                  <li>Mudou de um lado, muda do outro; quando os dois mudam, vale a mudança mais nova.</li>
                  <li>Convites de outras pessoas e repetições que só o Google faz aparecem aqui, mas só mudam lá.</li>
                </ul>
              </section>
              <div class="acoes-linha">
                <button type="button" class="btn-ink" [appBusy]="google.status() === 'ligando'" (click)="google.connect()">
                  <lucide-icon [img]="SyncIcon" [size]="18" [strokeWidth]="2.6" aria-hidden="true" />
                  {{ google.status() === 'ligando' ? 'Esperando o Google…' : 'Conectar o Google Agenda' }}
                </button>
              </div>
              <p class="texto ralo">
                Uma janela do Google pede a permissão. Dá para desligar aqui ou em myaccount.google.com/permissions.
              </p>
            }
          }
          @if (google.error(); as e) {
            <p class="erro" role="alert">{{ e }}</p>
          }
        </div>

        <footer class="foot">
          <div class="actions">
            <button type="button" class="btn-quiet" (click)="close()">Fechar</button>
          </div>
        </footer>
      </div>
    </dialog>
  `,
  styleUrl: './google-agenda-sheet.scss',
})
export class GoogleAgendaSheet {
  readonly closed = output<void>();

  protected readonly CloseIcon = X;
  protected readonly SyncIcon = CalendarSync;
  protected readonly RefreshIcon = RefreshCw;
  protected readonly UnlinkIcon = Unlink;

  protected readonly google = inject(GoogleAgenda);
  private readonly confirm = inject(Confirm);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  protected readonly sinceLine = computed(() => {
    const since = this.google.since();
    return since ? `Desde ${longDay(localDay(new Date(since)))}.` : 'Ligado.';
  });

  protected readonly lastLine = computed(() => {
    const last = this.google.lastSync();
    if (!last) return 'Ainda não sincronizou neste aparelho.';
    const minutes = Math.round((Date.now() - Date.parse(last)) / 60_000);
    const when = minutes < 1 ? 'agora há pouco' : minutes < 60 ? `há ${minutes} min` : `em ${longDay(localDay(new Date(last)))}`;
    return `Última sincronização ${when}. Com o Calendário aberto, ela se repete sozinha.`;
  });

  protected readonly skippedLine = computed(() => {
    const s = this.google.skipped();
    const parts: string[] = [];
    if (s.repeticao) parts.push(s.repeticao === 1 ? '1 evento repete de um jeito que o Murall não sabe mostrar' : `${s.repeticao} eventos repetem de um jeito que o Murall não sabe mostrar`);
    if (s.excecao) parts.push(s.excecao === 1 ? '1 mudança feita só num dia de um evento que repete' : `${s.excecao} mudanças feitas só num dia de eventos que repetem`);
    return parts.length ? `${parts.join('; ')}: ${s.repeticao + s.excecao === 1 ? 'ficou' : 'ficaram'} só no Google.` : null;
  });

  constructor() {
    afterNextRender(() => {
      this.dialog().nativeElement.showModal();
      this.dialog().nativeElement.querySelector<HTMLElement>('.fecha')?.focus();
    });
  }

  protected async disconnect(): Promise<void> {
    const sure = await this.confirm.ask({
      title: 'Desconectar o Google Agenda?',
      text: 'Os lembretes e os eventos continuam onde estão, nos dois lados; só param de se acompanhar.',
      confirm: 'Desconectar',
    });
    if (sure) await this.google.disconnect();
  }

  close(): void {
    const el = this.dialog().nativeElement;
    if (el.open) el.close();
  }
}
