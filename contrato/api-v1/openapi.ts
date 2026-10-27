/**
 * O OpenAPI 3.1 da API das AIs (PLANO-API.md, 13.1), gerado das ferramentas: cada uma é uma rota de
 * `/ext/v1`, então a documentação e o MCP nunca se desencontram. `docs/api/openapi.json` é a cópia
 * revisada no repositório (um teste da API confere). Só funções puras.
 */

import { ARGUMENTOS_DE_FORA, FERRAMENTAS, escopoEmPalavras, type Esquema, type Ferramenta } from './ferramentas';

const fora = ARGUMENTOS_DE_FORA as readonly string[];

/** Uma operação do OpenAPI para a ferramenta, na rota `caminho` (com ou sem o id). */
function operacao(f: Ferramenta, caminho: string, comId: boolean) {
  const props = f.entrada.properties ?? {};
  const required = f.entrada.required ?? [];
  const inPath = [...caminho.matchAll(/:(\w+)/g)].map((m) => m[1]!);
  // os do caminho com o :nome não viram campo nem no caminho sem ele (a lista dos quadros não tem grupo)
  const ofPath = [...f.caminho.matchAll(/:(\w+)/g)].map((m) => m[1]!);
  const campos = Object.entries(props).filter(([k]) => !fora.includes(k) && !ofPath.includes(k));
  const parameters: unknown[] = [];
  for (const name of inPath) parameters.push({ name, in: 'path', required: true, schema: props[name] ?? { type: 'string' } });
  if (props['chave_idempotencia']) {
    parameters.push({ name: 'Idempotency-Key', in: 'header', required: false, description: props['chave_idempotencia'].description, schema: { type: 'string', maxLength: 100 } });
  }
  let requestBody: unknown;
  if (f.metodo === 'GET' || f.metodo === 'DELETE') {
    for (const [name, schema] of campos) parameters.push({ name, in: 'query', required: required.includes(name), ...(schema.description ? { description: schema.description } : {}), schema: semDescricao(schema) });
  } else if (campos.length) {
    const body: Esquema = { type: 'object', properties: Object.fromEntries(campos), additionalProperties: false };
    const req = required.filter((r) => !fora.includes(r));
    if (req.length) body.required = req;
    requestBody = { required: req.length > 0, content: { 'application/json': { schema: body } } };
  }
  const ok = f.somenteLeitura ? { '200': { description: 'O que foi pedido, em JSON.' } } : { '202': { description: 'O pedido guardado e a nota como vai ficar (ela entra quando o Murall estiver aberto).' } };
  return {
    operationId: comId || !f.caminhoSemId ? f.nome : `${f.nome}_todos`,
    summary: f.titulo,
    description: f.descricao + (f.escopo ? ` Permissão: ${escopoEmPalavras(f.escopo)}.` : ''),
    ...(parameters.length ? { parameters } : {}),
    ...(requestBody ? { requestBody } : {}),
    responses: { ...ok, default: { description: 'Erro: {"erro": "codigo", "mensagem": "..."}' } },
  };
}

function semDescricao(s: Esquema): Esquema {
  const { description: _d, ...rest } = s;
  return rest;
}

export function openapi(api: string) {
  const paths: Record<string, Record<string, unknown>> = {};
  const add = (caminho: string, f: Ferramenta, comId: boolean) => {
    const p = caminho.replace(/:(\w+)/g, '{$1}');
    (paths[p] ??= {})[f.metodo.toLowerCase()] = operacao(f, caminho, comId);
  };
  for (const f of FERRAMENTAS) {
    if (!f.caminho.startsWith('/ext/')) continue;
    add(f.caminho, f, true);
    if (f.caminhoSemId) add(f.caminhoSemId, f, false);
  }
  return {
    openapi: '3.1.0',
    info: {
      title: 'Murall: API para AIs e programas',
      version: '1',
      description: `Ler e escrever nas Anotações, no Kanban e nos Gastos de uma pessoa, com uma chave criada em Ajustes › Acessos. Toda escrita vira um pedido, que entra quando o Murall estiver aberto. Guia: ${api}/llms-full.txt`,
    },
    servers: [{ url: api }],
    security: [{ chave: [] }],
    components: { securitySchemes: { chave: { type: 'http', scheme: 'bearer', description: 'A chave murall_… criada em Ajustes › Acessos.' } } },
    paths,
  };
}
