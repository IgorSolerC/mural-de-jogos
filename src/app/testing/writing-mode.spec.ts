/**
 * O editor do texto abrindo no Markdown, nos testes da `<textarea>`.
 *
 * Desde a rodada 9 do modo Visual (PLANO-EDITOR-VISUAL.md), o editor abre no Visual para quem não
 * escolheu. Os testes que escrevem na `<textarea>` (as marcas à vista) pedem o Markdown como se a pessoa
 * o tivesse escolhido nos Ajustes ("Jeito de escrever", guardado como `escrita`): a leitura dos ajustes
 * guardados diz "markdown", o que quer que esteja guardado. Vale também depois de um `localStorage.clear()` no
 * `beforeEach` do teste, e nada fica gravado (o espião sai com o teste).
 *
 * (O arquivo termina em .spec.ts para ficar fora do build do site, que exclui os specs.)
 */

const CONFIG = 'mural-de-jogos:config:v1';

/** Chamar no começo do `describe`. */
export function comMarkdown(): void {
  beforeEach(() => {
    const ler = Storage.prototype.getItem;
    spyOn(Storage.prototype, 'getItem').and.callFake(function (this: Storage, key: string) {
      const guardado = ler.call(this, key);
      if (this !== localStorage || key !== CONFIG) return guardado;
      let atual: Record<string, unknown> = {};
      try {
        atual = JSON.parse(guardado ?? '{}') ?? {};
      } catch {
        atual = {};
      }
      // sempre o Markdown: um `escrita` deixado por outro spec não vale aqui (o teste que quer o Visual
      // troca o sinal dos Ajustes, `writingMode`, direto)
      return JSON.stringify({ ...atual, escrita: 'markdown' });
    });
  });
}
