import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { gzip, readBackupFile } from './backup-file';
import { CloudAccount, CloudError } from './cloud-account';
import { deleteDatabase } from './erase-save';
import { FbNode, FreeBoard, sanitizeFreeBoard } from './free-board';
import { BOARDS_DB, FreeBoardStore } from './free-board-store';
import { BOARDS_VERSION_KEY, FreeBoardSync } from './free-board-sync';

const text = (i: string, txt = i, x = 0): FbNode => ({ i, t: 'x', x, y: 0, w: 120, h: 52, txt });
const settle = (ms = 30) => new Promise((r) => setTimeout(r, ms));

/**
 * A nuvem de mentira dos quadros, com as mesmas regras da API (api/src/routes/boards.ts): a versão por quadro,
 * o 409 de quem gravou no meio, as lápides e o contador.
 */
class FakeCloud {
  boards = new Map<string, { rev: number; data: string | null; apagado?: string; imagens: string[] }>();
  versao = 0;
  calls: string[] = [];

  async requestRaw(path: string, init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}): Promise<Response> {
    const method = init.method ?? 'GET';
    this.calls.push(`${method} ${path}`);
    const fail = (status: number, body: Record<string, unknown>) => {
      throw new CloudError(String(body['mensagem'] ?? 'erro'), String(body['erro'] ?? 'erro'), status, body);
    };
    if (path === '/v1/eu/quadros') {
      const quadros = [...this.boards].map(([id, b]) => ({ id, rev: b.rev, ...(b.apagado ? { apagado: b.apagado } : {}) }));
      return new Response(JSON.stringify({ quadros }), { headers: { 'Quadros-Versao': String(this.versao) } });
    }
    const m = /^\/v1\/eu\/quadros\/([^?]+)(?:\?rev=(\d+))?$/.exec(path)!;
    const id = m[1];
    const here = this.boards.get(id);
    if (method === 'GET') {
      if (!here) fail(404, { erro: 'quadro-nao-encontrado' });
      if (here!.apagado) fail(410, { erro: 'quadro-apagado', rev: here!.rev, apagado: here!.apagado });
      if (m[2] && Number(m[2]) === here!.rev) return new Response(null, { status: 204 });
      return new Response(await gzip(here!.data!), { headers: { 'Quadro-Rev': String(here!.rev) } });
    }
    if (method === 'DELETE') {
      if (here && !here.apagado) {
        here.rev++;
        here.data = null;
        here.apagado = '2026-11-10T00:00:00.000Z';
        this.versao++;
      }
      return new Response(JSON.stringify({ rev: here?.rev ?? 0 }));
    }
    const base = Number(init.headers?.['Quadro-Rev-Base']);
    if ((here && here.rev !== base) || (!here && base !== 0)) fail(409, { erro: 'conflito', rev: here?.rev ?? 0, ...(here?.apagado ? { apagado: here.apagado } : {}) });
    const data = await readBackupFile(init.body as Blob);
    const imagens = (init.headers?.['Quadro-Imagens'] ?? '').split(',').filter(Boolean);
    this.boards.set(id, { rev: (here?.rev ?? 0) + 1, data, imagens });
    this.versao++;
    return new Response(JSON.stringify({ rev: (here?.rev ?? 0) + 1 }));
  }

  /** Outro aparelho grava o quadro (o que já está, mudado por `change`). */
  edit(id: string, change: (b: FreeBoard) => FreeBoard): void {
    const here = this.boards.get(id)!;
    here.data = JSON.stringify(change(sanitizeFreeBoard(JSON.parse(here.data!))!));
    here.rev++;
    this.versao++;
  }
}

