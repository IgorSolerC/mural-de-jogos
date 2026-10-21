import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { name: 'node', environment: 'node', include: ['test/node.test.ts', 'test/config.test.ts', 'test/regras.test.ts', 'test/webauthn.test.ts', 'test/backup.test.ts', 'test/segredo.test.ts', 'test/workflows.test.ts'] },
});
