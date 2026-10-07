/**
 * Bugs conhecidos, nos testes do site.
 *
 * `itBug` descreve o comportamento CERTO e hoje falha de propósito: dentro dele, a conferência do
 * sintoma usa `must(...)` (e não `expect`). Enquanto o bug existir, `must` lança e o teste passa,
 * marcado "BUG:" na lista. Quando o comportamento certo acontecer, o teste falha dizendo que parece
 * corrigido: aí troque `itBug` por `it` e cada `must(cond, ...)` por `expect(cond).toBeTrue()`.
 *
 * Um erro qualquer (não do `must`) continua quebrando o teste: o bug só conta se o sintoma for o
 * esperado. `expect` comum dentro de um `itBug` serve para as pré-condições.
 *
 * (O arquivo termina em .spec.ts para ficar fora do build do site, que exclui os specs.)
 */
export class BugSymptom extends Error {}

/** O comportamento certo: se não acontece, é o sintoma do bug. */
export function must(condition: unknown, symptom: string): asserts condition {
  if (!condition) throw new BugSymptom(symptom);
}

export function itBug(name: string, body: () => Promise<void> | void, timeout?: number): void {
  it(
    `BUG: ${name}`,
    async () => {
      try {
        await body();
      } catch (error) {
        if (error instanceof BugSymptom) {
          // o bug continua lá; o sintoma vai no relatório para quem olhar
          expect(error.message).toBeTruthy();
          return;
        }
        throw error;
      }
      fail('Parece corrigido: o comportamento certo aconteceu. Troque itBug por it e must por expect.');
    },
    timeout,
  );
}

describe('itBug (o ajudante)', () => {
  it('must lança o sintoma quando a condição falha, e passa quieto quando vale', () => {
    expect(() => must(false, 'quebrou')).toThrowError(BugSymptom, 'quebrou');
    expect(() => must(1, 'não lança')).not.toThrow();
  });
});
