import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  CanActivateFn,
  RouterStateSnapshot,
  UrlTree,
  provideRouter,
} from '@angular/router';
import { clearGuestSessionGuard, registeredGuard } from './auth.guards';
import { AccountState, SessionService } from './session.service';

describe('auth guards', () => {
  let state: AccountState;
  let signOutCalls: number;

  beforeEach(() => {
    state = 'ready';
    signOutCalls = 0;

    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: SessionService,
          useValue: {
            waitForAccountState: async () => state,
            signOut: async () => {
              signOutCalls += 1;
            },
          },
        },
      ],
    });
  });

  async function runGuard(guard: CanActivateFn): Promise<unknown> {
    return TestBed.runInInjectionContext(() =>
      guard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
    );
  }

  it('permite el paso a una cuenta registrada', async () => {
    await expect(runGuard(registeredGuard)).resolves.toBe(true);
  });

  it('manda al onboarding si falta completar el perfil', async () => {
    state = 'needsOnboarding';

    const result = await runGuard(registeredGuard);

    expect(result).toBeInstanceOf(UrlTree);
    expect(String(result)).toBe('/onboarding');
  });

  it('manda a los invitados al acceso', async () => {
    state = 'anonymous';

    const result = await runGuard(registeredGuard);

    expect(result).toBeInstanceOf(UrlTree);
    expect(String(result)).toBe('/access');
  });

  it('cierra la sesión anónima al entrar al acceso', async () => {
    state = 'anonymous';

    await expect(runGuard(clearGuestSessionGuard)).resolves.toBe(true);
    expect(signOutCalls).toBe(1);
  });

  it('no cierra sesiones registradas al entrar al acceso', async () => {
    await expect(runGuard(clearGuestSessionGuard)).resolves.toBe(true);
    expect(signOutCalls).toBe(0);
  });
});
