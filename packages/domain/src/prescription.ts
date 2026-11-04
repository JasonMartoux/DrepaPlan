import { Schema } from "effect";

export const PrescriptionId = Schema.String.pipe(Schema.brand("PrescriptionId"));
export type PrescriptionId = typeof PrescriptionId.Type;

export const Prescription = Schema.Struct({
  id: PrescriptionId,
  medicationName: Schema.String,
  dosage: Schema.String,
  frequency: Schema.String,
  duration: Schema.NullOr(Schema.String),
  instructions: Schema.NullOr(Schema.String),
});
export type Prescription = typeof Prescription.Type;

export const PrescriptionRow = Schema.Struct({
  id: Schema.String,
  medication_name: Schema.String,
  dosage: Schema.String,
  frequency: Schema.String,
  duration: Schema.NullOr(Schema.String),
  instructions: Schema.NullOr(Schema.String),
});
export type PrescriptionRow = typeof PrescriptionRow.Type;

export const prescriptionFromRow = (row: PrescriptionRow): Prescription => ({
  id: PrescriptionId.make(row.id),
  medicationName: row.medication_name,
  dosage: row.dosage,
  frequency: row.frequency,
  duration: row.duration,
  instructions: row.instructions,
});

export const prescriptionToRow = (prescription: Prescription): PrescriptionRow => ({
  id: prescription.id,
  medication_name: prescription.medicationName,
  dosage: prescription.dosage,
  frequency: prescription.frequency,
  duration: prescription.duration,
  instructions: prescription.instructions,
});

export const describePrescription = (prescription: Prescription): string =>
  [
    `Prescription: ${prescription.medicationName}`,
    `Dosage: ${prescription.dosage}`,
    `Frequency: ${prescription.frequency}`,
    prescription.duration === null ? undefined : `Duration: ${prescription.duration}`,
    prescription.instructions === null ? undefined : `Instructions: ${prescription.instructions}`,
  ]
    .filter((line) => line !== undefined)
    .join("\n");
