-- Reverse of 031_interview_slots.sql
-- Drops only the objects created by migration 031. Booked interview history is
-- removed with the table: run this only after a verified backup.
DROP TABLE IF EXISTS interview_slots;
