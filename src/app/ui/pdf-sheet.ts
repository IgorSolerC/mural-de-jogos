import { ApplicationRef, ChangeDetectionStrategy, Component, EnvironmentInjector, ViewEncapsulation, createComponent, input } from '@angular/core';
import { NoteLinks } from '../core/note-links';
import { RichText } from './rich-text';

/** Um rótulo com cor (o grupo, uma tag); sem cor, o do papel. */
export interface PdfLabel {
  label: string;
  color: string | null;
}

/** A Média de uma análise, impressa como a etiqueta da ficha do mural, e as notas do boletim. */
export interface PdfScore {
  /** "9,6", como o site mostra. */
  value: string;
  verdict: string | null;
  /** As notas que contam, na ordem do boletim: "História", "9". */
  marks: readonly { label: string; value: string }[];
}

/** O que vai para o PDF: a ficha aberta na leitura, como ela é lida (sem o que se toca). */
export interface PdfDoc {
  title: string;
  /** "de Fulano", "Álbum de Radiohead": quem fez a obra (as análises). */
  by?: string;
  /** A linha das informações, na ordem: o assunto, a data, as horas, a média. */
  meta: readonly string[];
  group?: PdfLabel | null;
  tags?: readonly PdfLabel[];
  /** A nota da análise: a Média, o veredito e as notas do boletim (as anotações não têm). */
  score?: PdfScore | null;
  /** A capa da obra (ou a da anotação), pequena no canto do cabeçalho. */
  cover?: string | null;
  text: string;
  /** Os links entre anotações: só para achar a de um título (o que não existe sai tracejado). */
  links?: NoteLinks | null;
}

/**
 * A ficha como documento, para salvar em PDF pela impressão do navegador (Obsidian é a régua): a
 * folha A4 branca, o título grande, uma linha de informações impressas, e o texto com todas as marcas
 * do site (ui/rich-text.ts) numa letra de leitura, a Inter, sem a pauta nem a letra à mão. Os widgets
 * continuam com a cara deles (a foto colada, a fita, o bloquinho do contador, a ficha colada), no
 * tamanho em que aparecem na leitura; só os broches de ampliar e de volume saem, que no papel não se
 * tocam. O spoiler aparece (no papel não há o que tocar), numa caixinha tracejada; as tarefas feitas
 * aparecem todas, riscadas.
 *
 * Os estilos não são encapsulados (pdf-sheet.scss): eles vestem o texto desenhado pelo RichText, e
 * só existem enquanto a folha está montada (o Angular tira o estilo quando o último componente sai),
 * então o `@page` e o que esconde o site na impressão não ficam para depois.
 *
 * Todo jeito novo de escrever (um bloco, uma marca, um widget) precisa sair certo aqui: o
 * pdf-sheet.spec.ts tem uma amostra de cada um e falha com o que falta.
 */
@Component({
  selector: 'app-pdf-sheet',
  imports: [RichText],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: { class: 'pdf-sheet' },
  styleUrl: './pdf-sheet.scss',
  template: `
    @let d = doc();
    <article class="pdf-folha" lang="pt-BR">
      <header class="pdf-cabeca">
        <div class="pdf-nomes">
          <h1 class="pdf-titulo">{{ d.title }}</h1>
          @if (d.by) {
            <p class="pdf-de">{{ d.by }}</p>
          }
          @if (d.group || d.meta.length) {
            <p class="pdf-meta">
              @if (d.group; as g) {
                <span class="pdf-grupo" [style.--cor]="g.color">{{ g.label }}</span>
              }
              @for (m of d.meta; track $index) {
                <span>{{ m }}</span>
              }
            </p>
          }
          @if (d.score?.marks?.length) {
            <dl class="pdf-boletim">
              @for (m of d.score!.marks; track m.label) {
                <div>
                  <dt>{{ m.label }}</dt>
                  <dd>{{ m.value }}</dd>
                </div>
              }
            </dl>
          }
          @if (d.tags?.length) {
            <ul class="pdf-tags" aria-label="Tags">
              @for (t of d.tags; track t.label) {
                <li [style.--cor]="t.color">{{ t.label }}</li>
              }
            </ul>
          }
        </div>
        <!-- a Média: a etiqueta de duas partes da ficha do mural, o número impresso e o veredito na faixa preta -->
        @if (d.score; as s) {
          <p class="pdf-media" [attr.aria-label]="'Média ' + s.value + (s.verdict ? ', ' + s.verdict : '')">
            <span class="pdf-media-nota" aria-hidden="true">{{ s.value }}</span>
            @if (s.verdict) {
              <span class="pdf-media-veredito" aria-hidden="true">{{ s.verdict }}</span>
            }
          </p>
        }
        @if (d.cover) {
          <img class="pdf-capa" [src]="d.cover" alt="" referrerpolicy="no-referrer" />
        }
      </header>
      @if (d.text.trim()) {
        <div class="pdf-texto">
          <app-rich-text [text]="d.text" [links]="d.links ?? null" />
        </div>
      }
    </article>
  `,
})
export class PdfSheet {
  readonly doc = input.required<PdfDoc>();
}

