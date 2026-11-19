import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { paperVars } from '../core/paper-art';
import { CamadaInfo, agrupar, alcanceDaSombra, assar, chaveDe, marcarUrls, materializar, embutirUrls, filaDoForno, fornoCache, fornoEpoca, fornoErro, pegarSombra, grupos, pegar, receita, resetForno, soltar } from './forno';
import { ASLEEP, PaperArtLayer, PaperDefs, SOMBRA_ASSADA } from './paper-layer';
import { Pin } from './pin';
import { FORNO_DB, guardarNoForno, lerDoForno } from '../core/forno-store';
import { deleteDatabase } from '../core/erase-save';
import { resetPace, tick } from './pace';

const info = (z: number, mistura = 'normal', opacidade = 1, viva = false): CamadaInfo => ({ z, mistura, opacidade, viva });

/** Os pixels de um PNG, num canvas do tamanho dele. */
async function pixels(blob: Blob): Promise<{ w: number; h: number; at: (x: number, y: number) => [number, number, number, number] }> {
  const bmp = await createImageBitmap(blob);
  const cv = document.createElement('canvas');
  cv.width = bmp.width;
  cv.height = bmp.height;
  const ctx = cv.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0);
  const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
  return {
    w: cv.width,
    h: cv.height,
    at: (x, y) => {
      const k = (y * cv.width + x) * 4;
      return [d[k], d[k + 1], d[k + 2], d[k + 3]];
    },
  };
}

const until = async (ok: () => boolean, ms = 20000) => {
  const t0 = performance.now();
  while (!ok()) {
    if (performance.now() - t0 > ms) return false;
    await new Promise((r) => setTimeout(r, 30));
  }
  return true;
};

describe('o forno: os grupos', () => {
  it('o que fica abaixo do texto vira uma imagem só, com as misturas dentro', () => {
    // o miolo, o papel, o fundo (multiplica), a clareia
    expect(agrupar([info(-3), info(-2), info(-1, 'multiply'), info(-1)])).toEqual([{ indices: [0, 1, 2, 3], fundida: true }]);
  });

  it('a camada viva (as faíscas) corta o grupo de baixo, e a que mistura depois dela fica sozinha, misturando ao vivo', () => {
    expect(agrupar([info(-2), info(-1, 'screen', 1, true), info(-1, 'multiply'), info(-1)])).toEqual([
      { indices: [0], fundida: true },
      { indices: [2], fundida: false },
      { indices: [3], fundida: false },
    ]);
  });

  it('o relevo (overlay por cima do texto) fica sozinho; as de cima que não misturam, na mesma altura, juntas', () => {
    expect(agrupar([info(-2), info(2, 'overlay', 0.85), info(2), info(2), info(4), info(4)])).toEqual([
      { indices: [0], fundida: true },
      { indices: [1], fundida: false },
      { indices: [2, 3], fundida: false },
      { indices: [4, 5], fundida: false },
    ]);
  });

  it('as camadas vêm na ordem em que o navegador pinta (o z, depois o documento)', () => {
    const host = document.createElement('div');
    const mk = (z: number, nome: string) => {
      const el = document.createElement('div');
      el.style.cssText = `position:absolute;z-index:${z}`;
      el.dataset['n'] = nome;
      host.append(el);
      return el;
    };
    mk(2, 'frente');
    mk(-2, 'papel');
    mk(4, 'enfeite');
    mk(-3, 'miolo');
    document.body.append(host);
    const g = grupos(Array.from(host.children) as HTMLElement[]);
    expect(g.map((x) => x.camadas.map((el) => el.dataset['n']))).toEqual([['miolo', 'papel'], ['frente'], ['enfeite']]);
    host.remove();
  });
});

describe('o forno: as imagens de fora entram embutidas', () => {
  it('troca o endereço de um arquivo pelo arquivo, e não mexe nos data: nem nos url( de dentro deles', async () => {
    const arquivo = URL.createObjectURL(new Blob(['<svg xmlns="http://www.w3.org/2000/svg"/>'], { type: 'image/svg+xml' }));
    const dentro = `url("data:image/svg+xml,%3Csvg%3E%3Cg mask='url(%23m)'/%3E%3C/svg%3E")`;
    const out = await embutirUrls(`${dentro}, url('${arquivo}'), url(#papel-lapis)`);
    expect(out.startsWith(dentro)).toBeTrue();
    expect(out).toContain('url("data:image/svg+xml;base64,');
    expect(out).not.toContain(arquivo);
    expect(out).toContain('url(#papel-lapis)');
    URL.revokeObjectURL(arquivo);
  });
});

