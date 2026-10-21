import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { SessionService } from '../../core/auth/session.service';

@Component({
  selector: 'app-home-page',
  imports: [RouterLink],
  template: `
    @if (session.isAnonymous()) {
      <section class="hero">
        <div>
          <p class="eyebrow">MODO INVITADO</p>

          <h1>Hola{{ session.displayName() ? ', ' + session.displayName() : '' }}.</h1>

          <p class="lead">
            Estás en una sesión temporal. Ingresa con el código de tu evaluación o inicia sesión con
            tu cuenta.
          </p>
        </div>

        <a class="primary-button" routerLink="/guest">Ingresar con código</a>
      </section>

      <section class="grid">
        <article class="card">
          <h2>Tu sesión de invitado</h2>
          <p>Esta sesión se cerrará cuando vayas al inicio de sesión.</p>
          <div class="actions">
            <a class="secondary-button" routerLink="/access">Iniciar sesión</a>
            <button class="secondary-button" type="button" (click)="closeGuestSession()">
              Cerrar sesión de invitado
            </button>
          </div>
        </article>

        <article class="card">
          <h2>¿Tienes un código?</h2>
          <p>Ingresa el código que te compartió tu docente para comenzar la evaluación.</p>
          <a class="secondary-button" routerLink="/guest">Ir al acceso de invitado</a>
        </article>
      </section>
    } @else {
      <section class="hero">
        <div>
          <p class="eyebrow">ESPACIO PERSONAL</p>

          <h1>Hola{{ session.displayName() ? ', ' + session.displayName() : '' }}.</h1>

          <p class="lead">Tu panel reunirá clases, evaluaciones y progreso.</p>
        </div>

        <a class="primary-button" routerLink="/classes">Ver mis clases</a>
      </section>

      <section class="grid">
        <article class="card">
          <h2>
            {{ session.activeRole() === 'teacher' ? 'Herramientas docentes' : 'Mis evaluaciones' }}
          </h2>
          <p>
            {{
              session.activeRole() === 'teacher'
                ? 'La carga de PDF y la generación con CAG se encuentran maquetadas.'
                : 'Aquí aparecerán tus evaluaciones y resultados.'
            }}
          </p>
          @if (session.activeRole() === 'teacher') {
            <a class="secondary-button" routerLink="/teacher-preview">Ver maqueta de generación</a>
          }
        </article>

        <article class="card">
          <h2>Clases</h2>
          <p>Crea una clase o ingresa con un código para ver tus evaluaciones.</p>
          <a class="secondary-button" routerLink="/classes">Ir a mis clases</a>
        </article>
      </section>
    }
  `,
})
export class HomePageComponent {
  protected readonly session = inject(SessionService);
  private readonly router = inject(Router);

  protected async closeGuestSession(): Promise<void> {
    await this.session.signOut();
    await this.router.navigateByUrl('/access');
  }
}