describe('Quadro livre: a nuvem no site', () => {
  let cloud: FakeCloud;
  let store: FreeBoardStore;
  let sync: FreeBoardSync;
  const signedIn = signal(true);

  beforeEach(async () => {
    await deleteDatabase(BOARDS_DB);
    localStorage.removeItem(BOARDS_VERSION_KEY);
    cloud = new FakeCloud();
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), { provide: CloudAccount, useValue: { signedIn, requestRaw: (p: string, i: never) => cloud.requestRaw(p, i) } }],
    });
    store = TestBed.inject(FreeBoardStore);
    sync = TestBed.inject(FreeBoardSync);
    await store.ready;
  });

  afterEach(async () => {
    TestBed.resetTestingModule();
    await settle(0);
    await deleteDatabase(BOARDS_DB);
    localStorage.removeItem(BOARDS_VERSION_KEY);
  });

  it('o quadro novo sobe sozinho, com as imagens dele, e vira a base (nada mais por mandar)', async () => {
    const b = await store.create('Mansão', 'Jogos');
    await store.save({ ...b, n: [{ i: 'w', t: 'w', x: 0, y: 0, w: 260, h: 195, src: '{{imagem: murall://imagem/kkdxDJwYDycpsMExjuKjNQ}}' }] });
    await sync.flush();
    expect(cloud.boards.get(b.id)!.rev).toBe(1);
    expect(cloud.boards.get(b.id)!.imagens).toEqual(['kkdxDJwYDycpsMExjuKjNQ']);
    expect(store.record(b.id)).toEqual(jasmine.objectContaining({ rev: 1, sujo: false }));
    cloud.calls = [];
    await sync.flush();
    expect(cloud.calls).toEqual([]);
  });

  it('só pede a lista quando o Quadros-Versao muda; o quadro mudado em outro aparelho desce e entra', async () => {
    const b = await store.create('Mansão', 'Jogos');
    await sync.flush();
    sync.noteVersion(String(cloud.versao));
    await sync.flush();
    cloud.calls = [];
    sync.noteVersion(String(cloud.versao));
    await sync.flush();
    expect(cloud.calls).toEqual([]);
    cloud.edit(b.id, (x) => ({ ...x, n: [text('outro', 'de lá')] }));
    sync.noteVersion(String(cloud.versao));
    await sync.flush();
    expect(cloud.calls).toContain('GET /v1/eu/quadros');
    expect(store.get(b.id)!.n.map((n) => n.i)).toEqual(['outro']);
    expect(store.record(b.id)!.sujo).toBeFalse();
  });

  it('o primeiro login de um aparelho traz os quadros da nuvem', async () => {
    const remote = sanitizeFreeBoard({ v: 1, id: 'abcdefghijklmnopqrstuv', nome: 'De lá', grupo: 'Jogos', em: '2026-11-09T00:00:00.000Z', n: [text('a')], e: [] })!;
    cloud.boards.set(remote.id, { rev: 3, data: JSON.stringify(remote), imagens: [] });
    cloud.versao = 7;
    sync.noteVersion('7');
    await sync.flush();
    expect(store.get(remote.id)?.nome).toBe('De lá');
    expect(store.record(remote.id)).toEqual(jasmine.objectContaining({ rev: 3, sujo: false }));
    expect(localStorage.getItem(BOARDS_VERSION_KEY)).toBe('7');
  });

  it('dois aparelhos mexeram: o 409 baixa o de lá, junta campo a campo e manda o juntado', async () => {
    const b = await store.create('Mansão', 'Jogos');
    await store.save({ ...b, n: [text('a', 'a', 0), text('b', 'b', 300)] });
    await sync.flush();
    // lá: o bilhete b mudou de texto; aqui: o a andou
    cloud.edit(b.id, (x) => ({ ...x, n: x.n.map((n) => (n.i === 'b' ? { ...n, txt: 'b de lá' } : n)) }));
    const mine = store.get(b.id)!;
    await store.save({ ...mine, n: mine.n.map((n) => (n.i === 'a' ? { ...n, x: 520 } : n)) }, mine);
    await sync.flush();
    const sent = JSON.parse(cloud.boards.get(b.id)!.data!) as FreeBoard;
    expect(sent.n.find((n) => n.i === 'a')!.x).toBe(520);
    expect((sent.n.find((n) => n.i === 'b') as FbNode & { txt: string }).txt).toBe('b de lá');
    expect(cloud.boards.get(b.id)!.rev).toBe(3);
    expect(store.record(b.id)!.sujo).toBeFalse();
  });

  it('apagar aqui vira DELETE e o registro sai; apagado lá sem mudança aqui, sai daqui também', async () => {
    const a = await store.create('A', 'Jogos');
    const b = await store.create('B', 'Jogos');
    await sync.flush();
    await store.remove(a.id);
    await sync.flush();
    expect(cloud.boards.get(a.id)!.apagado).toBeTruthy();
    expect(store.record(a.id)).toBeNull();
    // b apagado em outro aparelho
    cloud.boards.get(b.id)!.apagado = '2026-11-10T00:00:00.000Z';
    cloud.boards.get(b.id)!.rev++;
    cloud.versao++;
    sync.noteVersion(String(cloud.versao));
    await sync.flush();
    expect(store.get(b.id)).toBeNull();
  });

  it('apagado lá enquanto este mexia: o que estava aqui vira uma cópia (mexida vence apagada)', async () => {
    const b = await store.create('Mansão', 'Jogos');
    await sync.flush();
    cloud.boards.get(b.id)!.apagado = '2026-11-10T00:00:00.000Z';
    cloud.boards.get(b.id)!.rev++;
    await store.save({ ...store.get(b.id)!, n: [text('novo')] });
    await sync.flush();
    expect(store.get(b.id)).toBeNull();
    const copy = store.boards().find((x) => x.nome.startsWith('Mansão (cópia)'));
    expect(copy?.n.map((n) => n.i)).toEqual(['novo']);
  });

  it('sem a conta, nada sobe', async () => {
    signedIn.set(false);
    await store.create('Mansão', 'Jogos');
    await sync.flush();
    expect(cloud.calls).toEqual([]);
    signedIn.set(true);
  });
});
