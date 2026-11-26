import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DEFAULT_LOOK, DEFAULT_SCRIBBLE_INK, DecorMark, InkTone, Paper, Pattern, PatternLook, Scribble, StainMark } from '../core/paper';
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
    [(scribbleTone)]="scribbleTone"
    [(damage)]="damage"
    [(damageSeed)]="damageSeed"
    [(wear)]="wear"
    [(wearSeed)]="wearSeed"
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
  scribbleTone = signal<InkTone | null>(null);
  damage = signal<Damage | null>(null);
  damageSeed = signal<number | null>(null);
  wear = signal<Damage | null>(null);
  wearSeed = signal<number | null>(null);
  stains = signal<StainMark[]>([]);
  decors = signal<DecorMark[]>([]);
}

describe('CardKit: várias manchas e decorações', () => {
  let host: Host;
  let el: HTMLElement;

  async function open(tab: string): Promise<void> {
    (el.querySelector(`[role="tab"][id$="-aba-${tab}"]`) as HTMLButtonElement).click();
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

  it('o estrago em dois blocos: um destrutivo e um estético, cada um com o seu Nenhum', async () => {
    await open('estrago');
    expect([...el.querySelectorAll('.bloco-titulo')].map((h) => h.textContent!.trim())).toEqual(['Destrutivos Nenhum', 'Estéticos Nenhum']);
    click('Rasgada');
    click('Queimada');
    // no mesmo bloco, um só
    expect([host.damage(), host.wear()]).toEqual(['queimado', null]);
    // o estético vai junto, por baixo: o destrutivo fica no damage, o estético no wear
    click('Amassada');
    expect([host.damage(), host.wear()]).toEqual(['queimado', 'amassado']);
    expect(host.wearSeed()).not.toBeNull();
    expect(el.querySelector('legend')!.textContent).toContain('Queimada + Amassada');
    expect(el.querySelector('[id$="-aba-estrago"] .aba-conta')!.textContent!.trim()).toBe('2');
    // tirar o destrutivo: o estético sozinho volta para o damage, com o sorteio dele
    const seed = host.wearSeed();
    box('Nenhum destrutivo').click();
    fixture.detectChanges();
    expect([host.damage(), host.damageSeed(), host.wear(), host.wearSeed()]).toEqual(['amassado', seed, null, null]);
    // e o estético sozinho aparece marcado no bloco dele
    expect(box('Amassada').checked).toBeTrue();
    expect(el.querySelector('input[type="checkbox"]')).toBeNull();
    expect(el.textContent).not.toContain('Desbotada no sol');
  });

  it('Desbotada no sol e Carregou pela metade estão no Papel, fixos: escolher não sorteia, e limpa o sorteio de antes', async () => {
    host.paperSeed.set(777);
    await open('papel');
    click('Desbotada no sol');
    expect([host.paper(), host.paperSeed()]).toEqual(['desbotado', null]);
    click('Desbotada no sol');
    expect(host.paperSeed()).toBeNull();
    click('Carregou pela metade');
    expect([host.paper(), host.paperSeed()]).toEqual(['carregando', null]);
  });

  it('as decorações por assunto, como as estampas: a régua em cima, um bloco por assunto e o pontinho no da escolhida', async () => {
    host.decors.set([{ decor: 'teia', seed: 4 }]);
    fixture.detectChanges();
    await open('decoracao');
    const chips = () => [...el.querySelectorAll<HTMLButtonElement>('.assuntos .assunto')];
    expect(chips().map((b) => b.textContent!.trim())).toEqual(['Todas', 'Brilho e festa', 'Adesivos', 'Papelaria', 'Prender e furar', 'Natureza', 'TV e computador']);
    // abre no assunto da decoração que a ficha tem, com o pontinho nele
    expect(el.querySelector('.assunto.on')!.textContent!.trim()).toBe('Natureza');
    expect(el.querySelector('.assunto.usada')!.textContent!.trim()).toBe('Natureza');
    expect(box('Neve')).not.toBeNull();
    expect(box('Purpurina')).toBeNull();
    // a Nenhuma fica à vista em qualquer assunto
    expect(box('Nenhuma')).not.toBeNull();
    chips()[0].click();
    fixture.detectChanges();
    expect([...el.querySelectorAll('.bloco-titulo')].map((h) => h.textContent!.trim())).toEqual(['Brilho e festa', 'Adesivos', 'Papelaria', 'Prender e furar', 'Natureza', 'TV e computador']);
    click('Purpurina');
    expect(host.decors().map((m) => m.decor)).toEqual(['teia', 'purpurina']);
    expect([...el.querySelectorAll('.assunto.usada')].map((b) => b.textContent!.trim())).toEqual(['Brilho e festa', 'Natureza']);
    // a Estampa continua com os assuntos dela
    await open('estampa');
    expect(chips()[1].textContent!.trim()).toBe('Papelaria');
  });

  it('a tinta da estampa e do lápis: Automática, Preta ou Branca; apagada sem a camada', async () => {
    const tones = () => [...el.querySelectorAll<HTMLButtonElement>('.tinta .assunto')];
    const pick = (label: string) => {
      tones().find((b) => b.textContent!.trim() === label)!.click();
      fixture.detectChanges();
    };
    await open('estampa');
    expect(tones().map((b) => b.textContent!.trim())).toEqual(['Automática', 'Preta', 'Branca']);
    expect(tones().every((b) => b.disabled)).toBeTrue();
    host.pattern.set('gatinhos');
    fixture.detectChanges();
    pick('Branca');
    expect(host.patternLook().tone).toBe('branco');
    expect(el.querySelector('.tinta .giz')!.textContent).toContain('Branca');
    expect(tones()[2].getAttribute('aria-checked')).toBe('true');
    expect(tones()[2].getAttribute('role')).toBe('radio');
    pick('Automática');
    expect('tone' in host.patternLook()).toBeFalse();
    await open('rabisco');
    host.scribble.set('novelo');
    fixture.detectChanges();
    pick('Preta');
    expect(host.scribbleTone()).toBe('preto');
    pick('Automática');
    expect(host.scribbleTone()).toBeNull();
  });

  it('com o botão solto fora da régua de assuntos, passar o mouse por cima não arrasta', async () => {
    await open('estampa');
    const strip = el.querySelector<HTMLElement>('.assuntos')!;
    const ev = (type: string, x: number, buttons: number) =>
      strip.dispatchEvent(new PointerEvent(type, { pointerId: 1, pointerType: 'mouse', button: 0, buttons, clientX: x, bubbles: true }));
    strip.scrollLeft = 0;
    // apertou num assunto e soltou fora da régua sem ter andado 5px: o pointerup não chega aqui
    ev('pointerdown', 100, 1);
    ev('pointermove', 102, 1);
    // depois, o mouse só passa por cima, sem botão
    ev('pointermove', 40, 0);
    ev('pointermove', 10, 0);
    expect(strip.classList.contains('arrastando')).toBeFalse();
    expect(strip.scrollLeft).toBe(0);
  });
});

@Component({
  imports: [CardKit],
  template: `
    @for (k of kits; track k) {
      <app-card-kit
        [id]="k"
        pinColor="vermelho"
        [(stock)]="stocks[$index]"
        [(paper)]="paper"
        [(paperSeed)]="paperSeed"
        [(pattern)]="pattern"
        [(patternLook)]="patternLook"
        [(patternSeed)]="patternSeed"
        [(scribble)]="scribble"
        [(scribbleSeed)]="scribbleSeed"
        [(scribbleInk)]="scribbleInk"
        [(scribbleTone)]="scribbleTone"
        [(damage)]="damage"
        [(damageSeed)]="damageSeed"
        [(wear)]="wear"
        [(wearSeed)]="wearSeed"
    [(wear)]="wear"
    [(wearSeed)]="wearSeed"
        [(stains)]="stains"
        [(decors)]="decors"
      />
    }
  `,
})
class TwoKits {
  kits = ['r-um', 'r-dois'];
  stocks = [signal<Stock>('amarelo'), signal<Stock>('azul')];
  paper = signal<Paper>('cartolina');
  paperSeed = signal<number | null>(null);
  pattern = signal<Pattern | null>(null);
  patternLook = signal<PatternLook>(DEFAULT_LOOK);
  patternSeed = signal<number | null>(null);
  scribble = signal<Scribble | null>(null);
  scribbleSeed = signal<number | null>(null);
  scribbleInk = signal(DEFAULT_SCRIBBLE_INK);
  scribbleTone = signal<InkTone | null>(null);
  damage = signal<Damage | null>(null);
  damageSeed = signal<number | null>(null);
  wear = signal<Damage | null>(null);
  wearSeed = signal<number | null>(null);
  stains = signal<StainMark[]>([]);
  decors = signal<DecorMark[]>([]);
}

describe('CardKit: dois estojos na mesma página', () => {
  it('cada um com os seus ids e grupos de rádio: marcar a cor num não desmarca a do outro', async () => {
    TestBed.configureTestingModule({ imports: [TwoKits], providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(TwoKits);
    fixture.detectChanges();
    await fixture.whenStable();
    const [a, b] = Array.from(fixture.nativeElement.querySelectorAll('app-card-kit')) as HTMLElement[];
    // os ids não se repetem na página, e cada aba aponta para o painel do próprio estojo
    const ids = Array.from(fixture.nativeElement.querySelectorAll('app-card-kit [role="tab"], app-card-kit [role="tabpanel"]') as NodeListOf<HTMLElement>).map((e) => e.id);
    expect(ids.length).toBe(16);
    expect(new Set(ids).size).toBe(ids.length);
    for (const kit of [a, b]) {
      const tab = kit.querySelector<HTMLElement>('[role="tab"]')!;
      expect(kit.querySelector(`#${tab.getAttribute('aria-controls')}`)).not.toBeNull();
    }
    const radio = (kit: HTMLElement, cor: string) => kit.querySelector<HTMLInputElement>(`input[type="radio"][value="${cor}"]`)!;
    expect(radio(a, 'amarelo').name).not.toBe(radio(b, 'amarelo').name);
    expect(radio(b, 'azul').checked).toBeTrue();
    radio(a, 'verde').click();
    fixture.detectChanges();
    expect(fixture.componentInstance.stocks[0]()).toBe('verde');
    expect(radio(b, 'azul').checked).toBeTrue();
    expect(fixture.componentInstance.stocks[1]()).toBe('azul');
  });
});
