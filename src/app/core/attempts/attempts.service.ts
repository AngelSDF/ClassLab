import { Injectable, inject } from '@angular/core';
import {
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
import { firebaseFirestore } from '../shared/firebase';
import { AttemptAnswer, AttemptRecord, ResultRecord, StartAttemptResult } from './result-record';
import { SessionService } from '../auth/session.service';
import {
  attemptDeadlineMs,
  isDeadlineExpired,
  readDurationMinutes,
} from '../publications/publication-time-limit';

function describeError(err: unknown): string {
  const code = (err as { code?: string } | null)?.code;
  if (code === 'permission-denied') {
    return 'Las reglas de Firestore bloquearon la operación. Verifica que estén desplegadas.';
  }
  return err instanceof Error ? err.message : 'Ocurrió un error inesperado.';
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' ? value : fallback;
}

function asTimestamp(value: unknown): Timestamp | null {
  return value instanceof Timestamp ? value : null;
}

function mapAnswer(value: unknown): AttemptAnswer | null {
  if (!value || typeof value !== 'object') return null;
  const data = value as Record<string, unknown>;
  const questionId = asString(data['questionId']);
  if (!questionId) return null;
  const optionIds = Array.isArray(data['optionIds'])
    ? data['optionIds'].filter((item): item is string => typeof item === 'string')
    : [];
  const booleanValue = typeof data['boolean'] === 'boolean' ? data['boolean'] : null;
  return { questionId, optionIds, boolean: booleanValue };
}

function mapAttempt(value: unknown): AttemptRecord | null {
  if (!value || typeof value !== 'object') return null;
  const data = value as Record<string, unknown>;
  const attemptNumber = asNumber(data['attemptNumber']);
  if (attemptNumber < 1) return null;
  const status = data['status'] === 'submitted' ? 'submitted' : 'in_progress';
  const answers = Array.isArray(data['answers'])
    ? data['answers'].flatMap((item) => {
        const answer = mapAnswer(item);
        return answer ? [answer] : [];
      })
    : [];
  const startedAt = asTimestamp(data['startedAt']) ?? Timestamp.now();
  const submittedAt = asTimestamp(data['submittedAt']);
  return { attemptNumber, status, answers, startedAt, submittedAt };
}

function mapResult(id: string, data: Record<string, unknown>): ResultRecord {
  const attempts = Array.isArray(data['attempts'])
    ? data['attempts'].flatMap((item) => {
        const attempt = mapAttempt(item);
        return attempt ? [attempt] : [];
      })
    : [];
  return {
    id,
    publicationId: asString(data['publicationId']),
    studentId: asString(data['studentId']),
    studentName: asString(data['studentName']),
    publicationTitle: asString(data['publicationTitle']),
    hasSubmitted: data['hasSubmitted'] === true,
    attempts,
    createdAt: asTimestamp(data['createdAt']),
    updatedAt: asTimestamp(data['updatedAt']),
  };
}

@Injectable({ providedIn: 'root' })
export class AttemptsService {
  private readonly firestore = firebaseFirestore;
  private readonly session = inject(SessionService);

  async startOrResumeAttempt(classId: string, publicationId: string): Promise<StartAttemptResult> {
    const firestore = this.requireFirestore();
    const user = this.session.user();
    if (!user) {
      throw new Error('Debes iniciar sesión para responder una evaluación.');
    }

    const profile = this.session.userRecord();
    const studentName = user.isAnonymous
      ? this.session.guestName()?.trim() || 'Invitado'
      : (profile ? `${profile.firstName} ${profile.lastName}`.trim() : '') ||
        user.displayName ||
        'Estudiante';

    const publicationRef = doc(firestore, 'classes', classId, 'publications', publicationId);
    const resultRef = doc(
      firestore,
      'classes',
      classId,
      'publications',
      publicationId,
      'results',
      user.uid,
    );

    try {
      return await runTransaction<StartAttemptResult>(firestore, async (transaction) => {
        const resultSnapshot = await transaction.get(resultRef);
        const contentSnapshot = await transaction.get(publicationRef);
        if (!contentSnapshot.exists() || contentSnapshot.data()['rawJsonSafe'] !== true) {
          throw new Error('La publicación ya no está disponible.');
        }

        const content = contentSnapshot.data();
        const existing = resultSnapshot.exists()
          ? mapResult(resultSnapshot.id, resultSnapshot.data())
          : null;
        const isGuest = user.isAnonymous;
        const now = Timestamp.now();
        const maxAttempts = Math.max(1, asNumber(content['maxAttempts'], 1));
        const durationMinutes = readDurationMinutes(content['durationMinutes']);
        const inProgress = existing?.attempts.find((attempt) => attempt.status === 'in_progress');

        let attempts = existing?.attempts ?? [];
        let autoResult: ResultRecord | null = null;

        if (inProgress && existing) {
          const deadline = attemptDeadlineMs(inProgress.startedAt.toMillis(), durationMinutes);
          const expired = isDeadlineExpired(deadline, now.toMillis());
          const shouldAutoSubmit = isGuest || durationMinutes === null || expired;

          if (!shouldAutoSubmit) {
            return { kind: 'resumed', attempt: inProgress, result: existing };
          }

          const submitted: AttemptRecord = {
            ...inProgress,
            status: 'submitted',
            submittedAt: now,
          };
          attempts = existing.attempts.map((attempt) =>
            attempt.attemptNumber === inProgress.attemptNumber ? submitted : attempt,
          );
          autoResult = { ...existing, attempts, hasSubmitted: true };

          const canStartAnother = isGuest || durationMinutes === null;
          if (!canStartAnother || attempts.length >= maxAttempts) {
            transaction.update(resultRef, {
              attempts,
              hasSubmitted: true,
              updatedAt: serverTimestamp(),
            });
            return {
              kind: 'auto_submitted',
              attempt: submitted,
              result: autoResult,
              reason: expired ? 'time_expired' : 'previous_attempt',
            };
          }
        }

        const blocked = (
          reason: 'not_open' | 'closed' | 'no_attempts' | 'guests_disabled' | 'guest_full',
        ): StartAttemptResult => {
          if (!autoResult) return { kind: 'blocked', reason, result: existing };
          transaction.update(resultRef, {
            attempts,
            hasSubmitted: true,
            updatedAt: serverTimestamp(),
          });
          return { kind: 'blocked', reason, result: autoResult };
        };

        const guestAccess = content['guestAccess'] === true;
        const guestCapacity = asNumber(content['guestCapacity']);
        const guestCount = asNumber(content['guestCount']);
        if (isGuest && !guestAccess) {
          return blocked('guests_disabled');
        }
        if (isGuest && !existing && guestCount >= guestCapacity) {
          return blocked('guest_full');
        }

        const openAt = asTimestamp(content['openAt']);
        const closeAt = asTimestamp(content['closeAt']);
        if (openAt && now.toMillis() < openAt.toMillis()) {
          return blocked('not_open');
        }
        if (closeAt && now.toMillis() > closeAt.toMillis()) {
          return blocked('closed');
        }

        if (attempts.length >= maxAttempts) {
          return blocked('no_attempts');
        }

        const attempt: AttemptRecord = {
          attemptNumber: attempts.length + 1,
          status: 'in_progress',
          answers: [],
          startedAt: now,
          submittedAt: null,
        };
        const nextAttempts = [...attempts, attempt];

        if (existing) {
          transaction.update(resultRef, {
            attempts: nextAttempts,
            ...(autoResult ? { hasSubmitted: true } : {}),
            updatedAt: serverTimestamp(),
          });
        } else {
          transaction.set(resultRef, {
            publicationId,
            studentId: user.uid,
            studentName,
            publicationTitle: asString(content['title'], 'Publicación'),
            hasSubmitted: false,
            attempts: nextAttempts,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
        const consumesGuestSeat = isGuest && !existing;
        transaction.update(publicationRef, {
          attemptCount: asNumber(content['attemptCount']) + 1,
          ...(consumesGuestSeat ? { guestCount: guestCount + 1 } : {}),
        });

        return {
          kind: 'started',
          attempt,
          result: existing
            ? {
                ...existing,
                attempts,
                hasSubmitted: existing.hasSubmitted || autoResult !== null,
              }
            : null,
          previousAttemptSubmitted: autoResult !== null,
        };
      });
    } catch (err) {
      throw new Error(describeError(err));
    }
  }
  async saveDraft(
    classId: string,
    publicationId: string,
    attemptNumber: number,
    answers: AttemptAnswer[],
  ): Promise<void> {
    const firestore = this.requireFirestore();
    const user = this.session.user();
    if (!user) {
      throw new Error('Debes iniciar sesión para responder una evaluación.');
    }

    const resultRef = doc(
      firestore,
      'classes',
      classId,
      'publications',
      publicationId,
      'results',
      user.uid,
    );

    try {
      await runTransaction(firestore, async (transaction) => {
        const snapshot = await transaction.get(resultRef);
        if (!snapshot.exists()) throw new Error('El intento ya no existe.');

        const result = mapResult(snapshot.id, snapshot.data());
        const attempt = result.attempts.find((item) => item.attemptNumber === attemptNumber);
        if (!attempt) throw new Error('El intento ya no existe.');
        if (attempt.status !== 'in_progress') throw new Error('Este intento ya fue enviado.');

        const nextAttempts = result.attempts.map((item) =>
          item.attemptNumber === attemptNumber ? { ...item, answers } : item,
        );
        transaction.update(resultRef, {
          attempts: nextAttempts,
          updatedAt: serverTimestamp(),
        });
      });
    } catch (err) {
      throw new Error(describeError(err));
    }
  }

  async submitAttempt(
    classId: string,
    publicationId: string,
    attemptNumber: number,
    answers: AttemptAnswer[],
  ): Promise<AttemptRecord> {
    const firestore = this.requireFirestore();
    const user = this.session.user();
    if (!user) {
      throw new Error('Debes iniciar sesión para enviar una evaluación.');
    }

    const resultRef = doc(
      firestore,
      'classes',
      classId,
      'publications',
      publicationId,
      'results',
      user.uid,
    );

    try {
      return await runTransaction<AttemptRecord>(firestore, async (transaction) => {
        const snapshot = await transaction.get(resultRef);
        if (!snapshot.exists()) throw new Error('El intento ya no existe.');

        const result = mapResult(snapshot.id, snapshot.data());
        const attempt = result.attempts.find((item) => item.attemptNumber === attemptNumber);
        if (!attempt) throw new Error('El intento ya no existe.');
        if (attempt.status !== 'in_progress') throw new Error('Este intento ya fue enviado.');

        const submitted: AttemptRecord = {
          ...attempt,
          status: 'submitted',
          answers,
          submittedAt: Timestamp.now(),
        };
        const nextAttempts = result.attempts.map((item) =>
          item.attemptNumber === attemptNumber ? submitted : item,
        );
        transaction.update(resultRef, {
          attempts: nextAttempts,
          hasSubmitted: true,
          updatedAt: serverTimestamp(),
        });
        return submitted;
      });
    } catch (err) {
      throw new Error(describeError(err));
    }
  }

  async listResults(classId: string, publicationId: string): Promise<ResultRecord[]> {
    const firestore = this.requireFirestore();
    try {
      const snapshot = await getDocs(
        collection(firestore, 'classes', classId, 'publications', publicationId, 'results'),
      );
      return snapshot.docs.map((item) => mapResult(item.id, item.data()));
    } catch (err) {
      throw new Error(describeError(err));
    }
  }

  async getResult(
    classId: string,
    publicationId: string,
    studentId?: string,
  ): Promise<ResultRecord | null> {
    const firestore = this.requireFirestore();
    const uid = studentId ?? this.session.user()?.uid;
    if (!uid) throw new Error('Debes iniciar sesión para consultar resultados.');

    try {
      const snapshot = await getDoc(
        doc(firestore, 'classes', classId, 'publications', publicationId, 'results', uid),
      );
      return snapshot.exists() ? mapResult(snapshot.id, snapshot.data()) : null;
    } catch (err) {
      throw new Error(describeError(err));
    }
  }

  private requireFirestore() {
    if (!this.firestore) throw new Error('Firebase aún no está configurado.');
    return this.firestore;
  }
}
