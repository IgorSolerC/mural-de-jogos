import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FbEdge, FbNode, FreeBoard, sanitizeFreeBoard } from '../../core/free-board';
import { Camera } from '../../core/free-board-geometry';
import { FreeBoardView } from './free-board-view';
import { tornTop } from './free-board-piece';
import { expectEtiquetaPadrao } from '../../testing/etiqueta-acoes.spec';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const frames = async (n = 3) => {
  for (let k = 0; k < n; k++) await new Promise<void>((r) => requestAnimationFrame(() => r()));
};

function board(n: FbNode[], e: FbEdge[] = [], nome = 'Mansão'): FreeBoard {
  return sanitizeFreeBoard({ v: 1, id: 'abcdefghijklmnopqrstuv', nome, grupo: 'Jogos', em: '2026-11-09T00:00:00.000Z', n, e })!;
}

const MANSION = board(
  [
    { i: 'roxo', t: 'm', x: 0, y: 0, w: 780, h: 520, nome: 'Roxo (Quartos)', c: 'lilas' },
    { i: 'senha', t: 'x', x: 52, y: 104, w: 182, h: 104, txt: 'Senha?' },
    { i: 'email', t: 'x', x: 312, y: 104, w: 208, h: 104, txt: 'Ler **email** no escritório' },
    { i: 'conta', t: 'w', x: 52, y: 260, w: 312, h: 156, src: '{{contador: 24/12/2026 | Fim do inverno}}' },
    { i: 'longe', t: 'x', x: 60000, y: 60000, w: 182, h: 104, txt: 'Muito longe' },
  ],
  [{ i: 'e1', a: 'senha', b: 'email', txt: 'Precisa da lupa' }],
);

