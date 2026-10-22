import type { CofreAberto } from '../core/abrir';
import { ApiCofre, type CofreCriado, type DesafioDeRegistro, ErroApi, type Gravacao, type ItensDaApi } from '../core/api';
import { aleatorios, paraBase64url } from '../core/bytes';
import { cifrarManifesto, criarCofre, novaChaveDoMeio } from '../core/crypto';
import { salvarItem } from '../core/itens';
import type { Autenticador } from '../core/passkey';
import { type Demonstracao, paginaDoNavegador } from './servicos';

/**
 * A demonstração das telas, só no `ng serve cofre` (fileReplacements no angular.json): abra
 * `http://localhost:4200/?demo`. A API e as passkeys são de mentira: o primeiro aparelho registrado tem
 * PRF, o segundo não (para ver o modo servidor). Com `?demo=sem-prf`, nenhum tem. Com `?demo=entrar` ou
 * `?demo=construcao`, a porta (no `ng serve` a página não é isolada, então o botão de entrar aparece
 * bloqueado, como deve). Com `?demo=abrir`, a tela de abrir; com `?demo=aberto`, um cofre aberto com três
 * senhas de exemplo, guardadas na memória por uma API de mentira que confere o contador como a de verdade.
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

  // os itens na memória, como o servidor guarda: cifrados, com o manifesto e o contador
  contador = 0;
  manifesto = '';
  private readonly guardados = new Map<string, { versao: number; dados: string | null; mudadoEm: string; naLixeiraDesde: string | null }>();

  private gravar(g: Gravacao, mudar: () => void): { contador: number } {
    if (g.contadorAnterior !== this.contador) throw new ErroApi(409, 'conflito', 'Outro aparelho mudou o cofre. Recarregando.');
    mudar();
    this.manifesto = g.manifesto;
    this.contador++;
    return { contador: this.contador };
  }

  override async itens(): Promise<ItensDaApi> {
    await espera(200);
    return { contador: this.contador, manifesto: this.manifesto, itens: [...this.guardados].map(([id, i]) => ({ id, ...i })) };
  }

  override async salvarItem(id: string, dados: string, versao: number, g: Gravacao): Promise<{ contador: number }> {
    await espera(250);
    return this.gravar(g, () => this.guardados.set(id, { versao, dados, mudadoEm: new Date().toISOString(), naLixeiraDesde: null }));
  }

  override async paraALixeira(id: string, g: Gravacao): Promise<{ contador: number }> {
    return this.gravar(g, () => (this.guardados.get(id)!.naLixeiraDesde = new Date().toISOString()));
  }

  override async restaurar(id: string, g: Gravacao): Promise<{ contador: number }> {
    return this.gravar(g, () => (this.guardados.get(id)!.naLixeiraDesde = null));
  }

  override async apagarDeVez(id: string, g: Gravacao): Promise<{ contador: number }> {
    return this.gravar(g, () => this.guardados.delete(id));
  }

  override trancar(): void {
    /* na demonstração não há servidor */
  }
}

/** Um cofre aberto de mentira (chaves sorteadas agora), com três senhas de exemplo. */
async function cofreDeMentira(api: ApiDeMentira, usuario: string): Promise<CofreAberto> {
  const { chave } = await criarCofre(aleatorios(32), novaChaveDoMeio(), usuario);
  const manifesto = { contador: 0, itens: {}, lixeira: {}, mudadoEm: new Date(Date.now() - 3 * 86_400_000).toISOString(), aparelho: 'Celular' };
  api.manifesto = paraBase64url(await cifrarManifesto(chave, usuario, manifesto));
  const cofre: CofreAberto = { usuario, chave, manifesto, contador: 0, recuperada: false, expiraEm: new Date(Date.now() + 8 * 3_600_000).toISOString(), paradaMaxima: 600, aparelho: 'PC' };
  for (const campos of [
    { titulo: 'Banco', usuario: 'fulano.silva', senha: 'Xk9#mQ2$vL7!pR4@', url: 'https://banco.exemplo', descricao: 'Agência 0001\nConta 12345-6' },
    { titulo: 'E-mail', usuario: 'exemplo@email.com', senha: 'vidraceiro-incisivo-convite-mexicano-soprano-mortal', url: 'mail.google.com', descricao: '' },
    { titulo: 'Wi-Fi de casa', usuario: '', senha: 'pastel-de-feira-2024', url: '', descricao: 'Rede: CASA_5G' },
  ]) {
    await salvarItem(api, cofre, campos, null);
  }
  return cofre;
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
  const porta = pedido === 'entrar' || pedido === 'construcao' ? pedido : undefined;
  const api = new ApiDeMentira();
  const usuario = '0b7c6a2e-5d4f-4e3a-9b1c-2d3e4f5a6b7c';
  return (feita = {
    porta,
    abrir: pedido === 'abrir',
    aberto: pedido === 'aberto' ? () => cofreDeMentira(api, usuario) : undefined,
    servicos: { api, autenticador: autenticadorDeMentira(pedido === 'sem-prf'), rpId: location.hostname, pagina: paginaDoNavegador(), terminar: () => location.reload() },
    entrada: { token: 'demo', expiraEm: new Date(Date.now() + 300_000).toISOString(), usuario: '0b7c6a2e-5d4f-4e3a-9b1c-2d3e4f5a6b7c', codigo: 'K7QFM2XA' },
  });
}
