import { EmbedBridge, EmbedReport } from './embed-bridge';

/** Um iframe vazio no lugar do player: o que vai para ele fica anotado, e ele "responde" por mensagem. */
function fakePlayer() {
  const frame = document.createElement('iframe');
  document.body.appendChild(frame);
  const win = frame.contentWindow!;
  const sent: unknown[] = [];
  spyOn(win, 'postMessage').and.callFake((msg: unknown) => void sent.push(typeof msg === 'string' ? JSON.parse(msg) : msg));
  const say = (data: unknown) => window.dispatchEvent(new MessageEvent('message', { data, source: win }));
  return { frame, sent, say, done: () => frame.remove() };
}

describe('a conversa com o player de fora', () => {
  it('YouTube: os pedidos esperam ele ficar pronto, só o último de cada tipo; o volume solta o som (ou cala, no zero)', () => {
    const p = fakePlayer();
    const got: EmbedReport[] = [];
    const b = new EmbedBridge('youtube', () => p.frame, (r) => got.push(r));
    b.send({ do: 'volume', v: 0.2 });
    b.send({ do: 'volume', v: 0.7 });
    b.send({ do: 'pause' });
    b.send({ do: 'play' });
    expect(p.sent).toEqual([]);
    p.say(JSON.stringify({ event: 'onReady' }));
    expect(got[0]).toEqual({ ready: true });
    const funcs = (p.sent as { func?: string; args?: unknown[] }[]).filter((m) => m.func && m.func !== 'addEventListener').map((m) => [m.func, ...(m.args ?? [])]);
    expect(funcs).toEqual([['unMute'], ['setVolume', 70], ['playVideo']]);
    p.sent.length = 0;
    b.send({ do: 'volume', v: 0 });
    expect((p.sent[0] as { func: string }).func).toBe('mute');
    b.destroy();
    p.done();
  });

  it('YouTube: o estado e o tempo que ele conta, traduzidos', () => {
    const p = fakePlayer();
    const got: EmbedReport[] = [];
    const b = new EmbedBridge('youtube', () => p.frame, (r) => got.push(r));
    p.say(JSON.stringify({ event: 'infoDelivery', info: { playerState: 1, currentTime: 12.5, duration: 200 } }));
    p.say(JSON.stringify({ event: 'onStateChange', info: 3 }));
    p.say(JSON.stringify({ event: 'onError', info: 150 }));
    expect(got).toEqual([{ state: 'playing', time: 12.5, duration: 200 }, { state: 'waiting' }, { error: true }]);
    b.destroy();
    p.done();
  });

  it('Vimeo: o "play" chega antes do som; tocando, só quando o tempo anda', () => {
    const p = fakePlayer();
    const got: EmbedReport[] = [];
    const b = new EmbedBridge('vimeo', () => p.frame, (r) => got.push(r));
    // o fim de um carregamento sem estar tocando não é tocar
    p.say({ event: 'bufferend' });
    p.say({ event: 'play', data: { seconds: 0, duration: 62 } });
    p.say({ event: 'timeupdate', data: { seconds: 0, duration: 62 } });
    p.say({ event: 'timeupdate', data: { seconds: 0.2, duration: 62 } });
    p.say({ event: 'bufferstart' });
    p.say({ event: 'bufferend' });
    p.say({ event: 'pause', data: { seconds: 0.4, duration: 62 } });
    expect(got.map((r) => r.state)).toEqual(['waiting', undefined, 'playing', 'waiting', 'playing', 'paused']);
    expect(got[2].time).toBe(0.2);
    b.destroy();
    p.done();
  });

  it('Vimeo: o volume vai como volume e mudo', () => {
    const p = fakePlayer();
    const b = new EmbedBridge('vimeo', () => p.frame, () => {});
    p.say({ event: 'ready' });
    p.sent.length = 0;
    b.send({ do: 'volume', v: 0.5 });
    b.send({ do: 'volume', v: 0 });
    expect(p.sent).toEqual([
      { method: 'setMuted', value: false },
      { method: 'setVolume', value: 0.5 },
      { method: 'setMuted', value: true },
    ]);
    b.destroy();
    p.done();
  });

  it('não ouve mensagem de outra janela', () => {
    const p = fakePlayer();
    const got: EmbedReport[] = [];
    const b = new EmbedBridge('youtube', () => p.frame, (r) => got.push(r));
    window.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ event: 'onReady' }), source: window }));
    expect(got).toEqual([]);
    expect(b.isReady).toBeFalse();
    b.destroy();
    p.done();
  });
});
