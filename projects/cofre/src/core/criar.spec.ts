import { deBase64url, type Bytes } from './bytes';
import { lerCodigo } from './codigo';
import { type AparelhoParaCriar, corpoDoAparelho, montarCofre } from './criar';
import { abrirCofre, abrirEnvelope, abrirRecuperacao, chaveDaSenha, decifrarManifesto, ErroCofre, KDF_PADRAO, provaDaSenha, provaDoCodigo, SOBRA_SELADO } from './crypto';
import type { PasskeyRegistrada } from './passkey';

const USUARIO = '0b7c6a2e-5d4f-4e3a-9b1c-2d3e4f5a6b7c';
const SENHA = 'cavalo-ponte-relogio-nuvem-pipoca-trevo';
const AGORA = new Date('2026-10-21T15:00:00Z');
const seq = (n: number, ini: number) => Uint8Array.from({ length: n }, (_, i) => (ini + i) & 255);
const b = (texto: string | undefined): Bytes => deBase64url(texto ?? '')!;

function passkey(prf: Bytes | null, n: number): PasskeyRegistrada {
  return {
    desafio: `6c1d2a6e-5d4f-4e3a-9b1c-2d3e4f5a6b7${n}`,
    credencial: { id: `credencial-${n}`, clientDataJSON: 'cdj', attestationObject: 'ao', transports: ['internal'] },
    prf,
    prfLigado: prf !== null,
  };
}

