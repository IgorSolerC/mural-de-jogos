import { deleteDatabase } from './erase-save';
import { IMAGES_DB, ImageStore } from './image-store';
import { ImageProblem, MAX_SIDE } from './images';
import { samplePng } from './images.spec';
import { freezeStorage, thawStorage } from './storage';

describe('as imagens guardadas no aparelho (core/image-store.ts)', () => {
  let store: ImageStore;

  beforeEach(async () => {
    await deleteDatabase(IMAGES_DB);
    store = new ImageStore();
  });
  afterAll(() => deleteDatabase(IMAGES_DB));

  it('guarda a encolhida, com um id novo, e mostra por um endereço blob: desta aba', async () => {
    const image = await store.add(await samplePng(1800, 1200));
    expect(image.id).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(image.largura).toBe(MAX_SIDE);
    expect(image.estado).toBe('local');
    const url = await store.url(image.id);
    expect(url).toMatch(/^blob:/);
    expect(await store.url(image.id)).withContext('o mesmo endereço da segunda vez').toBe(url);
    expect((await store.get(image.id))?.bytes).toBe(image.bytes);
  });

  it('a mesma imagem colada de novo reaproveita o id (não guarda duas vezes)', async () => {
    const png = await samplePng(400, 300);
    const a = await store.add(png);
    const b = await store.add(png);
    expect(b.id).toBe(a.id);
    expect((await store.all()).length).toBe(1);
  });

  it('tirar a imagem daqui: some, o endereço blob: deixa de valer e a contagem desce', async () => {
    const image = await store.add(await samplePng(200, 100));
    await store.url(image.id);
    const before = store.count();
    await store.remove(image.id);
    expect(await store.get(image.id)).toBeNull();
    expect(await store.url(image.id)).toBeNull();
    expect(store.count()).toBe(before - 1);
  });

  it('a que não está neste aparelho: null', async () => {
    expect(await store.url('naoexisteaqui' + 'x'.repeat(9))).toBeNull();
  });

  it('cada imagem guardada avisa (quem procurava uma que faltava procura de novo)', async () => {
    const before = store.version();
    await store.add(await samplePng(50, 50));
    expect(store.version()).toBe(before + 1);
  });

  it('enquanto a página recarrega para limpar o navegador, nada é guardado', async () => {
    const png = await samplePng(50, 50);
    freezeStorage();
    try {
      await expectAsync(store.add(png)).toBeRejectedWith(jasmine.any(ImageProblem));
    } finally {
      thawStorage();
    }
    expect(await store.all()).toEqual([]);
  });

  it('o backup baixado leva as imagens em base64, e restaurar traz de volta as que faltam', async () => {
    const image = await store.add(await samplePng(320, 240));
    const backup = await store.forBackup();
    expect(backup.length).toBe(1);
    expect(backup[0]).toEqual(jasmine.objectContaining({ id: image.id, tipo: image.tipo, largura: 320, altura: 240 }));
    await deleteDatabase(IMAGES_DB);
    const fresh = new ImageStore();
    expect(await fresh.fromBackup({ imagens: backup })).toBe(1);
    const back = await fresh.get(image.id);
    expect(back?.bytes).toBe(image.bytes);
    expect(back?.hash).toBe(image.hash);
    // de novo: nada muda
    expect(await fresh.fromBackup({ imagens: backup })).toBe(0);
  });

  it('do backup, só entra o que serve: o id, o tipo, o tamanho e os bytes conferidos', async () => {
    const ok = { id: 'imagemboa' + 'x'.repeat(13), tipo: 'image/webp', largura: 10, altura: 10, criada: '2026-10-28T00:00:00Z', dados: btoa('abc') };
    const bad = [
      { ...ok, id: 'curto' },
      { ...ok, id: 'svgsvgsvg' + 'y'.repeat(13), tipo: 'image/svg+xml' },
      { ...ok, id: 'grandegrande' + 'z'.repeat(10), largura: MAX_SIDE + 1 },
      { ...ok, id: 'quebradaaaa' + 'w'.repeat(11), dados: '%%%' },
      { ...ok, id: 'pesadaaaaaa' + 'v'.repeat(11), dados: 'A'.repeat(400_000) },
      null,
    ];
    expect(await store.fromBackup({ imagens: [...bad, ok] })).toBe(1);
    expect((await store.all()).map((i) => i.id)).toEqual([ok.id]);
    expect(await store.fromBackup({ imagens: 'x' })).toBe(0);
    expect(await store.fromBackup(null)).toBe(0);
  });

  it('a de outra pessoa vira sua com um id novo (os mesmos bytes, para subir); a sua volta como está', async () => {
    const png = await samplePng(300, 200);
    const theirs = 'DaBiaDaCompartilhada01';
    await store.fromCloud(theirs, png, 300, 200, true);
    const before = store.count();
    const mine = (await store.adopt(theirs))!;
    expect(mine.id).not.toBe(theirs);
    expect(mine.alheia).toBeUndefined();
    expect(mine.estado).withContext('ainda não subiu').toBe('local');
    expect(mine.bytes).toBe(png.size);
    expect(store.count()).toBe(before + 1);
    expect((await store.get(theirs))?.alheia).withContext('a dela continua, para mostrar a anotação dela').toBeTrue();
    // de novo: a mesma cópia, sem guardar outra
    expect((await store.adopt(theirs))!.id).toBe(mine.id);
    expect((await store.adopt(mine.id))!.id).toBe(mine.id);
    expect(await store.adopt('NaoEstaNesteAparelho01')).toBeNull();
  });

  it('colar a mesma foto que outra pessoa colou guarda uma sua (a dela não serve: some quando você sai da compartilhada)', async () => {
    const png = await samplePng(400, 300);
    const first = await store.add(png);
    // a mesma foto, baixada como de outra pessoa
    const db = (await store.all())[0];
    await store.remove(first.id);
    await store.restore([{ ...db, id: 'DaBiaComAMesmaFoto0001', alheia: true, estado: 'na-nuvem' }]);
    const mine = await store.add(png);
    expect(mine.id).not.toBe('DaBiaComAMesmaFoto0001');
    expect(mine.alheia).toBeUndefined();
    expect((await store.add(png)).id).toBe(mine.id);
  });

  it('dois pedidos juntos da mesma cópia, ou dois colares juntos da mesma foto, guardam uma só', async () => {
    const theirs = 'DaBiaDaCompartilhada05';
    await store.fromCloud(theirs, await samplePng(300, 200), 300, 200, true);
    const [a, b] = await Promise.all([store.adopt(theirs), store.adopt(theirs)]);
    expect(a!.id).toBe(b!.id);
    const png = await samplePng(500, 300);
    const [c, d] = await Promise.all([store.add(png), store.add(png)]);
    expect(c.id).toBe(d.id);
    expect((await store.all()).filter((i) => !i.alheia).length).toBe(2);
  });

    it('com a página congelada, a de outra pessoa não vira sua', async () => {
    await store.fromCloud('DaBiaDaCompartilhada02', await samplePng(100, 100), 100, 100, true);
    freezeStorage();
    try {
      expect(await store.adopt('DaBiaDaCompartilhada02')).toBeNull();
    } finally {
      thawStorage();
    }
    expect((await store.all()).length).toBe(1);
  });
});
