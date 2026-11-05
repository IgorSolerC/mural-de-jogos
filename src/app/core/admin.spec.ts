import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { onlyAdmin } from './admin';
import { CloudAccount, CloudAccountInfo } from './cloud-account';
import { Cloud } from './cloud-config';

describe('a rota só da conta de admin', () => {
  function setup(options: { cloud?: boolean; signedIn?: boolean; account?: Partial<CloudAccountInfo> | null; refreshed?: Partial<CloudAccountInfo>; refreshFails?: boolean; ready?: Promise<void> }) {
    const account = signal<Partial<CloudAccountInfo> | null>(options.account === undefined ? { codigo: 'K7QF-M2XA', nome: 'Ana' } : options.account);
    const refresh = jasmine.createSpy('refresh').and.callFake(async () => {
      if (options.refreshFails) throw new Error('sem rede');
      if (options.refreshed) account.set(options.refreshed);
    });
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: Cloud, useValue: { ready: options.ready ?? Promise.resolve(), config: () => (options.cloud === false ? null : { api: 'https://api.teste' }) } },
        { provide: CloudAccount, useValue: { account, signedIn: () => options.signedIn !== false, refresh } },
      ],
    });
    const run = () =>
      TestBed.runInInjectionContext(() => onlyAdmin({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot)) as Promise<boolean | UrlTree>;
    return { run, refresh };
  }

  const toExtras = async (result: boolean | UrlTree) => {
    expect(result).toBeInstanceOf(UrlTree);
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/extras');
  };

  it('a conta de admin entra, sem pedir nada à nuvem', async () => {
    const t = setup({ account: { codigo: 'G11T-G00D', nome: 'Igor', admin: true } });
    expect(await t.run()).toBeTrue();
    expect(t.refresh).not.toHaveBeenCalled();
  });

  it('quem não está logado volta para Extras, sem pedir nada à nuvem', async () => {
    const t = setup({ signedIn: false, account: null });
    await toExtras(await t.run());
    expect(t.refresh).not.toHaveBeenCalled();
  });

  it('com a nuvem desligada, volta para Extras mesmo com a bandeira guardada', async () => {
    const t = setup({ cloud: false, account: { codigo: 'G11T-G00D', nome: 'Igor', admin: true } });
    await toExtras(await t.run());
  });

  it('outra conta confere com a nuvem e volta para Extras', async () => {
    const t = setup({ refreshed: { codigo: 'K7QF-M2XA', nome: 'Ana' } });
    await toExtras(await t.run());
    expect(t.refresh).toHaveBeenCalledTimes(1);
  });

  it('abrindo o link direto antes da primeira conferida: a conta guardada ainda sem a bandeira entra', async () => {
    const t = setup({ refreshed: { codigo: 'G11T-G00D', nome: 'Igor', admin: true } });
    expect(await t.run()).toBeTrue();
  });

  it('sem rede para conferir, volta para Extras', async () => {
    const t = setup({ refreshFails: true });
    await toExtras(await t.run());
  });

  it('espera o cloud.json antes de decidir (a armadilha dos Acessos)', async () => {
    let release!: () => void;
    const ready = new Promise<void>((resolve) => (release = resolve));
    const t = setup({ ready, account: { codigo: 'G11T-G00D', nome: 'Igor', admin: true } });
    let done = false;
    const running = t.run().then((r) => {
      done = true;
      return r;
    });
    await Promise.resolve();
    expect(done).toBeFalse();
    release();
    expect(await running).toBeTrue();
  });
});
