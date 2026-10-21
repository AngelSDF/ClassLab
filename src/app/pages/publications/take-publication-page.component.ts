import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AttemptsService } from '../../core/attempts/attempts.service';
import { SessionService } from '../../core/auth/session.service';
import { ClassesService } from '../../core/classes/classes.service';
import { EvaluationQuestion } from '../../core/evaluations/evaluation-record';
import { PublicationsService } from '../../core/publications/publications.service';
import {
  StudentPublicationContent,
  StudentQuestion,
} from '../../core/publications/publication-content';
import { AttemptAnswer, AttemptRecord } from '../../core/attempts/result-record';
import { AttemptScore, formatScore, scoreAttempt } from '../../core/shared/scoring';
import {
  TIMER_WARNING_MS,
  attemptRemainingMs,
  formatRemainingTime,
} from '../../core/publications/publication-time-limit';

@Component({
  selector: 'app-take-publication-page',
  imports: [RouterLink],
  template: `
    <section class="narrow-page">
      <a class="back-link" [routerLink]="backLink">
        ← {{ session.isAnonymous() ? 'Volver al acceso de invitado' : 'Volver a mis clases' }}
      </a>

      @if (loading()) {
        <p class="notice">Cargando la evaluación.</p>
      } @else if (error()) {
        <article class="card">
          <h1>No pudimos abrir la evaluación</h1>
          <p class="error">{{ error() }}</p>
          <a class="secondary-button" [routerLink]="backLink">
            {{ session.isAnonymous() ? 'Volver al acceso de invitado' : 'Volver a mis clases' }}
          </a>
        </article>
      } @else {
        @if (blockedMessage()) {
          <article class="card">
            <p class="eyebrow">EVALUACIÓN</p>
            <h1>{{ content()?.title ?? 'Publicación' }}</h1>
            <p class="notice">{{ blockedMessage() }}</p>
            @if (!submittedAttempt()) {
              <a class="secondary-button" [routerLink]="backLink">
                {{ session.isAnonymous() ? 'Volver al acceso de invitado' : 'Volver a la clase' }}
              </a>
            }
          </article>
        }

        @if (submittedAttempt(); as submitted) {
          <article class="card result-summary">
            <p class="eyebrow">RESULTADO</p>
            <h1>{{ content()?.title }}</h1>
            <p class="analytics-meta">Intento {{ submitted.attemptNumber }}</p>
            @if (score(); as result) {
              <div class="score-banner">
                <span class="score">
                  {{ formatScore(result.earned) }} / {{ formatScore(result.max) }}
                </span>
                <span class="score-percentage">{{ result.percentage.toFixed(2) }}%</span>
              </div>
            }
            @if (notice()) {
              <p class="notice">{{ notice() }}</p>
            }
            @if (actionError()) {
              <p class="error">{{ actionError() }}</p>
            }
            <div class="actions result-actions">
              <a class="secondary-button" [routerLink]="backLink">
                {{ session.isAnonymous() ? 'Volver al acceso de invitado' : 'Volver a la clase' }}
              </a>
            </div>
          </article>

          @for (question of feedbackQuestions() ?? []; track question.id; let index = $index) {
            <article class="card question-feedback">
              <p class="eyebrow">
                PREGUNTA {{ index + 1 }} · {{ formatScore(scoreFor(question.id)) }} /
                {{ question.points }} pts
              </p>
              <h2>{{ question.prompt }}</h2>

              @if (question.type === 'verdadero_falso') {
                <p>
                  Tu respuesta:
                  <strong>{{ booleanLabel(selectedBoolean(question.id)) }}</strong>
                </p>
                <p>
                  Respuesta correcta:
                  <strong>{{ booleanLabel(question.correctBoolean) }}</strong>
                </p>
              } @else {
                <ul class="option-list">
                  @for (option of question.options; track option.id) {
                    <li
                      [class.correct]="isCorrectOption(question, option.id)"
                      [class.incorrect]="isIncorrectSelection(question, option.id)"
                    >
                      <span>{{ option.text }}</span>
                      @if (isSelected(question.id, option.id)) {
                        <span class="tag">Tu respuesta</span>
                      }
                      @if (isCorrectOption(question, option.id)) {
                        <span class="tag correct-tag">Correcta</span>
                      }
                    </li>
                  }
                </ul>
              }

              @if (question.explanation) {
                <p class="feedback-text">{{ question.explanation }}</p>
              }
            </article>
          }
        }

        @if (attempt(); as current) {
          @if (hasTimeLimit()) {
            <div class="exam-timer-bar" [class.warning]="timeWarning()" role="timer">
              <span class="timer-label">Tiempo restante</span>
              <strong class="timer-value">{{ timerLabel() }}</strong>
            </div>
          } @else {
            <div class="exam-timer-bar no-limit">
              <span class="timer-label">Sin límite de tiempo</span>
              <span class="timer-note">Al salir se envía el intento</span>
            </div>
          }

          <article class="card exam-header">
            <p class="eyebrow">
              INTENTO {{ current.attemptNumber }} DE {{ content()?.maxAttempts }}
            </p>
            <h1>{{ content()?.title }}</h1>
            @if (session.isAnonymous()) {
              <p class="exam-meta">
                <span>Invitado: {{ session.guestName() ?? 'Invitado' }}</span>
              </p>
            }
            <p class="lead">
              Responde las preguntas. Tus respuestas se guardan automáticamente en este intento.
            </p>
            @if (session.isAnonymous() || content()?.durationMinutes === null) {
              <p class="exam-warning">
                Si sales, tu examen se enviará y no podrás continuar este intento.
              </p>
            }
            <p class="exam-meta">
              <span>{{ durationLabel() }}</span>
              <span>{{ totalQuestions() }} pregunta(s)</span>
              <span>{{ answeredCount() }} respondida(s)</span>
              @if (saving()) {
                <span class="exam-saving" aria-live="polite">Guardando…</span>
              }
            </p>
            @if (notice()) {
              <p class="notice">{{ notice() }}</p>
            }
            @if (actionError()) {
              <p class="error">{{ actionError() }}</p>
            }
            @if (saveError()) {
              <p class="error">{{ saveError() }}</p>
            }
          </article>

          @for (question of content()?.questions ?? []; track question.id; let index = $index) {
            <article class="card">
              <p class="eyebrow">
                PREGUNTA {{ index + 1 }} · {{ typeLabel(question.type) }} ·
                {{ question.points }} pts
              </p>
              <h2>{{ question.prompt }}</h2>

              @if (question.type === 'verdadero_falso') {
                <div class="option-list">
                  <label class="option-row" [class.selected]="isBooleanSelected(question.id, true)">
                    <input
                      type="radio"
                      [name]="question.id"
                      [checked]="isBooleanSelected(question.id, true)"
                      (change)="selectBoolean(question.id, true)"
                    />
                    <span>Verdadero</span>
                  </label>
                  <label
                    class="option-row"
                    [class.selected]="isBooleanSelected(question.id, false)"
                  >
                    <input
                      type="radio"
                      [name]="question.id"
                      [checked]="isBooleanSelected(question.id, false)"
                      (change)="selectBoolean(question.id, false)"
                    />
                    <span>Falso</span>
                  </label>
                </div>
              } @else {
                <div class="option-list">
                  @for (option of question.options; track option.id) {
                    <label
                      class="option-row"
                      [class.selected]="isOptionSelected(question.id, option.id)"
                    >
                      @if (question.type === 'opcion_multiple') {
                        <input
                          type="checkbox"
                          [checked]="isOptionSelected(question.id, option.id)"
                          (change)="
                            toggleMultiple(question.id, option.id, $any($event.target).checked)
                          "
                        />
                      } @else {
                        <input
                          type="radio"
                          [name]="question.id"
                          [checked]="isOptionSelected(question.id, option.id)"
                          (change)="selectSingle(question.id, option.id)"
                        />
                      }
                      <span>{{ option.text }}</span>
                    </label>
                  }
                </div>
              }
            </article>
          }

          <div class="exam-submit-bar">
            <span class="exam-submit-info">
              <strong>{{ answeredCount() }} de {{ totalQuestions() }}</strong>
              <span>respondidas</span>
            </span>
            <div class="exam-submit-actions">
              <a class="secondary-button" [routerLink]="backLink">Salir</a>
              <button
                type="button"
                class="primary-button"
                [disabled]="submitting()"
                (click)="submit()"
              >
                {{ submitting() ? 'Enviando…' : 'Enviar respuestas' }}
              </button>
            </div>
          </div>
        }
      }
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .exam-meta {
        color: var(--text-subtle);
        display: flex;
        flex-wrap: wrap;
        gap: 0.35rem 1rem;
        font-size: 0.9rem;
        margin: 0.5rem 0 0;
      }

      .exam-saving {
        color: var(--accent);
        font-weight: 700;
      }

      .exam-timer-bar {
        align-items: center;
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 0.75rem;
        display: flex;
        gap: 0.75rem;
        justify-content: space-between;
        margin-top: 1rem;
        padding: 0.7rem 1rem;
        position: sticky;
        top: 0.75rem;
        z-index: 10;
      }

      .exam-timer-bar.warning {
        border-color: var(--danger);
        color: var(--danger);
      }

      .exam-timer-bar.no-limit {
        color: var(--text-subtle);
      }

      .timer-label {
        font-size: 0.85rem;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }

      .timer-value {
        font-size: 1.35rem;
        font-variant-numeric: tabular-nums;
      }

      .timer-note {
        font-size: 0.85rem;
      }

      .exam-warning {
        background: var(--danger-soft, rgba(220, 38, 38, 0.1));
        border: 1px solid var(--danger);
        border-radius: 0.65rem;
        color: var(--danger);
        font-size: 0.9rem;
        font-weight: 600;
        margin: 0.75rem 0 0;
        padding: 0.65rem 0.8rem;
      }

      .option-list {
        display: grid;
        gap: 0.6rem;
        margin: 0.9rem 0 0;
        padding: 0;
      }

      .option-row {
        align-items: center;
        background: var(--surface);
        border: 1px solid var(--border-strong);
        border-radius: 0.65rem;
        cursor: pointer;
        display: flex;
        font-weight: 500;
        gap: 0.75rem;
        justify-content: flex-start;
        padding: 0.8rem 0.9rem;
        transition:
          background 0.15s ease,
          border-color 0.15s ease;
      }

      .option-row:hover {
        border-color: var(--accent);
      }

      .option-row:focus-within {
        outline: 2px solid var(--outline);
        outline-offset: 1px;
      }

      .option-row.selected {
        background: var(--accent-soft);
        border-color: var(--accent);
      }

      .option-row.selected > span {
        color: var(--accent-soft-text);
        font-weight: 600;
      }

      .option-row > span {
        flex: 1 1 auto;
        line-height: 1.45;
      }

      .option-row input[type='radio'],
      .option-row input[type='checkbox'] {
        accent-color: var(--accent);
        background: transparent;
        border: 0;
        cursor: pointer;
        flex: 0 0 auto;
        height: 1.15rem;
        margin: 0;
        padding: 0;
        width: 1.15rem;
      }

      .option-row input[type='radio']:focus,
      .option-row input[type='checkbox']:focus {
        outline: none;
      }

      .exam-submit-bar {
        align-items: center;
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 0.9rem;
        bottom: 1rem;
        box-shadow: 0 10px 30px var(--shadow);
        display: flex;
        gap: 1rem;
        justify-content: space-between;
        margin-top: 1.5rem;
        padding: 0.85rem 1rem;
        position: sticky;
        z-index: 10;
      }

      .exam-submit-info {
        display: flex;
        flex-direction: column;
        font-size: 0.85rem;
        line-height: 1.35;
      }

      .exam-submit-info span {
        color: var(--text-subtle);
      }

      .exam-submit-actions {
        display: flex;
        flex: 0 0 auto;
        gap: 0.6rem;
      }

      .exam-submit-actions .primary-button,
      .exam-submit-actions .secondary-button {
        white-space: nowrap;
      }

      .score-banner {
        align-items: baseline;
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem 1rem;
        margin: 0.5rem 0;
      }

      .score-banner .score {
        margin: 0;
      }

      .score-percentage {
        background: var(--accent-soft);
        border-radius: 999px;
        color: var(--accent-soft-text);
        font-size: 0.9rem;
        font-weight: 800;
        padding: 0.15rem 0.6rem;
      }

      .result-actions {
        margin: 0.75rem 0 0;
      }

      @media (max-width: 560px) {
        .exam-submit-bar {
          align-items: stretch;
          flex-direction: column;
          gap: 0.75rem;
        }

        .exam-submit-info {
          flex-direction: row;
          gap: 0.35rem;
        }

        .exam-submit-actions {
          display: grid;
          grid-template-columns: auto 1fr;
        }
      }
    `,
  ],
})
export class TakePublicationPageComponent implements OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly publications = inject(PublicationsService);
  private readonly classes = inject(ClassesService);
  private readonly attempts = inject(AttemptsService);
  protected readonly session = inject(SessionService);

  protected readonly classId = this.route.snapshot.paramMap.get('classId') ?? '';
  protected readonly publicationId = this.route.snapshot.paramMap.get('publicationId') ?? '';
  private readonly resultOnly = this.route.snapshot.queryParamMap.get('view') === 'result';

  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly content = signal<StudentPublicationContent | null>(null);
  protected readonly attempt = signal<AttemptRecord | null>(null);
  protected readonly answers = signal<AttemptAnswer[]>([]);
  protected readonly saving = signal(false);
  protected readonly submitting = signal(false);
  protected readonly saveError = signal<string | null>(null);
  protected readonly actionError = signal<string | null>(null);
  protected readonly submittedAttempt = signal<AttemptRecord | null>(null);
  protected readonly feedbackQuestions = signal<EvaluationQuestion[] | null>(null);
  protected readonly score = signal<AttemptScore | null>(null);
  protected readonly blockedMessage = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);

  private readonly nowMs = signal(Date.now());
  protected readonly hasTimeLimit = computed(() => this.content()?.durationMinutes != null);
  protected readonly timeRemainingMs = computed(() => {
    const attempt = this.attempt();
    const duration = this.content()?.durationMinutes ?? null;
    if (!attempt || duration === null) return null;
    return attemptRemainingMs(attempt.startedAt.toMillis(), duration, this.nowMs());
  });
  protected readonly timeWarning = computed(() => {
    const left = this.timeRemainingMs();
    return left !== null && left <= TIMER_WARNING_MS;
  });
  protected readonly timerLabel = computed(() => {
    const left = this.timeRemainingMs();
    return left === null ? '--:--' : formatRemainingTime(left);
  });

  protected readonly formatScore = formatScore;

  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private timerId: ReturnType<typeof setInterval> | null = null;
  private readonly beforeUnloadHandler = (event: BeforeUnloadEvent): void => {
    if (!this.attempt() || this.submittedAttempt()) return;
    event.preventDefault();
    event.returnValue = '';
  };

  protected get backLink(): (string | number)[] {
    return this.session.isAnonymous() ? ['/guest'] : ['/classes', this.classId];
  }

  protected totalQuestions(): number {
    return this.content()?.questions.length ?? 0;
  }

  protected answeredCount(): number {
    return this.answers().filter((answer) => answer.optionIds.length > 0 || answer.boolean !== null)
      .length;
  }

  protected typeLabel(type: EvaluationQuestion['type']): string {
    switch (type) {
      case 'opcion_unica':
        return 'Opción única';
      case 'opcion_multiple':
        return 'Opción múltiple';
      case 'verdadero_falso':
        return 'Verdadero / Falso';
      default:
        return 'Pregunta';
    }
  }

  protected durationLabel(): string {
    const duration = this.content()?.durationMinutes ?? null;
    return duration === null ? 'Sin límite de tiempo' : `Duración: ${duration} min`;
  }

  async canLeavePage(): Promise<boolean> {
    if (this.resultOnly || !this.attempt() || this.submittedAttempt()) return true;

    const hasTimer = this.content()?.durationMinutes != null;
    const mustSubmitOnExit = this.session.isAnonymous() || !hasTimer;
    const message = mustSubmitOnExit
      ? 'Si sales ahora, tu examen se enviará y no podrás continuar este intento. ¿Enviar y salir?'
      : 'Si sales, tu progreso se guarda. Podrás continuar mientras no se agote el tiempo. ¿Salir?';

    if (!confirm(message)) return false;

    if (mustSubmitOnExit) {
      await this.submit(true);
      return true;
    }

    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    await this.saveDraft();
    return true;
  }

  async ngOnInit(): Promise<void> {
    window.addEventListener('beforeunload', this.beforeUnloadHandler);
    try {
      if (!this.session.isAnonymous()) {
        const membership = await this.classes.getMyMembership(this.classId);
        if (!membership || membership.status !== 'active') {
          this.error.set(
            'No eres miembro activo de esta clase. Primero ingresa con el código de la clase.',
          );
          return;
        }
      }

      const content = await this.publications.getStudentContent(this.classId, this.publicationId);
      this.content.set(content);
      this.answers.set(this.mergeAnswers([]));

      if (this.resultOnly) {
        const result = await this.attempts.getResult(this.classId, this.publicationId);
        if (result?.hasSubmitted) {
          await this.showResult(result);
        }
        if (!this.submittedAttempt()) {
          this.blockedMessage.set('Aún no has enviado esta evaluación.');
        }
        return;
      }

      const start = await this.attempts.startOrResumeAttempt(this.classId, this.publicationId);
      if (start.kind === 'blocked') {
        this.blockedMessage.set(this.blockedReason(start.reason));
        if (start.result) await this.showResult(start.result);
        return;
      }
      if (start.kind === 'auto_submitted') {
        this.notice.set(
          start.reason === 'time_expired'
            ? 'El tiempo del intento terminó. Enviamos tus respuestas automáticamente.'
            : 'Tu intento anterior se envió automáticamente al salir.',
        );
        await this.showResult(start.result);
        return;
      }

      this.attempt.set(start.attempt);
      this.answers.set(this.mergeAnswers(start.attempt.answers));
      if (start.kind === 'resumed') {
        this.notice.set('Continuando tu intento en curso.');
      } else if (start.previousAttemptSubmitted) {
        this.notice.set('Tu intento anterior se envió al salir. Este es un nuevo intento.');
      }
      this.beginTimer(content.durationMinutes);
    } catch (e) {
      this.error.set(
        this.session.isAnonymous()
          ? 'No pudimos abrir esta evaluación como invitado. Puede que el docente no haya habilitado invitados o que las reglas de Firestore no estén desplegadas.'
          : e instanceof Error
            ? e.message
            : 'No pudimos cargar la evaluación.',
      );
    } finally {
      this.loading.set(false);
    }
  }

  ngOnDestroy(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.stopTimer();
    window.removeEventListener('beforeunload', this.beforeUnloadHandler);
  }

  protected answerFor(questionId: string): AttemptAnswer {
    return (
      this.answers().find((answer) => answer.questionId === questionId) ?? {
        questionId,
        optionIds: [],
        boolean: null,
      }
    );
  }

  protected isOptionSelected(questionId: string, optionId: string): boolean {
    return this.answerFor(questionId).optionIds.includes(optionId);
  }

  protected isBooleanSelected(questionId: string, value: boolean): boolean {
    return this.answerFor(questionId).boolean === value;
  }

  protected selectSingle(questionId: string, optionId: string): void {
    this.updateAnswer(questionId, { optionIds: [optionId], boolean: null });
  }

  protected toggleMultiple(questionId: string, optionId: string, checked: boolean): void {
    const current = this.answerFor(questionId);
    const optionIds = new Set(current.optionIds);
    if (checked) optionIds.add(optionId);
    else optionIds.delete(optionId);
    this.updateAnswer(questionId, { optionIds: [...optionIds], boolean: null });
  }

  protected selectBoolean(questionId: string, value: boolean): void {
    this.updateAnswer(questionId, { optionIds: [], boolean: value });
  }

  protected async submit(auto = false): Promise<void> {
    const current = this.attempt();
    if (!current || this.submitting()) return;

    const unanswered = this.answers().filter(
      (answer) => answer.optionIds.length === 0 && answer.boolean === null,
    ).length;
    if (
      !auto &&
      unanswered > 0 &&
      !confirm(`Tienes ${unanswered} pregunta(s) sin responder. ¿Enviar de todos modos?`)
    ) {
      return;
    }

    this.stopTimer();
    if (!auto) this.notice.set(null);
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }

    try {
      this.submitting.set(true);
      this.actionError.set(null);
      const submitted = await this.attempts.submitAttempt(
        this.classId,
        this.publicationId,
        current.attemptNumber,
        this.answers(),
      );
      this.attempt.set(null);
      this.answers.set(this.mergeAnswers(submitted.answers));
      this.submittedAttempt.set(submitted);

      const feedback = await this.publications.getFeedbackQuestions(
        this.classId,
        this.publicationId,
      );
      this.feedbackQuestions.set(feedback);
      this.score.set(scoreAttempt(feedback, submitted.answers));
    } catch (e) {
      this.actionError.set(e instanceof Error ? e.message : 'No pudimos enviar tus respuestas.');
    } finally {
      this.submitting.set(false);
    }
  }

  protected isSelected(questionId: string, optionId: string): boolean {
    const submitted = this.submittedAttempt();
    if (!submitted) return false;
    return (
      submitted.answers
        .find((answer) => answer.questionId === questionId)
        ?.optionIds.includes(optionId) ?? false
    );
  }

  protected isCorrectOption(question: EvaluationQuestion, optionId: string): boolean {
    return question.correctOptionIds.includes(optionId);
  }

  protected isIncorrectSelection(question: EvaluationQuestion, optionId: string): boolean {
    return this.isSelected(question.id, optionId) && !this.isCorrectOption(question, optionId);
  }

  protected selectedBoolean(questionId: string): boolean | null {
    const submitted = this.submittedAttempt();
    return submitted?.answers.find((answer) => answer.questionId === questionId)?.boolean ?? null;
  }

  protected booleanLabel(value: boolean | null | undefined): string {
    if (value === true) return 'Verdadero';
    if (value === false) return 'Falso';
    return 'Sin responder';
  }

  protected scoreFor(questionId: string): number {
    return this.score()?.byQuestion[questionId]?.earned ?? 0;
  }

  private beginTimer(durationMinutes: number | null): void {
    this.stopTimer();
    this.nowMs.set(Date.now());
    if (durationMinutes === null) return;

    const tick = (): void => {
      this.nowMs.set(Date.now());
      const left = this.timeRemainingMs();
      if (left !== null && left <= 0) {
        this.stopTimer();
        this.notice.set('El tiempo del intento terminó. Enviamos tus respuestas automáticamente.');
        void this.submit(true);
      }
    };

    tick();
    if ((this.timeRemainingMs() ?? 0) > 0) {
      this.timerId = setInterval(tick, 1000);
    }
  }

  private stopTimer(): void {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  private updateAnswer(
    questionId: string,
    patch: Partial<Pick<AttemptAnswer, 'optionIds' | 'boolean'>>,
  ): void {
    this.answers.update((answers) =>
      answers.map((answer) =>
        answer.questionId === questionId ? { ...answer, ...patch } : answer,
      ),
    );
    this.scheduleSave();
  }

  private scheduleSave(): void {
    if (!this.attempt() || this.submittedAttempt()) return;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => void this.saveDraft(), 700);
  }

  private async saveDraft(): Promise<void> {
    const current = this.attempt();
    if (!current || this.submitting()) return;
    if (this.saving()) {
      this.scheduleSave();
      return;
    }

    try {
      this.saving.set(true);
      this.saveError.set(null);
      await this.attempts.saveDraft(
        this.classId,
        this.publicationId,
        current.attemptNumber,
        this.answers(),
      );
    } catch (e) {
      this.saveError.set(e instanceof Error ? e.message : 'No pudimos guardar tus respuestas.');
    } finally {
      this.saving.set(false);
    }
  }

  private async showResult(result: {
    attempts: AttemptRecord[];
    hasSubmitted: boolean;
  }): Promise<void> {
    const submitted = [...result.attempts]
      .reverse()
      .find((attempt) => attempt.status === 'submitted');
    if (!submitted || !result.hasSubmitted) return;

    this.answers.set(this.mergeAnswers(submitted.answers));
    this.submittedAttempt.set(submitted);

    try {
      const feedback = await this.publications.getFeedbackQuestions(
        this.classId,
        this.publicationId,
      );
      this.feedbackQuestions.set(feedback);
      this.score.set(scoreAttempt(feedback, submitted.answers));
    } catch (e) {
      this.actionError.set(
        e instanceof Error ? e.message : 'No pudimos cargar la retroalimentación.',
      );
    }
  }

  private mergeAnswers(stored: AttemptAnswer[]): AttemptAnswer[] {
    const questions: StudentQuestion[] = this.content()?.questions ?? [];
    return questions.map((question) => {
      const answer = stored.find((item) => item.questionId === question.id);
      return answer ? { ...answer } : { questionId: question.id, optionIds: [], boolean: null };
    });
  }

  private blockedReason(
    reason: 'not_open' | 'closed' | 'no_attempts' | 'guests_disabled' | 'guest_full',
  ): string {
    switch (reason) {
      case 'not_open':
        return 'La publicación aún no está abierta.';
      case 'closed':
        return 'La publicación ya cerró.';
      case 'no_attempts':
        return 'Ya usaste todos los intentos disponibles.';
      case 'guests_disabled':
        return 'El docente no habilitó el acceso para invitados.';
      case 'guest_full':
        return 'Ya no quedan vacantes para invitados en esta evaluación.';
    }
  }
}
