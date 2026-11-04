CREATE TABLE IF NOT EXISTS appointments (
  id TEXT PRIMARY KEY NOT NULL,
  date_time TEXT NOT NULL,
  agenda_code TEXT,
  title TEXT NOT NULL,
  practitioner TEXT,
  comment TEXT,
  duration INTEGER
);

CREATE INDEX IF NOT EXISTS appointments_date_time ON appointments (date_time);

CREATE TABLE IF NOT EXISTS prescriptions (
  id TEXT PRIMARY KEY NOT NULL,
  medication_name TEXT NOT NULL,
  dosage TEXT NOT NULL,
  frequency TEXT NOT NULL,
  duration TEXT,
  instructions TEXT
);
