import { inject } from '@angular/core';
import { CanActivateFn, CanDeactivateFn, Router } from '@angular/router';
import { ClassesService } from '../classes/classes.service';
import { SessionService } from './session.service';

/** Bloquea el acceso si el usuario aún no tiene perfil completo. */
export const requireOnboardedGuard: CanActivateFn = async () => {
  const session = inject(SessionService);
  const router = inject(Router);

  const state = await session.waitForAccountState();
  switch (state) {
    case 'ready':
    case 'anonymous': // los invitados no requieren onboarding
    case 'unconfigured': // deja pasar; la vista mostrará el aviso
      return true;
    case 'needsOnboarding':
      return router.parseUrl('/onboarding');
    default:
      return router.parseUrl('/access');
  }
};

/**
 * Cierra la sesión anónima al entrar a /access. Se ejecuta después del
 * canDeactivate de la evaluación, por lo que un intento en curso se envía
 * antes de perder la sesión.
 */
export const clearGuestSessionGuard: CanActivateFn = async () => {
  const session = inject(SessionService);

  const state = await session.waitForAccountState();
  if (state === 'anonymous') await session.signOut();
  return true;
};

/**
 * Requiere una cuenta registrada (no invitado) y con perfil completo.
 * Los invitados solo pueden entrar a la evaluación mediante su código.
 */
export const registeredGuard: CanActivateFn = async () => {
  const session = inject(SessionService);
  const router = inject(Router);

  const state = await session.waitForAccountState();
  switch (state) {
    case 'ready':
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
 * Requiere que el usuario sea miembro (activo o pendiente) de la clase
 * indicada en el parámetro `classId`. Los no-miembros vuelven a /classes.
 */
export const classMemberGuard: CanActivateFn = async (route) => {
  const session = inject(SessionService);
  const classes = inject(ClassesService);
  const router = inject(Router);

  const state = await session.waitForAccountState();
  if (state !== 'ready' && state !== 'anonymous') return router.parseUrl('/access');

  const classId = route.paramMap.get('classId');
  if (!classId) return router.parseUrl('/classes');

  const membership = await classes.getMyMembership(classId);
  return membership ? true : router.parseUrl('/classes');
};

/**
 * Permite abrir una publicación a un miembro de la clase o a un invitado
 * anónimo. Las reglas de Firestore validan cupo y acceso de invitado.
 */
export const publicationParticipantGuard: CanActivateFn = async (route) => {
  const session = inject(SessionService);
  const classes = inject(ClassesService);
  const router = inject(Router);

  const state = await session.waitForAccountState();
  if (state !== 'ready' && state !== 'anonymous') return router.parseUrl('/access');

  const classId = route.paramMap.get('classId');
  if (!classId) return router.parseUrl('/classes');

  // El invitado no tiene membresía; la página y las reglas controlan el cupo.
  if (state === 'anonymous') return true;

  const membership = await classes.getMyMembership(classId);
  return membership ? true : router.parseUrl('/classes');
};

export interface PendingAttemptExitTarget {
  canLeavePage?: () => boolean | Promise<boolean>;
}

/**
 * Pide confirmación antes de abandonar un intento activo. El componente
 * decide si solo guarda el avance o si debe enviar el examen.
 */
export const pendingAttemptExitGuard: CanDeactivateFn<unknown> = (component) => {
  const target = component as PendingAttemptExitTarget | null;
  return target?.canLeavePage?.() ?? true;
};

/**
 * Requiere que el usuario sea el docente propietario de la clase indicada.
 */
export const classOwnerGuard: CanActivateFn = async (route) => {
  const session = inject(SessionService);
  const classes = inject(ClassesService);
  const router = inject(Router);

  const state = await session.waitForAccountState();
  if (state !== 'ready') return router.parseUrl('/access');

  const classId = route.paramMap.get('classId');
  if (!classId) return router.parseUrl('/classes');

  const record = await classes.getClass(classId);
  if (!record || record.ownerTeacherId !== session.user()?.uid) {
    return router.parseUrl(`/classes/${classId}`);
  }
  return true;
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
