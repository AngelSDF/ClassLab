import { EvaluationQuestion } from '../evaluations/evaluation-record';
import { AttemptAnswer, AttemptRecord } from '../attempts/result-record';

export interface QuestionScore {
  questionId: string;
  earned: number;
  max: number;
}

export interface AttemptScore {
  earned: number;
  max: number;
  percentage: number;
  byQuestion: Record<string, QuestionScore>;
}

export function scoreQuestion(
  question: EvaluationQuestion,
  answer: AttemptAnswer | undefined,
): number {
  if (!answer) return 0;
  const max = question.points;

  if (question.type === 'verdadero_falso') {
    if (question.correctBoolean === null) return 0;
    return answer.boolean === question.correctBoolean ? max : 0;
  }

  const totalCorrect = question.correctOptionIds.length;
  if (totalCorrect === 0) return 0;

  const selected = new Set(answer.optionIds);
  let selectedCorrect = 0;
  for (const optionId of question.correctOptionIds) {
    if (selected.has(optionId)) selectedCorrect++;
  }

  return Math.max(0, Math.min(max, (selectedCorrect / totalCorrect) * max));
}

export function scoreAttempt(
  questions: EvaluationQuestion[],
  answers: AttemptAnswer[],
): AttemptScore {
  const byQuestion: Record<string, QuestionScore> = {};
  let earned = 0;
  let max = 0;

  for (const question of questions) {
    const answer = answers.find((item) => item.questionId === question.id);
    const questionEarned = scoreQuestion(question, answer);
    earned += questionEarned;
    max += question.points;
    byQuestion[question.id] = {
      questionId: question.id,
      earned: questionEarned,
      max: question.points,
    };
  }

  return {
    earned,
    max,
    percentage: max > 0 ? (earned / max) * 100 : 0,
    byQuestion,
  };
}

export function scoreAttemptRecord(
  questions: EvaluationQuestion[],
  attempt: AttemptRecord,
): AttemptScore {
  return scoreAttempt(questions, attempt.answers);
}

export function formatScore(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}
