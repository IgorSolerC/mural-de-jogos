import { Component, computed, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { CloudAccount } from './cloud-account';
import { ConflictQueue } from './conflict-queue';
import { Follow } from './follow';
import { Review, sanitizeReview } from './review';
import { SharedGroupsStore } from './shared-groups-store';
import { SharedEntry, SharedStore } from './shared-store';
import { SyncConflict, SyncConflicts, conflictKey } from './sync-conflicts';
import { ConflictSheet } from '../ui/conflict-sheet';
import { SiteHeader } from '../ui/site-header';

/**
 * A fila de tudo o que espera a pessoa escolher a versão (PLANO-CONFLITOS.md, rodada 3): os conflitos
 * da conta e os das compartilhadas em que ela escreve, o selo do botton de Ajustes, e a folha da fila,
 * que passa para o próximo em vez de fechar.
 */

const ANA = { codigo: 'AAAA-1111', nome: 'Ana', foto: null };

function note(id: string, name: string, extra: Record<string, unknown> = {}): Review {
  return sanitizeReview({ id, kind: 'anotacoes', game: { name, coverUrl: null, source: 'manual' }, text: 'x', completedAt: null, createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z', ...extra })!;
}

const own = (alvo: string, em: string, a: unknown, b: unknown, partes: SyncConflict['partes'] = []): SyncConflict => ({ alvo, em, a, b, deA: null, deB: null, partes });

function fakes(pending: SyncConflict[], shared: SharedEntry[]) {
  const list = signal(pending);
  return {
    list,
    sync: {
      pending: computed(() => list()),
      titleOf: (c: SyncConflict) => (c.alvo.startsWith('ficha:') ? ((c.a ?? c.b) as Review).game.name : 'As tags fixas'),
      get: (k: string) => list().find((c) => conflictKey(c) === k) ?? null,
      forFicha: (id: string) => list().find((c) => c.alvo === `ficha:${id}`) ?? null,
      device: { id: 'aparelho-pc', nome: 'Chrome no Windows' },
      resolve: (k: string) => list.set(list().filter((c) => conflictKey(c) !== k)),
    },
    shared: { conflicts: signal(shared), get: (id: string) => shared.find((e) => e.id === id) },
  };
}

function sharedEntry(id: string, name: string, em: string): SharedEntry {
  const view = note(id, name);
  return { id, papel: 'editor', conflito: { a: view, b: { ...view, text: 'y' }, autorA: ANA, autorB: ANA, em }, view } as unknown as SharedEntry;
}

describe('a fila das versões para escolher', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('junta a conta e as compartilhadas, os mais novos primeiro, uma linha por ficha', () => {
    const f = fakes(
      [
        own('ficha:n1', '2026-11-16T10:00:00.000Z', note('n1', 'Mercado'), note('n1', 'Mercado'), ['texto', 'tags']),
        own('ficha:n1', '2026-11-15T10:00:00.000Z', note('n1', 'Mercado'), null),
        own('ajuste:tagsFixas', '2026-11-16T12:00:00.000Z', ['a'], ['b']),
        // a compartilhada com conflito: vale a pergunta dela, não a da conta
        own('ficha:s1', '2026-11-16T09:00:00.000Z', note('s1', 'Viagem'), note('s1', 'Viagem')),
      ],
      [sharedEntry('s1', 'Viagem', '2026-11-16T11:00:00.000Z')],
    );
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), { provide: SyncConflicts, useValue: f.sync }, { provide: SharedStore, useValue: f.shared }] });
    const q = TestBed.inject(ConflictQueue);
    expect(q.list().map((x) => [x.what, x.name, x.parts])).toEqual([
      ['ajuste', 'As tags fixas', ''],
      ['compartilhada', 'Viagem', ''],
      ['ficha', 'Mercado', 'o texto e as tags'],
    ]);
    expect(q.list()[2].ref).toEqual({ noteId: 'n1' });
    expect(q.remaining({ noteId: 'n1' })).toBe(2);
    expect(q.nextAfter(q.list()[0].ref)).toEqual({ noteId: 's1' });
    q.open();
    expect(q.opened()).toEqual(q.list()[0].ref);
  });

  it('a folha da fila não fecha ao escolher: avisa, e quem abriu passa para o próximo', async () => {
    const c1 = own('ajuste:tagsFixas', '2026-11-16T12:00:00.000Z', ['a'], ['b']);
    const c2 = own('ajuste:tagsFixas', '2026-11-16T11:00:00.000Z', ['c'], ['d']);
    const f = fakes([c1, c2], []);
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: SyncConflicts, useValue: f.sync },
        { provide: SharedStore, useValue: { ...f.shared, get: () => null } },
        { provide: CloudAccount, useValue: { signedIn: () => true, account: () => ({ ...ANA }) } },
        { provide: SharedGroupsStore, useValue: { boards: () => [], groupOfBoard: () => undefined, ofCategory: () => null } },
      ],
    });
    const fx = TestBed.createComponent(ConflictSheet);
    fx.componentRef.setInput('chave', conflictKey(c1));
    fx.componentRef.setInput('chained', true);
    let resolved = 0;
    let vanished = 0;
    fx.componentInstance.resolved.subscribe(() => resolved++);
    fx.componentInstance.vanished.subscribe(() => vanished++);
    fx.detectChanges();
    await fx.whenStable();
    const el = fx.nativeElement as HTMLElement;
    expect(el.querySelector('.faltam')?.textContent).toBe('Depois deste, mais 1 para escolher');
    el.querySelectorAll<HTMLButtonElement>('.manter')[0].click();
    expect(resolved).toBe(1);
    expect(el.querySelector('dialog')!.open).toBeTrue();
    // escolheram o outro em outro aparelho, com a folha aberta nele: ela avisa, em vez de ficar vazia
    fx.componentRef.setInput('chave', conflictKey(c2));
    fx.detectChanges();
    await fx.whenStable();
    f.list.set([]);
    fx.detectChanges();
    await fx.whenStable();
    expect(vanished).toBeGreaterThan(0);
  });

  it('o selo do botton de Ajustes diz quantas esperam, e o botton leva à lista', async () => {
    @Component({ template: '' })
    class Blank {}
    const n = signal(2);
    TestBed.configureTestingModule({
      imports: [SiteHeader],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([{ path: '**', component: Blank }]),
        { provide: Follow, useValue: { available: signal(true), unseen: signal(0) } },
        { provide: ConflictQueue, useValue: { list: computed(() => Array.from({ length: n() }, () => ({}))) } },
      ],
    });
    const fx = TestBed.createComponent(SiteHeader);
    await TestBed.inject(Router).navigateByUrl('/anotacoes');
    await fx.whenStable();
    const el = fx.nativeElement as HTMLElement;
    const selo = el.querySelector('[data-conflitos]');
    expect(selo?.textContent).toBe('2 versões para escolher');
    const link = selo!.closest('a')!;
    expect(link.getAttribute('href')).toBe('/ajustes?aba=conta');
    expect(link.title).toContain('2 versões para escolher');
    n.set(0);
    await fx.whenStable();
    expect(el.querySelector('[data-conflitos]')).toBeNull();
  });
});
