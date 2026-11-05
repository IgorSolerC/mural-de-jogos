import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { CloudAccount } from './cloud-account';
import { Cloud } from './cloud-config';

/**
 * A rota do que só a conta de admin vê (PLANO-ADMIN-APIS.md, seção 9): quem não é volta para Extras. Isto
 * só cuida da tela; quem trava de verdade é a API.
 *
 * Para quem está logado e sem a bandeira, pergunta à nuvem antes de recusar: abrindo o link direto, a
 * primeira conferida da conta pode ainda estar a caminho (a conta guardada é de antes dela).
 */
export const onlyAdmin: CanActivateFn = async () => {
  const cloud = inject(Cloud);
  const account = inject(CloudAccount);
  const toExtras = inject(Router).parseUrl('/extras');
  await cloud.ready;
  if (!cloud.config() || !account.signedIn()) return toExtras;
  if (account.account()?.admin) return true;
  await account.refresh().catch(() => undefined);
  return account.account()?.admin ? true : toExtras;
};
