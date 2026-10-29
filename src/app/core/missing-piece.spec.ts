import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MISSING_OFFLINE, MISSING_ONLINE, MuralErrorHandler, isMissingPiece, reachable } from './missing-piece';
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
      online = jasmine.createSpy('online').and.resolveTo(true);
      handler.online = online;
      spyOn(console, 'error');
    });

    afterEach(() => toasts.dismiss());

    /** O bilhete sai depois de conferir a internet. */
    const settle = () => new Promise((resolve) => setTimeout(resolve));

    it('com internet, diz que saiu uma versão nova e recarrega no botão', async () => {
      handler.reload = jasmine.createSpy('reload');
      handler.handleError(new Error('NG0750'));
      await settle();
      const t = toasts.current();
      expect(t?.text).toBe(MISSING_ONLINE);
      expect(t?.action?.label).toBe('Recarregar');
      t!.action!.run();
      expect(handler.reload).toHaveBeenCalled();
      // o erro continua no console, como sempre
      expect(console.error).toHaveBeenCalled();
    });

    it('sem internet, só explica (recarregar não traria o pedaço)', async () => {
      online.and.resolveTo(false);
      handler.handleError(new TypeError('Failed to fetch dynamically imported module: chunk-X.js'));
      await settle();
      expect(toasts.current()?.text).toBe(MISSING_OFFLINE);
      expect(toasts.current()?.action).toBeUndefined();
    });

    it('a conferência que falha conta como sem internet', async () => {
      online.and.rejectWith(new Error('x'));
      handler.handleError(new Error('NG0750'));
      await settle();
      expect(toasts.current()?.text).toBe(MISSING_OFFLINE);
    });

    it('os outros erros não mostram bilhete nem vão à rede', async () => {
      handler.handleError(new Error('outra coisa'));
      await settle();
      expect(toasts.current()).toBeNull();
      expect(online).not.toHaveBeenCalled();
      expect(console.error).toHaveBeenCalled();
    });
  });

  describe('há internet de verdade?', () => {
    let onLine: jasmine.Spy;
    beforeEach(() => (onLine = spyOnProperty(Object.getPrototypeOf(navigator), 'onLine', 'get').and.returnValue(true)));

    it('o navegador sem rede nem tenta', async () => {
      onLine.and.returnValue(false);
      const fetchSpy = spyOn(window, 'fetch');
      expect(await reachable()).toBeFalse();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('a rede sem saída (onLine diz que sim, o pedido falha) é sem internet, e o pedido não passa pelo cache', async () => {
      const fetchSpy = spyOn(window, 'fetch').and.rejectWith(new TypeError('Failed to fetch'));
      expect(await reachable()).toBeFalse();
      expect(fetchSpy).toHaveBeenCalledWith('./', { method: 'HEAD', cache: 'no-store' });
    });

    it('qualquer resposta é internet', async () => {
      spyOn(window, 'fetch').and.resolveTo(new Response(null, { status: 404 }));
      expect(await reachable()).toBeTrue();
    });
  });
});