describe('montar o cofre novo', () => {
  it('tudo o que vai para a API abre de volta, com a senha e com cada passkey ou o código', async () => {
    const segredoPrf = seq(32, 100);
    const celular: AparelhoParaCriar = { passkey: passkey(segredoPrf.slice(), 1), apelido: 'Celular' };
    const pc: AparelhoParaCriar = { passkey: passkey(null, 2), apelido: 'PC' };
    const { corpo, codigo } = await montarCofre({ usuario: USUARIO, senha: SENHA, aparelhos: [celular, pc], aparelhoAgora: 'PC', agora: AGORA });

    expect(corpo.versao).toBe(1);
    expect(corpo.kdf).toEqual(KDF_PADRAO);
    expect(b(corpo.sal).length).toBe(16);
    expect(b(corpo.v).length).toBe(SOBRA_SELADO + 32);
    expect(b(corpo.kAuth).length).toBe(32);
    expect((b(corpo.manifesto).length - SOBRA_SELADO) % 512).toBe(0);

    // a senha e cada caminho até M
    const kSenha = await chaveDaSenha(SENHA, b(corpo.sal), corpo.kdf);
    const [celularNoCorpo, pcNoCorpo] = corpo.aparelhos;
    expect(celularNoCorpo).toEqual(jasmine.objectContaining({ desafio: celular.passkey.desafio, credencial: celular.passkey.credencial, apelido: 'Celular', prf: true }));
    expect('s' in celularNoCorpo!).toBe(false);
    const m = await abrirEnvelope(segredoPrf, USUARIO, celularNoCorpo!.envelopeId, b(celularNoCorpo!.envelope));
    expect(pcNoCorpo).toEqual(jasmine.objectContaining({ apelido: 'PC', prf: false }));
    expect(await abrirEnvelope(b(pcNoCorpo!.s), USUARIO, pcNoCorpo!.envelopeId, b(pcNoCorpo!.envelope))).toEqual(m);
    const bytesDoCodigo = await lerCodigo(codigo);
    expect(await abrirRecuperacao(bytesDoCodigo, USUARIO, b(corpo.recuperacao.envelope))).toEqual(m);
    expect(b(corpo.recuperacao.kRec)).toEqual(await provaDoCodigo(bytesDoCodigo));

    // com M e a senha: a prova, V e o manifesto vazio
    expect(b(corpo.kAuth)).toEqual(await provaDaSenha(kSenha, m));
    const chave = await abrirCofre(kSenha, m, USUARIO, b(corpo.v));
    expect(await decifrarManifesto(chave, USUARIO, 0, b(corpo.manifesto))).toEqual({ contador: 0, itens: {}, lixeira: {}, mudadoEm: AGORA.toISOString(), aparelho: 'PC' });

    // ids novos e todos diferentes
    const ids = [corpo.recuperacao.id, celularNoCorpo!.envelopeId, pcNoCorpo!.envelopeId];
    expect(new Set(ids).size).toBe(3);
    for (const id of ids) expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('o código tem 7 grupos de 4, e dois cofres nunca saem iguais', async () => {
    const um = await montarCofre({ usuario: USUARIO, senha: SENHA, aparelhos: [{ passkey: passkey(seq(32, 1), 1), apelido: 'Celular' }], aparelhoAgora: 'Celular' });
    const outro = await montarCofre({ usuario: USUARIO, senha: SENHA, aparelhos: [{ passkey: passkey(seq(32, 1), 1), apelido: 'Celular' }], aparelhoAgora: 'Celular' });
    expect(um.codigo).toMatch(/^([0-9A-Z]{4}-){6}[0-9A-Z]{4}$/);
    expect(um.codigo).not.toBe(outro.codigo);
    expect(um.corpo.sal).not.toBe(outro.corpo.sal);
    expect(um.corpo.aparelhos[0]!.envelope).not.toBe(outro.corpo.aparelhos[0]!.envelope);
  });

  it('o segredo do PRF da passkey é zerado depois de selado', async () => {
    const segredo = seq(32, 100);
    const p = passkey(segredo, 1);
    await montarCofre({ usuario: USUARIO, senha: SENHA, aparelhos: [{ passkey: p, apelido: 'Celular' }], aparelhoAgora: 'Celular' });
    expect(p.prf).toBeNull();
    expect(segredo.every((x) => x === 0)).toBe(true);
  });

  it('se der errado no meio, a passkey continua com o segredo do PRF (não cai para o modo servidor)', async () => {
    const segredo = seq(32, 100);
    const p = passkey(segredo, 1);
    await expectAsync(montarCofre({ usuario: USUARIO, senha: SENHA, aparelhos: [{ passkey: p, apelido: 'Celular' }], aparelhoAgora: 'x'.repeat(81) })).toBeRejectedWithError(ErroCofre);
    expect(p.prf).toEqual(seq(32, 100));
  });

  it('o S_i sorteado para um aparelho sem PRF é zerado também quando o envelope não sela', async () => {
    const sorteados: Uint8Array[] = [];
    const original = crypto.getRandomValues.bind(crypto);
    spyOn(crypto, 'getRandomValues').and.callFake(<T extends ArrayBufferView | null>(b: T): T => {
      if (b instanceof Uint8Array) sorteados.push(b);
      return original(b as ArrayBufferView) as unknown as T;
    });
    await expectAsync(corpoDoAparelho({ passkey: passkey(null, 1), apelido: 'PC' }, 'K7QFM2XA', seq(32, 1))).toBeRejectedWithError(ErroCofre);
    const segredos = sorteados.filter((s) => s.length === 32);
    expect(segredos.length).toBe(1);
    expect(segredos[0]!.every((x) => x === 0)).toBe(true);
  });

  it('recusa nenhum aparelho, três aparelhos, senha vazia e usuário fora do formato', async () => {
    const um = { passkey: passkey(null, 1), apelido: 'PC' };
    for (const pedido of [
      { usuario: USUARIO, senha: SENHA, aparelhos: [] },
      { usuario: USUARIO, senha: SENHA, aparelhos: [um, um, um] },
      { usuario: USUARIO, senha: '', aparelhos: [um] },
      { usuario: 'K7QFM2XA', senha: SENHA, aparelhos: [um] },
    ]) {
      await expectAsync(montarCofre({ ...pedido, aparelhoAgora: 'PC' })).toBeRejectedWithError(ErroCofre);
    }
  });
});
