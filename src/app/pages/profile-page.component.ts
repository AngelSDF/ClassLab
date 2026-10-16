import { Component, inject } from '@angular/core';
import { SessionService } from '../core/session.service';
import { UserRole } from '../core/user-record';

@Component({
  selector: 'app-profile-page',
  template: `
    <section class="narrow-page">
      <p class="eyebrow">PERFIL</p>
      <h1>Tu cuenta</h1>

      <article class="card profile-card">
        <img
          [src]="session.userRecord()?.photoURL || 'https://placehold.co/96x96/e0e7ff/1e3a8a?text=CL'"
          alt="Foto de perfil"
        />

        <div>
          <h2>{{ session.userRecord()?.firstName || 'Usuario' }}</h2>
          <p>{{ session.userRecord()?.email }}</p>
        </div>
      </article>

      <article class="card">
        <h2>Roles autorizados</h2>
        <p>El administrador concede los roles.</p>

        <div class="role-options">
          @for (role of session.availableRoles(); track role) {
            <button
              type="button"
              [class.selected]="session.activeRole() === role"
              (click)="selectRole(role)"
            >
              {{ role === 'teacher' ? 'Docente' : 'Estudiante' }}
            </button>
          }
        </div>
      </article>
    </section>
  `,
})
export class ProfilePageComponent {
  protected readonly session = inject(SessionService);

  protected selectRole(role: UserRole): void {
    this.session.setActiveRole(role);
  }
}