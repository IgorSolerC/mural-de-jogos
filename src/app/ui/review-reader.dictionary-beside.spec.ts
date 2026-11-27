import { SPEECH } from '../core/voz';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Cloud } from '../core/cloud-config';
import { CloudAccount } from '../core/cloud-account';
import { LocalData } from '../core/local-data';
import { Review, sanitizeReview } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { SHARED_AUTO } from '../core/shared-store';
import { setEverythingNear } from './near-screen';
import { ReviewReader } from './review-reader';

/**
 * O Dicionário Japonês ao lado (PLANO-LADO-A-LADO.md, D5 e D6): ele abre ao lado de uma anotação pelo seletor do Ao
 * lado, com a mesma peça da página e o estado só dele; a lousa cobre só o lado dele; fechando a anotação, ele fica
 * sozinho, com o Ao lado, e a escolhida entra à direita dele.
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

function note(id: string, name: string, text = 'Algum texto.'): Review {
  return sanitizeReview({
    id,
    kind: 'anotacoes',
    game: { name, coverUrl: null, source: 'manual' },
    scores: { final: 0 },
    status: 'finalizado',
    difficulty: 'nenhuma',
    verdict: null,
    text,
    completedAt: '2026-01-01',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  })!;
}

const wait = (ms = 0) => new Promise((r) => setTimeout(r, ms));

describe('O Dicionário Japonês ao lado (ReviewReader, PLANO-LADO-A-LADO.md, D5)', () => {
  let fixture: ComponentFixture<ReviewReader>;
  let reader: ReviewReader;
  let el: HTMLElement;
  let store: ReviewStore;

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
      ],
    });
    fixture = TestBed.createComponent(ReviewReader);
    reader = fixture.componentInstance;
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    store = TestBed.inject(ReviewStore);
    store.add(note('nota-a', 'Estudo de japonês'));
    store.add(note('nota-b', 'Vocabulário da semana'));
  });

  afterEach(() => {
    el.querySelectorAll('dialog').forEach((d) => d.open && d.close());
    setEverythingNear(false);
    localStorage.clear();
  });

  const outer = () => el.querySelector<HTMLDialogElement>('dialog.reader:not(.ao-lado)')!;
  const beside = () => el.querySelector<HTMLDialogElement>('dialog.reader.ao-lado');
  const nameOf = (root: Element | null) => root?.querySelector('.par > article h2')?.textContent?.trim();
  const fits = () => spyOn(reader as unknown as { fitsBeside(): boolean }, 'fitsBeside').and.returnValue(true);

  async function settle(ms = 30): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    await wait(ms);
    fixture.detectChanges();
    await fixture.whenStable();
  }

  async function openPicker(root: Element): Promise<void> {
    root.querySelector<HTMLElement>('.etq-trilho[data-trilho="ao-lado"]')!.click();
    await settle(60);
  }

  async function withDictionary(): Promise<void> {
    fits();
    reader.open(store.get('nota-a')!);
    await settle();
    await openPicker(outer());
    const row = document.querySelector<HTMLButtonElement>('app-card-picker .escolha.extra');
    expect(row).withContext('a linha do dicionário no seletor').not.toBeNull();
    expect(row!.textContent).toContain('Dicionário Japonês');
    row!.click();
    await settle(120);
    await settle(60);
  }

  it('o seletor do Ao lado tem o dicionário em cima, e ele abre ao lado da anotação, com a mesma peça da página', async () => {
    await withDictionary();
    expect(outer().classList).toContain('dupla');
    expect(nameOf(outer())).toBe('Estudo de japonês');
    expect(beside()?.classList).toContain('e-dicionario');
    expect(nameOf(beside())).toContain('Dicionário Japonês');
    const view = beside()!.querySelector('app-dictionary-view');
    expect(view).withContext('a peça do dicionário').not.toBeNull();
    expect(view!.classList).toContain('no-lado');
    // a busca e os filtros, e as palavras
    expect(view!.querySelector('app-search-strip')).not.toBeNull();
    expect(view!.querySelector('button[aria-controls="cartela-dicionario"]')).not.toBeNull();
    expect(view!.querySelectorAll('.verbete').length).toBeGreaterThan(0);
    // ao lado, sem o Treinar
    expect([...view!.querySelectorAll('.pasta button')].some((b) => b.textContent?.includes('Treinar'))).toBeFalse();
  });

  it('procurar no dicionário ao lado não muda o endereço da página (o estado é só dele)', async () => {
    await withDictionary();
    const router = TestBed.inject(Router);
    const before = router.url;
    const input = beside()!.querySelector<HTMLInputElement>('app-search-strip input')!;
    input.value = 'taberu';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await settle(250);
    expect(router.url).toBe(before);
    const words = [...beside()!.querySelectorAll('.verbete .palavra')].map((x) => x.textContent?.trim());
    expect(words.length).toBeGreaterThan(0);
    expect(words.some((w) => w?.includes('食べる'))).toBeTrue();
  });

  it('a lousa da escrita abre só no lado do dicionário, sem ser modal, e a anotação continua viva', async () => {
    await withDictionary();
    const draw = beside()!.querySelector<HTMLButtonElement>('.verbete [class*="desenhar"], .verbete .palavra-btn, .verbete button[title*="escrever"]');
    expect(draw).withContext('o botão que abre a lousa').not.toBeNull();
    draw!.click();
    await settle(150);
    const lousa = beside()!.querySelector<HTMLDialogElement>('app-word-board dialog.lousa');
    expect(lousa).withContext('a lousa').not.toBeNull();
    expect(lousa!.matches(':popover-open')).toBeTrue();
    expect(lousa!.matches(':modal')).toBeFalse();
    const room = beside()!.querySelector(':scope > .par')!.getBoundingClientRect();
    const r = lousa!.getBoundingClientRect();
    expect(r.left).toBeGreaterThanOrEqual(room.left - 1);
    expect(r.right).toBeLessThanOrEqual(room.right + 1);
    expect(beside()!.querySelector('.sala-veu')).not.toBeNull();
    // o foco entrou nela (como no modal), e o Esc a fecha, e a leitura fica
    expect(lousa!.contains(document.activeElement)).withContext('o foco na lousa').toBeTrue();
    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await settle(60);
    expect(beside()!.querySelector('app-word-board')).toBeNull();
    expect(beside()!.querySelector('.sala-veu')).toBeNull();
    expect(outer().open).toBeTrue();
  });

  it('fechando a anotação, o dicionário fica sozinho, com o Ao lado; a escolhida entra à direita dele', async () => {
    await withDictionary();
    outer().querySelector<HTMLElement>(':scope > .par .faixa-nome .fecha')!.click();
    await settle(60);
    expect(outer().open).toBeTrue();
    expect(outer().classList).toContain('so-o-lado');
    expect(outer().querySelector(':scope > .par')).toBeNull();
    expect(beside()?.classList).toContain('e-dicionario');
    expect(beside()!.querySelector('.faixa-nome .fecha')!.getAttribute('aria-label')).toBe('Fechar');
    // o Ao lado do dicionário sozinho: o seletor sem a linha do dicionário
    await openPicker(beside()!);
    expect(document.querySelector('app-card-picker .escolha.extra')).toBeNull();
    const item = [...document.querySelectorAll<HTMLButtonElement>('app-card-picker .escolha')].find((b) => b.textContent?.includes('Vocabulário'));
    expect(item).withContext('a anotação no seletor').toBeDefined();
    item!.click();
    await settle(60);
    expect(outer().classList).toContain('dupla');
    expect(outer().classList).toContain('lado-primeiro');
    expect(nameOf(outer())).toBe('Vocabulário da semana');
    // o dicionário à esquerda, a escolhida à direita
    const dic = beside()!.getBoundingClientRect();
    const nova = outer().querySelector(':scope > .par')!.getBoundingClientRect();
    expect(dic.left).toBeLessThan(nova.left);
  });

  it('com o dicionário sozinho, o X dele fecha a leitura', async () => {
    await withDictionary();
    outer().querySelector<HTMLElement>(':scope > .par .faixa-nome .fecha')!.click();
    await settle(60);
    beside()!.querySelector<HTMLElement>('.faixa-nome .fecha')!.click();
    await settle(60);
    expect(outer().open).toBeFalse();
  });

  it('o X do dicionário ao lado fecha só ele, e a anotação fica', async () => {
    await withDictionary();
    beside()!.querySelector<HTMLElement>('.faixa-nome .fecha')!.click();
    await settle(60);
    expect(beside()).toBeNull();
    expect(nameOf(outer())).toBe('Estudo de japonês');
    expect(outer().querySelector('.etq-trilho[data-trilho="ao-lado"]')).not.toBeNull();
  });
});
