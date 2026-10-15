import { setSoundVolume, settleSoundVolume, soundVolume, toggleMute } from './volume';

const KEY = 'meu-mural:volume';

describe('o volume do site', () => {
  let before: string | null;
  beforeEach(() => {
    before = localStorage.getItem(KEY);
    setSoundVolume(1);
    settleSoundVolume();
  });
  afterEach(() => {
    setSoundVolume(1);
    settleSoundVolume();
    if (before === null) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, before);
  });

  it('vai de 0 a 1 e fica guardado neste aparelho', () => {
    setSoundVolume(0.4);
    expect(soundVolume()).toBe(0.4);
    expect(JSON.parse(localStorage.getItem(KEY)!).v).toBe(0.4);
    setSoundVolume(3);
    expect(soundVolume()).toBe(1);
    setSoundVolume(-1);
    expect(soundVolume()).toBe(0);
    setSoundVolume(Number.NaN);
    expect(soundVolume()).toBe(1);
  });

  it('o alto-falante cala e volta ao volume de antes', () => {
    setSoundVolume(0.35);
    toggleMute();
    expect(soundVolume()).toBe(0);
    toggleMute();
    expect(soundVolume()).toBe(0.35);
  });

  it('arrastado até o zero, o alto-falante volta para onde a barra foi solta antes, não para os miúdos do caminho', () => {
    setSoundVolume(0.6);
    settleSoundVolume();
    // o arrasto passa por todos os números até o zero
    for (const v of [0.5, 0.3, 0.1, 0.02, 0]) setSoundVolume(v);
    settleSoundVolume();
    expect(soundVolume()).toBe(0);
    toggleMute();
    expect(soundVolume()).toBe(0.6);
  });
});
