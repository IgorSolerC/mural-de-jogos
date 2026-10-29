import { tirarServiceWorkers } from './sem-service-worker';

describe('nenhum service worker no cofre', () => {
  it('tira todos os que houver e diz se a página estava nas mãos de um', async () => {
    const tirados: number[] = [];
    const registro = (n: number) => ({ unregister: async () => (tirados.push(n), true) });
    expect(await tirarServiceWorkers({ controller: {}, getRegistrations: async () => [registro(1), registro(2)] })).toEqual({ tirados: 2, controlada: true });
    expect(tirados).toEqual([1, 2]);
    expect(await tirarServiceWorkers({ controller: null, getRegistrations: async () => [] })).toEqual({ tirados: 0, controlada: false });
  });

  it('sem service worker no navegador, ou se ele falhar, segue sem quebrar', async () => {
    expect(await tirarServiceWorkers(undefined)).toEqual({ tirados: 0, controlada: false });
    expect(await tirarServiceWorkers({ controller: null, getRegistrations: () => Promise.reject(new Error('x')) })).toEqual({ tirados: 0, controlada: false });
  });

  it('um que não sai (o unregister recusado) ainda conta: a porta pede para recarregar', async () => {
    const tirados: number[] = [];
    const recusa = { unregister: () => Promise.reject(new Error('não saiu')) };
    const sai = { unregister: async () => (tirados.push(2), true) };
    expect(await tirarServiceWorkers({ controller: null, getRegistrations: async () => [recusa, sai] })).toEqual({ tirados: 2, controlada: false });
    // o outro sai mesmo assim
    expect(tirados).toEqual([2]);
  });
});
