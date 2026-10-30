-- Migration 038: WebRTC Real-Time Audio Voice Simulator & Transcription Infrastructure
-- Provides server-authoritative room lifecycle, SFU token management, and transcription turn persistence.

CREATE TABLE IF NOT EXISTS voice_interview_rooms (
    id VARCHAR(128) NOT NULL PRIMARY KEY,
    session_id VARCHAR(128) NOT NULL,
    user_id VARCHAR(128) NOT NULL,
    room_name VARCHAR(128) NOT NULL UNIQUE,
    sfu_provider VARCHAR(32) NOT NULL DEFAULT 'livekit',
    status VARCHAR(24) NOT NULL DEFAULT 'active',
    participant_token TEXT NULL,
    max_duration_seconds INT UNSIGNED NOT NULL DEFAULT 3600,
    audio_codec VARCHAR(16) NOT NULL DEFAULT 'opus',
    bitrate_kbps INT UNSIGNED NOT NULL DEFAULT 64,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    closed_at DATETIME(3) NULL,
    CONSTRAINT chk_voice_room_status CHECK (status IN ('active', 'completed', 'terminated')),
    CONSTRAINT fk_voice_room_session FOREIGN KEY (session_id) REFERENCES live_interview_sessions(id) ON DELETE CASCADE,
    CONSTRAINT fk_voice_room_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_voice_room_user_active (user_id, status),
    INDEX idx_voice_room_session (session_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS voice_interview_transcripts (
    id VARCHAR(128) NOT NULL PRIMARY KEY,
    room_id VARCHAR(128) NOT NULL,
    turn_index INT UNSIGNED NOT NULL,
    speaker VARCHAR(32) NOT NULL,
    transcript_text TEXT NOT NULL,
    confidence DECIMAL(5,4) NULL DEFAULT 1.0000,
    duration_ms INT UNSIGNED NULL DEFAULT 0,
    audio_segment_url VARCHAR(512) NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    CONSTRAINT chk_voice_transcript_speaker CHECK (speaker IN ('candidate', 'ai_interviewer', 'system')),
    CONSTRAINT fk_voice_transcript_room FOREIGN KEY (room_id) REFERENCES voice_interview_rooms(id) ON DELETE CASCADE,
    INDEX idx_voice_transcript_room_turn (room_id, turn_index)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
