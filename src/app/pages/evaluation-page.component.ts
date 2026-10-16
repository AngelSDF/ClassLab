import { Component, inject } from '@angular/core';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { SessionService } from '../core/session.service';

@Component({
  selector: 'app-evaluation-page',
  imports: [RouterLink],
  template: `
    <section class="narrow-page">
      <p class="eyebrow">EVALUACIÓN · MAQUETA</p>

      <h1>
        {{ isTeacherPreview ? 'Generar evaluación' : 'Acceso validado' }}
      </h1>

      @if (isTeacherPreview) {
        <article class="card">
          <h2>PDF → texto → CAG/Groq</h2>
          <p>
            El flujo está representado visualmente; no se suben archivos
            ni se llama a un modelo todavía.
          </p>

          <ol>
            <li>Seleccionar PDF</li>
            <li>Extraer y limpiar texto</li>
            <li>Generar borrador validado</li>
            <li>Revisar antes de publicar</li>
          </ol>

          <button class="primary-button" disabled>
            Generación disponible próximamente
          </button>
        </article>
      } @else {
        <article class="card">
          <h2>Sesión iniciada</h2>

          <p>
            @if (session.isAnonymous()) {
              Invitado: {{ session.guestName() }}.
            } @else {
              Accediste como usuario autenticado.
            }
            Las preguntas y los intentos se implementarán después.
          </p>

          <a routerLink="/home">Volver al inicio</a>
        </article>
      }
    </section>
  `,
})
export class EvaluationPageComponent {
  protected readonly session = inject(SessionService);
  private readonly route = inject(ActivatedRoute);

  protected readonly isTeacherPreview =
    this.route.snapshot.routeConfig?.path === 'teacher-preview';
}