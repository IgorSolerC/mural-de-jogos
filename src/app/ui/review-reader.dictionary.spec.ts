import { provideZonelessChangeDetection, signal } from '@angular/core';
import { SPEECH } from '../core/voz';
import { ComponentFixture, DeferBlockState, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Cloud } from '../core/cloud-config';
import { CloudAccount } from '../core/cloud-account';
import { LocalData } from '../core/local-data';
import { Review, sanitizeReview } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { SHARED_AUTO, SharedEntry, SharedStore } from '../core/shared-store';
import { comMarkdown } from '../testing/writing-mode.spec';
import { DictionaryMarks } from '../core/dictionary/marks-store';
import { ReviewReader } from './review-reader';

/**
 * O Dicionário Japonês na seleção da leitura (PLANO-DICIONARIO.md, 4.3): selecionar uma palavra do dicionário (em
 * japonês ou em português) mostra o "No dicionário", que abre a folhinha com o verbete, e o "Aprendida", que marca.
 */

class MemoryData {
  private readonly map = new Map<string, string>();
  readonly where = 'local';
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  onExternalChange(): void {
    /* sem outras abas */
  }
  takeForeign(): null {
    return null;
  }
}

function note(id: string, name: string, text: string, extra: Partial<Review> = {}): Review {
  return {
    ...sanitizeReview({
      kind: 'anotacoes',
      game: { name, coverUrl: null, source: 'manual' },
      text,
      completedAt: '2026-11-01',
      createdAt: '2026-11-01T00:00:00.000Z',
      updatedAt: '2026-11-01T00:00:00.000Z',
      ...extra,
    })!,
    id,
  };
}

const TEXT = ['Estudo de hoje', '- 来る quer dizer vir', '- 食べる é comer, e televisão é テレビ', '- uma frase comprida que não é palavra nenhuma'].join('\n');

describe('O Dicionário Japonês na seleção da leitura (ReviewReader)', () => {
  comMarkdown();
  let fixture: ComponentFixture<ReviewReader>;
  let el: HTMLElement;
  let store: ReviewStore;
  let still: HTMLStyleElement;

  beforeEach(() => {
    localStorage.clear();
    still = document.head.appendChild(document.createElement('style'));
    still.textContent = '*, *::backdrop { animation: none !important; transition: none !important; }';
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: SPEECH, useValue: null },
        provideRouter([]),
        { provide: LocalData, useClass: MemoryData },
        { provide: SHARED_AUTO, useValue: false },
        { provide: Cloud, useValue: { ready: Promise.resolve(), config: signal({ api: 'https://api.teste', googleClientId: 'x' }) } },
        { provide: CloudAccount, useValue: { account: signal(null), signedIn: signal(false), request: async () => ({}) } },
      ],
    });
    store = TestBed.inject(ReviewStore);
    fixture = TestBed.createComponent(ReviewReader);
    el = fixture.nativeElement as HTMLElement;
    document.body.appendChild(el);
    fixture.detectChanges();
  });

  afterEach(() => {
    for (const d of el.querySelectorAll('dialog')) if (d.open) d.close();
    getSelection()?.removeAllRanges();
    el.remove();
    still.remove();
    localStorage.clear();
  });

  const q = <T extends HTMLElement>(selector: string) => el.querySelector<T>(selector);
  const wait = (ms = 0) => new Promise((res) => setTimeout(res, ms));
  async function settle(): Promise<void> {
    for (let i = 0; i < 3; i++) {
      await wait();
      fixture.detectChanges();
      for (const block of await fixture.getDeferBlocks()) await block.render(DeferBlockState.Complete).catch(() => undefined);
      await fixture.whenStable();
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    }
  }
  const button = (label: string) => [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent!.trim() === label);

  /** Seleciona a `nth` vez de `piece` no texto da ficha (contando todas as do texto) e espera os remendos. */
  async function select(piece: string, nth = 0): Promise<void> {
    const zone = q('[data-citavel]')!;
    const walker = document.createTreeWalker(zone, NodeFilter.SHOW_TEXT);
    let seen = 0;
    let found: { node: Node; at: number } | null = null;
    while (!found && walker.nextNode()) {
      const t = walker.currentNode.textContent ?? '';
      for (let at = t.indexOf(piece); at !== -1; at = t.indexOf(piece, at + piece.length)) {
        if (seen++ === nth) {
          found = { node: walker.currentNode, at };
          break;
        }
      }
    }
    expect(found).withContext(`"${piece}" no texto`).not.toBeNull();
    const range = document.createRange();
    range.setStart(found!.node, found!.at);
    range.setEnd(found!.node, found!.at + piece.length);
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
    await wait(260);
    await settle();
  }

  async function openNote(n: Review): Promise<void> {
    store.add(n);
    fixture.componentInstance.open(store.get(n.id)!);
    await settle();
  }

  it('a palavra selecionada mostra "No dicionário" e "Aprendida"; o resumo abre com o verbete e o caminho para o dicionário', async () => {
    await openNote(note('nestudo1', 'Japonês', TEXT));
    await select('来る');
    // o dicionário chega sob demanda: a seleção é lida de novo quando ele chega
    for (let i = 0; i < 20 && !q('.remendos .consultar'); i++) await settle();
    expect(q('.remendos .consultar')!.textContent!.trim()).toBe('No dicionário');
    expect(q('.remendos .aprender')!.textContent!.replace('覚', '').trim()).toBe('Aprendida');
    q<HTMLButtonElement>('.remendos .consultar')!.click();
    await settle();
    const sheet = q<HTMLDialogElement>('app-word-sheet dialog')!;
    expect(sheet.open).toBeTrue();
    expect(sheet.querySelector('.palavra')!.textContent).toContain('来る');
    expect(sheet.querySelector('.sentido')!.textContent!.trim()).toBe('vir');
    expect(sheet.querySelector<HTMLAnchorElement>('a.abrir')!.getAttribute('href')).toContain('/extras/dicionario?q=');
    sheet.close();
    await settle();
  });

  it('em português também, e "Aprendida" marca na hora; uma palavra já aprendida não oferece de novo', async () => {
    await openNote(note('nestudo2', 'Japonês', TEXT));
    // "televisão" é o sentido de テレビ (só dela); sem a conta do dono, ela falta aprender
    await select('televisão');
    for (let i = 0; i < 20 && !q('.remendos .consultar'); i++) await settle();
    const marks = TestBed.inject(DictionaryMarks);
    q<HTMLButtonElement>('.remendos .aprender')!.click();
    await settle();
    expect(marks.get('JP1004')?.learned).toBeTrue();
    expect(getSelection()!.isCollapsed).toBeTrue();
    // na conta do dono, 食べる já vem aprendida pelo CSV (14/nov): sem o "Aprendida"
    (TestBed.inject(CloudAccount).account as unknown as { set(v: unknown): void }).set({ codigo: 'G11T-G00D', nome: 'Igor' });
    await select('食べる');
    for (let i = 0; i < 20 && !q('.remendos .consultar'); i++) await settle();
    expect(q('.remendos .consultar')).not.toBeNull();
    expect(q('.remendos .aprender')).toBeNull();
    // uma frase que não é palavra não mostra nada do dicionário
    await select('frase comprida');
    await settle();
    expect(q('.remendos .consultar')).toBeNull();
  });
});
