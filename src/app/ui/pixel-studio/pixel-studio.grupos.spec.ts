import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { inkIndex } from '../../core/pixel-art';
import { WidgetValues } from '../../core/widgets';
import { Confirm } from '../confirm';
import { PixelStudio } from './pixel-studio';

/** Os grupos das cores no ateliê (PLANO-GRUPOS-CORES.md): o modelo, o painel, marcar e arrastar. */
describe('pixel art: os grupos das cores no ateliê', () => {
  let fixture: ComponentFixture<PixelStudio>;
  let values: WidgetValues;
  let host: HTMLElement;

  async function make(start: WidgetValues): Promise<void> {
    TestBed.configureTestingModule({
      imports: [PixelStudio],
      providers: [provideZonelessChangeDetection(), { provide: Confirm, useValue: { ask: () => Promise.resolve(true), choose: () => Promise.resolve('confirm') } }],
    });
    fixture = TestBed.createComponent(PixelStudio);
    values = { ...start };
    fixture.componentRef.setInput('values', values);
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

  const studio = () => fixture.componentInstance as unknown as Record<string, (...a: unknown[]) => unknown>;
  function run(name: string, ...args: unknown[]): void {
    studio()[name](...args);
    fixture.detectChanges();
  }

  describe('o modelo (rodada 1)', () => {
    it('abre com os grupos dos valores e os devolve com o desenho', async () => {
      await make({ width: '3', height: '1', pixels: '123', groups: 'grupos [Quentes]34 [Vazio]' });
      run('chooseInk', 2);
      run('removeFg');
      // a 2 saiu: a 3 e a 4 descem um número e continuam no grupo
      expect(values['groups']).toBe('grupos [Quentes]23 [Vazio]');
      expect(values['palette']).toBe('propria');
    });

    it('o desfazer volta os grupos junto com a paleta', async () => {
      await make({ width: '3', height: '1', pixels: '123', groups: 'grupos [Quentes]34' });
      run('chooseInk', 3);
      run('removeFg');
      expect(values['groups']).toBe('grupos [Quentes]3');
      run('undo');
      expect(values['groups']).toBe('grupos [Quentes]34');
      run('redo');
      expect(values['groups']).toBe('grupos [Quentes]3');
    });

    it('mudar de lugar e ordenar: cada cor leva o grupo dela', async () => {
      await make({ width: '2', height: '1', pixels: '12', groups: 'grupos [A]1' });
      run('chooseInk', 1);
      run('moveFg', 1);
      expect(values['groups']).toBe('grupos [A]2');
      expect(values['pixels']).toBe('21');
      const inks = () => (fixture.componentInstance as unknown as { inks: () => (string | null)[] }).inks();
      const grouped = () => inkIndex(values['groups']!.match(/\]([0-9a-zA-Z])$/)![1]);
      const color = inks()[grouped()];
      run('sortPalette', 'tom');
      // a cor do grupo continua a mesma, em outro número
      expect(inks()[grouped()]).toBe(color);
    });

    it('tirar as sem uso tira do grupo as que saíram', async () => {
      await make({ width: '2', height: '1', pixels: '19', groups: 'grupos [A]129' });
      run('removeUnused');
      expect(values['groups']).toBe('grupos [A]12');
    });

    it('trocar a paleta mantendo os números: o grupo perde as cores que a nova não tem', async () => {
      await make({ width: '1', height: '1', pixels: '1', palette: 'completa', groups: 'grupos [A]19a' });
      run('setPalette', 'gameboy');
      expect(values['groups']).toBe('grupos [A]1');
      run('undo');
      expect(values['groups']).toBe('grupos [A]19a');
    });

    it('trocar a paleta convertendo: cada cor do grupo vira a mais perto dela na nova', async () => {
      await make({ width: '1', height: '1', pixels: '1', groups: 'grupos [Escuro]1 [Claro]2' });
      run('applyPalette', { palette: 'bitonal', convert: true });
      expect(values['groups']).toMatch(/^grupos \[Escuro\]\d \[Claro\]\d$/);
      const [, a, b] = values['groups']!.match(/\[Escuro\](\d) \[Claro\](\d)/)!;
      expect(a).not.toBe(b);
    });

    it('sem grupo, os valores levam o campo vazio (a linha não muda)', async () => {
      await make({ width: '1', height: '1', pixels: '1' });
      expect(host.querySelectorAll('.cor-grupo').length).toBe(0);
      expect(host.querySelectorAll('.cores-paleta .pastilha:not(.mais)').length).toBe(10);
    });

    it('sem grupo, tirar uma cor deixa o campo vazio', async () => {
      await make({ width: '1', height: '1', pixels: '1' });
      run('chooseInk', 2);
      run('removeFg');
      expect(values['groups']).toBe('');
    });
  });

  describe('o painel (rodada 2)', () => {
    const options = () => [...document.querySelectorAll<HTMLButtonElement>('.menu-contexto .escolha')];
    const option = (label: string) => options().find((b) => b.textContent?.includes(label));
    const sections = () => [...host.querySelectorAll<HTMLElement>('.cor-grupo')];
    const swatchesOf = (el: Element) => [...el.querySelectorAll<HTMLElement>('.pastilha:not(.mais)')].map((b) => b.getAttribute('aria-label'));
    const soltas = () => swatchesOf(host.querySelector('.cores-paleta > .pastilhas')!);
    async function settle(): Promise<void> {
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
    }

    it('as soltas primeiro, depois cada grupo com o nome e quantas tem; o vazio diz que não tem', async () => {
      await make({ width: '1', height: '1', pixels: '1', groups: 'grupos [Quentes]34 [Vazio]' });
      expect(soltas()).toEqual(['Transparente', 'Cor 1', 'Cor 2', 'Cor 5', 'Cor 6', 'Cor 7', 'Cor 8', 'Cor 9']);
      expect(sections().map((s) => s.querySelector('.cor-grupo-nome')?.textContent?.trim())).toEqual(['Quentes2', 'Vazio0']);
      expect(swatchesOf(sections()[0])).toEqual(['Cor 3', 'Cor 4']);
      expect(sections()[1].querySelector('.grupo-vazio')?.textContent).toContain('Arraste cores');
    });

    it('"Novo grupo" faz um vazio com o nome aberto; Enter grava o nome, um passo do desfazer', async () => {
      await make({ width: '1', height: '1', pixels: '1' });
      (host.querySelector('.novo-grupo') as HTMLButtonElement).click();
      await settle();
      const input = host.querySelector<HTMLInputElement>('.grupo-nome-campo')!;
      expect(document.activeElement).toBe(input);
      expect(input.value).toBe('Grupo 1');
      expect(values['groups']).toBe('grupos [Grupo 1]');
      input.value = 'Céu';
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await settle();
      expect(values['groups']).toBe('grupos [Céu]');
      run('undo');
      expect(values['groups']).toBe('grupos [Grupo 1]');
    });

    it('o Esc no nome deixa o de antes', async () => {
      await make({ width: '1', height: '1', pixels: '1', groups: 'grupos [A]1' });
      run('startGroupRename', 0);
      await settle();
      const input = host.querySelector<HTMLInputElement>('.grupo-nome-campo')!;
      input.value = 'B';
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await settle();
      expect(values['groups']).toBe('grupos [A]1');
    });

    it('recolher esconde as pastilhas e mostra a fita; ] anda na ordem da tela e abre o grupo da escolhida', async () => {
      await make({ width: '1', height: '1', pixels: '1', groups: 'grupos [A]3' });
      (sections()[0].querySelector('.grupo-seta') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(sections()[0].querySelectorAll('.pastilha').length).toBe(0);
      expect(sections()[0].querySelectorAll('.grupo-fita span').length).toBe(1);
      // da 9 (a última solta), a próxima é a 3, no grupo
      run('chooseInk', 9);
      run('stepInk', 1);
      expect(host.querySelector('.pastilha.on')?.getAttribute('aria-label')).toBe('Cor 3');
      expect(sections()[0].querySelector('.grupo-seta')?.getAttribute('aria-expanded')).toBe('true');
    });

    it('o menu das cores põe a cor da frente num grupo e tira de volta', async () => {
      await make({ width: '1', height: '1', pixels: '1', groups: 'grupos [Quentes]3' });
      run('chooseInk', 4);
      (host.querySelector('.cores-topo [aria-label="Mais sobre as cores"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      option('Pôr em Quentes')!.click();
      fixture.detectChanges();
      expect(values['groups']).toBe('grupos [Quentes]34');
      expect(values['pixels']).toBe('1');
      (host.querySelector('.cores-topo [aria-label="Mais sobre as cores"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      option('Tirar de Quentes')!.click();
      fixture.detectChanges();
      expect(values['groups']).toBe('grupos [Quentes]3');
    });

    it('o botão direito no vazio do painel abre o menu das cores, com o grupo novo', async () => {
      await make({ width: '1', height: '1', pixels: '1' });
      const paleta = host.querySelector('.cores-paleta') as HTMLElement;
      paleta.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }));
      fixture.detectChanges();
      expect(option('Novo grupo')).toBeTruthy();
      // na pastilha, o direito continua escolhendo o fundo, sem o menu
      document.querySelector<HTMLElement>('.menu-contexto')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      fixture.detectChanges();
      const sw = host.querySelector('.cores-paleta .pastilha[aria-label="Cor 2"]') as HTMLElement;
      sw.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
      fixture.detectChanges();
      expect(sw.classList).toContain('fundo');
    });

    it('arrastar uma cor para a pastilha de outro grupo muda o grupo, sem renumerar; no mesmo grupo, muda o lugar', async () => {
      await make({ width: '1', height: '1', pixels: '1', palette: 'pico8', groups: 'grupos [A]34 [B]5' });
      const drop = (from: number, onto: string) => {
        const sw = (l: string) => host.querySelector(`.cores-paleta .pastilha[aria-label="${l}"]`) as HTMLElement;
        sw(`Cor ${from}`).dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: new DataTransfer() }));
        sw(onto).dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: new DataTransfer() }));
        fixture.detectChanges();
      };
      drop(3, 'Cor 5');
      expect(values['groups']).toBe('grupos [A]4 [B]35');
      expect(values['palette']).toBe('pico8');
      drop(3, 'Cor 1');
      expect(values['groups']).toBe('grupos [A]4 [B]5');
      // dentro do mesmo grupo: o lugar (a paleta vira a própria, como sempre)
      drop(3, 'Cor 1');
      expect(values['palette']).toBe('propria');
    });

    it('o menu do grupo: subir, descer e desfazer (as cores ficam soltas)', async () => {
      await make({ width: '1', height: '1', pixels: '1', groups: 'grupos [A]3 [B]4' });
      (sections()[1].querySelector('.grupo-mais') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(option('Descer')).toBeUndefined();
      option('Subir')!.click();
      fixture.detectChanges();
      expect(values['groups']).toBe('grupos [B]4 [A]3');
      (sections()[0].querySelector('.grupo-mais') as HTMLButtonElement).click();
      fixture.detectChanges();
      option('Desfazer o grupo')!.click();
      fixture.detectChanges();
      expect(values['groups']).toBe('grupos [A]3');
      expect(soltas()).toContain('Cor 4');
    });
  });

  describe('marcar e arrastar (rodada 3)', () => {
    const options = () => [...document.querySelectorAll<HTMLButtonElement>('.menu-contexto .escolha')];
    const option = (label: string) => options().find((b) => b.textContent?.includes(label));
    const sw = (n: number) => host.querySelector(`.cores-paleta .pastilha[data-cor="${n}"]`) as HTMLElement;
    const marks = () => [...host.querySelectorAll('.pastilha.marcada')].map((b) => Number(b.getAttribute('data-cor')));
    const fgNow = () => Number(host.querySelector('.pastilha.on')?.getAttribute('data-cor'));
    function tap(n: number, init: MouseEventInit = {}): void {
      sw(n).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...init }));
      fixture.detectChanges();
    }
    async function settle(): Promise<void> {
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
    }

    it('Ctrl + clique marca e desmarca sem mudar a cor da frente; Shift marca o intervalo na ordem da tela', async () => {
      await make({ width: '1', height: '1', pixels: '1', groups: 'grupos [A]23' });
      tap(4, { ctrlKey: true });
      tap(6, { ctrlKey: true });
      expect(marks()).toEqual([4, 6]);
      expect(fgNow()).toBe(1);
      expect(host.querySelector('.marcadas-n')?.textContent).toContain('2 cores marcadas');
      tap(6, { ctrlKey: true });
      expect(marks()).toEqual([4]);
      // da 6 (a última tocada) até a 2: na tela, 6 7 8 9 (soltas) e depois 2 (no grupo A)
      tap(2, { shiftKey: true });
      expect(marks().sort((a, b) => a - b)).toEqual([2, 6, 7, 8, 9]);
      // o clique simples escolhe e desmarca
      tap(5);
      expect(marks()).toEqual([]);
      expect(fgNow()).toBe(5);
    });

    it('o intervalo do Shift pula as cores de um grupo recolhido; recolher desmarca as dele', async () => {
      await make({ width: '1', height: '1', pixels: '1', groups: 'grupos [A]23 [B]45' });
      (host.querySelector('[data-grupo="1"] .grupo-seta') as HTMLButtonElement).click();
      fixture.detectChanges();
      // na tela: 1 6 7 8 9, depois 2 3 (A); o B está recolhido
      tap(9, { ctrlKey: true });
      tap(3, { shiftKey: true });
      expect(marks().sort((a, b) => a - b)).toEqual([2, 3, 9]);
      (host.querySelector('[data-grupo="0"] .grupo-seta') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(host.querySelector('.marcadas-n')?.textContent).toContain('1 cor marcada');
    });

    it('o Esc desmarca (e não fecha o ateliê)', async () => {
      await make({ width: '1', height: '1', pixels: '1' });
      tap(3, { ctrlKey: true });
      sw(3).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      fixture.detectChanges();
      expect(marks()).toEqual([]);
      expect((host.querySelector('dialog.atelie') as HTMLDialogElement).open).toBeTrue();
    });

    it('"Agrupar" faz o grupo com as marcadas, com o nome tirado das cores', async () => {
      await make({ width: '1', height: '1', pixels: '1' });
      // na clássica, a 4 é o vermelho e a 5 o laranja: quentes
      tap(4, { ctrlKey: true });
      tap(5, { ctrlKey: true });
      (host.querySelector('.marcadas-agrupar') as HTMLButtonElement).click();
      await settle();
      expect(values['groups']).toBe('grupos [Quentes]45');
      expect(marks()).toEqual([]);
      expect(host.querySelector<HTMLInputElement>('.grupo-nome-campo')?.value).toBe('Quentes');
    });

    it('arrastar uma marcada leva todas para o grupo onde caiu (no nome, no vazio ou numa pastilha)', async () => {
      await make({ width: '1', height: '1', pixels: '1', groups: 'grupos [A] [B]9' });
      tap(4, { ctrlKey: true });
      tap(5, { ctrlKey: true });
      sw(4).dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: new DataTransfer() }));
      fixture.detectChanges();
      expect(host.querySelectorAll('.pastilha.arrastada').length).toBe(2);
      const grupoA = host.querySelector('[data-grupo="0"]') as HTMLElement;
      grupoA.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: new DataTransfer() }));
      fixture.detectChanges();
      expect(grupoA.classList).toContain('recebe');
      grupoA.querySelector('.grupo-vazio')!.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: new DataTransfer() }));
      fixture.detectChanges();
      expect(values['groups']).toBe('grupos [A]45 [B]9');
      expect(host.querySelector('.recebe')).toBeNull();
      // de novo, numa pastilha do B: as duas vão para o B, sem renumerar
      tap(4, { ctrlKey: true });
      tap(5, { ctrlKey: true });
      sw(5).dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: new DataTransfer() }));
      sw(9).dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: new DataTransfer() }));
      fixture.detectChanges();
      expect(values['groups']).toBe('grupos [A] [B]459');
      expect(values['palette']).toBe('classica');
      // e para as soltas
      sw(9).dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: new DataTransfer() }));
      (host.querySelector('.soltas') as HTMLElement).dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: new DataTransfer() }));
      fixture.detectChanges();
      expect(values['groups']).toBe('grupos [A] [B]45');
      // soltar em cima do transparente também é soltar nas soltas
      sw(4).dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: new DataTransfer() }));
      sw(0).dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: new DataTransfer() }));
      fixture.detectChanges();
      expect(values['groups']).toBe('grupos [A] [B]5');
    });

    it('o menu das cores fala das marcadas e agrupa pelo tom (um passo do desfazer)', async () => {
      await make({ width: '1', height: '1', pixels: '1', groups: 'grupos [A]1' });
      tap(4, { ctrlKey: true });
      tap(5, { ctrlKey: true });
      (host.querySelector('.cores-topo [aria-label="Mais sobre as cores"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(option('Novo grupo com as 2 marcadas')).toBeTruthy();
      option('Pôr as 2 em A')!.click();
      fixture.detectChanges();
      expect(values['groups']).toBe('grupos [A]145');
      (host.querySelector('.cores-topo [aria-label="Mais sobre as cores"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      option('Agrupar pelo tom')!.click();
      fixture.detectChanges();
      expect(values['groups']).toMatch(/^grupos \[Cinzas\]\S+ \[Vermelhos\]4 /);
      expect(values['pixels']).toBe('1');
      run('undo');
      expect(values['groups']).toBe('grupos [A]145');
    });
  });
});
