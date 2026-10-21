import { Timestamp } from 'firebase/firestore';
import { PublicationSummary } from './publication-record';
import { AttemptRecord, ResultRecord } from '../attempts/result-record';
import { buildStudentPublicationView } from './student-publication-view';

function publication(id: string, maxAttempts: number): PublicationSummary {
  return {
    id,
    evaluationId: `evaluation-${id}`,
    title: `Publicación ${id}`,
    accessCode: 'ABC123',
    questionCount: 3,
    maxAttempts,
    durationMinutes: 30,
    rawJsonSafe: true,
    guestAccess: false,
    guestCapacity: 0,
    guestCount: 0,
    attemptCount: 0,
    hasAttempts: false,
    openAt: null,
    closeAt: null,
    createdAt: null,
  };
}

function attempt(
  attemptNumber: number,
  status: 'in_progress' | 'submitted',
  submittedAt: Timestamp | null = null,
): AttemptRecord {
  return {
    attemptNumber,
    status,
    answers: [],
    startedAt: Timestamp.fromMillis(attemptNumber * 1000),
    submittedAt,
  };
}

function result(publicationId: string, attempts: AttemptRecord[]): ResultRecord {
  return {
    id: 'student-1',
    publicationId,
    studentId: 'student-1',
    studentName: 'Estudiante',
    publicationTitle: `Publicación ${publicationId}`,
    hasSubmitted: attempts.some((item) => item.status === 'submitted'),
    attempts,
    createdAt: null,
    updatedAt: null,
  };
}

describe('buildStudentPublicationView', () => {
  it('deja disponible una publicación sin resultado', () => {
    const view = buildStudentPublicationView([publication('p1', 1)], new Map());

    expect(view.available.map((item) => item.id)).toEqual(['p1']);
    expect(view.completed).toEqual([]);
  });

  it('mueve a resultados al agotar los intentos con un envío', () => {
    const view = buildStudentPublicationView(
      [publication('p1', 1)],
      new Map([['p1', result('p1', [attempt(1, 'submitted', Timestamp.fromMillis(5000))])]]),
    );

    expect(view.available).toEqual([]);
    expect(view.completed).toHaveLength(1);
    expect(view.completed[0].submittedAttempts).toBe(1);
    expect(view.completed[0].latestSubmitted.attemptNumber).toBe(1);
  });

  it('mantiene disponible mientras queden intentos', () => {
    const view = buildStudentPublicationView(
      [publication('p1', 2)],
      new Map([['p1', result('p1', [attempt(1, 'submitted', Timestamp.fromMillis(5000))])]]),
    );

    expect(view.available.map((item) => item.id)).toEqual(['p1']);
    expect(view.completed).toEqual([]);
  });

  it('mantiene disponible si hay un intento en curso', () => {
    const view = buildStudentPublicationView(
      [publication('p1', 2)],
      new Map([
        [
          'p1',
          result('p1', [
            attempt(1, 'submitted', Timestamp.fromMillis(5000)),
            attempt(2, 'in_progress'),
          ]),
        ],
      ]),
    );

    expect(view.available.map((item) => item.id)).toEqual(['p1']);
    expect(view.completed).toEqual([]);
  });

  it('mueve a resultados al completar todos los intentos', () => {
    const view = buildStudentPublicationView(
      [publication('p1', 2)],
      new Map([
        [
          'p1',
          result('p1', [
            attempt(1, 'submitted', Timestamp.fromMillis(5000)),
            attempt(2, 'submitted', Timestamp.fromMillis(9000)),
          ]),
        ],
      ]),
    );

    expect(view.available).toEqual([]);
    expect(view.completed).toHaveLength(1);
    expect(view.completed[0].submittedAttempts).toBe(2);
    expect(view.completed[0].latestSubmitted.attemptNumber).toBe(2);
  });

  it('ordena los resultados por el último envío más reciente', () => {
    const view = buildStudentPublicationView(
      [publication('p1', 1), publication('p2', 1)],
      new Map([
        ['p1', result('p1', [attempt(1, 'submitted', Timestamp.fromMillis(1000))])],
        ['p2', result('p2', [attempt(1, 'submitted', Timestamp.fromMillis(9000))])],
      ]),
    );

    expect(view.completed.map((item) => item.publication.id)).toEqual(['p2', 'p1']);
  });
});
