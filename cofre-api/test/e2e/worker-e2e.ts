import { deps, type Env, serve } from '../../src/entry/worker';

/**
 * O cofre inteiro (a página e a API, com os cabeçalhos de verdade) para o teste de ponta a ponta no
 * Chrome com o autenticador virtual (PLANO-COFRE.md, 17.6, parte 4), com o login do Google e a conta do
 * Murall de mentira: qualquer código do Google entra como a conta E2E.
 *
 * NUNCA É PUBLICADO: roda só com `wrangler dev -c test/e2e/wrangler.e2e.toml`, sem rota nem workers.dev,
 * e recusa qualquer origem que não seja localhost.
 */
const CONTA = { id: '0e2e0e2e-5d4f-4e3a-9b1c-2d3e4f5a6b7c', code: 'E2ETESTE' };

export default {
  async fetch(request, env) {
    if (!/^http:\/\/localhost:\d+$/.test(env.COFRE_ORIGEM ?? '')) return new Response('só em localhost', { status: 500 });
    return serve(request, env, (e) => ({
      ...deps(e),
      googleLogin: async () => 'sub-e2e',
      mural: { accountByGoogle: async (sub) => (sub === 'sub-e2e' ? CONTA : null) },
    }));
  },
} satisfies ExportedHandler<Env>;
