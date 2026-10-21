import { Timestamp } from 'firebase/firestore';

export interface PublicationScheduleInput {
  date: string;
  startTime: string;
  endTime: string;
}

export interface PublicationSchedule {
  openAt: Timestamp | null;
  closeAt: Timestamp | null;
}

export function buildPublicationSchedule(input: PublicationScheduleInput): PublicationSchedule {
  const date = input.date.trim();
  if (!date) {
    return { openAt: null, closeAt: null };
  }

  const startTime = input.startTime.trim();
  const endTime = input.endTime.trim();
  if (!startTime || !endTime) {
    throw new Error('Si indicas una fecha, debes indicar la hora de inicio y la hora de fin.');
  }

  const start = new Date(`${date}T${startTime}:00`);
  const end = new Date(`${date}T${endTime}:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error('La fecha u horas indicadas no son válidas.');
  }
  if (end <= start) {
    throw new Error('La hora de fin debe ser posterior a la hora de inicio.');
  }

  return {
    openAt: Timestamp.fromDate(start),
    closeAt: Timestamp.fromDate(end),
  };
}
