import { ImageProblem, MAX_BYTES, MAX_SIDE, TARGET_BYTES, fitSize, imageFileOf, localImageId, localImageUrl, newImageId, shrinkImage, sizeLabel } from './images';

/** Uma imagem de verdade, desenhada num canvas: um degradê com um pouco de ruído, como uma foto. */
export async function samplePng(width: number, height: number, alpha = false): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(width, height);
  let seed = 7;
  for (let i = 0; i < img.data.length; i += 4) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const x = (i / 4) % width;
    img.data[i] = (x * 255) / width;
    img.data[i + 1] = 100 + (seed & 0x0f);
    img.data[i + 2] = 120;
    img.data[i + 3] = alpha && x < width / 2 ? 0 : 255;
  }
  ctx.putImageData(img, 0, 0);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b!), 'image/png'));
}

describe('as imagens coladas (core/images.ts)', () => {
  it('o endereço murall://imagem/ID: o id de 22 letras, e nada mais', () => {
    const id = newImageId();
    expect(id).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(newImageId()).not.toBe(id);
    expect(localImageUrl(id)).toBe(`murall://imagem/${id}`);
    expect(localImageId(` murall://imagem/${id} `)).toBe(id);
    expect(localImageId('https://i.imgur.com/foto.jpg')).toBeNull();
    expect(localImageId('murall://imagem/curto')).toBeNull();
    expect(localImageId(`murall://imagem/${id}/../x`)).toBeNull();
    expect(() => localImageUrl('nao é id')).toThrow();
  });

  it('o tamanho encolhido: o lado maior em 900, na mesma proporção; o menor fica como está', () => {
    expect(fitSize(1800, 900)).toEqual({ width: 900, height: 450 });
    expect(fitSize(1000, 4000)).toEqual({ width: 225, height: 900 });
    expect(fitSize(640, 480)).toEqual({ width: 640, height: 480 });
    expect(fitSize(5000, 1)).toEqual({ width: 900, height: 1 });
  });

  it('encolhe uma foto grande para 900 px no lado maior, abaixo do teto da nuvem', async () => {
    const out = await shrinkImage(await samplePng(2400, 1200));
    expect(Math.max(out.largura, out.altura)).toBe(MAX_SIDE);
    expect(out.altura).toBe(450);
    expect(out.blob.size).toBeLessThanOrEqual(MAX_BYTES);
    // o Chrome gera WebP; o Safari, JPEG
    expect(['image/webp', 'image/jpeg']).toContain(out.tipo);
    expect(out.blob.type).toBe(out.tipo);
  });

  it('a pequena não cresce', async () => {
    const out = await shrinkImage(await samplePng(300, 200));
    expect([out.largura, out.altura]).toEqual([300, 200]);
  });

  it('passou do alvo: a qualidade desce, depois o tamanho, até caber', async () => {
    const sizes: number[] = [];
    const steps: string[] = [];
    const out = await shrinkImage(await samplePng(2000, 1000), async (_src, width, height, quality) => {
      steps.push(`${width}@${quality}`);
      // só a de 560 px cabe no alvo
      const size = width > 560 ? TARGET_BYTES + 1 : 1000;
      return { blob: new Blob([new Uint8Array(size)], { type: 'image/webp' }), tipo: 'image/webp', largura: width, altura: height };
    });
    expect(out.blob.size).toBe(1000);
    expect(steps).toEqual(['900@0.8', '900@0.7', '900@0.6', '720@0.6', '560@0.55']);
  });

  it('nem a menor coube no teto: não guarda', async () => {
    const huge = async (_src: CanvasImageSource, width: number, height: number) => ({ blob: new Blob([new Uint8Array(MAX_BYTES + 1)]), tipo: 'image/webp' as const, largura: width, altura: height });
    await expectAsync(shrinkImage(await samplePng(100, 100), huge)).toBeRejectedWith(jasmine.any(ImageProblem));
  });

  it('o que não abre (não é imagem, ou o formato que o navegador não lê) avisa em palavras', async () => {
    await expectAsync(shrinkImage(new Blob(['<svg/>'], { type: 'text/plain' }))).toBeRejectedWithError(ImageProblem, 'Isso não é uma imagem.');
    await expectAsync(shrinkImage(new Blob([new Uint8Array([1, 2, 3])], { type: 'image/heic' }))).toBeRejectedWithError(ImageProblem, /não abre aqui/);
    const giant = { size: 41 * 1024 * 1024, type: 'image/png' } as Blob;
    await expectAsync(shrinkImage(giant)).toBeRejectedWithError(ImageProblem, /grande demais/);
  });

  it('a imagem de um colar ou de um soltar: a primeira imagem; texto e outros arquivos, não', () => {
    const data = new DataTransfer();
    data.items.add(new File(['x'], 'nota.txt', { type: 'text/plain' }));
    expect(imageFileOf(data)).toBeNull();
    const photo = new File(['y'], 'foto.png', { type: 'image/png' });
    data.items.add(photo);
    expect(imageFileOf(data)?.name).toBe('foto.png');
    expect(imageFileOf(null)).toBeNull();
  });

  it('o tamanho para a pessoa', () => {
    expect(sizeLabel(52 * 1024)).toBe('52 KB');
    expect(sizeLabel(100)).toBe('1 KB');
    expect(sizeLabel(1.25 * 1024 * 1024)).toBe('1,3 MB');
  });
});
