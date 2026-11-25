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

    it('sem grupo, os valores levam o campo vazio e a linha não muda', async () => {
      await make({ width: '1', height: '1', pixels: '1' });
      run('chooseInk', 2);
      run('removeFg');
      expect(values['groups']).toBe('');
    });
  });
});
