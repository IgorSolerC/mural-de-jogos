import { InjectionToken } from '@angular/core';
import type { CofreAberto } from '../core/abrir';
import { ApiCofre, type Entrada } from '../core/api';
import { type Guarda, guardaDaAba } from '../core/entrar';
import { type Autenticador, autenticadorDoNavegador } from '../core/passkey';
import type { Porta } from './porta/porta';
import type { Trabalhadores } from './sem-service-worker';

/** O que a raiz lê e faz na página: o endereço, as proteções e a ida ao Google (nos testes, de mentira). */
export interface Pagina {
  /** Endereço seguro (https ou localhost). */
  readonly seguro: boolean;
  /** Isolada das outras páginas (os cabeçalhos COOP e COEP do Worker). */
  readonly isolado: boolean;
  readonly origem: string;
  readonly caminho: string;
  readonly busca: string;
  /** O navegador e o sistema, para o histórico do cofre. */
  readonly agente: string;
  /** O navegador está sendo controlado por um programa (`navigator.webdriver`). */
  readonly automatizado?: boolean;
  /** Os service workers do endereço (seção 7.4). */
  readonly trabalhadores: Trabalhadores | undefined;
  /** Onde o login guarda o state e o verificador entre a ida e a volta do Google. */
  readonly guarda: Guarda;
  /** Tira o código do Google da URL (e do histórico). */
  limparUrl(): void;
  irPara(url: string): void;
  /** Copia para a área de transferência. */
  copiar(texto: string): Promise<void>;
  /** Abre um site guardado numa aba nova, sem dizer de onde veio. */
  abrirSite(url: string): void;
}

/**
 * O que as telas do cofre usam de fora: a API, as passkeys e o endereço. Nos testes e na demonstração
 * do desenvolvimento (`ambiente.dev.ts`), entram versões de mentira.
 */
export interface Servicos {
  readonly api: ApiCofre;
  readonly autenticador: Autenticador;
  /** O rpId das passkeys: o próprio endereço do cofre. */
  readonly rpId: string;
  readonly pagina: Pagina;
  /** Joga fora toda a memória da página (8.2): é assim que o cofre tranca. */
  terminar(): void;
}

export function paginaDoNavegador(): Pagina {
  return {
    seguro: window.isSecureContext,
    isolado: window.crossOriginIsolated,
    origem: location.origin,
    caminho: location.pathname,
    busca: location.search,
    agente: navigator.userAgent,
    automatizado: navigator.webdriver === true,
    trabalhadores: navigator.serviceWorker,
    guarda: guardaDaAba,
    limparUrl: () => history.replaceState(null, '', '/'),
    irPara: (url) => location.assign(url),
    copiar: (texto) => navigator.clipboard.writeText(texto),
    abrirSite: (url) => void window.open(url, '_blank', 'noopener,noreferrer'),
  };
}

export function servicosDoNavegador(): Servicos {
  return {
    api: new ApiCofre(),
    autenticador: autenticadorDoNavegador,
    rpId: location.hostname,
    pagina: paginaDoNavegador(),
    terminar: () => location.replace('/'),
  };
}

export const SERVICOS = new InjectionToken<Servicos>('serviços do cofre', { providedIn: 'root', factory: servicosDoNavegador });

/** A demonstração das telas, só no desenvolvimento: serviços de mentira e uma sessão de entrada. */
export interface Demonstracao {
  readonly servicos: Servicos;
  readonly entrada: Entrada;
  /** Para ver uma porta (`?demo=entrar`, `construcao`) em vez das telas de criar. */
  readonly porta?: Porta;
  /** `?demo=abrir`: a tela de abrir. */
  readonly abrir?: boolean;
  /** `?demo=aberto`: um cofre já aberto, com a API de mentira guardando os itens na memória. */
  readonly aberto?: () => Promise<CofreAberto>;
}
