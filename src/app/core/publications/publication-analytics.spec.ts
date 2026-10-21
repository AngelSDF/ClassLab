import { Timestamp } from 'firebase/firestore';
import { EvaluationQuestion } from '../evaluations/evaluation-record';
import { AttemptAnswer, AttemptRecord, ResultRecord } from '../attempts/result-record';
import { buildPublicationAnalytics } from './publication-analytics';

function singleQuestion(id = 'q1'): EvaluationQuestion {
  return {
    id,
    type: 'opcion_unica',
    prompt: `Pregunta ${id}`,
    points: 10,
    explanation: 'Explicación',
    options: [
      { id: 'a', text: 'Opción A' },
      { id: 'b', text: 'Opción B' },
    ],
    correctOptionIds: ['a'],
    correctBoolean: null,
  };
}

function multipleQuestion(): EvaluationQuestion {
  return {
    id: 'q1',
    type: 'opcion_multiple',
    prompt: 'Selecciona las correctas',
    points: 10,
    explanation: '',
    options: [
      { id: 'a', text: 'Opción A' },
      { id: 'b', text: 'Opción B' },
      { id: 'c', text: 'Opción C' },
    ],
    correctOptionIds: ['a', 'b'],
    correctBoolean: null,
  };
}

function trueFalseQuestion(): EvaluationQuestion {
  return {
    id: 'q1',
    type: 'verdadero_falso',
    prompt: '¿Es verdadero?',
    points: 5,
    explanation: '',
    options: [],
    correctOptionIds: [],
    correctBoolean: true,
  };
}

function answer(
  questionId: string,
  optionIds: string[] = [],
  boolean: boolean | null = null,
): AttemptAnswer {
  return { questionId, optionIds, boolean };
}

function attempt(
  attemptNumber: number,
  answers: AttemptAnswer[],
  status: 'in_progress' | 'submitted' = 'submitted',
  submittedAt = Timestamp.fromMillis(attemptNumber * 1000),
): AttemptRecord {
  return {
    attemptNumber,
    status,
    answers,
    startedAt: Timestamp.fromMillis(attemptNumber * 500),
    submittedAt: status === 'submitted' ? submittedAt : null,
  };
}

function result(studentId: string, studentName: string, attempts: AttemptRecord[]): ResultRecord {
  return {
    id: studentId,
    publicationId: 'p1',
    studentId,
    studentName,
    publicationTitle: 'Publicación',
    hasSubmitted: attempts.some((item) => item.status === 'submitted'),
    attempts,
    createdAt: null,
    updatedAt: null,
  };
}

