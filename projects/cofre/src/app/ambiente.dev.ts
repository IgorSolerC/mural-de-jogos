import { ApiCofre, type CofreCriado, type DesafioDeRegistro } from '../core/api';
import { aleatorios, paraBase64url } from '../core/bytes';
import type { Autenticador } from '../core/passkey';
import type { Demonstracao } from './servicos';

/**
 * A demonstração das telas, só no `ng serve cofre` (fileReplacements no angular.json): abra
 * `http://localhost:4200/?demo`. A API e as passkeys são de mentira: o primeiro aparelho registrado tem
 * PRF, o segundo não (para ver o modo servidor). Com `?demo=sem-prf`, nenhum tem.
 */
const espera = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

class ApiDeMentira extends ApiCofre {
  override async desafioDeRegistro(): Promise<DesafioDeRegistro> {
    await espera(250);
    return {
      desafio: crypto.randomUUID(),
      publicKey: {
        challenge: paraBase64url(aleatorios(32)),
        rp: { id: location.hostname, name: 'Murall Cofre' },
        user: { id: paraBase64url(aleatorios(16)), name: 'Cofre do Murall (K7QF-M2XA)', displayName: 'Cofre do Murall (K7QF-M2XA)' },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
      },
    };
  }

  override async criarCofre(): Promise<CofreCriado> {
    await espera(600);
    return { criado: true, aparelhos: [] };
  }
}

function autenticadorDeMentira(semPrf: boolean): Autenticador {
  let registrados = 0;
  return {
    criar: async () => {
      await espera(900);
      registrados++;
      const comPrf = !semPrf && registrados === 1;
      return {
        type: 'public-key',
        rawId: aleatorios(32).buffer,
        response: {
          clientDataJSON: aleatorios(64).buffer,
          attestationObject: aleatorios(128).buffer,
          getTransports: () => (registrados === 1 ? ['hybrid'] : ['internal']),
        },
        getClientExtensionResults: () => ({ prf: comPrf ? { enabled: true, results: { first: aleatorios(32).buffer } } : { enabled: false } }),
      } as unknown as Credential;
    },
    pegar: async () => null,
  };
}

let feita: Demonstracao | null | undefined;

export function demonstracao(): Demonstracao | null {
  if (feita !== undefined) return feita;
  const pedido = new URLSearchParams(location.search).get('demo');
  if (pedido === null) return (feita = null);
  return (feita = {
    servicos: { api: new ApiDeMentira(), autenticador: autenticadorDeMentira(pedido === 'sem-prf'), rpId: location.hostname, terminar: () => location.reload() },
    entrada: { token: 'demo', expiraEm: new Date(Date.now() + 300_000).toISOString(), usuario: '0b7c6a2e-5d4f-4e3a-9b1c-2d3e4f5a6b7c', codigo: 'K7QFM2XA' },
  });
}
