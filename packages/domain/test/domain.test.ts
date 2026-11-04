import { describe, expect, it } from "@effect/vitest";
import { Effect, Schema } from "effect";

import {
  Appointment,
  AppointmentId,
  appointmentFromRow,
  appointmentToRow,
  describeAppointment,
  DocumentKey,
  describePrescription,
  Prescription,
  PrescriptionId,
} from "../src/index.ts";

const appointment: Appointment = {
  id: AppointmentId.make("a-1"),
  dateTime: "2026-12-01T09:30:00+01:00",
  agendaCode: "HEM-12",
  title: "Hematology follow-up",
  practitioner: "Dr. Saoudi",
  comment: null,
  durationMinutes: 30,
};

describe("domain", () => {
  it("round-trips appointments through D1 rows", () => {
    expect(appointmentFromRow(appointmentToRow(appointment))).toEqual(appointment);
  });

  it("describes records for embeddings without empty fields", () => {
    const text = describeAppointment(appointment);
    expect(text).toContain("Practitioner: Dr. Saoudi");
    expect(text).not.toContain("Comment");

    const prescription: Prescription = {
      id: PrescriptionId.make("p-1"),
      medicationName: "Hydroxyurea",
      dosage: "500 mg",
      frequency: "once daily",
      duration: null,
      instructions: "Take with water",
    };
    expect(describePrescription(prescription)).toBe(
      "Prescription: Hydroxyurea\nDosage: 500 mg\nFrequency: once daily\nInstructions: Take with water"
    );
  });

  it.effect("accepts only generated PDF document keys", () =>
    Effect.gen(function* () {
      const decode = Schema.decodeUnknownEffect(DocumentKey);
      const key = yield* decode("documents/123e4567-e89b-42d3-a456-426614174000.pdf");
      expect(key).toBe("documents/123e4567-e89b-42d3-a456-426614174000.pdf");
      const rejected = yield* Effect.flip(decode("../etc/passwd"));
      expect(rejected._tag).toBe("SchemaError");
    })
  );
});