describe('Quadro livre: a tela (o motor de ver)', () => {
  let fixture: ComponentFixture<FreeBoardView>;
  let el: HTMLElement;
  let moved: Camera[];

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  });
  afterEach(() => {
    fixture?.destroy();
    el?.remove();
  });

  async function open(b: FreeBoard, camera: Camera | null = { x: -20, y: -20, z: 1 }): Promise<void> {
    fixture = TestBed.createComponent(FreeBoardView);
    fixture.componentRef.setInput('board', b);
    fixture.componentRef.setInput('camera', camera);
    el = fixture.nativeElement as HTMLElement;
    el.style.cssText = 'position:fixed;left:0;top:0;width:900px;height:600px;display:block';
    document.body.appendChild(el);
    moved = [];
    fixture.componentInstance.cameraChange.subscribe((c) => moved.push(c));
    await fixture.whenStable();
    await frames();
    await fixture.whenStable();
  }

  const piece = (id: string) => el.querySelector<HTMLElement>(`app-free-board-piece[data-peca="${id}"]`);
  const zoomText = () => el.querySelector('.zoom')!.textContent!.trim();

  it('é uma região com o nome do quadro, e monta só o que está perto da tela', async () => {
    await open(MANSION);
    const visor = el.querySelector('.visor')!;
    expect(visor.getAttribute('role')).toBe('region');
    expect(visor.getAttribute('aria-label')).toBe('Quadro Mansão');
    expect(piece('roxo')).not.toBeNull();
    expect(piece('senha')).not.toBeNull();
    expect(piece('conta')).not.toBeNull();
    expect(piece('longe')).toBeNull();
    // a moldura fica na camada de trás; as outras peças, na da frente
    const [back, , front] = Array.from(el.querySelectorAll('.mundo'));
    expect(back.contains(piece('roxo'))).toBeTrue();
    expect(front.contains(piece('senha'))).toBeTrue();
  });

  it('cada peça tem o nome falado: a moldura com quantas peças tem dentro, o bilhete com o que diz', async () => {
    await open(MANSION);
    expect(piece('roxo')!.getAttribute('aria-label')).toBe('Moldura Roxo (Quartos), 3 peças');
    expect(piece('senha')!.getAttribute('aria-label')).toBe('Bilhete: Senha?');
    expect(piece('email')!.getAttribute('aria-label')).toBe('Bilhete: Ler email no escritório');
    expect(piece('conta')!.getAttribute('aria-label')).toContain('Contador');
  });

  it('as peças de verdade de perto: o feltro com o título em Dymo, o bilhete rasgado com a formatação, o widget', async () => {
    await open(MANSION);
    expect(piece('roxo')!.querySelector('.feltro')).not.toBeNull();
    expect(piece('roxo')!.querySelector('.dymo')!.textContent!.trim()).toBe('Roxo (Quartos)');
    expect(piece('roxo')!.dataset['cor']).toBe('lilas');
    const bloco = piece('email')!.querySelector<HTMLElement>('.bloco')!;
    expect(bloco.style.clipPath).toContain('polygon');
    expect(bloco.querySelector('.negrito')?.textContent).toBe('email');
    expect(piece('conta')!.querySelector('app-note-widget')).not.toBeNull();
    expect(piece('email')!.dataset['nivel']).toBe('perto');
  });

  it('o rótulo da seta é uma fita no meio da curva, por cima das peças', async () => {
    await open(MANSION);
    const fita = el.querySelector<HTMLElement>('.fita')!;
    expect(fita.textContent!.trim()).toBe('Precisa da lupa');
    const front = el.querySelectorAll('.mundo')[2];
    expect(front.lastElementChild).toBe(fita);
  });

  it('afastando, as peças viram a versão leve, e de longe saem do DOM (vão para o canvas)', async () => {
    await open(MANSION, { x: -20, y: -20, z: 0.4 });
    expect(piece('senha')!.dataset['nivel']).toBe('meio');
    expect(piece('senha')!.querySelector('.primeira')!.textContent).toBe('Senha?');
    // de longe, o título da moldura vai para o canvas (o Dymo some) e o bilhete sai do DOM
    expect(el.querySelector('.visor')!.classList).toContain('rotulos-na-tela');
    fixture.destroy();
    el.remove();
    await open(MANSION, { x: -100, y: -100, z: 0.08 });
    expect(piece('senha')).toBeNull();
    expect(piece('roxo')).not.toBeNull();
    const canvas = el.querySelector<HTMLCanvasElement>('canvas.longe')!;
    expect(canvas.width).toBeGreaterThan(1);
  });

  it('sem câmera guardada, abre mostrando tudo (a moldura de 520 px de altura cabe nos 600 px com a margem)', async () => {
    await open(board(MANSION.n.filter((n) => n.i !== 'longe') as FbNode[]), null);
    expect(piece('roxo')).not.toBeNull();
    // (600 − 2 × 48) / 520
    expect(zoomText()).toBe('97%');
  });

  it('os botões do zoom: aproximar, afastar, 100% e Ver tudo; a câmera parada sai para quem guarda', async () => {
    await open(MANSION);
    const [menos, zoom, mais, tudo] = Array.from(el.querySelectorAll<HTMLButtonElement>('.regua button'));
    expect(zoom.getAttribute('aria-label')).toBe('Zoom 100%, voltar a 100%');
    mais.click();
    await sleep(700);
    await fixture.whenStable();
    expect(zoomText()).toBe('125%');
    expect(moved.at(-1)!.z).toBeCloseTo(1.25, 3);
    menos.click();
    await sleep(700);
    await fixture.whenStable();
    expect(zoomText()).toBe('100%');
    tudo.click();
    await sleep(700);
    await fixture.whenStable();
    // o quadro inteiro vai de 0 a 60.182 px: Ver tudo afasta até caber
    expect(moved.at(-1)!.z).toBeLessThan(0.05 + 1e-6);
    zoom.click();
    await sleep(700);
    expect(moved.at(-1)!.z).toBeCloseTo(1, 3);
  });

  it('o teclado: setas andam, + e − dão zoom, Tab passa pelas peças na ordem de leitura e a câmera vai junto', async () => {
    await open(MANSION);
    const visor = el.querySelector<HTMLElement>('.visor')!;
    visor.focus();
    const key = (k: string, extra: KeyboardEventInit = {}) => {
      const target = (document.activeElement as HTMLElement) ?? visor;
      target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...extra }));
    };
    key('ArrowRight');
    await sleep(400);
    expect(moved.at(-1)!.x).toBeCloseTo(60, 3);
    key('+');
    await sleep(700);
    expect(moved.at(-1)!.z).toBeCloseTo(1.25, 3);
    key('1');
    await sleep(700);
    // Tab: a moldura, depois o que tem dentro dela, por fileiras
    key('Tab');
    await frames();
    await fixture.whenStable();
    await frames();
    expect(document.activeElement).toBe(piece('roxo'));
    key('Tab');
    await frames(4);
    expect(document.activeElement).toBe(piece('senha'));
    key('Tab');
    await frames(4);
    expect(document.activeElement).toBe(piece('email'));
    key('Tab');
    await frames(4);
    expect(document.activeElement).toBe(piece('conta'));
    // a peça muito longe: a câmera pula até ela, que é montada antes do foco
    key('Tab');
    for (let k = 0; k < 10 && document.activeElement !== piece('longe'); k++) {
      await fixture.whenStable();
      await frames();
    }
    expect(document.activeElement).toBe(piece('longe'));
    // depois da última, o foco sai do quadro
    key('Tab');
    expect(document.activeElement!.textContent).toBe('Fim do quadro');
  });

  it('arrastar anda a câmera e, parado, a câmera sai para quem guarda', async () => {
    await open(MANSION);
    const visor = el.querySelector<HTMLElement>('.visor')!;
    const ptr = (type: string, x: number, y: number) =>
      visor.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 7, pointerType: 'mouse', button: 0 }));
    ptr('pointerdown', 400, 300);
    ptr('pointermove', 450, 300);
    ptr('pointermove', 500, 340);
    ptr('pointerup', 500, 340);
    await sleep(500);
    expect(moved.at(-1)).toEqual({ x: -120, y: -60, z: 1 });
    const back = el.querySelector<HTMLElement>('.mundo')!;
    expect(back.style.transform).toBe('translate(120px, 60px) scale(1)');
  });

  it('o quadro vazio diz que está vazio', async () => {
    await open(board([], [], 'Novo'));
    expect(el.querySelector('.vazio')!.textContent).toContain('Este quadro está vazio');
  });

  describe('no editar', () => {
    let changes: FreeBoard[];
    let toggles: boolean[];

    async function edit(b: FreeBoard): Promise<void> {
      await open(b);
      changes = [];
      toggles = [];
      fixture.componentInstance.changed.subscribe((c) => changes.push(c.board));
      fixture.componentInstance.editToggle.subscribe((on) => toggles.push(on));
      fixture.componentRef.setInput('editing', true);
      await fixture.whenStable();
    }
    const visor = () => el.querySelector<HTMLElement>('.visor')!;
    // a câmera em (-20, -20) e zoom 1: o ponto do mundo (x, y) está na tela em (x + 20, y + 20)
    const ptr = (type: string, x: number, y: number, extra: PointerEventInit = {}) =>
      visor().dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x + 20, clientY: y + 20, pointerId: 3, pointerType: 'mouse', button: 0, ...extra }));
    const key = (k: string, extra: KeyboardEventInit = {}) => visor().dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...extra }));
    const settle = async () => {
      await fixture.whenStable();
      await frames(2);
      await fixture.whenStable();
    };

    it('clicar seleciona a peça: o anel amarelo, as alças e a etiqueta da seleção no padrão dos botões do site', async () => {
      await edit(MANSION);
      ptr('pointerdown', 60, 110);
      ptr('pointerup', 60, 110);
      await settle();
      expect(el.querySelectorAll('.anel').length).toBe(1);
      expect(el.querySelectorAll('[data-alca]').length).toBe(8);
      const acoes = el.querySelector<HTMLElement>('.acoes')!;
      expect([...acoes.querySelectorAll('button')].map((b) => b.getAttribute('aria-label'))).toEqual(['Cor', 'Trazer para frente', 'Mandar para trás', 'Duplicar', 'Apagar']);
      expectEtiquetaPadrao(acoes);
    });

    it('arrastar move nos furos (uma mudança só), Delete apaga e Ctrl+Z desfaz', async () => {
      await edit(MANSION);
      ptr('pointerdown', 60, 110);
      ptr('pointermove', 80, 120);
      ptr('pointermove', 90, 140);
      ptr('pointerup', 90, 140);
      await settle();
      expect(changes.length).toBe(1);
      expect(changes[0].n.find((n) => n.i === 'senha')).toEqual(jasmine.objectContaining({ x: 78, y: 130 }));
      key('Delete');
      await settle();
      expect(changes.at(-1)!.n.some((n) => n.i === 'senha')).toBeFalse();
      expect(changes.at(-1)!.e.length).toBe(0);
      key('z', { ctrlKey: true });
      await settle();
      expect(changes.at(-1)!.n.some((n) => n.i === 'senha')).toBeTrue();
    });

    it('duplo clique no fundo é um bilhete novo, já escrevendo; o Esc guarda o texto', async () => {
      await edit(MANSION);
      visor().dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, clientX: 1000, clientY: 400 }));
      await settle();
      const area = el.querySelector<HTMLTextAreaElement>('textarea.escrever')!;
      expect(document.activeElement).toBe(area);
      area.value = 'Senha nova';
      area.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      await settle();
      const last = changes.at(-1)!;
      expect(last.n.some((n) => n.t === 'x' && n.txt === 'Senha nova')).toBeTrue();
      expect(el.querySelector('textarea.escrever')).toBeNull();
    });

    it('as ferramentas pelo teclado e pela régua; Esc sem nada selecionado pede para sair do editar', async () => {
      await edit(MANSION);
      expect(el.querySelector('app-free-board-tools')).not.toBeNull();
      key('m');
      await settle();
      expect(el.querySelector('.ferramenta[aria-pressed="true"]')!.textContent).toContain('Moldura');
      key('v');
      key('Escape');
      expect(toggles).toEqual([false]);
    });

    it('fora do editar, o E pede para editar e o botão direito abre o menu de ver', async () => {
      await open(MANSION);
      toggles = [];
      fixture.componentInstance.editToggle.subscribe((on) => toggles.push(on));
      fixture.componentRef.setInput('owner', { pickNote: async () => null, findNote: () => null, storeImages: async () => [], editWidget: async () => null, openNote: () => undefined });
      await fixture.whenStable();
      key('e');
      expect(toggles).toEqual([true]);
      visor().dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 1000, clientY: 400 }));
      await settle();
      const items = [...document.querySelectorAll<HTMLElement>('.menu-contexto [role="menuitem"]')].map((b) => b.textContent!.replace(/\s+/g, ' ').trim());
      expect(items.some((t) => t.startsWith('Ver tudo'))).toBeTrue();
      expect(items.some((t) => t.startsWith('Editar o quadro'))).toBeTrue();
    });
  });

  it('a borda rasgada do bilhete é sempre a mesma para a mesma peça', () => {
    expect(tornTop('senha')).toBe(tornTop('senha'));
    expect(tornTop('senha')).not.toBe(tornTop('email'));
  });
});
