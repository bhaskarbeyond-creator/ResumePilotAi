-- Rollback for Migration 038: WebRTC Real-Time Audio Voice Simulator
DROP TABLE IF EXISTS voice_interview_transcripts;
DROP TABLE IF EXISTS voice_interview_rooms;
