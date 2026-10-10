import { saveKeys } from './erase-save';

function fakeStorage(keys: string[]): Pick<Storage, 'length' | 'key'> {
  return { length: keys.length, key: (i: number) => keys[i] ?? null };
}

describe('saveKeys', () => {
  it('leva tudo o que é do mural e deixa os ajustes', () => {
    const keys = saveKeys(
      fakeStorage([
        'mural-de-jogos:resenhas:v1',
        'mural-de-jogos:resenhas:v1:corrompido',
        'mural-de-jogos:config:v1',
        'mural-de-jogos:muraldle:v1',
        'meu-mural:colega-aberto',
        'meu-mural:nuvem:sessao',
        'meu-mural:nuvem:conta',
        'meu-mural:novidades',
        'outro-site:coisa',
      ]),
    );
    expect(keys).toEqual([
      'mural-de-jogos:resenhas:v1',
      'mural-de-jogos:resenhas:v1:corrompido',
      'mural-de-jogos:muraldle:v1',
      'meu-mural:colega-aberto',
    ]);
  });
});
