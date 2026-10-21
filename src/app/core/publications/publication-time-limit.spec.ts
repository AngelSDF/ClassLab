import {
  DEFAULT_DURATION_MINUTES,
  MAX_DURATION_MINUTES,
  attemptDeadlineMs,
  attemptRemainingMs,
  formatRemainingTime,
  isDeadlineExpired,
  readDurationMinutes,
  remainingMs,
  validateDurationMinutes,
} from './publication-time-limit';

describe('publication-time-limit', () => {
  it('lee la duración guardada y descarta valores inválidos', () => {
    expect(readDurationMinutes(30)).toBe(30);
    expect(readDurationMinutes(null)).toBeNull();
    expect(readDurationMinutes(undefined)).toBeNull();
    expect(readDurationMinutes(0)).toBeNull();
    expect(readDurationMinutes(MAX_DURATION_MINUTES + 1)).toBeNull();
  });

  it('valida la duración configurada por el docente', () => {
    expect(validateDurationMinutes(DEFAULT_DURATION_MINUTES)).toBe(30);
    expect(() => validateDurationMinutes(0)).toThrow(/entre 1 y 180/);
    expect(() => validateDurationMinutes(MAX_DURATION_MINUTES + 1)).toThrow(/entre 1 y 180/);
  });

  it('calcula el vencimiento desde el inicio del intento', () => {
    const startedAt = 1_000_000;

    expect(attemptDeadlineMs(startedAt, 30)).toBe(startedAt + 30 * 60_000);
    expect(attemptDeadlineMs(startedAt, null)).toBeNull();
    expect(isDeadlineExpired(startedAt + 30 * 60_000, startedAt + 30 * 60_000)).toBe(true);
    expect(isDeadlineExpired(startedAt + 30 * 60_000, startedAt + 30 * 60_000 - 1)).toBe(false);
  });

  it('calcula el tiempo restante sin valores negativos', () => {
    expect(remainingMs(10_000, 4_000)).toBe(6_000);
    expect(remainingMs(10_000, 12_000)).toBe(0);
  });

  it('calcula el tiempo restante de un intento desde su inicio', () => {
    const startedAt = 1_000_000;

    expect(attemptRemainingMs(startedAt, 30, startedAt + 60_000)).toBe(29 * 60_000);
    expect(attemptRemainingMs(startedAt, 30, startedAt + 30 * 60_000)).toBe(0);
    expect(attemptRemainingMs(startedAt, 30, startedAt + 31 * 60_000)).toBe(0);
    expect(attemptRemainingMs(startedAt, null, startedAt)).toBeNull();
  });

  it('formatea el tiempo restante en minutos y segundos', () => {
    expect(formatRemainingTime(30 * 60_000)).toBe('30:00');
    expect(formatRemainingTime(61_000)).toBe('01:01');
    expect(formatRemainingTime(3_661_000)).toBe('1:01:01');
    expect(formatRemainingTime(-5_000)).toBe('00:00');
  });
});
