/**
 * Nos testes: abre o "Mais" (ui/tab-more.ts, o host `app-tab-more`), toca no "Novo grupo", escreve o nome e cria
 * (PLANO-NOVO-GRUPO.md). `settle`: o jeito de cada teste de esperar a tela.
 */
export async function newGroupIn(more: HTMLElement, name: string, settle: () => Promise<void>): Promise<void> {
  // na tela: com a orelha fora dela (a página comprida dos testes de antes), o remendo fecha sozinho
  more.scrollIntoView({ block: 'center' });
  await settle();
  const list = more.querySelector<HTMLElement>('[popover]')!;
  if (!list.matches(':popover-open')) more.querySelector<HTMLButtonElement>('.gatilho')!.click();
  for (let i = 0; i < 10 && !more.querySelector('.novo .criar'); i++) await settle();
  more.querySelector<HTMLButtonElement>('.novo .criar')!.click();
  for (let i = 0; i < 10 && !more.querySelector('.novo input'); i++) await settle();
  const field = more.querySelector<HTMLInputElement>('.novo input')!;
  field.value = name;
  field.dispatchEvent(new Event('input', { bubbles: true }));
  await settle();
  field.form!.requestSubmit();
  await settle();
}
