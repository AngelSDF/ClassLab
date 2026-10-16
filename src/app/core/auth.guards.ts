import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SessionService } from './session.service';

/** Bloquea el acceso si el usuario aún no tiene perfil completo. */
export const requireOnboardedGuard: CanActivateFn = async () => {
  const session = inject(SessionService);
  const router = inject(Router);

  const state = await session.waitForAccountState();
  switch (state) {
    case 'ready':
    case 'anonymous':      // los invitados no requieren onboarding
    case 'unconfigured':   // deja pasar; la vista mostrará el aviso
      return true;
    case 'needsOnboarding':
      return router.parseUrl('/onboarding');
    default:
      return router.parseUrl('/access');
  }
};

/** Solo permite /onboarding si realmente hace falta. */
export const onboardingGuard: CanActivateFn = async () => {
  const session = inject(SessionService);
  const router = inject(Router);

  const state = await session.waitForAccountState();
  if (state === 'needsOnboarding') return true;
  if (state === 'ready') return router.parseUrl('/home');
  return router.parseUrl('/access');
};

/**
 * Requiere sesión activa (registrado o invitado anónimo).
 * No exige que el perfil esté completo, pero si falta onboarding
 * redirige al formulario en lugar de dejar pasar.
 */
export const authenticatedGuard: CanActivateFn = async () => {
  const session = inject(SessionService);
  const router = inject(Router);

  const state = await session.waitForAccountState();
  switch (state) {
    case 'ready':
    case 'anonymous':
      return true;
    case 'needsOnboarding':
      return router.parseUrl('/onboarding');
    case 'unconfigured':
      // Sin Firebase no hay sesión real: manda al acceso, que mostrará el aviso.
      return router.parseUrl('/access');
    default:
      return router.parseUrl('/access');
  }
};

/**
 * Requiere sesión activa Y rol activo 'teacher'.
 * Si el usuario está autenticado pero no es docente, lo devuelve al home.
 */
export const teacherGuard: CanActivateFn = async () => {
  const session = inject(SessionService);
  const router = inject(Router);

  const state = await session.waitForAccountState();
  if (state === 'needsOnboarding') return router.parseUrl('/onboarding');
  if (state !== 'ready') return router.parseUrl('/access');

  // A partir de aquí el usuario tiene perfil; comprobamos el rol activo.
  return session.activeRole() === 'teacher' ? true : router.parseUrl('/home');
};