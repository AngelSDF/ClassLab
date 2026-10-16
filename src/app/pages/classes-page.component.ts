import { Component, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ClassesService } from '../core/classes.service';
import { SessionService } from '../core/session.service';

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
              <h2>{{ item.name }}</h2>
              <p>{{ item.memberCount }} de {{ item.capacity }} integrantes</p>
              <p>
                {{ item.modality === 'auto' ? 'Ingreso automático' : 'Ingreso con aprobación' }}
              </p>
              <a [routerLink]="['/classes', item.id]">Abrir clase</a>
            </article>
          }
        </div>
      }
    </section>
  `,
})
export class ClassesPageComponent implements OnInit {
  protected readonly session = inject(SessionService);
  protected readonly classes = inject(ClassesService);

  ngOnInit(): void {
    void this.classes.loadMyClasses();
  }
}
