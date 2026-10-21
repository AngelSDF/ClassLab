import { Routes } from '@angular/router';
import {
  authenticatedGuard,
  classMemberGuard,
  classOwnerGuard,
  clearGuestSessionGuard,
  onboardingGuard,
  pendingAttemptExitGuard,
  publicationParticipantGuard,
  registeredGuard,
  requireOnboardedGuard,
  teacherGuard,
} from './core/auth/auth.guards';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'home' },

  {
    path: 'access',
    canActivate: [clearGuestSessionGuard],
    loadComponent: () =>
      import('./pages/account/access-page.component').then((m) => m.AccessPageComponent),
  },

  {
    path: 'onboarding',
    canActivate: [onboardingGuard],
    loadComponent: () =>
      import('./pages/account/onboarding-page.component').then((m) => m.OnboardingPageComponent),
  },

  {
    path: 'home',
    canActivate: [requireOnboardedGuard],
    loadComponent: () =>
      import('./pages/home/home-page.component').then((m) => m.HomePageComponent),
  },

  {
    path: 'guest',
    loadComponent: () =>
      import('./pages/home/guest-page.component').then((m) => m.GuestPageComponent),
  },

  {
    path: 'profile',
    canActivate: [registeredGuard],
    loadComponent: () =>
      import('./pages/account/profile-page.component').then((m) => m.ProfilePageComponent),
  },

  {
    path: 'classes',
    canActivate: [registeredGuard],
    loadComponent: () =>
      import('./pages/classes/classes-page.component').then((m) => m.ClassesPageComponent),
  },

  {
    path: 'classes/new',
    canActivate: [teacherGuard],
    loadComponent: () =>
      import('./pages/classes/class-form-page.component').then((m) => m.ClassFormPageComponent),
  },

  {
    path: 'classes/join',
    canActivate: [registeredGuard],
    loadComponent: () =>
      import('./pages/classes/join-class-page.component').then((m) => m.JoinClassPageComponent),
  },

  {
    path: 'publications/join',
    canActivate: [registeredGuard],
    loadComponent: () =>
      import('./pages/publications/join-publication-page.component').then(
        (m) => m.JoinPublicationPageComponent,
      ),
  },

  {
    path: 'classes/:classId/edit',
    canActivate: [teacherGuard],
    loadComponent: () =>
      import('./pages/classes/class-edit-page.component').then((m) => m.ClassEditPageComponent),
  },

  {
    path: 'classes/:classId/evaluations/new',
    canActivate: [teacherGuard],
    loadComponent: () =>
      import('./pages/evaluations/evaluation-generate-page.component').then(
        (m) => m.EvaluationGeneratePageComponent,
      ),
  },

  {
    path: 'classes/:classId/evaluations/:evaluationId/edit',
    canActivate: [teacherGuard],
    loadComponent: () =>
      import('./pages/evaluations/evaluation-edit-page.component').then(
        (m) => m.EvaluationEditPageComponent,
      ),
  },

  {
    path: 'classes/:classId/publications/new',
    canActivate: [teacherGuard],
    loadComponent: () =>
      import('./pages/publications/publication-create-page.component').then(
        (m) => m.PublicationCreatePageComponent,
      ),
  },

  {
    path: 'classes/:classId/publications/:publicationId/edit',
    canActivate: [teacherGuard],
    loadComponent: () =>
      import('./pages/publications/publication-edit-page.component').then(
        (m) => m.PublicationEditPageComponent,
      ),
  },

  {
    path: 'classes/:classId/publications/:publicationId/take',
    canActivate: [authenticatedGuard, publicationParticipantGuard],
    canDeactivate: [pendingAttemptExitGuard],
    loadComponent: () =>
      import('./pages/publications/take-publication-page.component').then(
        (m) => m.TakePublicationPageComponent,
      ),
  },

  {
    path: 'classes/:classId/publications/:publicationId/results',
    canActivate: [teacherGuard, classOwnerGuard],
    loadComponent: () =>
      import('./pages/publications/publication-results-page.component').then(
        (m) => m.PublicationResultsPageComponent,
      ),
  },

  {
    path: 'classes/:classId',
    canActivate: [registeredGuard, classMemberGuard],
    loadComponent: () =>
      import('./pages/classes/class-page.component').then((m) => m.ClassPageComponent),
  },

  {
    path: 'evaluations/:evaluationId',
    canActivate: [registeredGuard],
    loadComponent: () =>
      import('./pages/evaluations/evaluation-page.component').then(
        (m) => m.EvaluationPageComponent,
      ),
  },

  {
    path: 'teacher-preview',
    canActivate: [teacherGuard],
    loadComponent: () =>
      import('./pages/evaluations/evaluation-page.component').then(
        (m) => m.EvaluationPageComponent,
      ),
  },

  // Un único wildcard, al final.
  { path: '**', redirectTo: 'home' },
];
