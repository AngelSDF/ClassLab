import { EvaluationQuestion } from '../evaluations/evaluation-record';
import { AttemptAnswer } from '../attempts/result-record';
import { scoreAttempt, scoreQuestion } from './scoring';

function singleQuestion(points = 10): EvaluationQuestion {
  return {
    id: 'q1',
    type: 'opcion_unica',
    prompt: '¿Cuál es la correcta?',
    points,
    explanation: '',
    options: [
      { id: 'opt_a', text: 'A' },
      { id: 'opt_b', text: 'B' },
    ],
    correctOptionIds: ['opt_a'],
    correctBoolean: null,
  };
}

function multipleQuestion(points = 10): EvaluationQuestion {
  return {
    id: 'q2',
    type: 'opcion_multiple',
    prompt: 'Marca las correctas',
    points,
    explanation: '',
    options: [
      { id: 'opt_a', text: 'A' },
      { id: 'opt_b', text: 'B' },
      { id: 'opt_c', text: 'C' },
      { id: 'opt_d', text: 'D' },
    ],
    correctOptionIds: ['opt_a', 'opt_b', 'opt_c'],
    correctBoolean: null,
  };
}

function trueFalseQuestion(points = 5): EvaluationQuestion {
  return {
    id: 'q3',
    type: 'verdadero_falso',
    prompt: '¿Es verdadero?',
    points,
    explanation: '',
    options: [],
    correctOptionIds: [],
    correctBoolean: true,
  };
}

function answer(
  questionId: string,
  optionIds: string[] = [],
  value: boolean | null = null,
): AttemptAnswer {
  return { questionId, optionIds, boolean: value };
}

describe('scoreQuestion', () => {
  it('asigna todo el puntaje en opción única correcta', () => {
    expect(scoreQuestion(singleQuestion(), answer('q1', ['opt_a']))).toBe(10);
  });

  it('no asigna puntaje en opción única incorrecta', () => {
    expect(scoreQuestion(singleQuestion(), answer('q1', ['opt_b']))).toBe(0);
  });

  it('aplica proporción de aciertos en opción múltiple', () => {
    expect(scoreQuestion(multipleQuestion(), answer('q2', ['opt_a', 'opt_b']))).toBeCloseTo(
      6.67,
      2,
    );
  });

  it('no penaliza opciones incorrectas adicionales', () => {
    expect(
      scoreQuestion(multipleQuestion(), answer('q2', ['opt_a', 'opt_b', 'opt_d'])),
    ).toBeCloseTo(6.67, 2);
  });

  it('asigna todo el puntaje si están todas las correctas', () => {
    expect(scoreQuestion(multipleQuestion(), answer('q2', ['opt_a', 'opt_b', 'opt_c']))).toBe(10);
  });

  it('puntúa verdadero/falso', () => {
    expect(scoreQuestion(trueFalseQuestion(), answer('q3', [], true))).toBe(5);
    expect(scoreQuestion(trueFalseQuestion(), answer('q3', [], false))).toBe(0);
  });

  it('asigna cero si no hay respuesta', () => {
    expect(scoreQuestion(singleQuestion(), undefined)).toBe(0);
  });
});

describe('scoreAttempt', () => {
  it('suma puntajes por pregunta y calcula el porcentaje', () => {
    const result = scoreAttempt(
      [singleQuestion(10), multipleQuestion(10), trueFalseQuestion(5)],
      [answer('q1', ['opt_a']), answer('q2', ['opt_a', 'opt_b']), answer('q3', [], false)],
    );

    expect(result.earned).toBeCloseTo(16.67, 2);
    expect(result.max).toBe(25);
    expect(result.percentage).toBeCloseTo(66.67, 2);
    expect(result.byQuestion['q1'].earned).toBe(10);
    expect(result.byQuestion['q2'].earned).toBeCloseTo(6.67, 2);
    expect(result.byQuestion['q3'].earned).toBe(0);
  });
});
