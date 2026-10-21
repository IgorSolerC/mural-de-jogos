import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * As regras de código da API do cofre (seção 9.3 do PLANO-COFRE.md): nunca o corpo do pedido, um token
 * ou um dado no log. O único log permitido é o `console.error` de erro interno em `app.ts`, que leva só
 * o tipo e a mensagem do erro.
 */
const fonte = fileURLToPath(new URL('../src', import.meta.url));

function arquivos(pasta: string): string[] {
  return readdirSync(pasta, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? arquivos(join(pasta, e.name)) : e.name.endsWith('.ts') ? [join(pasta, e.name)] : []));
}

describe('regras do código', () => {
  it('nenhum log além do erro interno', () => {
    const achados = arquivos(fonte).flatMap((f) =>
      readFileSync(f, 'utf8')
        .split('\n')
        .flatMap((linha) => (/\bconsole\.\w+/.test(linha) ? [`${relative(fonte, f)}: ${linha.trim()}`] : [])),
    );
    expect(achados).toEqual(['app.ts: console.error(`erro interno: ${error.name}: ${error.message}`);']);
  });
});
