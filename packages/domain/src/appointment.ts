import { Schema } from "effect";

export const AppointmentId = Schema.String.pipe(Schema.brand("AppointmentId"));
export type AppointmentId = typeof AppointmentId.Type;

export const Appointment = Schema.Struct({
  id: AppointmentId,
  dateTime: Schema.String,
  agendaCode: Schema.NullOr(Schema.String),
  title: Schema.String,
  practitioner: Schema.NullOr(Schema.String),
  comment: Schema.NullOr(Schema.String),
  durationMinutes: Schema.NullOr(Schema.Number),
});
export type Appointment = typeof Appointment.Type;

export const AppointmentRow = Schema.Struct({
  id: Schema.String,
  date_time: Schema.String,
  agenda_code: Schema.NullOr(Schema.String),
  title: Schema.String,
  practitioner: Schema.NullOr(Schema.String),
  comment: Schema.NullOr(Schema.String),
  duration: Schema.NullOr(Schema.Number),
});
export type AppointmentRow = typeof AppointmentRow.Type;

export const appointmentFromRow = (row: AppointmentRow): Appointment => ({
  id: AppointmentId.make(row.id),
  dateTime: row.date_time,
  agendaCode: row.agenda_code,
  title: row.title,
  practitioner: row.practitioner,
  comment: row.comment,
  durationMinutes: row.duration,
});

export const appointmentToRow = (appointment: Appointment): AppointmentRow => ({
  id: appointment.id,
  date_time: appointment.dateTime,
  agenda_code: appointment.agendaCode,
  title: appointment.title,
  practitioner: appointment.practitioner,
  comment: appointment.comment,
  duration: appointment.durationMinutes,
});

export const describeAppointment = (appointment: Appointment): string =>
  [
    `Appointment: ${appointment.title}`,
    `Date and time: ${appointment.dateTime}`,
    appointment.practitioner === null ? undefined : `Practitioner: ${appointment.practitioner}`,
    appointment.agendaCode === null ? undefined : `Agenda code: ${appointment.agendaCode}`,
    appointment.durationMinutes === null ? undefined : `Duration: ${appointment.durationMinutes} minutes`,
    appointment.comment === null ? undefined : `Comment: ${appointment.comment}`,
  ]
    .filter((line) => line !== undefined)
    .join("\n");
