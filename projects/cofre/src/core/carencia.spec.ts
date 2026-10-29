import { type Abertura, ApiCofre, type CorpoDaCarencia, type EntradaPelaCarencia } from './api';
import { deBase64url, paraBase64url } from './bytes';
import { abrirPelaCarencia, armarioDoAparelho, type Carencia, esquecerCarencia, guardarCarencia, lerCarencia, prepararCarencia } from './carencia';
import type { Guarda } from './entrar';
import { abrirEnvelope, chaveDaSenha, cifrarManifesto, criarCofre, ErroCofre, KDF_PADRAO, novaChaveDoMeio, novoSal, provaDaSenha } from './crypto';

const USUARIO = '0b7c6a2e-5d4f-4e3a-9b1c-2d3e4f5a6b7c';
const OUTRA = '1b7c6a2e-5d4f-4e3a-9b1c-2d3e4f5a6b7c';
const AGORA = Date.parse('2026-10-29T12:00:00.000Z');

function armario(): Guarda & { mapa: Map<string, string> } {
  const mapa = new Map<string, string>();
  return { mapa, getItem: (c) => mapa.get(c) ?? null, setItem: (c, v) => void mapa.set(c, v), removeItem: (c) => void mapa.delete(c) };
}

describe('a carência do aparelho (17.23)', () => {
  it('sela M com uma chave G sorteada aqui: o envelope vai ao servidor, G e o token ficam no aparelho', async () => {
    const m = novaChaveDoMeio();
    const nova = await prepararCarencia(m, USUARIO, 'K7QFM2XA', null);
    expect(nova.corpo.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(nova.corpo.anterior).toBeUndefined();
    const guardada = nova.guardavel('2026-10-30T12:00:00.000Z', true);
    expect(guardada).toEqual(jasmine.objectContaining({ id: nova.corpo.id, token: nova.corpo.token, usuario: USUARIO, codigo: 'K7QFM2XA', pin: true }));
    // a chave não vai no corpo, e o envelope só abre com ela
    expect(JSON.stringify(nova.corpo)).not.toContain(guardada.chave);
    expect(await abrirEnvelope(deBase64url(guardada.chave)!, USUARIO, nova.corpo.id, deBase64url(nova.corpo.envelope)!)).toEqual(m);
  });

  it('a carência nova leva o token da de antes, para o servidor tirá-la', async () => {
    const a = armario();
    const antes = (await prepararCarencia(novaChaveDoMeio(), USUARIO, 'K7QFM2XA', null)).guardavel('2026-10-30T12:00:00.000Z', false);
    guardarCarencia(a, antes);
    const nova = await prepararCarencia(novaChaveDoMeio(), USUARIO, 'K7QFM2XA', lerCarencia(a, AGORA));
    expect(nova.corpo.anterior).toBe(antes.token);
  });

  it('guarda e lê; a vencida, a estragada e a de formato estranho saem do armário', async () => {
    const a = armario();
    const c = (await prepararCarencia(novaChaveDoMeio(), USUARIO, 'K7QFM2XA', null)).guardavel('2026-10-30T12:00:00.000Z', false);
    guardarCarencia(a, c);
    expect(lerCarencia(a, AGORA)).toEqual(c);
    expect(lerCarencia(a, Date.parse('2026-10-30T12:00:00.000Z'))).toBeNull();
    expect(a.mapa.size).toBe(0);
    for (const ruim of ['{', 'null', '7', JSON.stringify({ ...c, chave: 'curta' }), JSON.stringify({ ...c, usuario: 'x' }), JSON.stringify({ ...c, pin: 'sim' })]) {
      a.mapa.set('cofre:carencia', ruim);
      expect(lerCarencia(a, AGORA)).withContext(ruim).toBeNull();
      expect(a.mapa.size).withContext(ruim).toBe(0);
    }
  });

  it('um armário que recusa (navegação privada) deixa o aparelho sem carência, sem erro', () => {
    const recusa: Guarda = {
      getItem: () => {
        throw new Error('negado');
      },
      setItem: () => {
        throw new Error('negado');
      },
      removeItem: () => {
        throw new Error('negado');
      },
    };
    expect(lerCarencia(recusa)).toBeNull();
    expect(() => guardarCarencia(recusa, {} as Carencia)).not.toThrow();
  });

  it('o armário de verdade é o localStorage, na chave cofre:carencia', () => {
    localStorage.removeItem('cofre:carencia');
    armarioDoAparelho.setItem('cofre:carencia', 'x');
    expect(localStorage.getItem('cofre:carencia')).toBe('x');
    armarioDoAparelho.removeItem('cofre:carencia');
    expect(localStorage.getItem('cofre:carencia')).toBeNull();
  });

  it('esquecer este aparelho: sai daqui e do servidor, mesmo se o servidor não responder', async () => {
    const a = armario();
    const c = (await prepararCarencia(novaChaveDoMeio(), USUARIO, 'K7QFM2XA', null)).guardavel('2999-10-30T12:00:00.000Z', false);
    guardarCarencia(a, c);
    const pedidos: string[] = [];
    const api = new (class extends ApiCofre {
      override async esquecerCarencia(token: string): Promise<{ esquecida: true }> {
        pedidos.push(token);
        throw new Error('sem rede');
      }
    })();
    await esquecerCarencia(api, a);
    expect(pedidos).toEqual([c.token]);
    expect(a.mapa.size).toBe(0);
  });

  describe('abrir pela carência', () => {
    /** Um cofre de verdade (a cripto inteira), e uma API de mentira que devolve o envelope da carência e confere a prova. */
    async function montar() {
      const senha = '58293071';
      const sal = novoSal();
      const m = novaChaveDoMeio();
      const kSenha = await chaveDaSenha(senha, sal, KDF_PADRAO);
      const { v, chave } = await criarCofre(kSenha, m, USUARIO);
      const kAuth = paraBase64url(await provaDaSenha(kSenha, m));
      const manifesto = paraBase64url(await cifrarManifesto(chave, USUARIO, { contador: 3, itens: {}, lixeira: {}, mudadoEm: '2026-10-29T11:00:00.000Z', aparelho: 'PC' }));
      const nova = await prepararCarencia(m, USUARIO, 'K7QFM2XA', null);
      const carencia = nova.guardavel('2999-10-30T12:00:00.000Z', true);
      const api = new (class extends ApiCofre {
        pedidos: string[] = [];
        dono = USUARIO;
        override async entrarPelaCarencia(token: string, aparelho: string): Promise<EntradaPelaCarencia> {
          this.pedidos.push(`entrar ${token === carencia.token} ${aparelho}`);
          return {
            token: 'e'.repeat(43),
            expiraEm: '',
            usuario: this.dono,
            codigo: 'K7QFM2XA',
            envelope: { id: carencia.id, dados: nova.corpo.envelope },
            versao: 1,
            kdf: { ...KDF_PADRAO },
            sal: paraBase64url(sal),
            mudadoEm: '',
            pin: true,
            passkeys: [{ id: 'cGFzc2tleQ', transports: ['internal'] }],
          };
        }
        override async abrir(prova: string, c?: CorpoDaCarencia): Promise<Abertura> {
          this.pedidos.push(`abrir ${prova === kAuth} ${c === undefined}`);
          if (prova !== kAuth) throw new Error('senha errada');
          return { token: 'c'.repeat(43), expiraEm: '2026-10-29T20:00:00.000Z', paradaMaxima: 600, v: paraBase64url(v), manifesto, contador: 3, recuperada: false, carencia: null };
        }
      })();
      return { api, carencia, senha };
    }

    it('o token vira a entrada, G abre M, e a senha (o PIN) abre o cofre: nada de passkey', async () => {
      const { api, carencia, senha } = await montar();
      const cofre = await abrirPelaCarencia(api, carencia, senha, 'Chrome no Android', 'Celular');
      expect(api.pedidos).toEqual(['entrar true Chrome no Android', 'abrir true true']);
      expect(cofre.manifesto.contador).toBe(3);
      expect(cofre.carencia).toBeNull();
      // as passkeys do cofre vêm junto: as senhas protegidas pedem uma de novo, como abrindo pela passkey
      expect(cofre.passkeys).toEqual([{ id: 'cGFzc2tleQ', transports: ['internal'] }]);
      // os Ajustes ainda conseguem trocar a senha (M, V, o sal e o Argon2id na memória)
      expect(cofre.segredos?.kdf).toEqual(KDF_PADRAO);
    });

    it('a senha errada não abre (a prova é outra)', async () => {
      const { api, carencia } = await montar();
      await expectAsync(abrirPelaCarencia(api, carencia, '00000000', 'Chrome no Android', 'Celular')).toBeRejected();
      expect(api.pedidos[1]).toBe('abrir false true');
    });

    it('a entrada de outra conta é recusada antes de qualquer coisa', async () => {
      const { api, carencia, senha } = await montar();
      api.dono = OUTRA;
      await expectAsync(abrirPelaCarencia(api, carencia, senha, 'Chrome no Android', 'Celular')).toBeRejectedWith(jasmine.any(ErroCofre));
      expect(api.pedidos.length).toBe(1);
    });
  });
});
