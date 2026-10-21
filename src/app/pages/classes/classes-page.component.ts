import { Component, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ClassesService } from '../../core/classes/classes.service';
import { SessionService } from '../../core/auth/session.service';

@Component({
  selector: 'app-classes-page',
  imports: [RouterLink],
  template: `
    <section>
      <p class="eyebrow">MIS CLASES</p>
      <h1>Clases</h1>
      <p class="lead">Ingresa con un código o crea una clase si eres docente.</p>

      <div class="actions">
        <a class="secondary-button" routerLink="/classes/join">Ingresar a clase</a>
        <a class="secondary-button" routerLink="/publications/join">Ingresar a evaluación</a>
        @if (session.activeRole() === 'teacher') {
          <a class="primary-button" routerLink="/classes/new">Crear clase</a>
        }
      </div>

      @if (classes.loading()) {
        <p class="notice">Cargando tus clases…</p>
      } @else if (classes.error()) {
        <p class="error">{{ classes.error() }}</p>
      } @else if (classes.myClasses().length === 0) {
        <article class="card">
          <h2>Aún no tienes clases</h2>
          <p>
            @if (session.activeRole() === 'teacher') {
              Crea tu primera clase o ingresa a una con un código.
            } @else {
              Ingresa a una clase con el código que te compartió tu docente.
            }
          </p>
        </article>
      } @else {
        <div class="grid">
          @for (item of classes.myClasses(); track item.id) {
            <article class="card">
              <h2>
                <a class="class-name-link" [routerLink]="['/classes', item.id]">
                  {{ item.name }}
                </a>
              </h2>
              <p>{{ item.memberCount }} de {{ item.capacity }} integrantes</p>
              <p>
                {{ item.modality === 'auto' ? 'Ingreso automático' : 'Ingreso con aprobación' }}
              </p>
            </article>
          }
        </div>
      }
    </section>
  `,
  styles: [
    `
      .class-name-link {
        color: inherit;
        text-decoration: none;
      }

      .class-name-link:hover,
      .class-name-link:focus-visible {
        color: var(--accent-strong);
        text-decoration: underline;
      }

      .class-name-link:focus-visible {
        border-radius: 0.25rem;
        outline: 2px solid var(--outline);
        outline-offset: 2px;
      }
    `,
  ],
})
export class ClassesPageComponent implements OnInit {
  protected readonly session = inject(SessionService);
  protected readonly classes = inject(ClassesService);

  ngOnInit(): void {
    void this.classes.loadMyClasses();
  }
}
