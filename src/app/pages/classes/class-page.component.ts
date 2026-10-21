import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Timestamp } from 'firebase/firestore';
import { AttemptsService } from '../../core/attempts/attempts.service';
import { ClassesService } from '../../core/classes/classes.service';
import { EvaluationSummary } from '../../core/evaluations/evaluation-record';
import { EvaluationsService } from '../../core/evaluations/evaluations.service';
import { PublicationSummary } from '../../core/publications/publication-record';
import { PublicationsService } from '../../core/publications/publications.service';
import { ResultRecord } from '../../core/attempts/result-record';
import { SessionService } from '../../core/auth/session.service';
import {
  buildStudentPublicationView,
  CompletedStudentPublication,
} from '../../core/publications/student-publication-view';
import { ClassMember, ClassRecord } from '../../core/classes/class-record';

@Component({
  selector: 'app-class-page',
  imports: [RouterLink],
  template: `
    <section>
      <a class="back-link" routerLink="/classes">← Volver a mis clases</a>

      @if (loading()) {
        <p class="notice">Cargando la clase…</p>
      } @else if (error()) {
        <p class="error">{{ error() }}</p>
      } @else if (classRecord(); as record) {
        <p class="eyebrow">CLASE</p>
        <h1>{{ record.name }}</h1>

        @if (actionError()) {
          <p class="error">{{ actionError() }}</p>
        }
        @if (actionNotice()) {
          <p class="notice">{{ actionNotice() }}</p>
        }

        <article class="card">
          <h2>Información</h2>
          <p>
            @if (record.unlimited) {
              {{ record.memberCount }} integrantes · sin límite de vacantes
            } @else {
              {{ record.memberCount }} de {{ record.capacity }} integrantes
            }
          </p>
          <p>
            Modalidad:
            {{ record.modality === 'auto' ? 'ingreso automático' : 'ingreso con aprobación' }}
          </p>
          <p>Incorporaciones: {{ record.joinOpen ? 'abiertas' : 'cerradas' }}</p>
          @if (isOwner) {
            <p>
              Código de acceso: <strong>{{ record.accessCode }}</strong>
            </p>
            <a class="secondary-button" [routerLink]="['/classes', record.id, 'edit']">
              Editar clase
            </a>
          }
        </article>

        @if (isOwner && pendingMembers.length > 0) {
          <article class="card">
            <h2>Solicitudes pendientes ({{ pendingMembers.length }})</h2>
            <ul class="member-list">
              @for (member of pendingMembers; track member.uid) {
                <li>
                  <span>
                    <strong>{{ member.firstName }} {{ member.lastName }}</strong>
                    <small>{{ member.email }}</small>
                  </span>
                  <span class="actions">
                    <button
                      type="button"
                      class="primary-button"
                      [disabled]="busyUid() === member.uid"
                      (click)="accept(member)"
                    >
                      Aceptar
                    </button>
                    <button
                      type="button"
                      class="secondary-button"
                      [disabled]="busyUid() === member.uid"
                      (click)="reject(member)"
                    >
                      Rechazar
                    </button>
                  </span>
                </li>
              }
            </ul>
          </article>
        }

        <article class="card">
          <button
            type="button"
            class="disclosure"
            [attr.aria-expanded]="membersOpen()"
            (click)="toggleMembers()"
          >
            <span>Integrantes ({{ members().length }})</span>
            <span class="chevron">{{ membersOpen() ? '▾' : '▸' }}</span>
          </button>

          @if (membersOpen()) {
            <ul class="member-list">
              @for (member of members(); track member.uid) {
                <li>
                  <span>{{ member.firstName }} {{ member.lastName }}</span>
                  <small>
                    {{ member.email }} ·
                    {{ member.roleInClass === 'teacher' ? 'Docente' : 'Estudiante' }}
                    @if (member.isOwner) {
                      · Propietario
                    }
                    @if (member.status === 'pending') {
                      · Pendiente
                    }
                  </small>
                </li>
              }
            </ul>
          }
        </article>

        <div class="grid">
          @if (isOwner) {
            <article class="card">
              <h2>Evaluaciones</h2>
              @if (evaluations().length > 0) {
                <ul class="member-list">
                  @for (evaluation of evaluations(); track evaluation.id) {
                    <li>
                      <a
                        class="item-link"
                        [routerLink]="['/classes', record.id, 'evaluations', evaluation.id, 'edit']"
                      >
                        {{ evaluation.title }}
                      </a>
                      <small>
                        {{ evaluation.questionCount }} pregunta(s) ·
                        {{ formatDate(evaluation.createdAt) }}
                      </small>
                    </li>
                  }
                </ul>
              } @else {
                <p>Aún no hay evaluaciones guardadas.</p>
              }
              <a
                class="primary-button"
                [routerLink]="['/classes', record.id, 'evaluations', 'new']"
              >
                Generar evaluación
              </a>
            </article>
          }
          <article class="card">
            <h2>Publicaciones</h2>
            @if (isOwner) {
              @if (publications().length > 0) {
                <ul class="member-list">
                  @for (publication of publications(); track publication.id) {
                    <li>
                      <a
                        class="item-link"
                        [routerLink]="[
                          '/classes',
                          record.id,
                          'publications',
                          publication.id,
                          'edit',
                        ]"
                      >
                        {{ publication.title }}
                      </a>
                      <small>
                        {{ publication.questionCount }} pregunta(s) ·
                        {{ publication.maxAttempts }} intento(s) ·
                        {{ formatDuration(publication) }} · Código {{ publication.accessCode }} ·
                        {{ formatWindow(publication) }} ·
                        {{
                          publication.guestAccess
                            ? 'Invitados ' +
                              publication.guestCount +
                              '/' +
                              publication.guestCapacity
                            : 'Invitados deshabilitado'
                        }}
                      </small>
                    </li>
                  }
                </ul>
              } @else {
                <p>Aún no hay evaluaciones publicadas.</p>
              }
              <a
                class="secondary-button"
                [routerLink]="['/classes', record.id, 'publications', 'new']"
              >
                Publicar evaluación
              </a>
            } @else if (myMembership?.status === 'active') {
              @if (publications().length > 0) {
                <ul class="member-list">
                  @for (publication of publications(); track publication.id) {
                    <li>
                      <a
                        class="item-link"
                        [routerLink]="[
                          '/classes',
                          record.id,
                          'publications',
                          publication.id,
                          'take',
                        ]"
                      >
                        {{ publication.title }}
                      </a>
                      <small>
                        {{ publication.questionCount }} pregunta(s) ·
                        {{ publication.maxAttempts }} intento(s) ·
                        {{ formatDuration(publication) }} · {{ formatWindow(publication) }}
                      </small>
                    </li>
                  }
                </ul>
              } @else if (studentResults().length > 0) {
                <p>No tienes evaluaciones pendientes.</p>
              } @else {
                <p>Aún no hay evaluaciones publicadas.</p>
              }
            } @else {
              <p>Tu solicitud de ingreso está pendiente de aprobación.</p>
            }
          </article>
          <article class="card">
            <h2>Resultados</h2>
            @if (isOwner) {
              @if (publicationsWithAttempts.length > 0) {
                <ul class="member-list">
                  @for (publication of publicationsWithAttempts; track publication.id) {
                    <li>
                      <span>
                        <strong>{{ publication.title }}</strong>
                        <small>
                          {{ publication.attemptCount }} intento(s) iniciado(s) ·
                          {{ publication.questionCount }} pregunta(s) ·
                          {{ formatDuration(publication) }} ·
                          {{
                            publication.guestAccess
                              ? 'Invitados ' +
                                publication.guestCount +
                                '/' +
                                publication.guestCapacity
                              : 'Invitados deshabilitado'
                          }}
                        </small>
                      </span>
                      <a
                        class="secondary-button"
                        [routerLink]="[
                          '/classes',
                          record.id,
                          'publications',
                          publication.id,
                          'results',
                        ]"
                      >
                        Ver resultados
                      </a>
                    </li>
                  }
                </ul>
              } @else {
                <p>Aún no hay resultados de la clase.</p>
              }
            } @else if (isTeacher) {
              <p>Solo el docente propietario puede consultar los resultados de la clase.</p>
            } @else if (studentResults().length > 0) {
              <ul class="member-list">
                @for (item of studentResults(); track item.publication.id) {
                  <li>
                    <span>
                      <strong>{{ item.publication.title }}</strong>
                      <small>
                        {{ item.submittedAttempts }} intento(s) enviado(s) · Último envío:
                        {{ formatDate(item.latestSubmitted.submittedAt) }}
                      </small>
                    </span>
                    <a
                      class="secondary-button"
                      [routerLink]="[
                        '/classes',
                        record.id,
                        'publications',
                        item.publication.id,
                        'take',
                      ]"
                      [queryParams]="{ view: 'result' }"
                    >
                      Ver resultados
                    </a>
                  </li>
                }
              </ul>
            } @else {
              <p>Aún no has finalizado ninguna evaluación.</p>
            }
          </article>
        </div>

        <div class="class-actions-bar">
          <div class="class-actions-buttons">
            <a class="secondary-button" routerLink="/classes">Volver a mis clases</a>
            @if (canLeave) {
              <button
                type="button"
                class="secondary-button leave-button"
                [disabled]="leaving()"
                (click)="requestLeave()"
              >
                {{ leaving() ? 'Saliendo…' : leaveLabel }}
              </button>
            }
          </div>
        </div>
      }
    </section>
  `,
  styles: [
    `
      .class-actions-bar {
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 0.9rem;
        bottom: 1rem;
        box-shadow: 0 10px 30px var(--shadow);
        display: flex;
        justify-content: flex-end;
        margin-top: 1.5rem;
        padding: 0.85rem 1rem;
        position: sticky;
        z-index: 10;
      }

      .class-actions-buttons {
        display: flex;
        flex-wrap: wrap;
        gap: 0.6rem;
        justify-content: flex-end;
      }

      .class-actions-bar .leave-button {
        border-color: var(--danger);
        color: var(--danger);
      }

      .class-actions-bar .leave-button:not(:disabled):hover {
        background: var(--danger);
        border-color: var(--danger);
        color: var(--surface);
      }

      .class-actions-bar .secondary-button:disabled {
        cursor: not-allowed;
        opacity: 0.6;
      }

      @media (max-width: 560px) {
        .class-actions-bar {
          align-items: stretch;
          flex-direction: column;
        }

        .class-actions-buttons {
          display: grid;
          grid-template-columns: 1fr;
          width: 100%;
        }
      }
    `,
  ],
})
export class ClassPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly session = inject(SessionService);
  private readonly classes = inject(ClassesService);
  private readonly attempts = inject(AttemptsService);
  private readonly evaluationsService = inject(EvaluationsService);
  private readonly publicationsService = inject(PublicationsService);

  private readonly classId = this.route.snapshot.paramMap.get('classId') ?? '';

  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly classRecord = signal<ClassRecord | null>(null);
  protected readonly members = signal<ClassMember[]>([]);
  protected readonly evaluations = signal<EvaluationSummary[]>([]);
  protected readonly publications = signal<PublicationSummary[]>([]);
  protected readonly studentResults = signal<CompletedStudentPublication[]>([]);
  protected readonly membersOpen = signal(false);

  protected readonly actionError = signal<string | null>(null);
  protected readonly actionNotice = signal<string | null>(null);
  protected readonly busyUid = signal<string | null>(null);
  protected readonly leaving = signal(false);

  protected get isOwner(): boolean {
    return this.classRecord()?.ownerTeacherId === this.session.user()?.uid;
  }

  protected get isTeacher(): boolean {
    return this.isOwner || this.myMembership?.roleInClass === 'teacher';
  }

  protected get pendingMembers(): ClassMember[] {
    return this.members().filter((member) => member.status === 'pending');
  }

  protected get publicationsWithAttempts(): PublicationSummary[] {
    return this.publications().filter((publication) => publication.attemptCount > 0);
  }

  protected get myMembership(): ClassMember | undefined {
    const uid = this.session.user()?.uid;
    return this.members().find((member) => member.uid === uid);
  }

  protected get canLeave(): boolean {
    const membership = this.myMembership;
    return Boolean(membership) && !membership?.isOwner;
  }

  protected get leaveLabel(): string {
    return this.myMembership?.status === 'pending' ? 'Cancelar solicitud' : 'Salir de la clase';
  }

  async ngOnInit(): Promise<void> {
    await this.reload();
    this.loading.set(false);
  }

  protected toggleMembers(): void {
    this.membersOpen.update((open) => !open);
  }

  protected requestLeave(): void {
    if (this.leaving()) return;

    const pending = this.myMembership?.status === 'pending';
    const message = pending
      ? '¿Cancelar tu solicitud para unirte a esta clase?'
      : '¿Seguro que quieres salir de esta clase?';
    if (!confirm(message)) return;

    void this.leave();
  }

  protected async accept(member: ClassMember): Promise<void> {
    this.actionError.set(null);
    this.actionNotice.set(null);
    this.busyUid.set(member.uid);
    try {
      await this.classes.acceptMember(this.classId, member.uid);
      this.actionNotice.set(`${member.firstName} ${member.lastName} fue aceptado en la clase.`);
      await this.reload();
    } catch (e) {
      this.actionError.set(e instanceof Error ? e.message : 'No pudimos aceptar la solicitud.');
    } finally {
      this.busyUid.set(null);
    }
  }

  protected async reject(member: ClassMember): Promise<void> {
    this.actionError.set(null);
    this.actionNotice.set(null);
    this.busyUid.set(member.uid);
    try {
      await this.classes.rejectMember(this.classId, member.uid);
      this.actionNotice.set(`La solicitud de ${member.firstName} fue rechazada.`);
      await this.reload();
    } catch (e) {
      this.actionError.set(e instanceof Error ? e.message : 'No pudimos rechazar la solicitud.');
    } finally {
      this.busyUid.set(null);
    }
  }

  protected async leave(): Promise<void> {
    this.actionError.set(null);
    this.actionNotice.set(null);
    this.leaving.set(true);
    try {
      await this.classes.leaveClass(this.classId);
      await this.router.navigate(['/classes']);
    } catch (e) {
      this.actionError.set(e instanceof Error ? e.message : 'No pudimos salir de la clase.');
      this.leaving.set(false);
    }
  }

  private async reload(): Promise<void> {
    try {
      this.loading.set(true);
      const [record, members] = await Promise.all([
        this.classes.getClass(this.classId),
        this.classes.listMembers(this.classId),
      ]);
      if (!record) {
        this.error.set('No encontramos esta clase o no tienes acceso.');
        return;
      }
      this.error.set(null);
      this.classRecord.set(record);
      this.members.set(members);

      if (record.ownerTeacherId === this.session.user()?.uid) {
        this.studentResults.set([]);
        try {
          this.evaluations.set(await this.evaluationsService.listEvaluations(this.classId));
        } catch {
          this.evaluations.set([]);
        }
        try {
          this.publications.set(await this.publicationsService.listPublications(this.classId));
        } catch {
          this.publications.set([]);
        }
      } else {
        this.evaluations.set([]);
        this.studentResults.set([]);
        if (this.myMembership?.status === 'active') {
          try {
            const publications = await this.publicationsService.listStudentPublications(
              this.classId,
            );
            const results = await this.loadStudentResults(publications);
            const view = buildStudentPublicationView(publications, results);
            this.publications.set(view.available);
            this.studentResults.set(view.completed);
          } catch {
            this.publications.set([]);
            this.studentResults.set([]);
          }
        } else {
          this.publications.set([]);
        }
      }
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'No pudimos cargar la clase.');
    } finally {
      this.loading.set(false);
    }
  }

  private async loadStudentResults(
    publications: PublicationSummary[],
  ): Promise<Map<string, ResultRecord>> {
    const results = new Map<string, ResultRecord>();
    await Promise.all(
      publications
        .filter((publication) => publication.attemptCount > 0)
        .map(async (publication) => {
          try {
            const result = await this.attempts.getResult(this.classId, publication.id);
            if (result) results.set(publication.id, result);
          } catch {
            return;
          }
        }),
    );
    return results;
  }

  protected formatDate(value: EvaluationSummary['createdAt'] | null): string {
    if (value instanceof Timestamp) {
      return value.toDate().toLocaleDateString('es', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    }
    return '—';
  }

  protected formatDuration(publication: PublicationSummary): string {
    return publication.durationMinutes === null
      ? 'sin límite de tiempo'
      : `${publication.durationMinutes} min`;
  }

  protected formatWindow(publication: PublicationSummary): string {
    if (!publication.openAt || !publication.closeAt) return 'sin ventana horaria';
    const start = publication.openAt.toDate();
    const end = publication.closeAt.toDate();
    const date = start.toLocaleDateString('es', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
    const startTime = start.toLocaleTimeString('es', {
      hour: '2-digit',
      minute: '2-digit',
    });
    const endTime = end.toLocaleTimeString('es', {
      hour: '2-digit',
      minute: '2-digit',
    });
    return `${date} · ${startTime}–${endTime}`;
  }
}
