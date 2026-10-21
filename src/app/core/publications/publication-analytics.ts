import { EvaluationQuestion } from '../evaluations/evaluation-record';
import { AttemptAnswer, AttemptRecord, ResultRecord } from '../attempts/result-record';
import { scoreAttempt, scoreQuestion } from '../shared/scoring';

export interface OptionAnalytics {
  id: string;
  text: string;
  count: number;
  percentage: number;
  isCorrect: boolean;
}

export interface QuestionAnalytics {
  index: number;
  question: EvaluationQuestion;
  responseCount: number;
  correctCount: number;
  unansweredCount: number;
  averageScore: number;
  averageRate: number;
  options: OptionAnalytics[];
}

export interface StudentResultSummary {
  studentId: string;
  studentName: string;
  submittedAttempts: number;
  latestAttempt: AttemptRecord;
  earned: number;
  max: number;
  percentage: number;
}

export interface PublicationAnalytics {
  studentCount: number;
  submittedAttemptCount: number;
  questions: QuestionAnalytics[];
  mostMissed: QuestionAnalytics | null;
  mostCorrect: QuestionAnalytics | null;
  students: StudentResultSummary[];
}

interface SelectedAttempt {
  result: ResultRecord;
  attempt: AttemptRecord;
}

function latestSubmittedAttempt(result: ResultRecord): AttemptRecord | null {
  return result.attempts
    .filter((attempt) => attempt.status === 'submitted')
    .reduce<AttemptRecord | null>((latest, attempt) => {
      if (!latest) return attempt;
      if (attempt.attemptNumber !== latest.attemptNumber) {
        return attempt.attemptNumber > latest.attemptNumber ? attempt : latest;
      }
      const attemptTime = attempt.submittedAt?.toMillis() ?? 0;
      const latestTime = latest.submittedAt?.toMillis() ?? 0;
      return attemptTime > latestTime ? attempt : latest;
    }, null);
}

function selectLatestSubmitted(results: ResultRecord[]): SelectedAttempt[] {
  return results.flatMap((result) => {
    const attempt = latestSubmittedAttempt(result);
    return attempt ? [{ result, attempt }] : [];
  });
}

function answerFor(attempt: AttemptRecord, questionId: string): AttemptAnswer | undefined {
  return attempt.answers.find((answer) => answer.questionId === questionId);
}

function percentage(count: number, total: number): number {
  return total > 0 ? (count / total) * 100 : 0;
}

function isAnswered(question: EvaluationQuestion, answer: AttemptAnswer | undefined): boolean {
  if (!answer) return false;
  if (question.type === 'verdadero_falso') return typeof answer.boolean === 'boolean';
  return answer.optionIds.length > 0;
}

function buildOptionAnalytics(
  question: EvaluationQuestion,
  selected: SelectedAttempt[],
): OptionAnalytics[] {
  const total = selected.length;

  if (question.type === 'verdadero_falso') {
    const trueCount = selected.filter(
      (item) => answerFor(item.attempt, question.id)?.boolean === true,
    ).length;
    const falseCount = selected.filter(
      (item) => answerFor(item.attempt, question.id)?.boolean === false,
    ).length;

    return [
      {
        id: 'true',
        text: 'Verdadero',
        count: trueCount,
        percentage: percentage(trueCount, total),
        isCorrect: question.correctBoolean === true,
      },
      {
        id: 'false',
        text: 'Falso',
        count: falseCount,
        percentage: percentage(falseCount, total),
        isCorrect: question.correctBoolean === false,
      },
    ];
  }

  return question.options.map((option) => {
    const count = selected.filter((item) =>
      (answerFor(item.attempt, question.id)?.optionIds ?? []).includes(option.id),
    ).length;
    return {
      id: option.id,
      text: option.text,
      count,
      percentage: percentage(count, total),
      isCorrect: question.correctOptionIds.includes(option.id),
    };
  });
}

function buildQuestionAnalytics(
  question: EvaluationQuestion,
  index: number,
  selected: SelectedAttempt[],
): QuestionAnalytics {
  const total = selected.length;
  let earnedTotal = 0;
  let correctCount = 0;
  let unansweredCount = 0;

  for (const item of selected) {
    const answer = answerFor(item.attempt, question.id);
    const earned = scoreQuestion(question, answer);
    earnedTotal += earned;
    if (earned === question.points) correctCount += 1;
    if (!isAnswered(question, answer)) unansweredCount += 1;
  }

  return {
    index,
    question,
    responseCount: total,
    correctCount,
    unansweredCount,
    averageScore: total > 0 ? earnedTotal / total : 0,
    averageRate: total > 0 ? (earnedTotal / (question.points * total)) * 100 : 0,
    options: buildOptionAnalytics(question, selected),
  };
}

export function buildPublicationAnalytics(
  questions: EvaluationQuestion[],
  results: ResultRecord[],
): PublicationAnalytics {
  const selected = selectLatestSubmitted(results);
  const questionAnalytics = questions.map((question, index) =>
    buildQuestionAnalytics(question, index, selected),
  );
  const withResponses = questionAnalytics.filter((item) => item.responseCount > 0);

  const mostMissed = withResponses.length
    ? withResponses.reduce((lowest, item) =>
        item.averageRate < lowest.averageRate ? item : lowest,
      )
    : null;
  const mostCorrect = withResponses.length
    ? withResponses.reduce((highest, item) =>
        item.averageRate > highest.averageRate ? item : highest,
      )
    : null;

  const students = selected
    .map(({ result, attempt }) => {
      const score = scoreAttempt(questions, attempt.answers);
      return {
        studentId: result.studentId || result.id,
        studentName: result.studentName || 'Estudiante',
        submittedAttempts: result.attempts.filter((item) => item.status === 'submitted').length,
        latestAttempt: attempt,
        earned: score.earned,
        max: score.max,
        percentage: score.percentage,
      };
    })
    .sort((a, b) => a.studentName.localeCompare(b.studentName));

  return {
    studentCount: selected.length,
    submittedAttemptCount: selected.reduce(
      (sum, item) =>
        sum + item.result.attempts.filter((attempt) => attempt.status === 'submitted').length,
      0,
    ),
    questions: questionAnalytics,
    mostMissed,
    mostCorrect,
    students,
  };
}
