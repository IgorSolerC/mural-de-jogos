import { Type, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AudioTrack } from './audio-track';
import { Countdown } from './countdown';
import { GluedMedia } from './glued-media';
import { warmups } from './sound-warmup';

/**
 * A entrada `editavel` das peças (PLANO-EDITOR-VISUAL.md, rodada 5): no modo Visual, a peça selecionada
 * troca a legenda (ou o título) por um campo, no mesmo lugar. Sem ela, nada muda: a aparência aprovada
 * fica congelada (o mesmo texto, nos mesmos lugares, nenhum campo, o quadro do contador escondido do
 * leitor de tela como sempre). As fotos de antes e depois da rodada conferem os pixels.
 */
describe('as peças com a legenda e o título escritos direto (editavel)', () => {
  beforeEach(() => {
    warmups.enabled = false;
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  });
  afterEach(() => (warmups.enabled = true));

  async function make<T>(tipo: Type<T>, inputs: Record<string, unknown>): Promise<HTMLElement> {
    const f = TestBed.createComponent(tipo);
    for (const [k, v] of Object.entries(inputs)) f.componentRef.setInput(k, v);
    await f.whenStable();
    return f.nativeElement as HTMLElement;
  }
  const campos = (el: HTMLElement) => Array.from(el.querySelectorAll('input.campo-peca')) as HTMLInputElement[];

  it('a foto: sem editavel, a legenda na etiqueta e nenhum campo; com ele, o campo no lugar dela', async () => {
    const leitura = await make(GluedMedia, { kind: 'imagem', args: ['https://exemplo.invalid/a.jpg', 'Na praia'] });
    expect(campos(leitura)).toEqual([]);
    expect(leitura.querySelector('.etiqueta')!.textContent).toBe('Na praia');
    const sem = await make(GluedMedia, { kind: 'imagem', args: ['https://exemplo.invalid/a.jpg'] });
    expect(sem.querySelector('.etiqueta')).toBeNull();
    const escrita = await make(GluedMedia, { kind: 'imagem', args: ['https://exemplo.invalid/a.jpg', 'Na praia'], editavel: true });
    const [c] = campos(escrita);
    expect(c.value).toBe('Na praia');
    expect(c.closest('.etiqueta')).not.toBeNull();
    // sem legenda, o lugar dela com o convite
    const vazia = await make(GluedMedia, { kind: 'video', args: ['https://exemplo.invalid/v.mp4'], editavel: true });
    expect(campos(vazia)[0].placeholder).toBe('Escreva uma legenda');
    expect(campos(vazia)[0].getAttribute('aria-label')).toBe('Legenda do vídeo');
    const polaroide = await make(GluedMedia, { kind: 'imagem', args: ['https://exemplo.invalid/a.jpg', 'polaroid', 'Oi'] });
    expect(polaroide.querySelector('.legenda-polaroide')!.textContent).toBe('Oi');
    expect(campos(polaroide)).toEqual([]);
  });

  it('o contador: sem editavel, o título nos três jeitos e o quadro escondido do leitor de tela; com ele, o campo', async () => {
    for (const jeito of ['calendario', 'neon', 'placar']) {
      const leitura = await make(Countdown, { args: ['25/12/2030', jeito, 'Natal'] });
      expect(campos(leitura)).withContext(jeito).toEqual([]);
      const nome = leitura.querySelector('.nome, .placa-nome')!;
      expect(nome.textContent).withContext(jeito).toBe('Natal');
      expect(nome.closest('[aria-hidden]')?.getAttribute('aria-hidden')).withContext(jeito).toBe('true');
      const escrita = await make(Countdown, { args: ['25/12/2030', jeito, 'Natal'], editavel: true });
      const [c] = campos(escrita);
      expect(c.value).withContext(jeito).toBe('Natal');
      expect(c.closest('[aria-hidden="true"]')).withContext(jeito).toBeNull();
    }
    const semTitulo = await make(Countdown, { args: ['25/12/2030'], editavel: true });
    expect(campos(semTitulo)[0].placeholder).toBe('Escreva um título');
  });

  it('a faixa: sem editavel, o nome nos três jeitos; com ele, o campo (e o lugar dele sem nome)', async () => {
    const leitura = await make(AudioTrack, { args: ['https://exemplo.invalid/a.mp3', 'Faixa um'] });
    expect(campos(leitura)).toEqual([]);
    expect(leitura.querySelector('.etiqueta-nome')!.textContent).toBe('Faixa um');
    const simples = await make(AudioTrack, { args: ['https://exemplo.invalid/a.mp3', 'simples', 'Dois'] });
    expect(simples.querySelector('.tira-nome')!.textContent).toBe('Dois');
    const vinil = await make(AudioTrack, { args: ['https://exemplo.invalid/a.mp3', 'vinil'] });
    expect(vinil.querySelector('.capa-nome')!.textContent).toBe('Lado A');
    const sem = await make(AudioTrack, { args: ['https://exemplo.invalid/a.mp3'] });
    expect(sem.querySelector('.etiqueta-nome')).toBeNull();
    for (const jeito of ['fita', 'simples', 'vinil']) {
      const escrita = await make(AudioTrack, { args: ['https://exemplo.invalid/a.mp3', jeito], editavel: true });
      const [c] = campos(escrita);
      expect(c?.placeholder).withContext(jeito).toBe('Escreva o nome da faixa');
      expect(c.maxLength).withContext(jeito).toBe(80);
    }
  });
});
