import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { Follow } from '../core/follow';
import { FollowToasts, TRY_AGAIN, failedText } from './follow-toasts';
import { Toasts } from './toast';

describe('FollowToasts', () => {
  let follow: jasmine.SpyObj<Pick<Follow, 'follow' | 'unfollow'>>;
  beforeEach(() => {
    follow = jasmine.createSpyObj('Follow', ['follow', 'unfollow']);
    follow.follow.and.resolveTo();
    follow.unfollow.and.resolveTo();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), { provide: Follow, useValue: follow }] });
  });

  it('seguir: o bilhete de sempre, sem Desfazer (ou com ele, na folha de Pessoas)', async () => {
    const toasts = TestBed.inject(Toasts);
    await TestBed.inject(FollowToasts).start('AB12CD', 'Ana');
    expect(follow.follow).toHaveBeenCalledWith('AB12CD');
    expect(toasts.current()?.text).toBe('Agora você segue Ana. As resenhas novas aparecem em Amigos.');
    expect(toasts.current()?.action).toBeUndefined();
    await TestBed.inject(FollowToasts).start('AB12CD', 'Ana', true);
    toasts.current()!.action!.run();
    expect(follow.unfollow).toHaveBeenCalledWith('AB12CD');
    toasts.dismiss();
  });

  it('deixar de seguir: com o Desfazer, que segue de novo', async () => {
    const toasts = TestBed.inject(Toasts);
    await TestBed.inject(FollowToasts).stop('AB12CD', 'Ana');
    expect(toasts.current()?.text).toBe('Você deixou de seguir Ana');
    toasts.current()!.action!.run();
    expect(follow.follow).toHaveBeenCalledWith('AB12CD');
    toasts.dismiss();
  });

  it('o Desfazer que a nuvem recusa diz por quê (antes ficava calado, e parecia ter dado certo)', async () => {
    const toasts = TestBed.inject(Toasts);
    await TestBed.inject(FollowToasts).stop('AB12CD', 'Ana');
    follow.follow.and.rejectWith(new Error('Você começou a seguir muita gente hoje. Tente de novo amanhã.'));
    toasts.current()!.action!.run();
    await new Promise((r) => setTimeout(r, 0));
    expect(toasts.current()?.text).toBe('Você começou a seguir muita gente hoje. Tente de novo amanhã.');
    follow.follow.and.resolveTo();
    follow.unfollow.and.rejectWith(new Error('Sem conexão'));
    await TestBed.inject(FollowToasts).start('AB12CD', 'Ana', true);
    toasts.current()!.action!.run();
    await new Promise((r) => setTimeout(r, 0));
    expect(toasts.current()?.text).toBe('Sem conexão');
    toasts.dismiss();
  });

  it('o erro: a mensagem da nuvem, ou o tente de novo', () => {
    expect(failedText(new Error('Essa pessoa não existe'))).toBe('Essa pessoa não existe');
    expect(failedText('x')).toBe(TRY_AGAIN);
  });
});