/** O nome do arquivo que o navegador sugere (é o título da página): sem o que o sistema não aceita. */
export function pdfFileName(title: string): string {
  const clean = title
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  return clean || 'Anotação';
}

/** O tempo máximo esperando a folha ficar pronta (as fotos, os widgets): depois disso, imprime como está. */
const READY_MS = 8000;

/**
 * Salva a ficha em PDF: monta a folha fora da tela, espera tudo chegar (os widgets, que vêm em
 * pedaços à parte, as fotos, as letras e as animações de chegada), põe o título da ficha no da página
 * (o nome que o arquivo ganha) e abre a impressão do navegador, onde se escolhe "Salvar como PDF".
 * Desmonta quando a impressão fecha. `ready` avisa logo antes de a impressão abrir (o bilhete de
 * "Preparando" sai).
 */
export async function exportPdf(doc: PdfDoc, env: EnvironmentInjector, app: ApplicationRef, ready?: () => void): Promise<void> {
  cleanup?.();
  const ref = createComponent(PdfSheet, { environmentInjector: env });
  ref.setInput('doc', doc);
  app.attachView(ref.hostView);
  const host = ref.location.nativeElement as HTMLElement;
  document.body.appendChild(host);
  ref.changeDetectorRef.detectChanges();

  const html = document.documentElement;
  const title = document.title;
  let gone = false;
  const done = (): void => {
    if (gone) return;
    gone = true;
    cleanup = null;
    removeEventListener('afterprint', done);
    html.classList.remove('pdf-imprimindo');
    document.head.querySelector('style[data-pdf-pe]')?.remove();
    document.title = title;
    app.detachView(ref.hostView);
    ref.destroy();
  };
  cleanup = done;

  await sheetReady(host);
  if (gone) return;
  markLong(host);
  // o pé de cada página leva o dia em que o PDF foi feito: o contador fica certo para aquele dia
  const stamp = document.createElement('style');
  stamp.setAttribute('data-pdf-pe', '');
  stamp.textContent = footerStamp(new Date());
  document.head.appendChild(stamp);
  ready?.();
  html.classList.add('pdf-imprimindo');
  document.title = pdfFileName(doc.title);
  addEventListener('afterprint', done);
  window.print();
}

/** A altura do que se escreve numa página A4 (297 mm menos as margens de cima e de baixo), em px. */
const PAGE_PX = ((297 - 38) / 25.4) * 96;

/**
 * Um widget mais alto que uma página (a nota colada com um texto comprido) pode quebrar de página,
 * como texto; os outros vão inteiros para a página seguinte.
 */
export function markLong(host: HTMLElement): void {
  for (const w of host.querySelectorAll<HTMLElement>('app-note-widget')) w.classList.toggle('pdf-longa', w.getBoundingClientRect().height > PAGE_PX * 0.9);
}

/** O pé das páginas com o dia: "MURALL · 24 DE OUT. DE 2026". */
export function footerStamp(day: Date): string {
  const when = day.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' }).toUpperCase();
  return `@page { @bottom-left { content: ${JSON.stringify(`MURALL · ${when}`)}; } }`;
}

/** A folha de antes, se a impressão não avisou que fechou (alguns navegadores não avisam). */
let cleanup: (() => void) | null = null;

/** A folha está pronta para o papel: os widgets chegaram, as fotos carregaram, as letras também. */
export async function sheetReady(host: HTMLElement, ms = READY_MS): Promise<void> {
  const until = Date.now() + ms;
  const left = (): number => Math.max(0, until - Date.now());
  const wait = (t: number) => new Promise<void>((r) => setTimeout(r, t));
  const settled = <T>(p: Promise<T>, t: number) => Promise.race([p.then(() => undefined, () => undefined), wait(t)]);
  // duas voltas: a ficha colada (o widget Nota) traz widgets e fotos dela
  for (let round = 0; round < 2; round++) {
    // os widgets vêm em pedaços à parte: o lugar deles espera até eles chegarem
    while (host.querySelector('.esperando') && left()) await wait(40);
    // as capas que esperam a tela chegar perto: no papel, todas
    const imgs = [...host.querySelectorAll('img')];
    for (const img of imgs) if (img.loading === 'lazy') img.loading = 'eager';
    const loading = imgs.filter((img) => !img.complete);
    await settled(
      Promise.all(loading.map((img) => new Promise((r) => (img.addEventListener('load', r, { once: true }), img.addEventListener('error', r, { once: true }))))),
      left(),
    );
    await wait(30);
  }
  // as letras da folha (a Inter só carrega quando a folha aparece) e as do site
  if (document.fonts) {
    await settled(
      Promise.all(['400 1em "Inter Variable"', 'italic 400 1em "Inter Variable"', '700 1em "Inter Variable"'].map((f) => document.fonts.load(f))).then(() => document.fonts.ready),
      left(),
    );
  }
  // a foto que acabou de chegar ainda está se revelando: espera as animações que terminam
  const finite = host.getAnimations?.({ subtree: true }).filter((a) => a.effect?.getComputedTiming().endTime !== Infinity) ?? [];
  await settled(Promise.all(finite.map((a) => a.finished)), Math.min(left(), 1500));
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
}
