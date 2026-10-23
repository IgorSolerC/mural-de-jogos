import type { CofreAberto } from '../core/abrir';
import { type AparelhoDaApi, ApiCofre, type CofreCriado, type DesafioDeRegistro, ErroApi, type EventoDaApi, type Gravacao, type ItensDaApi, type SessaoDaApi } from '../core/api';
import { aleatorios, paraBase64url } from '../core/bytes';
import { cifrarManifesto, criarCofre, KDF_PADRAO, novaChaveDoMeio, novoSal } from '../core/crypto';
import { type CamposDoItem, salvarItem } from '../core/itens';
import type { Autenticador } from '../core/passkey';
import { type Demonstracao, paginaDoNavegador } from './servicos';

/**
 * A demonstração das telas, só no `ng serve cofre` (fileReplacements no angular.json): abra
 * `http://localhost:4200/?demo`. A API e as passkeys são de mentira: o primeiro aparelho registrado tem
 * PRF, o segundo não (para ver o modo servidor). Com `?demo=sem-prf`, nenhum tem. Com `?demo=entrar` ou
 * `?demo=construcao`, a porta (no `ng serve` a página não é isolada, então o botão de entrar aparece
 * bloqueado, como deve). Com `?demo=abrir`, a tela de abrir (`?demo=congelado`, com o cofre congelado); com `?demo=aberto`, um cofre aberto com sete
 * senhas de exemplo, guardadas na memória por uma API de mentira que confere o contador como a de verdade.
 */
const espera = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

class ApiDeMentira extends ApiCofre {
  override async congelar(): Promise<{ readonly congeladoAte: string }> {
    await espera(250);
    return { congeladoAte: new Date(Date.now() + 86_400_000).toISOString() };
  }

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

  private lista: AparelhoDaApi[] = [
    { id: 'celular', apelido: 'Celular', prf: true, criadoEm: new Date(Date.now() - 9 * 86_400_000).toISOString(), usadoEm: new Date(Date.now() - 3 * 86_400_000).toISOString() },
    { id: 'pc', apelido: 'PC do escritório', prf: false, criadoEm: new Date(Date.now() - 9 * 86_400_000).toISOString(), usadoEm: new Date().toISOString() },
  ];

  override async aparelhos(): Promise<{ aparelhos: readonly AparelhoDaApi[] }> {
    return { aparelhos: this.lista };
  }
  override async porAparelho(aparelho: unknown): Promise<{ id: string; apelido: string; prf: boolean }> {
    const a = aparelho as { apelido: string; prf: boolean };
    const novo = { id: crypto.randomUUID(), apelido: a.apelido, prf: a.prf, criadoEm: new Date().toISOString(), usadoEm: null };
    this.lista = [...this.lista, novo];
    return novo;
  }
  override async tirarAparelho(id: string): Promise<{ tirado: true }> {
    this.lista = this.lista.filter((a) => a.id !== id);
    return { tirado: true };
  }
  override async trocarSenha(): Promise<{ trocada: true }> {
    await espera(400);
    return { trocada: true };
  }
  override async novoCodigo(): Promise<{ trocado: true }> {
    return { trocado: true };
  }
  override async sessoes(): Promise<{ sessoes: readonly SessaoDaApi[] }> {
    return { sessoes: [{ tipo: 'cofre', criadaEm: new Date(Date.now() - 600_000).toISOString(), usadaEm: new Date().toISOString(), aparelho: 'Chrome no Windows', atual: true }] };
  }
  override async eventos(): Promise<{ eventos: readonly EventoDaApi[] }> {
    const h = (horas: number) => new Date(Date.now() - horas * 3_600_000).toISOString();
    return {
      eventos: [
        { tipo: 'aberto', em: h(0.1), aparelho: 'Chrome no Windows', pais: 'BR' },
        { tipo: 'passkey-usada', em: h(0.1), aparelho: 'Chrome no Windows', pais: 'BR' },
        { tipo: 'erro-senha', em: h(26), aparelho: 'Safari no iPhone', pais: 'BR' },
        { tipo: 'cofre-criado', em: h(216), aparelho: 'Chrome no Windows', pais: 'BR' },
      ],
    };
  }
  override async trancarTodos(): Promise<{ trancados: true }> {
    return { trancados: true };
  }
  override async apagarCofre(): Promise<{ apagado: true }> {
    return { apagado: true };
  }
}