describe('buildPublicationAnalytics', () => {
  it('calcula la distribución de opciones y el ejemplo 3/5', () => {
    const results = [
      result('s1', 'Ana', [attempt(1, [answer('q1', ['a'])])]),
      result('s2', 'Beto', [attempt(1, [answer('q1', ['a'])])]),
      result('s3', 'Carla', [attempt(1, [answer('q1', ['a'])])]),
      result('s4', 'Dani', [attempt(1, [answer('q1', ['b'])])]),
      result('s5', 'Eva', [attempt(1, [answer('q1', ['b'])])]),
    ];

    const analytics = buildPublicationAnalytics([singleQuestion()], results);
    const question = analytics.questions[0];

    expect(analytics.studentCount).toBe(5);
    expect(analytics.submittedAttemptCount).toBe(5);
    expect(question.options[0]).toMatchObject({
      id: 'a',
      count: 3,
      percentage: 60,
      isCorrect: true,
    });
    expect(question.options[1]).toMatchObject({
      id: 'b',
      count: 2,
      percentage: 40,
      isCorrect: false,
    });
    expect(question.correctCount).toBe(3);
    expect(question.averageScore).toBe(6);
    expect(question.averageRate).toBe(60);
  });

  it('usa el último intento enviado de cada estudiante', () => {
    const student = result('s1', 'Ana', [
      attempt(1, [answer('q1', ['b'])], 'submitted', Timestamp.fromMillis(1000)),
      attempt(2, [answer('q1', ['a'])], 'submitted', Timestamp.fromMillis(2000)),
    ]);

    const analytics = buildPublicationAnalytics([singleQuestion()], [student]);

    expect(analytics.students[0].latestAttempt.attemptNumber).toBe(2);
    expect(analytics.questions[0].options[0].count).toBe(1);
    expect(analytics.questions[0].options[1].count).toBe(0);
    expect(analytics.questions[0].correctCount).toBe(1);
  });

  it('ignora intentos en curso', () => {
    const student = result('s1', 'Ana', [attempt(1, [answer('q1', ['a'])], 'in_progress')]);

    const analytics = buildPublicationAnalytics([singleQuestion()], [student]);

    expect(analytics.studentCount).toBe(0);
    expect(analytics.questions[0].options[0].percentage).toBe(0);
    expect(analytics.mostMissed).toBeNull();
    expect(analytics.mostCorrect).toBeNull();
  });

  it('ignora un intento en curso posterior al último enviado', () => {
    const student = result('s1', 'Ana', [
      attempt(1, [answer('q1', ['a'])], 'submitted'),
      attempt(2, [answer('q1', ['b'])], 'in_progress'),
    ]);

    const analytics = buildPublicationAnalytics([singleQuestion()], [student]);

    expect(analytics.students[0].latestAttempt.attemptNumber).toBe(1);
    expect(analytics.questions[0].options[0].count).toBe(1);
    expect(analytics.questions[0].options[1].count).toBe(0);
    expect(analytics.questions[0].unansweredCount).toBe(0);
  });

  it('cuenta selecciones y puntaje parcial en opción múltiple', () => {
    const results = [
      result('s1', 'Ana', [attempt(1, [answer('q1', ['a', 'b'])])]),
      result('s2', 'Beto', [attempt(1, [answer('q1', ['a'])])]),
      result('s3', 'Carla', [attempt(1, [answer('q1', ['b'])])]),
    ];

    const analytics = buildPublicationAnalytics([multipleQuestion()], results);
    const question = analytics.questions[0];

    expect(question.options.map((option) => option.count)).toEqual([2, 2, 0]);
    expect(question.correctCount).toBe(1);
    expect(question.averageScore).toBeCloseTo(6.67, 2);
    expect(question.averageRate).toBeCloseTo(66.67, 2);
  });

  it('calcula verdadero/falso', () => {
    const results = [
      result('s1', 'Ana', [attempt(1, [answer('q1', [], true)])]),
      result('s2', 'Beto', [attempt(1, [answer('q1', [], false)])]),
    ];

    const analytics = buildPublicationAnalytics([trueFalseQuestion()], results);
    const question = analytics.questions[0];

    expect(question.options[0]).toMatchObject({
      text: 'Verdadero',
      count: 1,
      percentage: 50,
      isCorrect: true,
    });
    expect(question.options[1]).toMatchObject({
      text: 'Falso',
      count: 1,
      percentage: 50,
      isCorrect: false,
    });
    expect(question.averageScore).toBe(2.5);
    expect(question.averageRate).toBe(50);
  });

  it('identifica la pregunta con más fallas y la de más aciertos', () => {
    const questions = [singleQuestion('q1'), singleQuestion('q2')];
    const results = [
      result('s1', 'Ana', [attempt(1, [answer('q1', ['a']), answer('q2', ['b'])])]),
      result('s2', 'Beto', [attempt(1, [answer('q1', ['a']), answer('q2', ['b'])])]),
    ];

    const analytics = buildPublicationAnalytics(questions, results);

    expect(analytics.mostCorrect?.question.id).toBe('q1');
    expect(analytics.mostMissed?.question.id).toBe('q2');
    expect(analytics.mostCorrect?.averageRate).toBe(100);
    expect(analytics.mostMissed?.averageRate).toBe(0);
  });

  it('cuenta preguntas sin responder y resume a los estudiantes', () => {
    const results = [
      result('s1', 'Ana', [
        attempt(1, [answer('q1', [])]),
        attempt(2, [answer('q1', ['a'])], 'submitted', Timestamp.fromMillis(2000)),
      ]),
      result('s2', 'Beto', [attempt(1, [answer('q1', [])])]),
    ];

    const analytics = buildPublicationAnalytics([singleQuestion()], results);

    expect(analytics.studentCount).toBe(2);
    expect(analytics.questions[0].unansweredCount).toBe(1);
    expect(analytics.questions[0].correctCount).toBe(1);
    expect(analytics.students[0].submittedAttempts).toBe(2);
    expect(analytics.students[0].earned).toBe(10);
  });

  it('devuelve listas vacías sin resultados', () => {
    const analytics = buildPublicationAnalytics([singleQuestion()], []);

    expect(analytics.studentCount).toBe(0);
    expect(analytics.students).toEqual([]);
    expect(analytics.mostMissed).toBeNull();
    expect(analytics.mostCorrect).toBeNull();
    expect(analytics.questions[0].unansweredCount).toBe(0);
  });
});
