import { Component, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { ACCOUNT_KEY, SESSION_KEY } from './cloud-account';
import { Cloud } from './cloud-config';
import { CloudMurals, muralLink, normalizeCode } from './cloud-murals';
import { ColleagueStore } from './colleague-store';
import { Toasts } from '../ui/toast';

@Component({ template: '' })
class Blank {}

const API = 'https://api.teste';

async function gz(doc: unknown): Promise<ArrayBuffer> {
  const stream = new Blob([JSON.stringify(doc)]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}

const review = (id: string, name: string) => ({
  id,
  kind: 'jogos',
  game: { name, coverUrl: null, source: 'manual' },
  scores: { historia: 7, diversao: 8, jogabilidade: 8, visual: 8 },
  status: 'finalizado',
  difficulty: 'nenhuma',
  verdict: null,
  completedAt: '2026-01-01',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

describe('murais pela nuvem (código e link)', () => {
  let murals: CloudMurals;
  let colleagues: ColleagueStore;
  let calls: string[];
  /** A nuvem de mentira: código → mural público e rev. */
  let published: Map<string, { rev: number; doc: unknown }>;

  beforeEach(async () => {
    await new Promise<void>((resolve) => {
      const r = indexedDB.deleteDatabase('meu-mural:colegas');
      r.onsuccess = r.onerror = r.onblocked = () => resolve();
    });
    localStorage.clear();
    calls = [];
    published = new Map([['K7QF-M2XA', { rev: 3, doc: { app: 'meu-mural', version: 2, owner: { name: 'Marina' }, reviews: [review('rmar01', 'Celeste')] } }]]);
    spyOn(window, 'fetch').and.callFake(async (url: RequestInfo | URL) => {
      const u = new URL(String(url));
      calls.push(u.pathname + u.search);
      const code = decodeURIComponent(u.pathname.replace('/v1/murais/', ''));
      const hit = published.get(code);
      if (!hit) return new Response(JSON.stringify({ erro: 'mural-nao-encontrado', mensagem: 'Não achei mural com esse código.' }), { status: 404 });
      if (u.searchParams.get('rev') === String(hit.rev)) return new Response(null, { status: 204, headers: { 'Mural-Rev': String(hit.rev) } });
      return new Response(await gz(hit.doc), { status: 200, headers: { 'Mural-Rev': String(hit.rev), 'Content-Type': 'application/gzip' } });
    });
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([{ path: 'comparar/mural', component: Blank }]),
        { provide: Cloud, useValue: { ready: Promise.resolve(), config: () => ({ api: API, googleClientId: 'x.apps.googleusercontent.com' }) } },
      ],
    });
    murals = TestBed.inject(CloudMurals);
    colleagues = TestBed.inject(ColleagueStore);
    await colleagues.ready;
  });

  afterEach(() => localStorage.clear());

  it('entende o código digitado de vários jeitos', () => {
    expect(normalizeCode('k7qf m2xa')).toBe('K7QF-M2XA');
    expect(normalizeCode('K7QF-M2XO')).toBe('K7QF-M2X0');
    expect(normalizeCode('i7lf-m2xa')).toBe('171F-M2XA');
    expect(normalizeCode('K7QF')).toBeNull();
    expect(muralLink('K7QF-M2XA', 'https://igorsolerc.github.io/mural-de-jogos/')).toBe('https://igorsolerc.github.io/mural-de-jogos/?mural=K7QF-M2XA');
  });

  it('abre pelo código: o mural vira um colega em Comparar, com o nome que veio nele', async () => {
    const c = await murals.open('k7qf-m2xa');
    expect(c.name).toBe('Marina');
    expect(c.codigo).toBe('K7QF-M2XA');
    expect(c.rev).toBe(3);
    expect(c.reviews.map((r) => r.game.name)).toEqual(['Celeste']);
    expect(colleagues.selected()?.id).toBe(c.id);
    expect(calls).toEqual(['/v1/murais/K7QF-M2XA']);
  });

  it('abrir de novo pede só "mudou?" (204), e com mudança traz o novo', async () => {
    await murals.open('K7QF-M2XA');
    await murals.open('K7QF-M2XA');
    expect(calls.at(-1)).toBe('/v1/murais/K7QF-M2XA?rev=3');
    expect(colleagues.colleagues().length).toBe(1);
    published.set('K7QF-M2XA', { rev: 4, doc: { app: 'meu-mural', version: 2, owner: { name: 'Marina' }, reviews: [review('rmar01', 'Celeste'), review('rmar02', 'Hades')] } });
    const c = await murals.open('K7QF-M2XA');
    expect(c.reviews.length).toBe(2);
    expect(colleagues.colleagues().length).toBe(1);
  });

  it('o nome que a pessoa deu aqui fica quando o mural se atualiza', async () => {
    const c = await murals.open('K7QF-M2XA');
    await colleagues.rename(c.id, 'Má');
    published.set('K7QF-M2XA', { rev: 5, doc: { app: 'meu-mural', version: 2, owner: { name: 'Marina' }, reviews: [] } });
    expect((await murals.open('K7QF-M2XA')).name).toBe('Má');
  });

  it('código errado, desconhecido ou o meu: mensagem clara e nada muda', async () => {
    await expectAsync(murals.open('abc')).toBeRejectedWithError(/tem 8 letras e números/);
    await expectAsync(murals.open('ZZZZ-ZZZZ')).toBeRejectedWithError(/Não achei mural/);
    localStorage.setItem(SESSION_KEY, 'A'.repeat(43));
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ id: 'eu', codigo: 'K7QF-M2XA', nome: 'Igor' }));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: Cloud, useValue: { ready: Promise.resolve(), config: () => ({ api: API, googleClientId: 'x.apps.googleusercontent.com' }) } },
      ],
    });
    await expectAsync(TestBed.inject(CloudMurals).open('K7QF-M2XA')).toBeRejectedWithError(/Esse é o seu código/);
    expect(colleagues.colleagues().length).toBe(0);
  });

  it('o link ?mural= abre o mural, vai para ele e sai do endereço', async () => {
    const before = location.href;
    history.replaceState(null, '', `${location.pathname}?mural=K7QF-M2XA${location.hash}`);
    const toasts = TestBed.inject(Toasts);
    spyOn(toasts, 'show');
    const router = TestBed.inject(Router);
    await murals.openFromLink();
    expect(location.search).toBe('');
    expect(router.url).toBe('/comparar/mural');
    expect(toasts.show).toHaveBeenCalledWith('O mural de Marina chegou');
    history.replaceState(null, '', before);
  });

  it('sem nuvem, o link só avisa', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideRouter([]), { provide: Cloud, useValue: { ready: Promise.resolve(), config: () => null } }],
    });
    const before = location.href;
    history.replaceState(null, '', `${location.pathname}?mural=K7QF-M2XA${location.hash}`);
    const toasts = TestBed.inject(Toasts);
    spyOn(toasts, 'show');
    await TestBed.inject(CloudMurals).openFromLink();
    expect(toasts.show).toHaveBeenCalledWith(jasmine.stringMatching(/nuvem está desligada/));
    expect(calls).toEqual([]);
    history.replaceState(null, '', before);
  });
});
