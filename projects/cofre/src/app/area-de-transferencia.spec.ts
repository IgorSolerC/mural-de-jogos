import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AreaDeTransferencia, LIMPAR_COPIA_MS } from './area-de-transferencia';
import { type Pagina, SERVICOS, type Servicos } from './servicos';

function montar() {
  const escritas: string[] = [];
  let comFoco = true;
  const pagina = {
    copiar: async (t: string) => {
      if (!comFoco) throw new DOMException('Document is not focused.', 'NotAllowedError');
      escritas.push(t);
    },
  } as unknown as Pagina;
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), { provide: SERVICOS, useValue: { pagina } as Servicos }] });
  return { area: TestBed.inject(AreaDeTransferencia), escritas, foco: (f: boolean) => (comFoco = f) };
}

describe('a área de transferência do cofre', () => {
  beforeEach(() => jasmine.clock().install());
  afterEach(() => {
    jasmine.clock().uninstall();
    TestBed.resetTestingModule();
  });

  it('limpa 30 segundos depois de copiar; copiar de novo recomeça a conta', async () => {
    const { area, escritas } = montar();
    await area.copiar('senha-1');
    jasmine.clock().tick(LIMPAR_COPIA_MS - 1000);
    await area.copiar('senha-2');
    jasmine.clock().tick(LIMPAR_COPIA_MS - 1000);
    expect(escritas).toEqual(['senha-1', 'senha-2']);
    jasmine.clock().tick(1000);
    await Promise.resolve();
    expect(escritas).toEqual(['senha-1', 'senha-2', '']);
  });

  it('sem foco na hora (a pessoa foi colar em outro app), limpa quando a página volta ao foco', async () => {
    const { area, escritas, foco } = montar();
    await area.copiar('senha');
    foco(false);
    jasmine.clock().tick(LIMPAR_COPIA_MS);
    await Promise.resolve();
    expect(area.temLimpezaPendente).toBe(true);
    foco(true);
    window.dispatchEvent(new Event('focus'));
    await Promise.resolve();
    await Promise.resolve();
    expect(escritas).toEqual(['senha', '']);
    expect(area.temLimpezaPendente).toBe(false);
  });
});
