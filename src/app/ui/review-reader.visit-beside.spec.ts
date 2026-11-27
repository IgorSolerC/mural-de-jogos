import { SPEECH } from '../core/voz';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Cloud } from '../core/cloud-config';
import { CloudAccount } from '../core/cloud-account';
import { LocalData } from '../core/local-data';
import { NO_FOLDERS } from '../core/folders';
import type { FreeBoard } from '../core/free-board';
import { Review, sanitizeReview } from '../core/review';
import { SHARED_AUTO } from '../core/shared-store';
import { WallState } from '../core/wall-view';
import { setEverythingNear } from './near-screen';
import { ReviewReader } from './review-reader';

/**
 * Na visita, o lado a lado é o do dono (CLAUDE.md, "Visita: as mesmas peças do dono"; PLANO-LADO-A-LADO.md): a mesma
 * leitura abre o dicionário ao lado e o canvas público da pessoa só de ver, como no seu mural.
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

const BOARD = 'quadroPublicoDela12345';
const board: FreeBoard = { v: 1, id: BOARD, nome: 'Mapa da viagem', grupo: '', em: '2026-01-01T00:00:00.000Z', n: [], e: [] };

function note(id: string, name: string, extra: Partial<Review> = {}): Review {
  return sanitizeReview({
    id,
    kind: 'anotacoes',
    game: { name, coverUrl: null, source: 'manual' },
    scores: { final: 0 },
    status: 'finalizado',
    difficulty: 'nenhuma',
    verdict: null,
    text: 'Um texto.',
    completedAt: '2026-01-01',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...extra,
  })!;
}

const wait = (ms = 0) => new Promise((r) => setTimeout(r, ms));

describe('O lado a lado na visita (ReviewReader, PLANO-LADO-A-LADO.md)', () => {
  let fixture: ComponentFixture<ReviewReader>;
  let reader: ReviewReader;
  let el: HTMLElement;
  const dela = [note('dela-1', 'Diário da viagem'), note('cv-' + BOARD, 'Mapa da viagem', { canvas: BOARD, text: '' })];

  beforeEach(() => {
    localStorage.clear();
    setEverythingNear(true);
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: SPEECH, useValue: null },
        provideRouter([]),
        { provide: LocalData, useClass: MemoryData },
        { provide: SHARED_AUTO, useValue: false },
        { provide: Cloud, useValue: { ready: Promise.resolve(), config: signal({ api: 'https://api.teste', googleClientId: 'x' }) } },
        { provide: CloudAccount, useValue: { account: signal(null), signedIn: signal(false), request: async () => ({}) } },
        // a vista da visita: as pastas dela e os quadros públicos dela
        { provide: WallState, useValue: { folders: signal(NO_FOLDERS), canvasBoard: signal((id: string) => (id === BOARD ? board : null)), openFolderFrom: () => undefined } },
      ],
    });
    fixture = TestBed.createComponent(ReviewReader);
    reader = fixture.componentInstance;
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    spyOn(reader as unknown as { fitsBeside(): boolean }, 'fitsBeside').and.returnValue(true);
  });

  afterEach(() => {
    el.querySelectorAll('dialog').forEach((d) => d.open && d.close());
    setEverythingNear(false);
    localStorage.clear();
  });

  const outer = () => el.querySelector<HTMLDialogElement>('dialog.reader:not(.ao-lado)')!;
  const beside = () => el.querySelector<HTMLDialogElement>('dialog.reader.ao-lado');

  async function settle(ms = 40): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    await wait(ms);
    fixture.detectChanges();
    await fixture.whenStable();
  }

  async function pick(sel: string): Promise<void> {
    outer().querySelector<HTMLElement>(':scope > .par .etq-trilho[data-trilho="ao-lado"]')!.click();
    await settle(80);
    const item = document.querySelector<HTMLButtonElement>(sel) ?? [...document.querySelectorAll<HTMLButtonElement>('app-card-picker .escolha')].find((b) => b.textContent?.includes(sel));
    expect(item).withContext('no seletor: ' + sel).toBeTruthy();
    item!.click();
    await settle(150);
    await settle(60);
  }

  it('na visita, o dicionário abre ao lado da anotação da pessoa, como no seu mural', async () => {
    reader.open(dela[0], 'Ana', dela, false, 'ANA123');
    await settle();
    await pick('app-card-picker .escolha.extra');
    expect(beside()?.classList).toContain('e-dicionario');
    expect(beside()!.querySelectorAll('app-dictionary-view .verbete').length).toBeGreaterThan(0);
  });

  it('na visita, o canvas público dela abre ao lado, só de ver, sem o Abrir o canvas (que é do dono)', async () => {
    reader.open(dela[0], 'Ana', dela, false, 'ANA123');
    await settle();
    await pick('Mapa da viagem');
    expect(beside()!.querySelector('.canvas-leitura app-free-board')).withContext('o quadro dela').not.toBeNull();
    expect([...beside()!.querySelectorAll('.foot button')].some((b) => b.textContent?.includes('Abrir o canvas'))).toBeFalse();
    expect(beside()!.querySelector('.foot')?.textContent).toContain('Anotação de Ana');
  });
});
