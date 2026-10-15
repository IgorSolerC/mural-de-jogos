import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DEFAULT_LOOK, DEFAULT_SCRIBBLE_INK, DecorMark, Paper, Pattern, PatternLook, Scribble, StainMark } from '../core/paper';
import type { Damage } from '../core/paper';
import { Stock } from '../core/review';
import { CardKit } from './card-kit';

@Component({
  imports: [CardKit],
  template: `<app-card-kit
    id="r-teste"
    pinColor="vermelho"
    [(stock)]="stock"
    [(paper)]="paper"
    [(paperSeed)]="paperSeed"
    [(pattern)]="pattern"
    [(patternLook)]="patternLook"
    [(patternSeed)]="patternSeed"
    [(scribble)]="scribble"
    [(scribbleSeed)]="scribbleSeed"
    [(scribbleInk)]="scribbleInk"
    [(damage)]="damage"
    [(damageSeed)]="damageSeed"
    [(stains)]="stains"
    [(decors)]="decors"
  />`,
})
class Host {
  stock = signal<Stock>('amarelo');
  paper = signal<Paper>('cartolina');
  paperSeed = signal<number | null>(null);
  pattern = signal<Pattern | null>(null);
  patternLook = signal<PatternLook>(DEFAULT_LOOK);
  patternSeed = signal<number | null>(null);
  scribble = signal<Scribble | null>(null);
  scribbleSeed = signal<number | null>(null);
  scribbleInk = signal(DEFAULT_SCRIBBLE_INK);
  damage = signal<Damage | null>(null);
  damageSeed = signal<number | null>(null);
  stains = signal<StainMark[]>([]);
  decors = signal<DecorMark[]>([]);
}

describe('CardKit: várias manchas e decorações', () => {
  let host: Host;
  let el: HTMLElement;

  async function open(tab: string): Promise<void> {
    (el.querySelector(`#kit-aba-${tab}`) as HTMLButtonElement).click();
    fixture.detectChanges();
    await fixture.whenStable();
  }
  const box = (label: string) => el.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
  const click = (label: string) => {
    box(label).click();
    fixture.detectChanges();
  };
  let fixture: ReturnType<typeof TestBed.createComponent<Host>>;

  beforeEach(async () => {
    TestBed.configureTestingModule({ imports: [Host], providers: [provideZonelessChangeDetection()] });
    fixture = TestBed.createComponent(Host);
    host = fixture.componentInstance;
    el = fixture.nativeElement;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('marca até três, na ordem da escolha, e mostra a ordem', async () => {
    await open('mancha');
    for (const label of ['Sangue', 'Café', 'Lama respingada']) click(label);
    expect(host.stains().map((m) => m.stain)).toEqual(['sangue', 'cafe', 'lama']);
    expect(host.stains().every((m) => !!m.seed)).toBeTrue();
    // o número da ordem no canto de cada escolhida, e o x no outro canto (a fileira de antes saiu)
    const order = (label: string) => box(label).closest('label')!.querySelector('.ordem')?.textContent?.trim();
    expect(['Sangue', 'Café', 'Lama respingada'].map(order)).toEqual(['1', '2', '3']);
    expect(el.querySelectorAll('.tirar').length).toBe(3);
    expect(el.querySelector('.na-ficha')).toBeNull();
    expect(el.querySelector('legend')!.textContent).toContain('3 de 3');
    // a quarta espera: apagada, sem entrar
    expect(box('Nanquim').disabled).toBeTrue();
    click('Nanquim');
    expect(host.stains().length).toBe(3);
  });

  it('tocar de novo numa escolhida sorteia de outro jeito, no mesmo lugar, sem desmarcar', async () => {
    await open('decoracao');
    for (const label of ['Neve', 'Selo', 'Clipe']) click(label);
    const before = host.decors();
    click('Selo');
    expect(host.decors().map((m) => m.decor)).toEqual(['neve', 'selo', 'clipe']);
    expect(host.decors()[1].seed).not.toBe(before[1].seed);
    expect(host.decors()[0]).toEqual(before[0]);
    expect(host.decors()[2]).toEqual(before[2]);
    expect(box('Selo').checked).toBeTrue();
    expect(box('Pena').disabled).toBeTrue();
  });

  it('o x do canto tira só aquela (as de cima descem na ordem); Nenhuma tira todas', async () => {
    await open('mancha');
    click('Café');
    click('Mofada');
    click('Sangue');
    const before = host.stains();
    (el.querySelector('[aria-label="Tirar Mofada"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(host.stains()).toEqual([before[0], before[2]]);
    expect(box('Mofada').checked).toBeFalse();
    expect(box('Sangue').closest('label')!.querySelector('.ordem')!.textContent!.trim()).toBe('2');
    expect(el.querySelector('[aria-label="Tirar Mofada"]')).toBeNull();
    click('Nenhuma');
    expect(host.stains()).toEqual([]);
    expect(box('Nenhuma').checked).toBeTrue();
    expect(el.querySelector('.tirar')).toBeNull();
  });

  it('o estrago continua um só', async () => {
    await open('estrago');
    click('Rasgada');
    click('Queimada');
    expect(host.damage()).toBe('queimado');
    expect(el.querySelector('input[type="checkbox"]')).toBeNull();
    expect(el.textContent).not.toContain('Desbotada no sol');
  });

  it('Desbotada no sol e Carregou pela metade estão no Papel, e cada clique sorteia de outro jeito', async () => {
    await open('papel');
    click('Desbotada no sol');
    expect(host.paper()).toBe('desbotado');
    const first = host.paperSeed();
    expect(first).not.toBeNull();
    click('Desbotada no sol');
    expect(host.paperSeed()).not.toBe(first);
    click('Carregou pela metade');
    expect(host.paper()).toBe('carregando');
    click('Canson');
    expect([host.paper(), host.paperSeed()]).toEqual(['canson', null]);
  });
});
