/**
 * Nenhum service worker no cofre (seção 7.4): um service worker fica entre a página e a rede e poderia
 * ler ou trocar o que passa. Ao abrir, a página tira qualquer um que exista neste endereço (não deveria
 * existir nenhum) e diz quantos tirou. Se a página já estava nas mãos de um (`controller`), ela só fica
 * livre depois de recarregar: a tela pede isso antes de deixar entrar.
 */
export interface Trabalhadores {
  readonly controller: unknown;
  getRegistrations(): Promise<readonly { unregister(): Promise<boolean> }[]>;
}

export interface SemServiceWorker {
  /** Quantos foram tirados agora. */
  readonly tirados: number;
  /** Esta página estava sendo servida por um: precisa recarregar. */
  readonly controlada: boolean;
}

export async function tirarServiceWorkers(trabalhadores: Trabalhadores | undefined = navigator.serviceWorker): Promise<SemServiceWorker> {
  if (!trabalhadores) return { tirados: 0, controlada: false };
  const controlada = !!trabalhadores.controller;
  let registros: readonly { unregister(): Promise<boolean> }[];
  try {
    registros = await trabalhadores.getRegistrations();
  } catch {
    // sem acesso aos service workers (cookies bloqueados, por exemplo): o navegador também não deixa
    // nenhum se registrar aqui
    return { tirados: 0, controlada };
  }
  // havia algum: conta mesmo se o unregister falhar, para a porta pedir a recarga (antes, um unregister
  // recusado zerava a conta e a prova "Sem service worker" passava com ele ainda registrado)
  await Promise.allSettled(registros.map((r) => r.unregister()));
  return { tirados: registros.length, controlada };
}
