import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ClassesService } from '../core/classes.service';
import { SessionService } from '../core/session.service';
import { ClassMember, ClassRecord } from '../core/class-record';

@Component({
  selector: 'app-class-page',
  imports: [RouterLink],
  template: `
    <section>
      <a routerLink="/classes">← Volver a mis clases</a>

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
          <h2>Integrantes ({{ members().length }})</h2>
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

          @if (canLeave) {
            <button type="button" class="secondary-button" [disabled]="leaving()" (click)="leave()">
              {{ leaving() ? 'Saliendo…' : 'Salir de la clase' }}
            </button>
          }
        </article>

        <div class="grid">
          <article class="card">
            <h2>Evaluaciones</h2>
            <p>Cuando se publiquen evaluaciones aparecerán aquí.</p>
          </article>
          <article class="card">
            <h2>Publicaciones</h2>
            <p>Este espacio se habilitará en una fase posterior.</p>
          </article>
        </div>
      }
    </section>
  `,
})
export class ClassPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly session = inject(SessionService);
  private readonly classes = inject(ClassesService);

  private readonly classId = this.route.snapshot.paramMap.get('classId') ?? '';

  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly classRecord = signal<ClassRecord | null>(null);
  protected readonly members = signal<ClassMember[]>([]);

  protected readonly actionError = signal<string | null>(null);
  protected readonly actionNotice = signal<string | null>(null);
  protected readonly busyUid = signal<string | null>(null);
  protected readonly leaving = signal(false);

  protected get isOwner(): boolean {
    return this.classRecord()?.ownerTeacherId === this.session.user()?.uid;
  }

  protected get pendingMembers(): ClassMember[] {
    return this.members().filter((member) => member.status === 'pending');
  }

  protected get myMembership(): ClassMember | undefined {
    const uid = this.session.user()?.uid;
    return this.members().find((member) => member.uid === uid);
  }

  protected get canLeave(): boolean {
    const membership = this.myMembership;
    return Boolean(membership) && !membership?.isOwner;
  }

  async ngOnInit(): Promise<void> {
    await this.reload();
    this.loading.set(false);
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
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'No pudimos cargar la clase.');
    } finally {
      this.loading.set(false);
    }
  }
}
