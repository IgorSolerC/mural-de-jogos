import { keyboardOpen } from './visual-viewport';

describe('o teclado do celular aberto', () => {
  it('a parte visível bem mais baixa que a página: é o teclado', () => {
    expect(keyboardOpen(844, 464, 1)).toBeTrue();
    // deitado, o teclado come quase tudo
    expect(keyboardOpen(390, 150, 1)).toBeTrue();
  });

  it('a barra de endereço que some ou aparece não é o teclado', () => {
    expect(keyboardOpen(844, 844, 1)).toBeFalse();
    expect(keyboardOpen(844, 780, 1)).toBeFalse();
  });

  it('com zoom de pinça a parte visível encolhe, mas não é o teclado', () => {
    expect(keyboardOpen(844, 422, 2)).toBeFalse();
  });
});
