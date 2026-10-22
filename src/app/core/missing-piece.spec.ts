import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MISSING_OFFLINE, MISSING_ONLINE, MuralErrorHandler, isMissingPiece } from './missing-piece';
import { Toasts } from '../ui/toast';

describe('pedaço do site que não chegou', () => {
  it('reconhece o @defer que não carregou e o import que falhou em cada navegador', () => {
    expect(isMissingPiece(new Error('NG0750'))).toBeTrue();
    expect(isMissingPiece(new Error('NG0750: Loading dependencies for `@defer` block failed'))).toBeTrue();
    expect(isMissingPiece(new TypeError('Failed to fetch dynamically imported module: https://murall.igorsc.com.br/chunk-CP4QBDQH.js'))).toBeTrue();
    expect(isMissingPiece(new TypeError('error loading dynamically imported module: https://murall.igorsc.com.br/chunk-CP4QBDQH.js'))).toBeTrue();
    expect(isMissingPiece(new TypeError('Importing a module script failed.'))).toBeTrue();
  });

  it('olha a causa do erro, e não confunde com os outros', () => {
    expect(isMissingPiece(new Error('a navegação falhou', { cause: new TypeError('Importing a module script failed.') }))).toBeTrue();
    expect(isMissingPiece(new Error('Cannot read properties of undefined'))).toBeFalse();
    expect(isMissingPiece(new TypeError('Failed to fetch'))).toBeFalse();
    expect(isMissingPiece(null)).toBeFalse();
    expect(isMissingPiece({ message: 'NG0750' })).toBeFalse();
  });

  describe('o bilhete', () => {
    let handler: MuralErrorHandler;
    let toasts: Toasts;
    let online: jasmine.Spy;

    beforeEach(() => {
      TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), MuralErrorHandler] });
      handler = TestBed.inject(MuralErrorHandler);
      toasts = TestBed.inject(Toasts);
      online = spyOnProperty(Object.getPrototypeOf(navigator), 'onLine', 'get').and.returnValue(true);
      spyOn(console, 'error');
    });

    afterEach(() => toasts.dismiss());

    it('com internet, diz que saiu uma versão nova e recarrega no botão', () => {
      handler.reload = jasmine.createSpy('reload');
      handler.handleError(new Error('NG0750'));
      const t = toasts.current();
      expect(t?.text).toBe(MISSING_ONLINE);
      expect(t?.action?.label).toBe('Recarregar');
      t!.action!.run();
      expect(handler.reload).toHaveBeenCalled();
      // o erro continua no console, como sempre
      expect(console.error).toHaveBeenCalled();
    });

    it('sem internet, só explica (recarregar não traria o pedaço)', () => {
      online.and.returnValue(false);
      handler.handleError(new TypeError('Failed to fetch dynamically imported module: chunk-X.js'));
      expect(toasts.current()?.text).toBe(MISSING_OFFLINE);
      expect(toasts.current()?.action).toBeUndefined();
    });

    it('os outros erros não mostram bilhete', () => {
      handler.handleError(new Error('outra coisa'));
      expect(toasts.current()).toBeNull();
      expect(console.error).toHaveBeenCalled();
    });
  });
});
