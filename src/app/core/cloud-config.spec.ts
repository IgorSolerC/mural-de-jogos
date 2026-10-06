import { parseCloudConfig } from './cloud-config';

describe('cloud.json', () => {
  const ok = { ativo: true, api: 'https://mural-api.igorsoler.workers.dev/', googleClientId: '123-abc.apps.googleusercontent.com' };

  it('ligado: devolve o endereço sem barra no fim e o Client ID', () => {
    expect(parseCloudConfig(ok, false)).toEqual({
      api: 'https://mural-api.igorsoler.workers.dev',
      googleClientId: '123-abc.apps.googleusercontent.com',
    });
  });

  it('desligado: nada de nuvem, a não ser no ng serve', () => {
    expect(parseCloudConfig({ ...ok, ativo: false }, false)).toBeNull();
    expect(parseCloudConfig({ ...ok, ativo: false }, true)).not.toBeNull();
  });

  it('recusa endereço sem https, Client ID estranho ou arquivo quebrado', () => {
    expect(parseCloudConfig({ ...ok, api: 'http://mural-api.igorsoler.workers.dev' }, false)).toBeNull();
    expect(parseCloudConfig({ ...ok, api: 'https://exemplo.com/caminho' }, false)).toBeNull();
    expect(parseCloudConfig({ ...ok, googleClientId: 'qualquer-coisa' }, false)).toBeNull();
    expect(parseCloudConfig(null, false)).toBeNull();
    expect(parseCloudConfig('ativo', false)).toBeNull();
  });

  it('localhost só vale no ng serve', () => {
    expect(parseCloudConfig({ ...ok, api: 'http://localhost:8787' }, true)?.api).toBe('http://localhost:8787');
    expect(parseCloudConfig({ ...ok, api: 'http://localhost:8787' }, false)).toBeNull();
  });
});
