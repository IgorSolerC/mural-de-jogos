import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { paperVars } from '../core/paper-art';
import { CamadaInfo, agrupar, assar, embutirUrls, filaDoForno, fornoCache, fornoEpoca, fornoErro, grupos, pegar, receita, resetForno, soltar } from './forno';
import { PaperArtLayer, PaperDefs, sleepPaper } from './paper-layer';

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

describe('o forno nas fichas do mural', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] }));
  afterEach(() => resetForno());

  /** Um papel numa "ficha do mural" (o forno só assa as do mural, não a prévia do editor). */
  async function montar() {
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
    card.appendChild(fixture.nativeElement);
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
    document.documentElement.classList.remove('parede-arrastando', 'lapis-liso');
    document.body.classList.remove('has-tray');
    document.documentElement.style.removeProperty('--vv-h');
    done();
  }, 30000);

  it('a ficha que dorme e acorda pega a mesma imagem de volta, sem assar outra', async () => {
    const { fixture, ok, assadas, done } = await montar();
    expect(ok).toBeTrue();
    const url = (assadas()[0] as HTMLElement).style.getPropertyValue('--assada');
    const imagens = fornoCache().imagens;
    const card = assadas()[0].closest('app-review-card')!;
    sleepPaper(card);
    expect(assadas().length).toBe(0);
    (fixture.componentInstance as PaperArtLayer).querAssar();
    expect(await until(() => assadas().length > 0)).toBeTrue();
    expect((assadas()[0] as HTMLElement).style.getPropertyValue('--assada')).toBe(url);
    expect(fornoCache().imagens).toBe(imagens);
    done();
  }, 30000);

  it('a ficha que vai dormir longe da tela devolve as imagens ao forno', async () => {
    const { card, ok, assadas, done } = await montar();
    expect(ok).toBeTrue();
    expect(fornoCache().emUso).toBeGreaterThan(0);
    sleepPaper(card);
    expect(assadas().length).toBe(0);
    expect(fornoCache().emUso).toBe(0);
    done();
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