describe('o forno: os arquivos marcados', () => {
  it('a receita leva a marca do arquivo; na hora de desenhar ele entra uma vez só, mesmo usado em várias camadas', async () => {
    const arquivo = URL.createObjectURL(new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4" fill="red"/></svg>'], { type: 'image/svg+xml' }));
    const marcado = marcarUrls(`url("${arquivo}")`);
    expect(marcado).toMatch(/^url\(forno-arquivo:/);
    expect(marcado).not.toContain('data:');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><div xmlns="http://www.w3.org/1999/xhtml" style="--forno-arquivos:0;"><p style="background:${marcado}"></p><p style="background:${marcado}"></p></div></foreignObject></svg>`;
    const pronto = await materializar(svg);
    expect(pronto.match(/data:/g)?.length).toBe(1);
    expect(pronto.match(/var\(--forno-a0\)/g)?.length).toBe(2);
    // e continua sendo um XML que abre
    expect(new DOMParser().parseFromString(pronto, 'image/svg+xml').querySelector('parsererror')).toBeNull();
    URL.revokeObjectURL(arquivo);
  });
});

describe('o forno: assar', () => {
  afterEach(() => resetForno());

  /** Uma "ficha" com camadas soltas, no molde das do papel. */
  function ficha(css: string, html = ''): { host: HTMLElement; camada: HTMLElement; done: () => void } {
    const host = document.createElement('div');
    host.style.cssText = 'position:relative;width:100px;height:60px';
    const camada = document.createElement('div');
    camada.className = 'camada';
    camada.style.cssText = `position:absolute;inset:0;${css}`;
    camada.innerHTML = html;
    host.append(camada);
    document.body.append(host);
    return { host, camada, done: () => host.remove() };
  }

  it('a cor, a máscara e o tamanho saem na imagem, na densidade pedida', async () => {
    const { camada, done } = ficha('background:rgb(200 30 40);mask-image:linear-gradient(to right,#000 50%,transparent 50%)');
    const r = await receita({ camadas: [camada], fundida: true }, 100, 60);
    const px = await pixels(await assar(r, 2));
    expect([px.w, px.h]).toEqual([200, 120]);
    expect(px.at(40, 60)).toEqual([200, 30, 40, 255]);
    expect(px.at(160, 60)[3]).toBe(0);
    done();
  });

  it('o desenho que passa da beirada (overflow visível) vem junto, com a caixa maior', async () => {
    const { camada, done } = ficha(
      'overflow:visible',
      '<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 100 60" style="position:absolute;inset:0;overflow:visible"><rect x="-30" y="10" width="20" height="20" fill="rgb(0,0,255)"/></svg>',
    );
    const r = await receita({ camadas: [camada], fundida: false }, 100, 60);
    expect(r.esquerda).toBeLessThanOrEqual(-30);
    const px = await pixels(await assar(r, 1));
    // o quadrado azul, a 20 px para fora da beirada esquerda
    expect(px.at(-r.esquerda - 20, 20)).toEqual([0, 0, 255, 255]);
    done();
  });

  it('a imagem guardada que não abre (cortada, estragada) sai do aparelho e é desenhada de novo', async () => {
    const { camada, done } = ficha('background:rgb(20 90 160)');
    const r = await receita({ camadas: [camada], fundida: true }, 100, 60);
    const chave = await chaveDe(r, 1);
    await guardarNoForno(chave, new Blob(['não é um png'], { type: 'image/png' }));
    const a = await pegar(r, 1, true);
    const img = new Image();
    img.src = a.url;
    await img.decode();
    expect(img.naturalWidth).toBe(100);
    // o novo, que abre, ficou no lugar
    await until(() => false, 200);
    expect((await lerDoForno(chave))!.size).toBeGreaterThan(20);
    soltar(a);
    done();
  });

  it('a mesma receita é a mesma imagem (a ficha montada de novo não assa outra vez)', async () => {
    const { camada, done } = ficha('background:rgb(10 120 60)');
    const antes = fornoCache();
    const r = await receita({ camadas: [camada], fundida: true }, 100, 60);
    const a = await pegar(r, 1, true);
    const b = await pegar(r, 1, true);
    expect(b.url).toBe(a.url);
    expect(fornoCache().imagens).toBe(antes.imagens + 1);
    expect(fornoCache().emUso).toBe(antes.emUso + 1);
    soltar(a);
    soltar(b);
    // solta, fica guardada (abaixo do teto das que ninguém usa)
    expect(fornoCache().imagens).toBe(antes.imagens + 1);
    expect(fornoCache().emUso).toBe(antes.emUso);
    done();
  });
});

describe('o forno guardado no aparelho', () => {
  it('guarda e devolve a imagem pela chave; passando do teto, saem as usadas há mais tempo', async () => {
    const espera = () => new Promise((r) => setTimeout(r, 5));
    const png = (n: number) => new Blob(['x'.repeat(n)], { type: 'image/png' });
    await guardarNoForno('t|velha', png(10), 25);
    await espera();
    await guardarNoForno('t|meio', png(10), 25);
    await espera();
    await guardarNoForno('t|nova', png(10), 25);
    expect(await lerDoForno('t|velha')).toBeNull();
    expect((await lerDoForno('t|meio'))?.size).toBe(10);
    expect((await lerDoForno('t|nova'))?.size).toBe(10);
    expect(await lerDoForno('t|nunca')).toBeNull();
  });

  it('um banco com o nome do forno e sem a tabela (criado vazio antes do site) não impede de guardar', async () => {
    await deleteDatabase(FORNO_DB);
    await new Promise<void>((res, rej) => {
      const r = indexedDB.open(FORNO_DB, 1);
      r.onsuccess = () => {
        r.result.close();
        res();
      };
      r.onerror = () => rej(r.error);
    });
    await guardarNoForno('t|depois-do-vazio', new Blob(['png'], { type: 'image/png' }));
    expect((await lerDoForno('t|depois-do-vazio'))?.size).toBe(3);
  });
});

describe('o forno: a sombra', () => {
  afterEach(() => resetForno());

  it('o alcance de uma lista de drop-shadow soma o deslocamento e o borrão de cada uma', () => {
    expect(alcanceDaSombra('drop-shadow(rgba(0, 0, 0, 0.35) 0px 1px 1px) drop-shadow(rgba(0, 0, 0, 0.5) 0px 8px 10px)')).toBe(Math.ceil(1 + 1.5 + 2 + 8 + 15 + 2));
    expect(alcanceDaSombra('none')).toBe(0);
  });

  it('a silhueta por cima da sombra assada dá o mesmo que o filtro (a sombra fica só onde a silhueta não cobre)', async () => {
    // a silhueta: um quadrado de 40 px, opaco, numa "ficha" de 100×80
    const cv = document.createElement('canvas');
    cv.width = 100;
    cv.height = 80;
    const c = cv.getContext('2d')!;
    c.fillStyle = '#c33';
    c.fillRect(30, 20, 40, 40);
    const url = URL.createObjectURL(await new Promise<Blob>((r) => cv.toBlob((b) => r(b!), 'image/png')));
    const filtro = 'drop-shadow(rgba(0, 0, 0, 0.5) 0px 8px 10px)';
    const s = await pegarSombra({ imagens: [{ url, inset: '0px 0px 0px 0px', fundida: true, chave: 'x' }], pecas: [], filtro, W: 100, H: 80 }, 1);
    const [it, , , il] = s.inset.split(' ').map((v) => Number.parseFloat(v));
    const img = new Image();
    img.src = s.url;
    await img.decode();
    const tela = () => {
      const t = document.createElement('canvas');
      t.width = img.width;
      t.height = img.height;
      return t.getContext('2d', { willReadFrequently: true })!;
    };
    // o que a ficha vai mostrar: a sombra assada e, por cima, a silhueta sem filtro
    const ax = tela();
    ax.drawImage(img, 0, 0);
    ax.drawImage(cv, -il, -it);
    // o que o filtro desenhava
    const bx = tela();
    bx.filter = filtro;
    bx.drawImage(cv, -il, -it);
    const da = ax.getImageData(0, 0, img.width, img.height).data;
    const db = bx.getImageData(0, 0, img.width, img.height).data;
    let max = 0;
    for (let k = 0; k < da.length; k++) max = Math.max(max, Math.abs(da[k] - db[k]));
    expect(max).withContext('diferença máxima, de 255').toBeLessThanOrEqual(3);
    // e embaixo do quadrado não há sombra nenhuma na imagem (a ficha cobre)
    const sx = tela();
    sx.drawImage(img, 0, 0);
    expect(sx.getImageData(50 - il, 40 - it, 1, 1).data[3]).toBe(0);
    URL.revokeObjectURL(url);
  });
});

describe('o forno nas fichas do mural', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] }));
  afterEach(() => resetForno());

  /** Um papel numa "ficha do mural" (o forno só assa as do mural, não a prévia do editor). */
  async function montar(opcoes: { recortada?: boolean; textos?: (card: HTMLElement) => void } = {}) {
    const defs = TestBed.createComponent(PaperDefs);
    defs.detectChanges();
    document.body.append(defs.nativeElement);
    const fixture = TestBed.createComponent(PaperArtLayer);
    fixture.componentRef.setInput('id', 'forno1');
    fixture.componentRef.setInput('scribble', 'novelo');
    fixture.componentRef.setInput('damage', 'rasgado');
    fixture.componentRef.setInput('look', 'amarelo');
    const card = document.createElement('app-review-card');
    card.className = 'cartolina';
    card.setAttribute('data-cor', 'amarelo');
    card.style.cssText = 'position:relative;display:block;width:300px;height:200px;--stock:#f3d36b';
    for (const [k, v] of Object.entries(paperVars(undefined, undefined, undefined, null, false, 'forno1'))) if (v) card.style.setProperty(k, v);
    if (opcoes.recortada) {
      // a ficha recortada e a sombra dela (a de review-card.ts, posta aqui à mão)
      card.classList.add('recortada');
      card.style.filter = 'drop-shadow(0 1px 1px rgb(0 0 0 / 0.35)) drop-shadow(0 8px 10px rgb(0 0 0 / 0.5))';
    }
    card.appendChild(fixture.nativeElement);
    opcoes.textos?.(card);
    // no alto da página, à vista (a fila do papel desenha primeiro as da tela)
    document.body.prepend(card);
    fixture.detectChanges();
    await fixture.whenStable();
    const assadas = () => card.querySelectorAll('.camada.assada');
    const ok = await until(() => assadas().length > 0);
    return {
      fixture,
      card,
      ok,
      assadas,
      done: () => {
        fixture.destroy();
        card.remove();
        defs.destroy();
      },
    };
  }

  it('a ficha desenhada e à vista é assada: a imagem fica na camada, e o desenho vivo sai de cena', async () => {
    const { card, ok, assadas, done } = await montar();
    expect(ok).withContext(`assou (${String(fornoErro())})`).toBeTrue();
    const lider = assadas()[0] as HTMLElement;
    expect(lider.style.getPropertyValue('--assada')).toMatch(/^url\("blob:/);
    expect(getComputedStyle(lider).maskImage).toBe('none');
    // o papel, o fundo e o resto de baixo: uma imagem só, as outras camadas do grupo escondidas
    expect(lider.classList.contains('fundida')).toBeTrue();
    for (const el of Array.from(card.querySelectorAll<HTMLElement>('.camada.assada-junto'))) expect(getComputedStyle(el).display).toBe('none');
    for (const svg of Array.from(lider.querySelectorAll('svg'))) expect(getComputedStyle(svg).display).toBe('none');
    expect(filaDoForno()).toBe(0);
    done();
  }, 30000);

  it('a imagem chega à camada já decodificada (sem um quadro sem papel nem imagem na troca)', async () => {
    await deleteDatabase(FORNO_DB);
    const decodificadas: string[] = [];
    const decode = HTMLImageElement.prototype.decode;
    spyOn(HTMLImageElement.prototype, 'decode').and.callFake(function (this: HTMLImageElement) {
      return decode.call(this).then(() => void decodificadas.push(this.src));
    });
    const { ok, assadas, done } = await montar();
    expect(ok).withContext(`assou (${String(fornoErro())})`).toBeTrue();
    for (const el of Array.from(assadas()) as HTMLElement[]) {
      const url = /url\("(.+)"\)/.exec(el.style.getPropertyValue('--assada'))?.[1];
      expect(decodificadas).withContext('decodificada antes de entrar').toContain(url!);
    }
    done();
  }, 30000);

  it('numa tela de 120 Hz, com algo animando (a folga do navegador à toa fica em 1 a 7 ms), a ficha assa do mesmo jeito', async () => {
    // a tela rápida: os quadros de trabalho a cada 8,3 ms
    for (let i = 0, t = 1000; i < 20; i++, t += 8.33) tick(t);
    // sem nada guardado de outro teste (a ficha entraria pelo atalho, sem passar pela fila)
    await deleteDatabase(FORNO_DB);
    const original = window.requestIdleCallback;
    const ric = original.bind(window);
    // o navegador à toa nunca dá mais que 5 ms (a 120 Hz o quadro inteiro tem 8,3)
    window.requestIdleCallback = ((cb: IdleRequestCallback) =>
      ric((d) => cb({ didTimeout: false, timeRemaining: () => Math.min(5, d.timeRemaining()) }))) as typeof window.requestIdleCallback;
    try {
      const { ok, done } = await montar();
      expect(ok).withContext(`assou (${String(fornoErro())})`).toBeTrue();
      done();
    } finally {
      window.requestIdleCallback = original;
      resetPace();
    }
  }, 30000);

  it('o papel mudou (a cor, ou a outra pessoa da anotação compartilhada): a imagem sai antes de o molde mostrar o novo', async () => {
    const { fixture, card, ok, assadas, done } = await montar();
    expect(ok).toBeTrue();
    fixture.componentRef.setInput('look', 'azul');
    fixture.detectChanges();
    expect(assadas().length).withContext('nenhuma imagem velha').toBe(0);
    expect(card.querySelector('.camada.assada-junto')).toBeNull();
    // e assa de novo
    expect(await until(() => assadas().length > 0)).toBeTrue();
    done();
  }, 30000);

  it('a página mudou por fora (classe, densidade): as fichas voltam a ser vivas e assam de novo', async () => {
    const { fixture, ok, assadas, done } = await montar();
    expect(ok).toBeTrue();
    fornoEpoca.update((n) => n + 1);
    fixture.detectChanges();
    expect(assadas().length).toBe(0);
    expect(await until(() => assadas().length > 0)).toBeTrue();
    done();
  }, 30000);

  it('a mesma ficha montada outra vez dá a mesma receita (e acha a imagem guardada na visita de antes)', async () => {
    const receitas = async (m: Awaited<ReturnType<typeof montar>>) => {
      // assada, ela volta a ser viva para a receita ler as camadas (e sai da fila, para o forno não a
      // assar de novo enquanto a receita espera a página quieta)
      resetForno();
      (m.fixture.componentInstance as PaperArtLayer).desassar();
      const camadas = Array.from(m.card.querySelectorAll<HTMLElement>('.camada')).filter((el) => !el.hasAttribute('data-fantasma'));
      return Promise.all(grupos(camadas).map((g) => receita(g, 300, 200).then((r) => r.svg)));
    };
    // (o TestBed tira o componente anterior da página ao montar outro: uma de cada vez)
    const a = await montar();
    expect(a.ok).toBeTrue();
    const ra = await receitas(a);
    a.done();
    const b = await montar();
    expect(b.ok).toBeTrue();
    const rb = await receitas(b);
    b.done();
    expect(ra.length).toBeGreaterThan(0);
    // os ids do desenho levam o número de cada ficha na página (pa12): na receita, os da ordem
    expect(ra.join('')).not.toMatch(/id="pa\d/);
    expect(rb).toEqual(ra);
  }, 30000);

  it('a página que muda de classe sem mexer no papel (o arrasto, a bandeja) não faz as fichas assarem de novo; o lápis liso faz', async () => {
    const { ok, assadas, done } = await montar();
    expect(ok).toBeTrue();
    const antes = fornoEpoca();
    const quadro = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 30)));
    document.documentElement.classList.add('parede-arrastando');
    document.body.classList.add('has-tray');
    document.documentElement.style.setProperty('--vv-h', '500px');
    await quadro();
    expect(fornoEpoca()).withContext('arrasto, bandeja, teclado do celular').toBe(antes);
    expect(assadas().length).toBeGreaterThan(0);
    document.documentElement.classList.add('lapis-liso');
    await quadro();
    expect(fornoEpoca()).withContext('o lápis liso muda o desenho').toBeGreaterThan(antes);
    // a tachinha que aparece pela primeira vez (a folha dela chega) e, logo depois, a foto das
    // tachinhas: a silhueta da sombra muda
    const pino = TestBed.createComponent(Pin);
    pino.detectChanges();
    // (o TestBed monta a tachinha num div: na ficha ela é um <app-pin>, com o atributo do componente)
    const tag = document.createElement('app-pin');
    for (const a of Array.from((pino.nativeElement as HTMLElement).attributes)) if (a.name.startsWith('_nghost')) tag.setAttribute(a.name, '');
    document.body.append(tag);
    await quadro();
    const comPino = fornoEpoca();
    document.body.classList.add('has-pins');
    await quadro();
    expect(fornoEpoca()).withContext('a foto das tachinhas muda a silhueta da sombra').toBeGreaterThan(comPino);
    document.body.classList.remove('has-pins');
    tag.remove();
    pino.destroy();
    document.documentElement.classList.remove('parede-arrastando', 'lapis-liso');
    document.body.classList.remove('has-tray');
    document.documentElement.style.removeProperty('--vv-h');
    done();
  }, 30000);

  it('a ficha que larga as imagens e volta sem nada mudar pega as mesmas, sem assar outra', async () => {
    const { fixture, ok, assadas, done } = await montar();
    expect(ok).toBeTrue();
    const url = (assadas()[0] as HTMLElement).style.getPropertyValue('--assada');
    const imagens = fornoCache().imagens;
    (fixture.componentInstance as PaperArtLayer).desassar();
    expect(assadas().length).toBe(0);
    (fixture.componentInstance as PaperArtLayer).querAssar();
    expect(await until(() => assadas().length > 0)).toBeTrue();
    expect((assadas()[0] as HTMLElement).style.getPropertyValue('--assada')).toBe(url);
    expect(fornoCache().imagens).toBe(imagens);
    done();
  }, 30000);

  it('a ficha já assada noutra visita entra assada: no instante em que aparece, já com as imagens, sem desenhar nada (o atalho)', async () => {
    const a = await montar({ recortada: true });
    expect(a.ok).toBeTrue();
    expect(await until(() => a.card.hasAttribute(SOMBRA_ASSADA))).toBeTrue();
    // (o atalho é guardado logo depois da sombra)
    await until(() => false, 300);
    a.done();
    // outra visita: a memória da aba vazia, só o que ficou no aparelho
    resetForno();
    const desenhos = spyOn(HTMLCanvasElement.prototype, 'toBlob').and.callThrough();
    const aoAparecer: boolean[] = [];
    const mo = new MutationObserver((ms) => {
      for (const m of ms) {
        const el = m.target as HTMLElement;
        if (m.attributeName === 'data-veu' && !el.hasAttribute('data-veu')) aoAparecer.push(!!el.querySelector('.camada.assada') && el.hasAttribute(SOMBRA_ASSADA));
      }
    });
    mo.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['data-veu'] });
    const b = await montar({ recortada: true });
    mo.disconnect();
    expect(b.ok).toBeTrue();
    expect(aoAparecer).withContext('assada e com a sombra no instante em que aparece').toEqual([true]);
    expect(desenhos).not.toHaveBeenCalled();
    b.done();
  }, 40000);

  it('a ficha recortada ganha a sombra assada por baixo de tudo; a que volta a ser viva volta ao filtro', async () => {
    const { card, ok, fixture, done } = await montar({ recortada: true });
    expect(ok).toBeTrue();
    expect(await until(() => card.hasAttribute(SOMBRA_ASSADA))).withContext(`sombra (${String(fornoErro())})`).toBeTrue();
    const sombra = card.querySelector<HTMLElement>('.sombra-assada')!;
    expect(sombra.style.background).toContain('blob:');
    expect(getComputedStyle(sombra).zIndex).toBe('-10');
    // a sombra passa da ficha (o alcance do filtro), para todos os lados
    expect(sombra.getBoundingClientRect().height).toBeGreaterThan(card.getBoundingClientRect().height + 20);
    fixture.componentRef.setInput('look', 'verde');
    fixture.detectChanges();
    expect(card.hasAttribute(SOMBRA_ASSADA)).toBeFalse();
    expect(card.querySelector('.sombra-assada')).toBeNull();
    done();
  }, 30000);

  it('a ficha sem sombra (a inteira, ou com "Sem sombra na cartolina") não ganha a imagem da sombra', async () => {
    const { card, ok, done } = await montar();
    expect(ok).toBeTrue();
    await new Promise((r) => setTimeout(r, 300));
    expect(card.hasAttribute(SOMBRA_ASSADA)).toBeFalse();
    done();
  }, 30000);

  it('o recorte do texto só vai no texto que o rasgo alcança (longe dele, a máscara não mudaria nada)', async () => {
    const masked = (n: Element) => [...n.classList].some((c) => c.startsWith('mascara-'));
    let grande!: HTMLElement;
    const { card, fixture, ok, done } = await montar({
      textos: (c) => {
        grande = document.createElement('p');
        grande.setAttribute('data-queima', '');
        grande.style.cssText = 'position:absolute;left:0;top:0;width:300px;height:200px;margin:0';
        c.append(grande);
      },
    });
    expect(ok).toBeTrue();
    expect(await until(() => masked(grande))).withContext('o texto que cobre a ficha inteira leva o recorte').toBeTrue();
    // um lugar longe de todos os pedaços do rasgo
    const caixas = (fixture.componentInstance as unknown as { caixasDoRasgo(): DOMRect[] }).caixasDoRasgo();
    expect(caixas.length).toBeGreaterThan(0);
    let livre: [number, number] | null = null;
    for (let y = 14; y <= 200 - 14 - 10 && !livre; y += 2)
      for (let x = 14; x <= 300 - 14 - 30 && !livre; x += 2)
        if (caixas.every((k) => k.x > x + 30 + 12 || k.x + k.width < x - 12 || k.y > y + 10 + 12 || k.y + k.height < y - 12)) livre = [x, y];
    expect(livre).withContext('um lugar livre na ficha de teste').not.toBeNull();
    const pequeno = document.createElement('span');
    pequeno.setAttribute('data-queima', '');
    pequeno.style.cssText = `position:absolute;left:${livre![0]}px;top:${livre![1]}px;width:30px;height:10px`;
    card.append(pequeno);
    fixture.componentRef.setInput('content', { mudou: 1 });
    fixture.detectChanges();
    await until(() => false, 600);
    expect(masked(pequeno)).withContext('o texto longe do rasgo fica sem a máscara').toBeFalse();
    expect(masked(grande)).toBeTrue();
    done();
  }, 30000);

  it('a ficha que dorme longe da tela continua assada (acordando no meio da rolagem, não volta ao desenho vivo)', async () => {
    const { card, ok, assadas, done } = await montar();
    expect(ok).toBeTrue();
    const antes = assadas().length;
    card.setAttribute(ASLEEP, '');
    await until(() => false, 300);
    card.removeAttribute(ASLEEP);
    expect(assadas().length).toBe(antes);
    done();
  }, 30000);

  it('a ficha que sai da página devolve as imagens ao forno', async () => {
    const { ok, done } = await montar();
    expect(ok).toBeTrue();
    expect(fornoCache().emUso).toBeGreaterThan(0);
    done();
    expect(fornoCache().emUso).toBe(0);
  }, 30000);

  it('a ficha mudou de tamanho: volta viva no tamanho novo, e assa de novo', async () => {
    const { card, ok, assadas, done } = await montar();
    expect(ok).toBeTrue();
    const antes = (assadas()[0] as HTMLElement).style.getPropertyValue('--assada');
    card.style.width = '360px';
    expect(await until(() => !assadas().length || (assadas()[0] as HTMLElement).style.getPropertyValue('--assada') !== antes)).toBeTrue();
    expect(await until(() => assadas().length > 0)).toBeTrue();
    expect((assadas()[0] as HTMLElement).style.getPropertyValue('--assada')).not.toBe(antes);
    done();
  }, 30000);

  it('a prévia do editor não vai ao forno (o papel muda a cada clique)', async () => {
    const fixture = TestBed.createComponent(PaperArtLayer);
    fixture.componentRef.setInput('id', 'forno2');
    fixture.componentRef.setInput('scribble', 'novelo');
    const card = document.createElement('div');
    card.style.cssText = 'position:relative;width:200px;height:120px';
    card.appendChild(fixture.nativeElement);
    document.body.appendChild(card);
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r, 600));
    expect(card.querySelector('.assada')).toBeNull();
    expect(filaDoForno()).toBe(0);
    fixture.destroy();
    card.remove();
  }, 30000);
});
