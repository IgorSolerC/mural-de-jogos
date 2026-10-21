import { InjectionToken } from '@angular/core';
import { ApiCofre, type Entrada } from '../core/api';
import { type Autenticador, autenticadorDoNavegador } from '../core/passkey';

/**
 * O que as telas do cofre usam de fora: a API, as passkeys e o endereço. Nos testes e na demonstração
 * do desenvolvimento (`ambiente.dev.ts`), entram versões de mentira.
 */
export interface Servicos {
  readonly api: ApiCofre;
  readonly autenticador: Autenticador;
  /** O rpId das passkeys: o próprio endereço do cofre. */
  readonly rpId: string;
  /** Joga fora toda a memória da página (8.2): é assim que o cofre tranca. */
  terminar(): void;
}

export function servicosDoNavegador(): Servicos {
  return {
    api: new ApiCofre(),
    autenticador: autenticadorDoNavegador,
    rpId: location.hostname,
    terminar: () => location.replace('/'),
  };
}

export const SERVICOS = new InjectionToken<Servicos>('serviços do cofre', { providedIn: 'root', factory: servicosDoNavegador });

/** A demonstração das telas, só no desenvolvimento: serviços de mentira e uma sessão de entrada. */
export interface Demonstracao {
  readonly servicos: Servicos;
  readonly entrada: Entrada;
}
