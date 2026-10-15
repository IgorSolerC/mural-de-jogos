import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { setSoundVolume, settleSoundVolume, soundVolume } from '../core/volume';
import { VolumeKnob } from './volume-knob';

/** O aviso de que a tira abriu (ou fechou) chega depois do toque, numa tarefa à parte. */
const toggled = () => new Promise((r) => setTimeout(r, 0));

describe('o botão de volume', () => {
  let before: number;
  beforeEach(() => {
    before = soundVolume();
    setSoundVolume(1);
    settleSoundVolume();
  });
  afterEach(() => {
    setSoundVolume(before);
    settleSoundVolume();
  });

  it('abre a tira do volume, que muda o volume de todo som do site e cala no alto-falante', async () => {
    TestBed.configureTestingModule({ imports: [VolumeKnob], providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(VolumeKnob);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const knob = el.querySelector<HTMLButtonElement>('.botao')!;
    expect(knob.getAttribute('aria-label')).toBe('Volume: 100%');
    const panel = el.querySelector<HTMLElement>('.folha')!;
    expect(panel.matches(':popover-open')).toBeFalse();
    knob.click();
    await toggled();
    await fixture.whenStable();
    expect(panel.matches(':popover-open')).toBeTrue();
    expect(el.classList).toContain('aberto');

    const bar = panel.querySelector<HTMLInputElement>('input[type=range]')!;
    expect(bar.getAttribute('aria-label')).toBe('Volume de todo som do site');
    bar.value = '40';
    bar.dispatchEvent(new Event('input'));
    bar.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    expect(soundVolume()).toBe(0.4);
    expect(knob.getAttribute('aria-label')).toBe('Volume: 40%');
    expect(panel.querySelector('.numero')?.textContent).toBe('40%');

    const mute = panel.querySelector<HTMLButtonElement>('.calar')!;
    mute.click();
    await fixture.whenStable();
    expect(soundVolume()).toBe(0);
    expect(mute.getAttribute('aria-pressed')).toBe('true');
    expect(mute.getAttribute('aria-label')).toBe('Voltar o som');
    mute.click();
    await fixture.whenStable();
    expect(soundVolume()).toBe(0.4);

    panel.hidePopover();
    await toggled();
    await fixture.whenStable();
    expect(el.classList).not.toContain('aberto');
  });

  it('a tira fica dentro da tela, embaixo do botão', async () => {
    TestBed.configureTestingModule({ imports: [VolumeKnob], providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(VolumeKnob);
    const el = fixture.nativeElement as HTMLElement;
    // o botão encostado na beirada esquerda: a tira não sai da tela
    el.style.cssText = 'position: fixed; top: 20px; left: 0; opacity: 1; visibility: visible';
    await fixture.whenStable();
    el.querySelector<HTMLButtonElement>('.botao')!.click();
    await toggled();
    await fixture.whenStable();
    expect(el.querySelector('.folha.posta')).not.toBeNull();
    const panel = el.querySelector<HTMLElement>('.folha')!.getBoundingClientRect();
    const knob = el.querySelector('.botao')!.getBoundingClientRect();
    expect(panel.left).toBeGreaterThanOrEqual(7);
    expect(panel.top).toBeGreaterThan(knob.bottom);
    el.querySelector<HTMLElement>('.folha')!.hidePopover();
  });

  it('o broche desenha o volume: duas ondas no alto, a de fora clarinha no baixo, um X calado', async () => {
    TestBed.configureTestingModule({ imports: [VolumeKnob], providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(VolumeKnob);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const face = () => el.querySelector('.botao .face .falante')!;
    expect(face().querySelectorAll('.pena').length).toBe(2);
    expect(face().querySelector('.fraca')).toBeNull();

    setSoundVolume(0.3);
    await fixture.whenStable();
    expect(face().querySelectorAll('.pena').length).toBe(2);
    expect(face().querySelectorAll('.pena.fraca').length).toBe(1);

    setSoundVolume(0);
    await fixture.whenStable();
    expect(face().querySelectorAll('.pena').length).toBe(1);
    // o botão de calar da tira usa o mesmo desenho
    expect(el.querySelector('.calar .falante .pena')?.getAttribute('d')).toBe(face().querySelector('.pena')!.getAttribute('d'));

    // o desenho fica no meio do broche, com a mesma folga dos dois lados (o broche à mostra, sem a
    // escala de quando está escondido)
    el.style.cssText = 'opacity: 1; visibility: visible; scale: 1; transition: none';
    const f = el.querySelector('.botao .face')!.getBoundingClientRect();
    const s = face().getBoundingClientRect();
    // (o meio pixel para cima, girado com o broche, anda 0,5 × sen 8° ≈ 0,07 px de lado)
    expect(Math.abs(s.left + s.width / 2 - (f.left + f.width / 2))).toBeLessThan(0.1);
    expect(getComputedStyle(face()).width).toBe('18px');
  });
});
