/**
 * A conversa da página com a API do cofre (seção 9.2 do PLANO-COFRE.md), na mesma origem
 * (`/api/...`). Sem estado guardado no aparelho: o token da sessão vive só nesta instância, na
 * memória, e some quando a página é recarregada (é assim que o cofre tranca).
 *
 * Cada pedido sai sem cookie, sem cache e sem seguir redirecionamento. Uma resposta de erro da API
 * vira `ErroApi`, com o código dela ("cofre-existe", "sessao-invalida"…) e a mensagem em português,
 * que a tela pode mostrar como está.
 */

/** O que a API responde quando algo dá errado: `{ erro, mensagem }`. */
export class ErroApi extends Error {
  constructor(
    readonly status: number,
    readonly codigo: string,
    mensagem: string,
  ) {
    super(mensagem);
    this.name = 'ErroApi';
  }
}

/** O que o `POST /api/entrar` devolve: a sessão de entrada (5 minutos) e de quem ela é. */
export interface Entrada {
  readonly token: string;
  readonly expiraEm: string;
  /** O id da conta do Murall: entra no AAD de tudo o que a página sela. */
  readonly usuario: string;
  /** O código da conta do Murall (8 caracteres, sem hífen). */
  readonly codigo: string;
}

/** O `GET /api/status` (sem login): se a API está de pé e o cliente OAuth do cofre. */
export interface StatusDaApi {
  readonly versao: number;
  readonly modo: string;
  /** Vazio: o login ainda não está pronto (falta o cliente OAuth do cofre). */
  readonly googleClientId: string;
}

/** O `GET /api/cofre`: se a conta já tem cofre, se está congelado e quantos aparelhos tem. */
export interface EstadoDoCofre {
  readonly existe: boolean;
  readonly congeladoAte: string | null;
  readonly aparelhos: number;
}

/** O desafio para registrar uma passkey: as opções do `navigator.credentials.create`, em JSON. */
export interface DesafioDeRegistro {
  readonly desafio: string;
  readonly publicKey: OpcoesDeRegistroJson;
}

/** As opções de registro como a API manda (os bytes em base64url). */
export interface OpcoesDeRegistroJson {
  readonly challenge: string;
  readonly rp: { readonly id: string; readonly name: string };
  readonly user: { readonly id: string; readonly name: string; readonly displayName: string };
  readonly pubKeyCredParams: readonly { readonly type: 'public-key'; readonly alg: number }[];
  readonly authenticatorSelection?: AuthenticatorSelectionCriteria;
  readonly attestation?: AttestationConveyancePreference;
  readonly timeout?: number;
  readonly excludeCredentials?: readonly { readonly type: 'public-key'; readonly id: string; readonly transports?: readonly string[] }[];
}

/** O desafio para abrir (`POST /api/cofre/desafio`): a assinatura e a cripto do cofre. */
export interface DesafioDeAbrir {
  readonly desafio: string;
  readonly publicKey: {
    readonly challenge: string;
    readonly rpId: string;
    readonly allowCredentials: readonly { readonly type: 'public-key'; readonly id: string; readonly transports?: readonly string[] }[];
    readonly userVerification?: UserVerificationRequirement;
    readonly timeout?: number;
  };
  readonly versao: number;
  readonly kdf: { readonly m: number; readonly t: number; readonly p: number };
  readonly sal: string;
  readonly aparelhos: readonly { readonly id: string; readonly apelido: string; readonly prf: boolean }[];
  readonly mudadoEm: string;
}

/** A assinatura de uma passkey como a API confere (os bytes em base64url). */
export interface AssinaturaJson {
  readonly id: string;
  readonly clientDataJSON: string;
  readonly authenticatorData: string;
  readonly signature: string;
  readonly userHandle?: string;
}

/** O envelope do aparelho que assinou (`POST /api/cofre/chave`); no modo servidor, com o S_i. */
export interface ChaveDoAparelho {
  readonly envelope: { readonly id: string; readonly dados: string };
  readonly tipo: 'prf' | 'servidor';
  readonly s?: string;
}

/** O cofre aberto pela API (`POST /api/cofre/abrir`): a sessão do cofre, V e o manifesto. */
export interface Abertura {
  readonly token: string;
  readonly expiraEm: string;
  /** Segundos parado até a sessão acabar. */
  readonly paradaMaxima: number;
  readonly v: string;
  readonly manifesto: string;
  readonly contador: number;
  readonly recuperada: boolean;
}

/** Os itens como a API guarda (`GET /api/cofre/itens`): cifrados, com o manifesto e o contador de agora. */
export interface ItensDaApi {
  readonly contador: number;
  readonly manifesto: string;
  readonly itens: readonly {
    readonly id: string;
    readonly versao: number;
    /** null: a lápide de um item que passou de 30 dias na lixeira. */
    readonly dados: string | null;
    readonly mudadoEm: string;
    readonly naLixeiraDesde: string | null;
  }[];
}

/** O pedaço comum a toda gravação de item: o manifesto novo e o contador que o aparelho viu. */
export interface Gravacao {
  readonly manifesto: string;
  readonly contadorAnterior: number;
}

