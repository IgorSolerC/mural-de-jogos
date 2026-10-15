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
});
