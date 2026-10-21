import { buildPublicationSchedule } from './publication-schedule';

describe('buildPublicationSchedule', () => {
  it('devuelve null cuando no hay fecha', () => {
    const schedule = buildPublicationSchedule({
      date: '',
      startTime: '08:00',
      endTime: '10:00',
    });

    expect(schedule.openAt).toBeNull();
    expect(schedule.closeAt).toBeNull();
  });

  it('convierte fecha y horas locales en timestamps', () => {
    const schedule = buildPublicationSchedule({
      date: '2026-10-20',
      startTime: '08:00',
      endTime: '10:30',
    });

    expect(schedule.openAt?.toMillis()).toBe(new Date('2026-10-20T08:00:00').getTime());
    expect(schedule.closeAt?.toMillis()).toBe(new Date('2026-10-20T10:30:00').getTime());
  });

  it('exige horas cuando hay fecha', () => {
    expect(() =>
      buildPublicationSchedule({
        date: '2026-10-20',
        startTime: '',
        endTime: '10:00',
      }),
    ).toThrow(/hora de inicio/);
  });

  it('rechaza un fin anterior o igual al inicio', () => {
    expect(() =>
      buildPublicationSchedule({
        date: '2026-10-20',
        startTime: '10:00',
        endTime: '09:00',
      }),
    ).toThrow(/posterior/);
  });
});
