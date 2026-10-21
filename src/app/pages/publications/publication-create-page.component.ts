import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ClassesService } from '../../core/classes/classes.service';
import { EvaluationRecord, EvaluationSummary } from '../../core/evaluations/evaluation-record';
import { EvaluationsService } from '../../core/evaluations/evaluations.service';
import { buildPublicationSchedule } from '../../core/publications/publication-schedule';
import {
  DEFAULT_DURATION_MINUTES,
  MAX_DURATION_MINUTES,
  validateDurationMinutes,
} from '../../core/publications/publication-time-limit';
import { PublicationsService } from '../../core/publications/publications.service';
import { SessionService } from '../../core/auth/session.service';

@Component({
  selector: 'app-publication-create-page',
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <section class="narrow-page">
      <a class="back-link" [routerLink]="['/classes', classId]">← Volver a la clase</a>

      @if (loading()) {
        <p class="notice">Cargando…</p>
      } @else if (error()) {
        <p class="error">{{ error() }}</p>
      } @else if (createdPublicationId(); as publicationId) {
        <article class="card">
          <p class="eyebrow">PUBLICACIÓN CREADA</p>
          <h1>Publicación creada</h1>
          <p>
            Se guardó una copia independiente de la evaluación. La evaluación original no cambió.
          </p>
          <p>
            Código de acceso:
            <strong class="access-code">{{ createdAccessCode() }}</strong>
          </p>
          <p>
            <small>Comparte este código con tus estudiantes. ID: {{ publicationId }}</small>
          </p>
          <div class="actions">
            <a
              class="primary-button"
              [routerLink]="['/classes', classId, 'publications', publicationId, 'edit']"
            >
              Ver publicación
            </a>
            <a class="secondary-button" [routerLink]="['/classes', classId]"> Volver a la clase </a>
          </div>
        </article>
      } @else {
        <article class="card">
          <p class="eyebrow">PUBLICAR EVALUACIÓN</p>
          <h1>Publicar evaluación</h1>
          <p class="lead">
            Clase: <strong>{{ className() }}</strong>
          </p>

          <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
            @if (!fixedEvaluationId) {
              <label>
                <span>Evaluación (borrador)</span>
                <select formControlName="evaluationId">
                  @for (item of evaluations(); track item.id) {
                    <option [value]="item.id">
                      {{ item.title }} ({{ item.questionCount }} pregunta(s))
                    </option>
                  }
                </select>
              </label>
            }

            @if (selectedEvaluationInfo; as selected) {
              <p class="notice">
                Copia de: <strong>{{ selected.title }}</strong> ·
                {{ selectedQuestionCount }} pregunta(s). La evaluación original no se modificará.
              </p>
            }

            <label>
              <span>Fecha (opcional)</span>
              <input type="date" formControlName="date" />
            </label>

            <label>
              <span>Hora de inicio</span>
              <input type="time" formControlName="startTime" />
            </label>

            <label>
              <span>Hora de fin</span>
              <input type="time" formControlName="endTime" />
            </label>

            <small>
              Si no indicas fecha, la publicación no tendrá ventana horaria y se controlará por
              intentos. Si indicas fecha, ambas horas son obligatorias.
            </small>

            <label>
              <span>Número de intentos</span>
              <input
                type="number"
                formControlName="maxAttempts"
                min="1"
                max="100"
                step="1"
                inputmode="numeric"
              />
              @if (form.controls.maxAttempts.touched && form.controls.maxAttempts.invalid) {
                <small class="error">Ingresa un número entre 1 y 100.</small>
              }
            </label>

            <label class="checkbox-row">
              <input type="checkbox" formControlName="timeLimitEnabled" />
              <span>Limitar el tiempo del examen</span>
            </label>

            @if (form.controls.timeLimitEnabled.value) {
              <label>
                <span>Duración (minutos)</span>
                <input
                  type="number"
                  formControlName="durationMinutes"
                  [min]="minDurationMinutes"
                  [max]="maxDurationMinutes"
                  step="1"
                  inputmode="numeric"
                />
                <small>
                  El contador inicia cuando el estudiante o invitado abre la evaluación. Sin límite,
                  al salir se envía el intento.
                </small>
                @if (
                  form.controls.durationMinutes.touched && form.controls.durationMinutes.invalid
                ) {
                  <small class="error">Ingresa un número entre 1 y 180 minutos.</small>
                }
              </label>
            }

            <label class="checkbox-row">
              <input type="checkbox" formControlName="guestAccess" />
              <span>Permitir acceso como invitado sin cuenta</span>
            </label>

            @if (form.controls.guestAccess.value) {
              <label>
                <span>Vacantes para invitados</span>
                <input
                  type="number"
                  formControlName="guestCapacity"
                  min="1"
                  max="500"
                  step="1"
                  inputmode="numeric"
                />
                <small>
                  Obligatorio. Cada invitado ocupa una vacante al iniciar su primer intento.
                </small>
              </label>
            }

            @if (actionError()) {
              <p class="error">{{ actionError() }}</p>
            }

            <button class="primary-button" type="submit" [disabled]="submitDisabled">
              {{ working() ? 'Publicando…' : 'Crear publicación' }}
            </button>
          </form>
        </article>
      }
    </section>
  `,
})
export class PublicationCreatePageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly classes = inject(ClassesService);
  private readonly evaluationsService = inject(EvaluationsService);
  private readonly publications = inject(PublicationsService);
  private readonly session = inject(SessionService);
  private readonly fb = inject(FormBuilder);

  protected readonly classId = this.route.snapshot.paramMap.get('classId') ?? '';
  protected readonly fixedEvaluationId =
    this.route.snapshot.queryParamMap.get('evaluationId') ?? '';

  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly className = signal('');
  protected readonly evaluations = signal<EvaluationSummary[]>([]);
  protected readonly evaluation = signal<EvaluationRecord | null>(null);
  protected readonly working = signal(false);
  protected readonly actionError = signal<string | null>(null);
  protected readonly createdPublicationId = signal<string | null>(null);
  protected readonly createdAccessCode = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    evaluationId: ['', Validators.required],
    date: [''],
    startTime: [''],
    endTime: [''],
    maxAttempts: [1, [Validators.required, Validators.min(1), Validators.max(100)]],
    timeLimitEnabled: [true],
    durationMinutes: [
      DEFAULT_DURATION_MINUTES,
      [Validators.required, Validators.min(1), Validators.max(MAX_DURATION_MINUTES)],
    ],
    guestAccess: [false],
    guestCapacity: [0, [Validators.min(0), Validators.max(500)]],
  });

  protected readonly minDurationMinutes = 1;
  protected readonly maxDurationMinutes = MAX_DURATION_MINUTES;

  protected get submitDisabled(): boolean {
    if (this.working()) return true;
    if (this.form.controls.evaluationId.invalid) return true;
    if (this.form.controls.maxAttempts.invalid) return true;
    return this.form.controls.timeLimitEnabled.value && this.form.controls.durationMinutes.invalid;
  }

  protected get selectedEvaluationInfo(): EvaluationRecord | EvaluationSummary | null {
    const fixed = this.evaluation();
    if (fixed) return fixed;

    const id = this.form.controls.evaluationId.value;
    return this.evaluations().find((item) => item.id === id) ?? null;
  }

  protected get selectedQuestionCount(): number {
    const fixed = this.evaluation();
    if (fixed) return fixed.questions.length;

    const id = this.form.controls.evaluationId.value;
    const summary = this.evaluations().find((item) => item.id === id);
    return summary?.questionCount ?? 0;
  }

  async ngOnInit(): Promise<void> {
    try {
      const record = await this.classes.getClass(this.classId);
      if (!record) {
        this.error.set('No encontramos esta clase.');
        return;
      }
      if (record.ownerTeacherId !== this.session.user()?.uid) {
        this.error.set('Solo el docente propietario puede publicar evaluaciones.');
        return;
      }
      this.className.set(record.name);

      if (this.fixedEvaluationId) {
        const evaluation = await this.evaluationsService.getEvaluation(
          this.classId,
          this.fixedEvaluationId,
        );
        if (!evaluation) {
          this.error.set('No encontramos esta evaluación.');
          return;
        }
        this.evaluation.set(evaluation);
        this.form.controls.evaluationId.setValue(evaluation.id);
        return;
      }

      const evaluations = await this.evaluationsService.listEvaluations(this.classId);
      if (evaluations.length === 0) {
        this.error.set('Aún no hay evaluaciones guardadas en esta clase.');
        return;
      }
      this.evaluations.set(evaluations);
      this.form.controls.evaluationId.setValue(evaluations[0].id);
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'No pudimos cargar la clase.');
    } finally {
      this.loading.set(false);
    }
  }

  protected async submit(): Promise<void> {
    this.actionError.set(null);
    this.form.markAllAsTouched();
    if (this.submitDisabled) return;

    const raw = this.form.getRawValue();
    let durationMinutes: number | null;
    try {
      durationMinutes = raw.timeLimitEnabled ? validateDurationMinutes(raw.durationMinutes) : null;
    } catch (e) {
      this.actionError.set(e instanceof Error ? e.message : 'La duración no es válida.');
      return;
    }
    let schedule;
    try {
      schedule = buildPublicationSchedule({
        date: raw.date,
        startTime: raw.startTime,
        endTime: raw.endTime,
      });
    } catch (e) {
      this.actionError.set(e instanceof Error ? e.message : 'La programación no es válida.');
      return;
    }

    const guestCapacity = Math.trunc(Number(raw.guestCapacity));
    if (
      raw.guestAccess &&
      (!Number.isFinite(guestCapacity) || guestCapacity < 1 || guestCapacity > 500)
    ) {
      this.actionError.set('Indica entre 1 y 500 vacantes para invitados.');
      return;
    }

    this.working.set(true);
    try {
      let evaluation = this.evaluation();
      if (!evaluation || evaluation.id !== raw.evaluationId) {
        evaluation = await this.evaluationsService.getEvaluation(this.classId, raw.evaluationId);
      }
      if (!evaluation) {
        this.actionError.set('No encontramos la evaluación seleccionada.');
        return;
      }

      const created = await this.publications.createPublication(this.classId, evaluation, {
        ...schedule,
        maxAttempts: raw.maxAttempts,
        durationMinutes,
        guestAccess: raw.guestAccess,
        guestCapacity: raw.guestAccess ? guestCapacity : 0,
      });

      this.createdPublicationId.set(created.id);
      this.createdAccessCode.set(created.accessCode);
    } catch (e) {
      this.actionError.set(e instanceof Error ? e.message : 'No pudimos crear la publicación.');
    } finally {
      this.working.set(false);
    }
  }
}
