import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AreaDeTransferencia, avisoDaCopia, CHAVE_DA_LIMPEZA, LIMPAR_COPIA_MS } from './area-de-transferencia';
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

/** Trancar recarrega a página: um serviço novo, com o mesmo sessionStorage da aba. */
function recarregar() {
  TestBed.resetTestingModule();
  return montar();
}

describe('a área de transferência do cofre', () => {
  beforeEach(() => {
    sessionStorage.removeItem(CHAVE_DA_LIMPEZA);
    jasmine.clock().install();
    jasmine.clock().mockDate(new Date(2026, 9, 22, 12, 0, 0));
  });
  afterEach(() => {
    jasmine.clock().uninstall();
    TestBed.resetTestingModule();
    sessionStorage.removeItem(CHAVE_DA_LIMPEZA);
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
    expect(sessionStorage.getItem(CHAVE_DA_LIMPEZA)).toBeNull();
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

  it('guarda só a hora da limpeza, nunca o que foi copiado', async () => {
    const { area } = montar();
    await area.copiar('segredo-muito-secreto');
    expect(sessionStorage.getItem(CHAVE_DA_LIMPEZA)).toBe(String(Date.now() + LIMPAR_COPIA_MS));
  });

  it('o cofre trancou (a página recarregou) longe dele: a página nova limpa quando volta ao foco', async () => {
    const antes = montar();
    await antes.area.copiar('senha');
    antes.foco(false);
    jasmine.clock().tick(LIMPAR_COPIA_MS + 60_000);
    await Promise.resolve();
    expect(antes.escritas).toEqual(['senha']);

    const depois = recarregar();
    depois.foco(false);
    jasmine.clock().tick(0);
    await Promise.resolve();
    expect(depois.area.temLimpezaPendente).toBe(true);
    depois.foco(true);
    window.dispatchEvent(new Event('focus'));
    await Promise.resolve();
    await Promise.resolve();
    expect(depois.escritas).toEqual(['']);
    expect(sessionStorage.getItem(CHAVE_DA_LIMPEZA)).toBeNull();
  });

  it('trancou antes dos 30 segundos: a página nova espera o resto da conta', async () => {
    const antes = montar();
    await antes.area.copiar('senha');
    jasmine.clock().tick(10_000);
    const depois = recarregar();
    jasmine.clock().tick(LIMPAR_COPIA_MS - 10_000 - 1);
    expect(depois.escritas).toEqual([]);
    jasmine.clock().tick(1);
    await Promise.resolve();
    expect(depois.escritas).toEqual(['']);
  });

  it('o bilhete diz o que é verdade, e só fala do Win+V no Windows', () => {
    const windows = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/141.0';
    expect(avisoDaCopia('User', windows)).toBe('User copiado. Sai do Ctrl+V depois de 30 s, quando o cofre estiver na frente. O histórico do Win+V guarda uma cópia.');
    expect(avisoDaCopia('Senha anterior', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe('Senha anterior copiada. Sai do Ctrl+V depois de 30 s, quando o cofre estiver na frente.');
  });
});
