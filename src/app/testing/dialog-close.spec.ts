/**
 * O `close` de um `<dialog>`, nos testes do site.
 *
 * O navegador manda o evento `close` numa tarefa depois do `dialog.close()`, e não logo nele. Esperar
 * um ou dois `setTimeout` costuma bastar, mas não sempre: com a máquina ocupada, o evento chega
 * depois, e o teste confere antes do que o `close` faz (fechar a folha, devolver o foco, salvar), ou
 * o evento atrasado fecha a folha que o teste já abriu de novo. Por isso, esperar o próprio evento.
 *
 * (O arquivo termina em .spec.ts para ficar fora do build do site, que exclui os specs.)
 */

/** Uma promessa que se cumpre no próximo `close` do diálogo (pedir antes do que o fecha). */
export function nextClose(dialog: HTMLDialogElement): Promise<void> {
  return new Promise((done) => dialog.addEventListener('close', () => done(), { once: true }));
}

/** Fecha o diálogo e espera o `close` chegar (fechado já, não espera nada). */
export async function closeDialog(dialog: HTMLDialogElement): Promise<void> {
  if (!dialog.open) return;
  const closed = nextClose(dialog);
  dialog.close();
  await closed;
}
