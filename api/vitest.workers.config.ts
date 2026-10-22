import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      wrangler: { configPath: './wrangler.toml' },
      miniflare: {
        bindings: { TEST_MIGRATIONS: await readD1Migrations('./migrations') },
        // o Worker do cofre não existe aqui: os testes passam o cofre de mentira nas deps (test/suite.ts)
        serviceBindings: { COFRE: () => new Response('sem cofre nos testes', { status: 503 }) },
      },
    })),
  ],
  test: { name: 'workers', include: ['test/workers.test.ts'] },
});
