import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SessionService } from '../core/session.service';

@Component({
  selector: 'app-home-page',
  imports: [RouterLink],
  template: `
    <section class="hero">
      <div>
        <p class="eyebrow">ESPACIO PERSONAL</p>

        <h1>
          Hola{{ session.displayName() ? ', ' + session.displayName() : '' }}.
        </h1>

        <p class="lead">Tu panel reunirá clases, evaluaciones y progreso.</p>
      </div>

      <a class="primary-button" routerLink="/classes">Ver mis clases</a>
    </section>

    <section class="grid">
      <article class="card">
        <h2>
          {{
            session.activeRole() === 'teacher'
              ? 'Herramientas docentes'
              : 'Mis evaluaciones'
          }}
        </h2>
        <p>
          {{
            session.activeRole() === 'teacher'
              ? 'La carga de PDF y la generación con CAG se encuentran maquetadas.'
              : 'Aquí aparecerán tus evaluaciones y resultados.'
          }}
        </p>
        @if (session.activeRole() === 'teacher') {
          <a routerLink="/teacher-preview">Ver maqueta de generación</a>
        }
      </article>

      <article class="card">
        <h2>Clases</h2>
        <p>
          Crea una clase o ingresa con un código para ver tus evaluaciones.
        </p>
        <a routerLink="/classes">Ir a mis clases</a>
      </article>
    </section>
  `,
})
export class HomePageComponent {
  protected readonly session = inject(SessionService);
}