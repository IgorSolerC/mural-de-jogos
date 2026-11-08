import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { POMODORO_SKINS, PomodoroSkin } from '../core/pomodoro';
import { PomodoroDial } from './pomodoro-dial';

const MIN = 60_000;

describe('o mostrador do Pomodoro (as 12 skins)', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [PomodoroDial], providers: [provideZonelessChangeDetection()] }));

  async function dial(skin: PomodoroSkin, inputs: { ms?: number; total?: number; phase?: 'estudo' | 'pausa'; paused?: boolean; idle?: boolean } = {}) {
    const f = TestBed.createComponent(PomodoroDial);
    f.componentRef.setInput('skin', skin);
    f.componentRef.setInput('ms', inputs.ms ?? 18 * MIN + 42_000);
    f.componentRef.setInput('total', inputs.total ?? 25 * MIN);
    if (inputs.phase) f.componentRef.setInput('phase', inputs.phase);
    if (inputs.paused) f.componentRef.setInput('paused', true);
    if (inputs.idle) f.componentRef.setInput('idle', true);
    await f.whenStable();
    return { f, host: f.nativeElement as HTMLElement };
  }

  it('são pelo menos dez, e cada uma tem o próprio desenho', async () => {
    expect(POMODORO_SKINS.length).toBeGreaterThanOrEqual(10);
    const roots = new Set<string>();
    for (const k of POMODORO_SKINS) {
      const { host } = await dial(k.value);
      expect(host.classList).withContext(k.value).toContain('d-' + k.value);
      const root = host.firstElementChild as HTMLElement;
      roots.add(root.className);
      expect(root.getBoundingClientRect().width).withContext(`${k.value}: tem tamanho`).toBeGreaterThan(40);
    }
    expect(roots.size).toBe(POMODORO_SKINS.length);
  });

  it('todas mostram o tempo e a fase', async () => {
    for (const k of POMODORO_SKINS) {
      const { host } = await dial(k.value, { phase: 'pausa' });
      expect(host.dataset['tempo']).withContext(k.value).toBe('18:42');
      const text = host.textContent!.replace(/\s+/g, '');
      // os sete segmentos (neon, relógio de pulso) desenham os algarismos; as outras os escrevem
      if (k.value === 'placar') expect([...host.querySelectorAll('.cela > .cima .letra')].map((l) => l.textContent).join('')).toBe('1842');
      else if (k.value !== 'neon' && k.value !== 'lcd') expect(text).withContext(`${k.value}: o tempo escrito`).toContain('18:42');
      else expect(host.querySelectorAll('svg.seg').length).withContext(`${k.value}: os algarismos`).toBe(4);
      expect(host.textContent).withContext(`${k.value}: a fase em palavra`).toMatch(/pausa/i);
      expect(host.classList).toContain('pausa');
    }
  });

  it('o andamento vai de 0 a 1 e desligado é zero', async () => {
    const { host, f } = await dial('disco', { ms: 20 * MIN, total: 25 * MIN });
    expect(host.style.getPropertyValue('--p')).toBe('0.2');
    f.componentRef.setInput('idle', true);
    await f.whenStable();
    expect(host.style.getPropertyValue('--p')).toBe('0');
  });

  it('pausado e desligado não giram; andando, sim', async () => {
    const a = await dial('cassete');
    expect(a.host.classList).not.toContain('parado');
    const b = await dial('cassete', { paused: true });
    expect(b.host.classList).toContain('parado');
    expect(b.host.classList).toContain('pausado');
    expect(b.host.textContent).toContain('parado');
    const c = await dial('vinil', { idle: true });
    expect(c.host.classList).toContain('parado');
  });

  it('a plaquinha do placar que mudou vira; a que ficou igual, não', async () => {
    const { f, host } = await dial('placar', { ms: 18 * MIN + 42_000 });
    expect(host.querySelectorAll('.cai').length).toBe(0);
    f.componentRef.setInput('ms', 18 * MIN + 41_000);
    await f.whenStable();
    expect(host.querySelectorAll('.cai').length).toBe(1);
  });

  it('é só desenho para o leitor de tela (quem o põe na tela diz o tempo)', async () => {
    const { host } = await dial('tomate');
    expect(host.getAttribute('aria-hidden')).toBe('true');
  });
});
