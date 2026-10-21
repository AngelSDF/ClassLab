import { PublicationSummary } from './publication-record';
import { AttemptRecord, ResultRecord } from '../attempts/result-record';

export interface CompletedStudentPublication {
  publication: PublicationSummary;
  submittedAttempts: number;
  latestSubmitted: AttemptRecord;
}

export interface StudentPublicationView {
  available: PublicationSummary[];
  completed: CompletedStudentPublication[];
}

export function buildStudentPublicationView(
  publications: PublicationSummary[],
  resultsByPublication: Map<string, ResultRecord>,
): StudentPublicationView {
  const available: PublicationSummary[] = [];
  const completed: CompletedStudentPublication[] = [];

  for (const publication of publications) {
    const result = resultsByPublication.get(publication.id);
    const attempts = result?.attempts ?? [];
    const submitted = attempts.filter((attempt) => attempt.status === 'submitted');
    const latestSubmitted = submitted.reduce<AttemptRecord | null>(
      (latest, attempt) =>
        !latest || attempt.attemptNumber > latest.attemptNumber ? attempt : latest,
      null,
    );
    const hasInProgress = attempts.some((attempt) => attempt.status === 'in_progress');
    const exhausted = attempts.length >= publication.maxAttempts;

    if (latestSubmitted && !hasInProgress && exhausted) {
      completed.push({
        publication,
        submittedAttempts: submitted.length,
        latestSubmitted,
      });
    } else {
      available.push(publication);
    }
  }

  completed.sort((a, b) => {
    const aTime = a.latestSubmitted.submittedAt?.toMillis() ?? 0;
    const bTime = b.latestSubmitted.submittedAt?.toMillis() ?? 0;
    return bTime - aTime;
  });

  return { available, completed };
}
