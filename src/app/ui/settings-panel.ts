import { ChangeDetectionStrategy, Component, ElementRef, inject, output, signal, viewChild } from '@angular/core';
import { Download, Eye, EyeOff, LucideAngularModule, Upload, X } from 'lucide-angular';
import { ReviewStore } from '../core/review-store';
import { Settings } from '../core/settings';
import { Pin } from './pin';

@Component({
  selector: 'app-settings-panel',
  imports: [LucideAngularModule, Pin],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dialog class="sheet settings" aria-labelledby="ajustes-titulo" (click)="onBackdrop($event)">
      <div class="ficha cartolina">
        <app-pin class="pin" color="#2f6bff" />
        <header class="head">
          <h2 id="ajustes-titulo">Ajustes do mural</h2>
          <button type="button" class="icon-btn" (click)="close()" aria-label="Fechar">
            <lucide-icon [img]="CloseIcon" [size]="22" [strokeWidth]="2.6" />
          </button>
        </header>

        <div class="body">
          <section>
            <h3>Backup</h3>
            <p class="lead">
              Suas resenhas ficam só neste navegador. Baixe um backup de vez em quando, ou antes de limpar
              os dados do navegador.
            </p>
            <div class="row-actions">
              <button type="button" class="btn-ink" (click)="exportFile()" [disabled]="!store.count() && !store.draftCount()">
                <lucide-icon [img]="DownloadIcon" [size]="18" [strokeWidth]="2.4" aria-hidden="true" />
                Baixar backup ({{ store.count() }})
              </button>
              <label class="file-btn">
                <lucide-icon [img]="UploadIcon" [size]="18" [strokeWidth]="2.4" aria-hidden="true" />
                Restaurar backup
                <input type="file" accept="application/json,.json" (change)="importFile($event)" />
              </label>
            </div>
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

          <section>
            <h3>Catálogo de jogos</h3>
            <p class="lead">
              A busca usa a Wikipedia e funciona sem configurar nada. Se quiser capas e busca mais precisas,
              crie uma chave gratuita em
              <a href="https://rawg.io/apidocs" target="_blank" rel="noopener">rawg.io/apidocs</a> e cole aqui.
            </p>
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
                  <span class="needs">precisa da chave abaixo</span>
                }
              </label>
            </fieldset>
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

          </section>
        </div>
      </div>
    </dialog>
  `,
  styleUrl: './settings-panel.scss',
})
export class SettingsPanel {
  protected readonly store = inject(ReviewStore);
  protected readonly settings = inject(Settings);
  readonly imported = output<number>();

  protected readonly CloseIcon = X;
  protected readonly DownloadIcon = Download;
  protected readonly UploadIcon = Upload;
  protected readonly ShowIcon = Eye;
  protected readonly HideIcon = EyeOff;

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  protected readonly showKey = signal(false);
  protected readonly mode = signal<'merge' | 'replace'>('merge');
  protected readonly importMsg = signal<{ text: string; error: boolean } | null>(null);

  open(): void {
    this.importMsg.set(null);
    this.dialog().nativeElement.showModal();
  }

  close(): void {
    this.dialog().nativeElement.close();
  }

  protected onBackdrop(e: MouseEvent): void {
    if (e.target === this.dialog().nativeElement) this.close();
  }

  protected exportFile(): void {
    const blob = this.store.exportJson();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mural-de-jogos-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
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
      const res = this.store.importJson(await file.text(), this.mode());
      const parts = [`${res.added} ${res.added === 1 ? 'resenha nova' : 'resenhas novas'}`];
      if (res.updated) parts.push(`${res.updated} atualizada${res.updated === 1 ? '' : 's'}`);
      if (res.skipped) parts.push(`${res.skipped} ignorada${res.skipped === 1 ? '' : 's'}`);
      if (res.drafts) parts.push(`${res.drafts} ${res.drafts === 1 ? 'jogo' : 'jogos'} pra resenhar depois`);
      this.importMsg.set({ text: `Backup restaurado: ${parts.join(', ')}.`, error: false });
      this.imported.emit(res.added + res.updated);
    } catch (err) {
      this.importMsg.set({ text: (err as Error).message, error: true });
    }
  }
}
