/**
 * O OpenAPI 3.1 da API das AIs (PLANO-API.md, 13.1), gerado das ferramentas: cada uma é uma rota de
 * `/ext/v1`, então a documentação e o MCP nunca se desencontram. `docs/api/openapi.json` é a cópia
 * revisada no repositório (um teste da API confere). Só funções puras.
 */

import { ARGUMENTOS_DE_FORA, FERRAMENTAS, type Esquema, type Ferramenta } from './ferramentas';

const fora = ARGUMENTOS_DE_FORA as readonly string[];

/** Uma operação do OpenAPI para a ferramenta, na rota `path` (com ou sem o id). */
function operacao(f: Ferramenta, comId: boolean) {
  const props = f.entrada.properties ?? {};
  const required = f.entrada.required ?? [];
  const campos = Object.entries(props).filter(([k]) => !fora.includes(k));
  const parameters: unknown[] = [];
  if (comId) parameters.push({ name: 'id', in: 'path', required: true, schema: props['id'] ?? { type: 'string' } });
  if (props['chave_idempotencia']) {
    parameters.push({ name: 'Idempotency-Key', in: 'header', required: false, description: props['chave_idempotencia'].description, schema: { type: 'string', maxLength: 100 } });
  }
  let requestBody: unknown;
  if (f.metodo === 'GET') {
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
    description: f.descricao + (f.escopo ? ` Permissão: ${f.escopo}.` : ''),
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
    const p = caminho.replace(':id', '{id}');
    (paths[p] ??= {})[f.metodo.toLowerCase()] = operacao(f, comId);
  };
  for (const f of FERRAMENTAS) {
    if (!f.caminho.startsWith('/ext/')) continue;
    add(f.caminho, f, f.caminho.includes(':id'));
    if (f.caminhoSemId) add(f.caminhoSemId, f, false);
  }
  return {
    openapi: '3.1.0',
    info: {
      title: 'Murall: API para AIs e programas',
      version: '1',
      description: `Ler e escrever nas Anotações de uma pessoa, com uma chave criada em Ajustes › Acessos. Toda escrita vira um pedido, que entra quando o Murall estiver aberto. Guia: ${api}/llms-full.txt`,
    },
    servers: [{ url: api }],
    security: [{ chave: [] }],
    components: { securitySchemes: { chave: { type: 'http', scheme: 'bearer', description: 'A chave murall_… criada em Ajustes › Acessos.' } } },
    paths,
  };
}
