export const DEFAULT_DURATION_MINUTES = 30;
export const MIN_DURATION_MINUTES = 1;
export const MAX_DURATION_MINUTES = 180;
export const TIMER_WARNING_MS = 60_000;

const MINUTE_MS = 60_000;

export function validateDurationMinutes(value: unknown): number {
  const minutes = Math.trunc(Number(value));
  if (
    !Number.isFinite(minutes) ||
    minutes < MIN_DURATION_MINUTES ||
    minutes > MAX_DURATION_MINUTES
  ) {
    throw new Error(
      `La duración debe estar entre ${MIN_DURATION_MINUTES} y ${MAX_DURATION_MINUTES} minutos.`,
    );
  }
  return minutes;
}

export function readDurationMinutes(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const minutes = Math.trunc(value);
  return minutes >= MIN_DURATION_MINUTES && minutes <= MAX_DURATION_MINUTES ? minutes : null;
}

export function attemptDeadlineMs(
  startedAtMs: number,
  durationMinutes: number | null,
): number | null {
  if (durationMinutes === null) return null;
  return startedAtMs + durationMinutes * MINUTE_MS;
}

export function remainingMs(deadlineMs: number, nowMs: number): number {
  return Math.max(0, deadlineMs - nowMs);
}

export function attemptRemainingMs(
  startedAtMs: number,
  durationMinutes: number | null,
  nowMs: number,
): number | null {
  const deadline = attemptDeadlineMs(startedAtMs, durationMinutes);
  return deadline === null ? null : remainingMs(deadline, nowMs);
}

export function isDeadlineExpired(deadlineMs: number | null, nowMs: number): boolean {
  return deadlineMs !== null && nowMs >= deadlineMs;
}

export function formatRemainingTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value: number) => value.toString().padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}
