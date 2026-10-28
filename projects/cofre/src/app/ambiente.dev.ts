import type { CofreAberto } from '../core/abrir';
import { type AparelhoDaApi, ApiCofre, type CofreCriado, type DesafioDeConfirmar, type DesafioDeRegistro, ErroApi, type EventoDaApi, type Gravacao, type ItensDaApi, type SessaoDaApi } from '../core/api';
import { aleatorios, deBase64url, paraBase64url } from '../core/bytes';
import { cifrarManifesto, criarCofre, KDF_PADRAO, novaChaveDoMeio, novoSal } from '../core/crypto';
import { type CamposDoItem, salvarItem } from '../core/itens';
import type { Autenticador } from '../core/passkey';
import { type Demonstracao, paginaDoNavegador } from './servicos';
import type { IdDaCor, IdDoIcone } from '../../../../shared/cartela-de-icones';

/**
 * A demonstração das telas, só no `ng serve cofre` (fileReplacements no angular.json): abra
 * `http://localhost:4200/?demo`. A API e as passkeys são de mentira: o primeiro aparelho registrado tem
 * PRF, o segundo não (para ver o modo servidor). Com `?demo=sem-prf`, nenhum tem. Com `?demo=entrar` ou
 * `?demo=construcao`, a porta (no `ng serve` a página não é isolada, então o botão de entrar aparece
 * bloqueado, como deve). Com `?demo=abrir`, a tela de abrir (`?demo=congelado`, com o cofre congelado); com `?demo=aberto`, um cofre aberto com oito
 * senhas de exemplo (duas com mais de uma entrada, e uma entrada que pede a passkey), guardadas na memória por uma API de mentira que confere o contador como a de verdade.
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

  override async desafioDeConfirmar(): Promise<DesafioDeConfirmar> {
    await espera(150);
    return {
      desafio: crypto.randomUUID(),
      publicKey: { challenge: paraBase64url(aleatorios(32)), rpId: location.hostname, allowCredentials: [{ type: 'public-key', id: PASSKEY_DA_DEMO }], userVerification: 'required' },
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
async function cofreDeMentira(api: ApiDeMentira, usuario: string, muitas = false): Promise<CofreAberto> {
  const m = novaChaveDoMeio();
  const { chave, v } = await criarCofre(aleatorios(32), m, usuario);
  const manifesto = { contador: 0, itens: {}, lixeira: {}, mudadoEm: new Date(Date.now() - 3 * 86_400_000).toISOString(), aparelho: 'Celular' };
  api.manifesto = paraBase64url(await cifrarManifesto(chave, usuario, manifesto));
  const cofre: CofreAberto = {
    usuario,
    chave,
    manifesto,
    contador: 0,
    recuperada: false,
    expiraEm: new Date(Date.now() + 8 * 3_600_000).toISOString(),
    paradaMaxima: 600,
    aparelho: 'PC',
    segredos: { m, v, sal: novoSal(), kdf: { ...KDF_PADRAO } },
    passkeys: [{ id: PASSKEY_DA_DEMO, transports: ['internal'] }],
  };
  const exemplos: CamposDoItem[] = [
    {
      titulo: 'Banco',
      rotulo: 'Internet banking',
      usuario: 'fulano.silva',
      senha: 'Xk9#mQ2$vL7!pR4@',
      outras: [{ rotulo: 'Senha do cartão final 4321', usuario: '', senha: '7342', protegida: true }],
      url: 'https://banco.exemplo',
      descricao: 'Agência 0001\nConta 12345-6',
      icone: 'moedas',
      grupo: 'Bancos',
      grupoIcone: 'moedas',
      grupoCor: 'verde',
    },
    {
      titulo: 'Facebook',
      rotulo: 'Conta pessoal',
      usuario: 'fulano.silva@email.com',
      senha: 'mR7&kT3!xW9#',
      outras: [
        { rotulo: 'Página da loja', usuario: 'loja.do.fulano@email.com', senha: 'jaguatirica-azul-sereno', protegida: false },
        { rotulo: 'Códigos de recuperação', usuario: '', senha: '4821 9930 1174 6605', protegida: true },
      ],
      url: 'facebook.com',
      descricao: '',
      grupo: 'Pessoal',
    },
    { titulo: 'Cartão', usuario: '4321', senha: 'tR8!vN2@qK5#', url: 'cartao.exemplo', descricao: '', grupo: 'Bancos', grupoIcone: 'moedas', grupoCor: 'verde' },
    { titulo: 'E-mail', usuario: 'exemplo@email.com', senha: 'vidraceiro-incisivo-convite-mexicano-soprano-mortal', url: 'mail.google.com', descricao: '', grupo: 'Pessoal' },
    { titulo: 'Wi-Fi de casa', usuario: '', senha: 'pastel-de-feira-2024', url: '', descricao: 'Rede: CASA_5G', icone: 'raio', grupo: 'Casa', grupoCor: 'azul' },
    { titulo: 'Alarme', usuario: '', senha: '7319', url: '', descricao: '', grupo: 'Casa', grupoCor: 'azul' },
    { titulo: 'Repositório', usuario: 'fulano-dev', senha: 'Zq4$hP9!wM2&', url: 'github.com', descricao: '', icone: 'chip', grupo: 'Trabalho', grupoIcone: 'maleta' },
    { titulo: 'Loja de jogos', usuario: 'fulano', senha: 'cinema-pipoca-tucano', url: 'loja.exemplo', descricao: '' },
  ];
  for (const campos of muitas ? [...exemplos, ...outrosExemplos()] : exemplos) {
    await salvarItem(api, cofre, campos, null);
  }
  return cofre;
}

/** Com `?demo=muitas`: mais 32 senhas, para o cofre ficar com 40 em seis grupos (o tamanho de um cofre de verdade). */
function outrosExemplos(): CamposDoItem[] {
  const vazio = { url: '', descricao: '' };
  const em =
    (grupo: string, grupoIcone?: IdDoIcone, grupoCor?: IdDaCor) =>
    (titulo: string, usuario: string, senha: string, url = ''): CamposDoItem => ({ ...vazio, titulo, usuario, senha, url, grupo, grupoIcone, grupoCor });
  const banco = em('Bancos', 'moedas', 'verde');
  const pessoal = em('Pessoal');
  const streaming = em('Streaming', 'tv', 'roxo');
  const trabalho = em('Trabalho', 'maleta');
  const casa = em('Casa', undefined, 'azul');
  const jogos = em('Jogos', 'jogos', 'laranja');
  return [
    banco('Corretora', 'fulano.invest', 'Hn4!pW8@zK2#', 'corretora.exemplo'),
    banco('Banco digital', 'fulano.silva@email.com', 'roxinho-cafe-manha-91', 'nubank.com.br'),
    banco('Cartão de crédito', '5555 4444', '8812', ''),
    banco('Imposto de renda', '123.456.789-00', 'Gv7#nB4$tY1!', 'gov.br'),
    pessoal('Instagram', '@fulano.silva', 'xR2!bN8#mQ4$', 'instagram.com'),
    pessoal('WhatsApp (PIN)', '', '482913'),
    pessoal('Spotify', 'fulano.silva@email.com', 'tamborim-lua-cheia', 'spotify.com'),
    pessoal('Amazon', 'fulano.silva@email.com', 'Lp5$wE9!rT3@', 'amazon.com.br'),
    pessoal('Mercado Livre', 'fulanosilva', 'Bq8!kM3#vX6$', 'mercadolivre.com.br'),
    pessoal('iCloud', 'fulano.silva@icloud.com', 'Wd2@hJ7!nP4#', 'icloud.com'),
    streaming('Netflix', 'fulano.silva@email.com', 'pipoca-sofa-domingo', 'netflix.com'),
    streaming('Prime Video', 'fulano.silva@email.com', 'Kt6!vB2@mW8#', 'primevideo.com'),
    streaming('Disney+', 'fulano.silva@email.com', 'castelo-fogos-magia', 'disneyplus.com'),
    streaming('Max', 'familia.silva@email.com', 'Rz3#qN7!hL5$', 'max.com'),
    streaming('Globoplay', 'fulano.silva@email.com', 'novela-das-nove-77', 'globoplay.globo.com'),
    streaming('YouTube Premium', 'fulano.silva@gmail.com', 'Ys9!cV4@bN1#', 'youtube.com'),
    streaming('Crunchyroll', 'fulano_anime', 'Mf2$gT8!kW5@', 'crunchyroll.com'),
    trabalho('E-mail do trabalho', 'fulano.silva@empresa.com', 'Jn5#xP2!vR8$', 'outlook.office.com'),
    trabalho('VPN', 'fsilva', 'Qa7!mZ3@wE9#', 'vpn.empresa.com'),
    trabalho('Jira', 'fulano.silva@empresa.com', 'Uc4@nH8!tK2$', 'empresa.atlassian.net'),
    trabalho('Slack', 'fulano.silva@empresa.com', 'Pe6#bL1!xS7@', 'empresa.slack.com'),
    trabalho('Servidor de testes', 'root', 'Vn8!qW2#zM5$', '10.0.0.12'),
    trabalho('Portal do RH', '004512', 'Ix3$kD9!pF6@', 'rh.empresa.com'),
    casa('Roteador', 'admin', 'Tg5!rY8@uI2#', '192.168.0.1'),
    casa('Câmera da porta', 'casa.silva@email.com', 'olho-magico-2023'),
    casa('Condomínio', 'apto 42', 'Ob7#lK4!jH1$', 'condominio.exemplo'),
    jogos('Steam', 'fulano_gamer', 'Hz2!wQ7@eR4#', 'store.steampowered.com'),
    jogos('PlayStation', 'fulano.silva@email.com', 'Nc8#vB5!mX3$', 'playstation.com'),
    jogos('Nintendo', 'fulano.silva@email.com', 'cogumelo-estrela-1up', 'nintendo.com'),
    jogos('Epic Games', 'fulano_gamer', 'Ka4@sD9!fG2#', 'epicgames.com'),
    jogos('Battle.net', 'fulano#1234', 'Ew6!rT1@yU8$', 'battle.net'),
    { ...vazio, titulo: 'Academia', usuario: '0071', senha: '2580' },
  ];
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
    // a passkey de novo (17.18): o aparelho confere a pessoa, e a assinatura volta com a flag de usuário verificado
    pegar: async () => {
      await espera(900);
      const dados = new Uint8Array(37);
      dados[32] = 0x05;
      return {
        type: 'public-key',
        rawId: deBase64url(PASSKEY_DA_DEMO)!.buffer,
        response: { authenticatorData: dados.buffer, clientDataJSON: aleatorios(64).buffer, signature: aleatorios(64).buffer },
        getClientExtensionResults: () => ({}),
      } as unknown as Credential;
    },
  };
}

const PASSKEY_DA_DEMO = 'cGFzc2tleS1kYS1kZW1vbnN0cmFjYW8';

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
    aberto: pedido === 'aberto' || pedido === 'muitas' ? () => cofreDeMentira(api, usuario, pedido === 'muitas') : undefined,
    servicos: { api, autenticador: autenticadorDeMentira(pedido === 'sem-prf'), rpId: location.hostname, pagina: paginaDoNavegador(), terminar: () => location.reload() },
    entrada: { token: 'demo', expiraEm: new Date(Date.now() + 300_000).toISOString(), usuario: '0b7c6a2e-5d4f-4e3a-9b1c-2d3e4f5a6b7c', codigo: 'K7QFM2XA' },
  });
}
