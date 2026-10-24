import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * As regras de código da API do cofre (seção 9.3 do PLANO-COFRE.md): nunca o corpo do pedido, um token
 * ou um dado no log. Os únicos logs permitidos são o `console.error` de erro interno em `app.ts`, que leva
 * só o tipo e a mensagem do erro, e o `log` do Worker, que só recebe a linha das respostas de erro de
 * `app.ts` (o método, o molde da rota, o status e o código).
 */
const fonte = fileURLToPath(new URL('../src', import.meta.url));

function arquivos(pasta: string): string[] {
  return readdirSync(pasta, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? arquivos(join(pasta, e.name)) : e.name.endsWith('.ts') ? [join(pasta, e.name)] : []));
}

describe('regras do código', () => {
  it('nenhum log além do erro interno e da linha das respostas de erro (método, molde da rota, status e código)', () => {
    const achados = arquivos(fonte).flatMap((f) =>
      readFileSync(f, 'utf8')
        .split('\n')
        .flatMap((linha) => (/\bconsole\.\w+/.test(linha) ? [`${relative(fonte, f)}: ${linha.trim()}`] : [])),
    );
    expect(achados).toEqual(['app.ts: console.error(`erro interno: ${error.name}: ${error.message}`);', `entry${sep}worker.ts: log: (line) => console.warn(line),`]);
  });
});
