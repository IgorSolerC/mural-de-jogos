import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { name: 'node', environment: 'node', include: ['test/node.test.ts', 'test/config.test.ts', 'test/code.test.ts', 'test/saude.test.ts', 'test/backup.test.ts', 'test/catalog.test.ts', 'test/agenda.test.ts', 'test/log.test.ts', 'test/segredo.test.ts', 'test/operacoes.test.ts', 'test/operacoes-kanban.test.ts', 'test/operacoes-calendario.test.ts', 'test/operacoes-murais.test.ts', 'test/docs.test.ts', 'test/imagem.test.ts'] },
});
