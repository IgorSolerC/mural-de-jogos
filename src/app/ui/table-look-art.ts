import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TableLook } from '../core/tables';

/**
 * A miniatura de cada jeito da tabela (a folha branca, a listrada, a quadriculada, a de caneta e o
 * recibo), desenhada dentro de um <svg viewBox="0 0 64 48">: a mesma na folha da tabela
 * (ui/widget-sheet.html) e no menu "Tabela" do modo Visual (ui/table-looks.ts).
 */
@Component({
  selector: 'g[appTableLookArt]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (appTableLookArt()) {
    @case ('branca') {
      <svg:g transform="rotate(-1.5 32 24)">
        <svg:rect x="6" y="7" width="52" height="34" rx="1.5" fill="#fffefb" stroke="#151515" stroke-opacity=".12" />
        @for (x of [10, 25, 40]; track x) {
          <svg:line [attr.x1]="x" y1="12" [attr.x2]="x + 9" y2="12" stroke="#1b1916" stroke-width="2" stroke-linecap="round" />
        }
        <svg:line x1="9" y1="16" x2="55" y2="16" stroke="#1b1916" stroke-width="1.6" />
        @for (y of [21, 28, 35]; track y) {
          <svg:line x1="10" [attr.y1]="y" x2="51" [attr.y2]="y" stroke="#151515" stroke-opacity=".4" stroke-width="1.1" stroke-linecap="round" stroke-dasharray="9 6" />
          @if (y !== 35) {
            <svg:line x1="9" [attr.y1]="y + 3.5" x2="55" [attr.y2]="y + 3.5" stroke="#d8d1c3" stroke-width=".8" />
          }
        }
      </svg:g>
    }
    @case ('listrada') {
      <svg:g transform="rotate(1.5 32 24)">
        <svg:rect x="6" y="7" width="52" height="34" rx="2" fill="#fffefb" stroke="#151515" stroke-opacity=".12" />
        <svg:path d="M6 9a2 2 0 0 1 2-2h48a2 2 0 0 1 2 2v7H6z" fill="#22201d" />
        @for (x of [10, 25, 40]; track x) {
          <svg:line [attr.x1]="x" y1="11.5" [attr.x2]="x + 9" y2="11.5" stroke="#fffdf8" stroke-width="1.8" stroke-linecap="round" />
        }
        <svg:rect x="6" y="23" width="52" height="7" fill="#efe7d6" />
        @for (y of [19.5, 26.5, 33.5]; track y) {
          <svg:line x1="10" [attr.y1]="y" x2="51" [attr.y2]="y" stroke="#151515" stroke-opacity=".4" stroke-width="1.1" stroke-linecap="round" stroke-dasharray="9 6" />
        }
      </svg:g>
    }
    @case ('quadriculada') {
      <svg:g transform="rotate(-2 32 24)">
        <svg:rect x="6" y="6" width="52" height="36" rx="1" fill="#fbfdff" stroke="#151515" stroke-opacity=".1" />
        @for (x of [10, 14, 18, 22, 26, 30, 34, 38, 42, 46, 50, 54]; track x) {
          <svg:line [attr.x1]="x" y1="6" [attr.x2]="x" y2="42" stroke="#4084d2" stroke-opacity=".22" stroke-width=".5" />
        }
        @for (y of [10, 14, 18, 22, 26, 30, 34, 38]; track y) {
          <svg:line x1="6" [attr.y1]="y" x2="58" [attr.y2]="y" stroke="#4084d2" stroke-opacity=".22" stroke-width=".5" />
        }
        <svg:rect x="12" y="12" width="16" height="4" fill="#ffda42" fill-opacity=".75" />
        <svg:rect x="34" y="12" width="16" height="4" fill="#ffda42" fill-opacity=".75" />
        <svg:rect x="10" y="10" width="44" height="28" fill="none" stroke="#3070c4" stroke-opacity=".7" stroke-width="1.1" />
        <svg:line x1="32" y1="10" x2="32" y2="38" stroke="#3070c4" stroke-opacity=".7" stroke-width="1.1" />
        @for (y of [17, 24, 31]; track y) {
          <svg:line x1="10" [attr.y1]="y" x2="54" [attr.y2]="y" stroke="#3070c4" stroke-opacity=".7" stroke-width="1.1" />
        }
        <svg:path d="M13.5 21.5c2-.8 4.5.5 7-.2s3-.4 4.5 0M35.5 28.5c2.4-.7 5 .4 7.4-.2" fill="none" stroke="#1d2a46" stroke-width="1.1" stroke-linecap="round" />
      </svg:g>
    }
    @case ('caneta') {
      <svg:g transform="rotate(1 32 24)" fill="none" stroke="#151515" stroke-opacity=".6" stroke-width="1.3" stroke-linecap="round">
        <svg:rect x="8.5" y="9.6" width="47.6" height="7.6" fill="#151515" fill-opacity=".08" stroke="none" />
        <svg:path d="M8 9.5 56.5 9M8.5 17.5 56 17.2M8 25.5l48.3.3M8.3 33.4 56 33.2M8 41l48.4-.3M8 9.5 8.3 41M24.2 9.3l.2 31.6M40.3 9.2 40 41M56.5 9 56.4 40.7" />
        @for (x of [11, 27, 43]; track x) {
          <svg:line [attr.x1]="x" y1="13.5" [attr.x2]="x + 9" y2="13.5" stroke-width="2" stroke-opacity=".9" />
        }
      </svg:g>
    }
    @case ('recibo') {
      <svg:g transform="rotate(-2 32 24)">
        <svg:path d="M14 7.5 16.5 5 19 7.5 21.5 5 24 7.5 26.5 5 29 7.5 31.5 5 34 7.5 36.5 5 39 7.5 41.5 5 44 7.5 46.5 5 49 7.5V40.5L46.5 43 44 40.5 41.5 43 39 40.5 36.5 43 34 40.5 31.5 43 29 40.5 26.5 43 24 40.5 21.5 43 19 40.5 16.5 43 14 40.5Z" fill="#fbfaf4" stroke="#151515" stroke-opacity=".14" stroke-width=".6" stroke-linejoin="round" />
        <svg:line x1="18" y1="13" x2="45" y2="13" stroke="#2b2a28" stroke-width="1.8" />
        <svg:line x1="18" y1="17" x2="45" y2="17" stroke="#2b2a28" stroke-opacity=".6" stroke-width="1" stroke-dasharray="2.2 1.6" />
        @for (y of [22, 27, 32]; track y) {
          <svg:line x1="18" [attr.y1]="y" x2="31" [attr.y2]="y" stroke="#2b2a28" stroke-opacity=".7" stroke-width="1.2" />
          <svg:line x1="38" [attr.y1]="y" x2="45" [attr.y2]="y" stroke="#2b2a28" stroke-opacity=".7" stroke-width="1.2" />
        }
        <svg:line x1="18" y1="36" x2="45" y2="36" stroke="#2b2a28" stroke-opacity=".6" stroke-width="1" stroke-dasharray="2.2 1.6" />
      </svg:g>
    }
    }
  `,
})
export class TableLookArt {
  readonly appTableLookArt = input.required<TableLook>();
}
