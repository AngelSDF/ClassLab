import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Timestamp } from 'firebase/firestore';
import { AttemptsService } from '../../core/attempts/attempts.service';
import { EvaluationQuestion, QuestionType } from '../../core/evaluations/evaluation-record';
import {
  PublicationAnalytics,
  QuestionAnalytics,
  buildPublicationAnalytics,
} from '../../core/publications/publication-analytics';
import { PublicationsService } from '../../core/publications/publications.service';
import { formatScore } from '../../core/shared/scoring';

@Component({
  selector: 'app-publication-results-page',
  imports: [RouterLink],
  template: `
    <section>
      <a class="back-link" [routerLink]="['/classes', classId]">← Volver a la clase</a>

      @if (loading()) {
        <p class="notice">Cargando los resultados de la clase…</p>
      } @else if (error()) {
        <article class="card">
          <h1>No pudimos abrir los resultados</h1>
          <p class="error">{{ error() }}</p>
          <a class="secondary-button" [routerLink]="['/classes', classId]">Volver a la clase</a>
        </article>
      } @else if (analytics(); as data) {
        <p class="eyebrow">RESULTADOS DE LA CLASE</p>
        <h1>{{ title() }}</h1>
        <p>
          {{ data.studentCount }} estudiante(s) con envío ·
          {{ data.submittedAttemptCount }} intento(s) enviado(s)
        </p>

        @if (data.studentCount === 0) {
          <article class="card">
            <p>Aún no hay resultados enviados para esta publicación.</p>
          </article>
        } @else {
          <p class="analytics-legend">
            <span class="legend-correct">Verde: respuesta correcta</span>
            <span class="legend-incorrect">Rojo: respuesta incorrecta</span>
          </p>

          @for (item of data.questions; track item.question.id; let index = $index) {
            <article class="card question-analytics">
              <p class="eyebrow">
                PREGUNTA {{ index + 1 }} · {{ typeLabel(item.question.type) }} ·
                {{ item.question.points }} punto(s)
              </p>
              <h2>{{ item.question.prompt }}</h2>

              <p class="analytics-meta">
                <strong>Respuesta correcta:</strong> {{ correctAnswerText(item.question) }}
              </p>

              @if (item.question.explanation) {
                <p class="feedback-text">{{ item.question.explanation }}</p>
              }

              @if (item.question.type === 'opcion_multiple') {
                <p class="analytics-note">
                  En esta pregunta se pueden seleccionar varias opciones; los porcentajes pueden
                  sumar más de 100%.
                </p>
              }

              <div class="result-options">
                @for (option of item.options; track option.id) {
                  <div
                    class="result-option"
                    [class.correct]="option.isCorrect"
                    [class.incorrect]="!option.isCorrect"
                  >
                    <div class="result-option-header">
                      <span>{{ option.text }}</span>
                      <span>
                        {{ option.count }}/{{ data.studentCount }} ·
                        {{ formatScore(option.percentage) }}%
                      </span>
                    </div>
                    <div
                      class="result-bar"
                      role="progressbar"
                      aria-valuemin="0"
                      aria-valuemax="100"
                      [attr.aria-valuenow]="option.percentage"
                    >
                      <span class="result-bar-fill" [style.width.%]="option.percentage"></span>
                    </div>
                  </div>
                }
              </div>

              <div class="analytics-stats">
                <span> {{ item.correctCount }} de {{ data.studentCount }} respuestas exactas </span>
                <span>
                  Puntaje promedio: {{ formatScore(item.averageScore) }} /
                  {{ item.question.points }} ({{ formatScore(item.averageRate) }}%)
                </span>
                @if (item.unansweredCount > 0) {
                  <span>{{ item.unansweredCount }} sin responder</span>
                }
              </div>
            </article>
          }

          <div class="grid summary-grid">
            @for (card of summaryCards(data); track card.heading) {
              <article
                class="card summary-card"
                [class.missed]="card.tone === 'missed'"
                [class.correct]="card.tone === 'correct'"
              >
                <p class="eyebrow">{{ card.heading }}</p>
                <h2>{{ card.item.question.prompt }}</h2>
                <p class="analytics-meta">
                  Pregunta {{ card.item.index + 1 }} · {{ typeLabel(card.item.question.type) }} ·
                  {{ card.item.question.points }} punto(s)
                </p>
                <p class="analytics-meta">
                  <strong>Respuesta correcta:</strong>
                  {{ correctAnswerText(card.item.question) }}
                </p>
                @if (card.item.question.explanation) {
                  <p class="feedback-text">{{ card.item.question.explanation }}</p>
                }
                <div class="analytics-stats">
                  <span>
                    {{ formatScore(card.item.averageScore) }} /
                    {{ card.item.question.points }} puntos promedio
                  </span>
                  <span>
                    {{ card.item.correctCount }}/{{ data.studentCount }} respuestas exactas
                  </span>
                </div>
              </article>
            }
          </div>

          <article class="card">
            <button
              type="button"
              class="disclosure"
              [attr.aria-expanded]="studentsOpen()"
              (click)="toggleStudents()"
            >
              <span>Estudiantes ({{ data.students.length }})</span>
              <span class="chevron">{{ studentsOpen() ? '▾' : '▸' }}</span>
            </button>

            @if (studentsOpen()) {
              <ul class="member-list">
                @for (student of data.students; track student.studentId) {
                  <li>
                    <span>
                      <strong>{{ student.studentName }}</strong>
                      <small>
                        {{ student.submittedAttempts }} intento(s) enviado(s) · Último: intento
                        {{ student.latestAttempt.attemptNumber }} ·
                        {{ formatDate(student.latestAttempt.submittedAt) }}
                      </small>
                    </span>
                    <span class="student-score">
                      {{ formatScore(student.earned) }} / {{ formatScore(student.max) }} ({{
                        formatScore(student.percentage)
                      }}%)
                    </span>
                  </li>
                }
              </ul>
            }
          </article>
        }
      }
    </section>
  `,
})
export class PublicationResultsPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly publications = inject(PublicationsService);
  private readonly attempts = inject(AttemptsService);

  protected readonly classId = this.route.snapshot.paramMap.get('classId') ?? '';
  protected readonly publicationId = this.route.snapshot.paramMap.get('publicationId') ?? '';

  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly title = signal('');
  protected readonly analytics = signal<PublicationAnalytics | null>(null);
  protected readonly studentsOpen = signal(false);

  protected readonly formatScore = formatScore;

  async ngOnInit(): Promise<void> {
    try {
      const [publication, questions, results] = await Promise.all([
        this.publications.getPublication(this.classId, this.publicationId),
        this.publications.getFeedbackQuestions(this.classId, this.publicationId),
        this.attempts.listResults(this.classId, this.publicationId),
      ]);

      if (!publication) {
        this.error.set('No encontramos esta publicación.');
        return;
      }

      this.title.set(publication.title);
      this.analytics.set(buildPublicationAnalytics(questions, results));
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'No pudimos cargar los resultados.');
    } finally {
      this.loading.set(false);
    }
  }

  protected toggleStudents(): void {
    this.studentsOpen.update((open) => !open);
  }

  protected typeLabel(type: QuestionType): string {
    switch (type) {
      case 'opcion_unica':
        return 'Opción única';
      case 'opcion_multiple':
        return 'Opción múltiple';
      case 'verdadero_falso':
        return 'Verdadero / Falso';
    }
  }

  protected correctAnswerText(question: EvaluationQuestion): string {
    if (question.type === 'verdadero_falso') {
      if (question.correctBoolean === true) return 'Verdadero';
      if (question.correctBoolean === false) return 'Falso';
      return 'Sin definir';
    }

    const texts = question.options
      .filter((option) => question.correctOptionIds.includes(option.id))
      .map((option) => option.text);
    return texts.length > 0 ? texts.join(', ') : 'Sin definir';
  }

  protected summaryCards(data: PublicationAnalytics): {
    heading: string;
    tone: 'missed' | 'correct';
    item: QuestionAnalytics;
  }[] {
    const cards: {
      heading: string;
      tone: 'missed' | 'correct';
      item: QuestionAnalytics;
    }[] = [];

    if (data.mostMissed) {
      cards.push({
        heading: 'Pregunta con más fallas',
        tone: 'missed',
        item: data.mostMissed,
      });
    }
    if (data.mostCorrect) {
      cards.push({
        heading: 'Pregunta con más aciertos',
        tone: 'correct',
        item: data.mostCorrect,
      });
    }

    return cards;
  }

  protected formatDate(value: Timestamp | null): string {
    if (value instanceof Timestamp) {
      return value.toDate().toLocaleDateString('es', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    }
    return '—';
  }
}
