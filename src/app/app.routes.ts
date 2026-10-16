import { Routes } from '@angular/router';
import {
  authenticatedGuard,
  onboardingGuard,
  requireOnboardedGuard,
  teacherGuard,
} from './core/auth.guards';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'home' },

  {
    path: 'access',
    loadComponent: () => import('./pages/access-page.component').then((m) => m.AccessPageComponent),
  },

  {
    path: 'onboarding',
    canActivate: [onboardingGuard],
    loadComponent: () =>
      import('./pages/onboarding-page.component').then((m) => m.OnboardingPageComponent),
  },

  {
    path: 'home',
    canActivate: [requireOnboardedGuard],
    loadComponent: () => import('./pages/home-page.component').then((m) => m.HomePageComponent),
  },

  {
    path: 'guest',
    loadComponent: () => import('./pages/guest-page.component').then((m) => m.GuestPageComponent),
  },

  {
    path: 'profile',
    canActivate: [authenticatedGuard],
    loadComponent: () =>
      import('./pages/profile-page.component').then((m) => m.ProfilePageComponent),
  },

  {
    path: 'classes',
    canActivate: [authenticatedGuard],
    loadComponent: () =>
      import('./pages/classes-page.component').then((m) => m.ClassesPageComponent),
  },

  {
    path: 'classes/new',
    canActivate: [teacherGuard],
    loadComponent: () =>
      import('./pages/class-form-page.component').then((m) => m.ClassFormPageComponent),
  },

  {
    path: 'classes/join',
    canActivate: [authenticatedGuard],
    loadComponent: () =>
      import('./pages/join-class-page.component').then((m) => m.JoinClassPageComponent),
  },

  {
    path: 'classes/:classId/edit',
    canActivate: [teacherGuard],
    loadComponent: () =>
      import('./pages/class-edit-page.component').then((m) => m.ClassEditPageComponent),
  },

  {
    path: 'classes/:classId',
    canActivate: [authenticatedGuard],
    loadComponent: () => import('./pages/class-page.component').then((m) => m.ClassPageComponent),
  },

  {
    path: 'evaluations/:evaluationId',
    canActivate: [authenticatedGuard],
    loadComponent: () =>
      import('./pages/evaluation-page.component').then((m) => m.EvaluationPageComponent),
  },

  {
    path: 'teacher-preview',
    canActivate: [teacherGuard],
    loadComponent: () =>
      import('./pages/evaluation-page.component').then((m) => m.EvaluationPageComponent),
  },

  // Un único wildcard, al final.
  { path: '**', redirectTo: 'home' },
];
