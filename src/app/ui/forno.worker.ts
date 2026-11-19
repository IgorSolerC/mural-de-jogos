import { desmisturar } from './forno-pixels';

/**
 * O ajudante do forno (ver ui/forno.ts): lê os pixels do que a página desenhou e faz o PNG, longe dela.
 * Ler os pixels de um canvas espera a GPU terminar tudo o que está na fila dela, e na página essa espera
 * parava tudo: de 50 a 350 ms por camada na abertura do mural, com a GPU ocupada pintando a página (o
 * mesmo desenho, sozinho, leva de 2 a 20 ms). Aqui quem espera é o ajudante; a página segue rolando.
 */

/** Um pedido ao ajudante. A imagem vai transferida (a página não fica com ela). */
export type PedidoAoAjudante =
  /** O PNG de uma imagem pronta. */
  | { id: number; tipo: 'png'; imagem: ImageBitmap }
  /** A sombra de uma silhueta: o filtro da ficha (já na escala) e a silhueta tirada (ver `desmisturar`). */
  | { id: number; tipo: 'sombra'; imagem: ImageBitmap; filtro: string }
  /** Uma textura (o endereço) reduzida a `lado` px de largura, como data: (ver `texturaNaEscala` em ui/forno.ts). */
  | { id: number; tipo: 'reduzir'; url: string; lado: number };

/** A resposta: o PNG, o data: da textura, ou o porquê de não ter saído. */
export type RespostaDoAjudante = { id: number; blob: Blob } | { id: number; texto: string } | { id: number; erro: string };

const responder = (r: RespostaDoAjudante) => (self as unknown as { postMessage(m: RespostaDoAjudante): void }).postMessage(r);

self.addEventListener('message', (e: Event) => {
  const pedido = (e as MessageEvent<PedidoAoAjudante>).data;
  if (pedido.tipo === 'reduzir') {
    reduzir(pedido.url, pedido.lado).then(
      (texto) => responder({ id: pedido.id, texto }),
      (err: unknown) => responder({ id: pedido.id, erro: String(err) }),
    );
    return;
  }
  (pedido.tipo === 'png' ? png(pedido.imagem) : sombra(pedido.imagem, pedido.filtro)).then(
    (blob) => responder({ id: pedido.id, blob }),
    (err: unknown) => responder({ id: pedido.id, erro: String(err) }),
  );
});

/**
 * A textura do endereço com `lado` px de largura (a altura na mesma proporção), em PNG, como data:. A
 * maior que o lado é reduzida em alta qualidade; a que já cabe vai como está.
 */
async function reduzir(url: string, lado: number): Promise<string> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`forno: ${r.status} em ${url}`);
  const original = await r.blob();
  const inteira = await createImageBitmap(original);
  const { width: w, height: h } = inteira;
  inteira.close();
  if (w <= lado) return dataUrl(original);
  const menor = await createImageBitmap(original, { resizeWidth: lado, resizeHeight: Math.max(1, Math.round((lado * h) / w)), resizeQuality: 'high' });
  const c = new OffscreenCanvas(menor.width, menor.height);
  const ctx = c.getContext('bitmaprenderer');
  if (!ctx) throw new Error('forno: o ajudante sem canvas');
  ctx.transferFromImageBitmap(menor);
  return dataUrl(await c.convertToBlob({ type: 'image/png' }));
}

function dataUrl(b: Blob): Promise<string> {
  return new Promise((ok, falhou) => {
    const fr = new FileReader();
    fr.onload = () => ok(fr.result as string);
    fr.onerror = () => falhou(fr.error);
    fr.readAsDataURL(b);
  });
}

async function png(imagem: ImageBitmap): Promise<Blob> {
  const c = new OffscreenCanvas(imagem.width, imagem.height);
  const ctx = c.getContext('bitmaprenderer');
  if (!ctx) throw new Error('forno: o ajudante sem canvas');
  ctx.transferFromImageBitmap(imagem);
  return c.convertToBlob({ type: 'image/png' });
}

async function sombra(silhueta: ImageBitmap, filtro: string): Promise<Blob> {
  const w = silhueta.width,
    h = silhueta.height;
  const s = new OffscreenCanvas(w, h);
  const sx = s.getContext('2d');
  const f = new OffscreenCanvas(w, h);
  const fx = f.getContext('2d');
  if (!sx || !fx) throw new Error('forno: o ajudante sem canvas');
  sx.drawImage(silhueta, 0, 0);
  fx.filter = filtro;
  fx.drawImage(silhueta, 0, 0);
  silhueta.close();
  const img = fx.getImageData(0, 0, w, h);
  desmisturar(sx.getImageData(0, 0, w, h).data, img.data);
  fx.putImageData(img, 0, 0);
  return f.convertToBlob({ type: 'image/png' });
}
