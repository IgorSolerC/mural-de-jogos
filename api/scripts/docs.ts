// Regera as cópias da documentação no repositório (docs/api/), a partir do contrato. `npm run docs`.
import { mkdirSync, writeFileSync } from 'node:fs';
import { API_DO_MURALL as DOCS_API, guia } from '../../contrato/api-v1/guia';
import { openapi } from '../../contrato/api-v1/openapi';

mkdirSync('../docs/api', { recursive: true });
writeFileSync('../docs/api/guia.md', guia(DOCS_API));
writeFileSync('../docs/api/openapi.json', `${JSON.stringify(openapi(DOCS_API), null, 2)}\n`);
console.log('docs/api/guia.md e docs/api/openapi.json regerados.');