/** Um cofre aberto de mentira (chaves sorteadas agora), com três senhas de exemplo. */
async function cofreDeMentira(api: ApiDeMentira, usuario: string): Promise<CofreAberto> {
  const m = novaChaveDoMeio();
  const { chave, v } = await criarCofre(aleatorios(32), m, usuario);
  const manifesto = { contador: 0, itens: {}, lixeira: {}, mudadoEm: new Date(Date.now() - 3 * 86_400_000).toISOString(), aparelho: 'Celular' };
  api.manifesto = paraBase64url(await cifrarManifesto(chave, usuario, manifesto));
  const cofre: CofreAberto = { usuario, chave, manifesto, contador: 0, recuperada: false, expiraEm: new Date(Date.now() + 8 * 3_600_000).toISOString(), paradaMaxima: 600, aparelho: 'PC', segredos: { m, v, sal: novoSal(), kdf: { ...KDF_PADRAO } } };
  const exemplos: CamposDoItem[] = [
    { titulo: 'Banco', usuario: 'fulano.silva', senha: 'Xk9#mQ2$vL7!pR4@', url: 'https://banco.exemplo', descricao: 'Agência 0001\nConta 12345-6', icone: 'moedas', grupo: 'Bancos', grupoIcone: 'moedas', grupoCor: 'verde' },
    { titulo: 'Cartão', usuario: '4321', senha: 'tR8!vN2@qK5#', url: 'cartao.exemplo', descricao: '', grupo: 'Bancos', grupoIcone: 'moedas', grupoCor: 'verde' },
    { titulo: 'E-mail', usuario: 'exemplo@email.com', senha: 'vidraceiro-incisivo-convite-mexicano-soprano-mortal', url: 'mail.google.com', descricao: '', grupo: 'Pessoal' },
    { titulo: 'Wi-Fi de casa', usuario: '', senha: 'pastel-de-feira-2024', url: '', descricao: 'Rede: CASA_5G', icone: 'raio', grupo: 'Casa', grupoCor: 'azul' },
    { titulo: 'Alarme', usuario: '', senha: '7319', url: '', descricao: '', grupo: 'Casa', grupoCor: 'azul' },
    { titulo: 'Repositório', usuario: 'fulano-dev', senha: 'Zq4$hP9!wM2&', url: 'github.com', descricao: '', icone: 'chip', grupo: 'Trabalho', grupoIcone: 'maleta' },
    { titulo: 'Loja de jogos', usuario: 'fulano', senha: 'cinema-pipoca-tucano', url: 'loja.exemplo', descricao: '' },
  ];
  for (const campos of exemplos) {
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
    abrir: pedido === 'abrir' || pedido === 'congelado',
    congeladoAte: pedido === 'congelado' ? new Date(Date.now() + 86_400_000).toISOString() : undefined,
    aberto: pedido === 'aberto' ? () => cofreDeMentira(api, usuario) : undefined,
    servicos: { api, autenticador: autenticadorDeMentira(pedido === 'sem-prf'), rpId: location.hostname, pagina: paginaDoNavegador(), terminar: () => location.reload() },
    entrada: { token: 'demo', expiraEm: new Date(Date.now() + 300_000).toISOString(), usuario: '0b7c6a2e-5d4f-4e3a-9b1c-2d3e4f5a6b7c', codigo: 'K7QFM2XA' },
  });
}
