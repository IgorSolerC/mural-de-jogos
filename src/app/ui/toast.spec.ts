import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { Toasts } from './toast';

describe('Toasts.copy', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] }));

  it('copiou: o bilhete de feito', async () => {
    const write = spyOn(navigator.clipboard, 'writeText').and.resolveTo();
    const toasts = TestBed.inject(Toasts);
    await toasts.copy('ABC123', 'Código copiado', 'Não deu para copiar. O seu código é ABC123');
    expect(write).toHaveBeenCalledWith('ABC123');
    expect(toasts.current()?.text).toBe('Código copiado');
    toasts.dismiss();
  });

  it('o navegador não deixou: o bilhete de falha', async () => {
    spyOn(navigator.clipboard, 'writeText').and.rejectWith(new Error('NotAllowedError'));
    const toasts = TestBed.inject(Toasts);
    await toasts.copy('ABC123', 'Código copiado', 'Não deu para copiar. O seu código é ABC123');
    expect(toasts.current()?.text).toBe('Não deu para copiar. O seu código é ABC123');
    toasts.dismiss();
  });
});
