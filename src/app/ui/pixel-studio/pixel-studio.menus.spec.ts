import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WidgetValues } from '../../core/widgets';
import { PixelStudio } from './pixel-studio';

/** A barra de menus do ateliê (como a de todo programa): Arquivo, Editar, Selecionar, Imagem, Camada, Cores, Exibir, Ajuda. */
describe('pixel art: a barra de menus do ateliê', () => {
  let fixture: ComponentFixture<PixelStudio>;
  let values: WidgetValues;
  let host: HTMLElement;

  async function make(start: WidgetValues, opts: { layered?: boolean; name?: string } = {}): Promise<void> {
    TestBed.configureTestingModule({ imports: [PixelStudio], providers: [provideZonelessChangeDetection()] });
    fixture = TestBed.createComponent(PixelStudio);
    values = { ...start };
    fixture.componentRef.setInput('values', values);
    if (opts.layered) fixture.componentRef.setInput('layered', true);
    if (opts.name) fixture.componentRef.setInput('artName', opts.name);
    fixture.componentInstance.changed.subscribe((p) => (values = { ...values, ...p }));
    host = fixture.nativeElement;
    document.body.appendChild(host);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }
  afterEach(() => {
    host?.querySelectorAll('dialog').forEach((d) => d.open && d.close());
    host?.remove();
    TestBed.resetTestingModule();
  });

  const top = (id: string) => host.querySelector(`.barra-menus [data-menu="${id}"]`) as HTMLButtonElement;
  const options = () => [...host.querySelectorAll<HTMLButtonElement>('.menu-contexto .escolha')];
  const option = (text: string) => options().find((b) => b.textContent?.includes(text))!;
  const caption = () => host.querySelector('.menu-contexto .legenda')?.textContent?.replace('Ações de', '').trim();
  function open(id: string): void {
    top(id).click();
    fixture.detectChanges();
  }
  function pick(text: string): void {
    option(text).click();
    fixture.detectChanges();
  }
  const board = () => host.querySelector('svg.folha') as SVGSVGElement;
  function key(k: string, extra: KeyboardEventInit = {}, on: Element = board()): void {
    on.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...extra }));
    fixture.detectChanges();
  }

  it('os menus de todo programa, em ordem; o Camada só nas obras da galeria', async () => {
    await make({ width: '2', height: '2' });
    const names = () => [...host.querySelectorAll('.barra-menus .menu-topo:not(.menu-geral)')].map((b) => b.textContent?.trim());
    expect(names()).toEqual(['Arquivo', 'Editar', 'Selecionar', 'Imagem', 'Cores', 'Exibir', 'Ajuda']);
    expect(host.querySelector('[role="menubar"]')).not.toBeNull();
    TestBed.resetTestingModule();
    host.remove();
    await make({ width: '2', height: '2' }, { layered: true });
    expect(names()).toEqual(['Arquivo', 'Editar', 'Selecionar', 'Imagem', 'Camada', 'Cores', 'Exibir', 'Ajuda']);
  });

  it('o Editar: o Desfazer apagado sem nada para desfazer; depois de pintar, ele desfaz', async () => {
    await make({ width: '2', height: '1' });
    open('editar');
    expect(top('editar').getAttribute('aria-expanded')).toBe('true');
    expect(caption()).toBe('Editar');
    expect(option('Desfazer').disabled).toBeTrue();
    expect(option('Colar').disabled).toBeTrue();
    key('Escape', {}, host.querySelector('.menu-contexto')!);
    key('Enter');
    expect(values['pixels']).toBe('1');
    open('editar');
    expect(option('Desfazer').disabled).toBeFalse();
    expect(option('Desfazer').querySelector('.atalho')?.textContent).toBe('Ctrl+Z');
    pick('Desfazer');
    expect(values['pixels']).toBe('');
  });

  it('com um menu aberto, o mouse no nome de outro abre aquele; as setas dos lados andam entre eles', async () => {
    await make({ width: '2', height: '2' });
    open('arquivo');
    top('imagem').dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(caption()).toBe('Imagem');
    expect(top('arquivo').getAttribute('aria-expanded')).toBe('false');
    key('ArrowRight', {}, host.querySelector('.menu-contexto')!);
    await fixture.whenStable();
    expect(caption()).toBe('Cores');
    key('ArrowLeft', {}, host.querySelector('.menu-contexto')!);
    key('ArrowLeft', {}, host.querySelector('.menu-contexto')!);
    await fixture.whenStable();
    expect(caption()).toBe('Selecionar');
    // sem menu aberto, passar o mouse não abre nada
    key('Escape', {}, host.querySelector('.menu-contexto')!);
    top('ajuda').dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
    fixture.detectChanges();
    expect(top('ajuda').getAttribute('aria-expanded')).toBe('false');
  });

  it('o nome do menu aberto, clicado de novo, fecha', async () => {
    await make({ width: '2', height: '2' });
    open('imagem');
    expect(top('imagem').getAttribute('aria-expanded')).toBe('true');
    top('imagem').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    fixture.detectChanges();
    open('imagem');
    expect(top('imagem').getAttribute('aria-expanded')).toBe('false');
    open('imagem');
    expect(top('imagem').getAttribute('aria-expanded')).toBe('true');
  });

  it('F10 leva à barra; as setas andam pelos nomes e a de baixo abre com o foco na primeira opção', async () => {
    await make({ width: '2', height: '2' });
    if (matchMedia('(max-width: 760px)').matches) {
      // (na janela estreita, os nomes moram no Menu: o F10 vai para ele)
      key('F10');
      expect(document.activeElement).toBe(host.querySelector('.menu-geral'));
      return;
    }
    key('F10');
    expect(document.activeElement).toBe(top('arquivo'));
    key('ArrowRight', {}, top('arquivo'));
    expect(document.activeElement).toBe(top('editar'));
    expect(top('editar').getAttribute('tabindex')).toBe('0');
    expect(top('arquivo').getAttribute('tabindex')).toBe('-1');
    key('ArrowDown', {}, top('editar'));
    await fixture.whenStable();
    expect(caption()).toBe('Editar');
    // o Desfazer e o Refazer não valem: o foco vai para o primeiro que vale
    expect(document.activeElement?.textContent).toContain('Limpar a folha');
  });

  it('o Exibir liga e desliga a grade de 8 e a prévia, com o tique no que está ligado; o zoom mora na barra de baixo', async () => {
    await make({ width: '16', height: '16' });
    expect(host.querySelector('.fios.fortes')).not.toBeNull();
    open('exibir');
    expect(option('Grade de 8 em 8').querySelector('.marcada')).not.toBeNull();
    pick('Grade de 8 em 8');
    expect(host.querySelector('.fios.fortes')).toBeNull();
    expect(host.querySelector('.previa')).not.toBeNull();
    open('exibir');
    expect(option('Grade de 8 em 8').querySelector('.marcada')).toBeNull();
    pick('Prévia no painel');
    expect(host.querySelector('.previa')).toBeNull();
    expect(host.querySelector('.estado [aria-label="Aproximar"]')).not.toBeNull();
    open('exibir');
    pick('Tamanho de verdade');
    expect(host.querySelector('.estado .zoom-n')?.textContent?.trim()).toBe('100%');
  });

  it('o Cores muda a cor de lugar e tira a cor; o Ajuda abre os atalhos, que contam do F10', async () => {
    await make({ width: '3', height: '1', pixels: '123' });
    open('cores');
    expect(option('Um lugar para trás').disabled).toBeTrue();
    pick('Um lugar para a frente');
    expect(values['pixels']).toBe('213');
    open('ajuda');
    pick('Atalhos do teclado');
    await fixture.whenStable();
    fixture.detectChanges();
    const sheet = host.querySelector('dialog.atalhos') as HTMLDialogElement;
    expect(sheet.open).toBeTrue();
    expect(sheet.textContent).toContain('F10');
  });

  it('o Arquivo baixa o PNG com o nome da obra, grande ou no tamanho original', async () => {
    await make({ width: '16', height: '13', pixels: '1' }, { name: 'Gato preto' });
    const names: string[] = [];
    spyOn(HTMLAnchorElement.prototype, 'click').and.callFake(function (this: HTMLAnchorElement) {
      names.push(this.download);
    });
    open('arquivo');
    pick('Baixar no tamanho original');
    open('arquivo');
    pick('Baixar em PNG');
    await new Promise((r) => setTimeout(r, 100));
    expect(names.sort()).toEqual(['gato-preto-16x13.png', 'gato-preto.png']);
  });

  it('no celular, o Menu junta todos: escolher um nome abre aquele menu', async () => {
    await make({ width: '2', height: '2' }, { layered: true });
    const geral = host.querySelector('.menu-geral') as HTMLButtonElement;
    // (o ateliê esconde os nomes no celular; aqui o Menu é aberto direto, como o dedo faria)
    geral.click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(caption()).toBe('Menu');
    expect(options().map((b) => b.textContent?.trim())).toEqual(['Arquivo', 'Editar', 'Selecionar', 'Imagem', 'Camada', 'Cores', 'Exibir', 'Ajuda']);
    pick('Camada');
    await fixture.whenStable();
    expect(caption()).toBe('Camada');
    expect(option('Camada nova').querySelector('.atalho')?.textContent).toBe('Shift+N');
    pick('Camada nova');
    expect(host.querySelectorAll('.camada-linha').length).toBe(2);
  });
});
