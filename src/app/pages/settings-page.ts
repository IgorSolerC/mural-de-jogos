import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Download, Eye, EyeOff, LucideAngularModule, Upload } from 'lucide-angular';
import { Backup } from '../core/backup';
import { ReviewStore } from '../core/review-store';
import { Settings } from '../core/settings';
import { Toasts } from '../ui/toast';
import { Pin } from '../ui/pin';

/** Ajustes: backup, catálogo de jogos e o jeito do mural, cada um na sua ficha. Era um diálogo; virou página. */
@Component({
  selector: 'app-settings-page',
  imports: [LucideAngularModule, Pin],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="sr-only">Ajustes</h1>

    <div class="boards">
      <section class="ficha cartolina backup" aria-labelledby="backup-titulo">
        <app-pin class="pin" color="#e62e2d" />
        <h2 id="backup-titulo">Backup</h2>
        <p class="lead">
          Suas resenhas ficam só neste navegador. Baixe um backup de vez em quando, ou antes de limpar os dados do
          navegador.
        </p>
        <div class="row-actions">
          <button type="button" class="btn-ink" (click)="exportFile()" [disabled]="!store.count() && !store.draftCount()">
            <lucide-icon [img]="DownloadIcon" [size]="18" [strokeWidth]="2.4" aria-hidden="true" />
            Baixar backup
          </button>
          <label class="file-btn">
            <lucide-icon [img]="UploadIcon" [size]="18" [strokeWidth]="2.4" aria-hidden="true" />
            Restaurar backup
            <input type="file" accept="application/json,.json,application/gzip,.gz" (change)="importFile($event)" />
          </label>
        </div>
        <p class="has">
          {{ store.count() }} {{ store.count() === 1 ? 'resenha' : 'resenhas' }}
          @if (store.draftCount()) {
            e {{ store.draftCount() }} pra depois
          }
          entram no arquivo.
        </p>
        <p class="has last">{{ lastBackup() }}</p>
        @if (backup.persisted() === false) {
          <p class="tip">
            O navegador pode apagar o que um site guarda quando falta espaço (o Safari apaga depois de uma semana
            sem abrir). Instale o mural na tela inicial para ele ficar protegido, e baixe o backup de vez em quando.
          </p>
        }
        <fieldset class="mode">
          <legend>Ao restaurar</legend>
          <label>
            <input type="radio" name="modo" value="merge" [checked]="mode() === 'merge'" (change)="mode.set('merge')" />
            Juntar com o que já está no mural
          </label>
          <label>
            <input type="radio" name="modo" value="replace" [checked]="mode() === 'replace'" (change)="mode.set('replace')" />
            Substituir o mural inteiro
          </label>
        </fieldset>
        @if (importMsg(); as m) {
          <p class="msg" [class.error]="m.error" role="status">{{ m.text }}</p>
        }
      </section>

      <section class="ficha cartolina catalog" aria-labelledby="catalogo-titulo">
        <app-pin class="pin" color="#f4f4f0" />
        <h2 id="catalogo-titulo">Catálogo de jogos</h2>
        <p class="lead">
          A busca usa a Wikipedia e funciona sem configurar nada. Para capas e busca mais precisas, crie uma chave
          gratuita em <a href="https://rawg.io/apidocs" target="_blank" rel="noopener">rawg.io/apidocs</a> e cole aqui.
        </p>
        <label class="key-label" for="rawg-key">Chave da RAWG</label>
        <div class="key">
          <input
            id="rawg-key"
            [type]="showKey() ? 'text' : 'password'"
            autocomplete="off"
            spellcheck="false"
            placeholder="Cole sua chave aqui"
            [value]="settings.rawgKey()"
            (input)="settings.rawgKey.set($any($event.target).value)"
          />
          <button
            type="button"
            class="icon-btn"
            (click)="showKey.set(!showKey())"
            [attr.aria-label]="showKey() ? 'Esconder chave' : 'Mostrar chave'"
          >
            <lucide-icon [img]="showKey() ? HideIcon : ShowIcon" [size]="20" [strokeWidth]="2.4" />
          </button>
        </div>
        <fieldset class="mode source">
          <legend>Buscar jogos e capas em</legend>
          <label>
            <input type="radio" name="fonte" value="wikipedia" [checked]="settings.effectiveSource() === 'wikipedia'" (change)="settings.source.set('wikipedia')" />
            Wikipedia
          </label>
          <label [class.disabled]="!settings.hasRawg()">
            <input type="radio" name="fonte" value="rawg" [disabled]="!settings.hasRawg()" [checked]="settings.effectiveSource() === 'rawg'" (change)="settings.source.set('rawg')" />
            RAWG
            @if (!settings.hasRawg()) {
              <span class="needs">precisa da chave acima</span>
            }
          </label>
        </fieldset>
      </section>

      <section class="ficha cartolina mural" aria-labelledby="mural-titulo">
        <app-pin class="pin" color="#e62e2d" />
        <h2 id="mural-titulo">Mural</h2>
        <p class="lead">
          As etiquetas de fita separam o mural pelo que ordena: mês, nota, letra ou status. Esconda para as fichas
          correrem juntas, sem nada no meio, na hora de tirar um print.
        </p>
        <fieldset class="mode">
          <legend>Etiquetas dos grupos</legend>
          <label>
            <input type="radio" name="etiquetas" value="mostrar" [checked]="settings.groupLabels()" (change)="settings.groupLabels.set(true)" />
            Mostrar
          </label>
          <label>
            <input type="radio" name="etiquetas" value="esconder" [checked]="!settings.groupLabels()" (change)="settings.groupLabels.set(false)" />
            Esconder
          </label>
        </fieldset>
      </section>
    </div>
  `,
  styleUrl: './settings-page.scss',
})
export class SettingsPage {
  protected readonly store = inject(ReviewStore);
  protected readonly settings = inject(Settings);
  protected readonly backup = inject(Backup);
  private readonly toasts = inject(Toasts);

  protected readonly DownloadIcon = Download;
  protected readonly UploadIcon = Upload;
  protected readonly ShowIcon = Eye;
  protected readonly HideIcon = EyeOff;

  protected readonly showKey = signal(false);
  protected readonly mode = signal<'merge' | 'replace'>('merge');
  protected readonly importMsg = signal<{ text: string; error: boolean } | null>(null);

  protected readonly lastBackup = computed(() => {
    const at = this.backup.lastAt();
    if (!at) return 'Nenhum backup baixado ainda';
    const days = Math.floor((Date.now() - Date.parse(at)) / 86_400_000);
    const when = days <= 0 ? 'hoje' : days === 1 ? 'ontem' : `há ${days} dias`;
    return `Último backup: ${when}`;
  });

  protected exportFile(): Promise<void> {
    return this.backup.download();
  }

  protected async importFile(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (
      this.mode() === 'replace' &&
      this.store.count() > 0 &&
      !confirm(`Substituir as ${this.store.count()} resenhas do mural pelas do backup?`)
    ) {
      return;
    }
    try {
      const res = this.store.importJson(await this.store.readBackup(file), this.mode());
      const parts = [`${res.added} ${res.added === 1 ? 'resenha nova' : 'resenhas novas'}`];
      if (res.updated) parts.push(`${res.updated} atualizada${res.updated === 1 ? '' : 's'}`);
      if (res.skipped) parts.push(`${res.skipped} ignorada${res.skipped === 1 ? '' : 's'}`);
      if (res.removed) parts.push(`${res.removed} ${res.removed === 1 ? 'apagada' : 'apagadas'} como no backup`);
      if (res.drafts) parts.push(`${res.drafts} ${res.drafts === 1 ? 'jogo' : 'jogos'} pra depois`);
      this.importMsg.set({ text: `Backup restaurado: ${parts.join(', ')}.`, error: false });
      const n = res.added + res.updated;
      if (n) this.toasts.show(`${n} ${n === 1 ? 'resenha voltou' : 'resenhas voltaram'} para o mural`);
    } catch (err) {
      this.importMsg.set({ text: (err as Error).message, error: true });
    }
  }
}
