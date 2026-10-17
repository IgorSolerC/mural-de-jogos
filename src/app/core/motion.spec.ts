import { reducedMotion } from './motion';

describe('reducedMotion', () => {
  it('segue o que o sistema pediu', () => {
    const spy = spyOn(window, 'matchMedia').and.returnValue({ matches: true } as MediaQueryList);
    expect(reducedMotion()).toBeTrue();
    expect(spy).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
    spy.and.returnValue({ matches: false } as MediaQueryList);
    expect(reducedMotion()).toBeFalse();
  });
});