/** O que o `POST /api/cofre` devolve ao criar. */
export interface CofreCriado {
  readonly criado: true;
  readonly aparelhos: readonly { readonly id: string; readonly apelido: string; readonly prf: boolean }[];
}

/** A resposta que não é JSON da API (um erro da Cloudflare, por exemplo) também vira `ErroApi`. */
const FORA_DO_AR = 'O cofre não respondeu direito. Tente de novo daqui a pouco.';

export class ApiCofre {
  /** O token da sessão de agora (de entrada ou do cofre), só na memória. */
  private token: string | null = null;

  constructor(private readonly buscar: typeof fetch = (entrada, init) => fetch(entrada, init)) {}

  /** Usa este token nos próximos pedidos (null: sem sessão). */
  usarToken(token: string | null): void {
    this.token = token;
  }

  get temSessao(): boolean {
    return this.token !== null;
  }

  async pedir<T>(metodo: 'GET' | 'POST' | 'PUT' | 'DELETE', caminho: string, corpo?: unknown): Promise<T> {
    if (!caminho.startsWith('/api/')) throw new Error('caminho fora da API do cofre');
    const headers: Record<string, string> = {};
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
    if (corpo !== undefined) headers['Content-Type'] = 'application/json';
    let resposta: Response;
    try {
      resposta = await this.buscar(caminho, {
        method: metodo,
        headers,
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
      });
    } catch {
      throw new ErroApi(0, 'sem-rede', 'Sem conexão com o cofre. Confira a internet e tente de novo.');
    }
    let dados: unknown;
    try {
      dados = await resposta.json();
    } catch {
      throw new ErroApi(resposta.status, 'resposta-estranha', FORA_DO_AR);
    }
    if (!resposta.ok) {
      const d = (dados ?? {}) as { erro?: unknown; mensagem?: unknown };
      const codigo = typeof d.erro === 'string' ? d.erro : 'erro';
      const mensagem = typeof d.mensagem === 'string' ? d.mensagem : FORA_DO_AR;
      throw new ErroApi(resposta.status, codigo, mensagem);
    }
    return dados as T;
  }

  /** Entra com o código que o Google mandou de volta e o verificador do PKCE; já passa a usar o token. */
  async entrar(codigo: string, verificador: string, aparelho: string): Promise<Entrada> {
    const entrada = await this.pedir<Entrada>('POST', '/api/entrar', { codigo, verificador, aparelho });
    this.usarToken(entrada.token);
    return entrada;
  }

  status(): Promise<StatusDaApi> {
    return this.pedir('GET', '/api/status');
  }

  estado(): Promise<EstadoDoCofre> {
    return this.pedir('GET', '/api/cofre');
  }

  desafioDeRegistro(): Promise<DesafioDeRegistro> {
    return this.pedir('POST', '/api/cofre/registro', {});
  }

  criarCofre(corpo: unknown): Promise<CofreCriado> {
    return this.pedir('POST', '/api/cofre', corpo);
  }

  desafioDeAbrir(): Promise<DesafioDeAbrir> {
    return this.pedir('POST', '/api/cofre/desafio', {});
  }

  chave(desafio: string, assinatura: AssinaturaJson): Promise<ChaveDoAparelho> {
    return this.pedir('POST', '/api/cofre/chave', { desafio, assinatura });
  }

  /** O código de recuperação no lugar da passkey: devolve o envelope do código. */
  recuperar(kRec: string): Promise<{ readonly envelope: { readonly id: string; readonly dados: string } }> {
    return this.pedir('POST', '/api/cofre/recuperar', { kRec });
  }

  /** A prova da senha; dando certo, já passa a usar a sessão do cofre. */
  async abrir(kAuth: string): Promise<Abertura> {
    const abertura = await this.pedir<Abertura>('POST', '/api/cofre/abrir', { kAuth });
    this.usarToken(abertura.token);
    return abertura;
  }

  itens(): Promise<ItensDaApi> {
    return this.pedir('GET', '/api/cofre/itens');
  }

  salvarItem(id: string, dados: string, versao: number, gravacao: Gravacao): Promise<{ readonly contador: number }> {
    return this.pedir('PUT', `/api/cofre/itens/${encodeURIComponent(id)}`, { dados, versao, ...gravacao });
  }

  paraALixeira(id: string, gravacao: Gravacao): Promise<{ readonly contador: number }> {
    return this.pedir('DELETE', `/api/cofre/itens/${encodeURIComponent(id)}`, gravacao);
  }

  restaurar(id: string, gravacao: Gravacao): Promise<{ readonly contador: number }> {
    return this.pedir('POST', `/api/cofre/itens/${encodeURIComponent(id)}/restaurar`, gravacao);
  }

  apagarDeVez(id: string, gravacao: Gravacao): Promise<{ readonly contador: number }> {
    return this.pedir('DELETE', `/api/cofre/lixeira/${encodeURIComponent(id)}`, gravacao);
  }
}
