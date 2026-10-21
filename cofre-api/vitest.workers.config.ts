import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      wrangler: { configPath: './wrangler.toml' },
      miniflare: {
        bindings: { TEST_MIGRATIONS: await readD1Migrations('./migrations') },
        // a API do Murall não existe aqui: os testes usam o Murall de mentira (test/harness.ts)
        serviceBindings: { MURAL: () => new Response('sem Murall nos testes', { status: 503 }) },
      },
    })),
  ],
  test: { name: 'workers', include: ['test/workers.test.ts', 'test/webauthn.test.ts'] },
});
