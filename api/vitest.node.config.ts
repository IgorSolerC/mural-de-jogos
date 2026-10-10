import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { name: 'node', environment: 'node', include: ['test/node.test.ts', 'test/config.test.ts', 'test/code.test.ts', 'test/saude.test.ts', 'test/backup.test.ts'] },
});
