import type { Demonstracao } from './servicos';

/**
 * A demonstração das telas sem servidor existe só no desenvolvimento: `ng serve cofre` troca este
 * arquivo por `ambiente.dev.ts` (fileReplacements no angular.json). No build de produção, nunca há
 * demonstração (e os hashes do build conferem isso).
 */
export function demonstracao(): Demonstracao | null {
  return null;
}
