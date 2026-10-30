'use strict';

/**
 * Candidate WebRTC Voice Interview API
 * Mounted at `/api/candidate/voice-interview`
 *
 * Endpoints:
 * - POST   /rooms                     Create room and mint SFU participant token
 * - GET    /rooms/:roomId             Retrieve room metadata and state
 * - POST   /rooms/:roomId/transcription Ingest speech-to-text transcript turn
 * - GET    /rooms/:roomId/transcripts Retrieve full room transcript history
 * - POST   /rooms/:roomId/close       Gracefully close voice room
 */

const express = require('express');
const {
  createVoiceRoom,
  getVoiceRoom,
  recordVoiceTranscript,
  listVoiceTranscripts,
  closeVoiceRoom,
  processVoiceAudioChunk,
} = require('../services/voiceInterviewService');
const { getPool } = require('../database/mysql');

const router = express.Router();

function getUserId(req) {
  return req.user?.uid || req.user?.id || null;
}

function failure(res, error, defaultMsg) {
  const status = Number(error?.status) >= 400 && Number(error?.status) < 600 ? Number(error.status) : 500;
  if (status >= 500) {
    console.error('[VoiceInterview API Error]', error?.code || '', error?.message || error);
  }
  return res.status(status).json({
    success: false,
    error: {
      code: error?.code || 'VOICE_INTERVIEW_ERROR',
      message: status >= 500 ? defaultMsg || 'Voice interview service is temporarily unavailable.' : error.message,
    },
  });
}

// Authentication guard
router.use((req, res, next) => {
  const uid = getUserId(req);
  if (!uid) {
    return res.status(401).json({
      success: false,
      error: { code: 'AUTH_REQUIRED', message: 'Authentication required to access voice interview services.' },
    });
  }
  return next();
});

// POST /rooms - Create room
router.post('/rooms', express.json({ limit: '32kb' }), async (req, res) => {
  try {
    const userId = getUserId(req);
    const pool = getPool();
    const { sessionId, roomName, sfuProvider, maxDurationSeconds } = req.body || {};

    const room = await createVoiceRoom({
      pool,
      userId,
      sessionId,
      roomName,
      sfuProvider,
      maxDurationSeconds,
    });

    return res.status(201).json({
      success: true,
      data: room,
    });
  } catch (error) {
    return failure(res, error, 'Failed to create voice interview room.');
  }
});

// GET /rooms/:roomId - Get room status
router.get('/rooms/:roomId', async (req, res) => {
  try {
    const userId = getUserId(req);
    const pool = getPool();
    const { roomId } = req.params;

    const room = await getVoiceRoom({ pool, userId, roomId });
    return res.json({
      success: true,
      data: room,
    });
  } catch (error) {
    return failure(res, error, 'Failed to retrieve voice interview room.');
  }
});

// POST /rooms/:roomId/transcription - Record transcript turn
router.post('/rooms/:roomId/transcription', express.json({ limit: '64kb' }), async (req, res) => {
  try {
    const userId = getUserId(req);
    const pool = getPool();
    const { roomId } = req.params;
    const { turnIndex, speaker, transcriptText, confidence, durationMs, audioSegmentUrl } = req.body || {};

    const transcript = await recordVoiceTranscript({
      pool,
      userId,
      roomId,
      turnIndex: Number(turnIndex),
      speaker,
      transcriptText,
      confidence,
      durationMs,
      audioSegmentUrl,
    });

    return res.status(201).json({
      success: true,
      data: transcript,
    });
  } catch (error) {
    return failure(res, error, 'Failed to record speech transcript turn.');
  }
});

// GET /rooms/:roomId/transcripts - List transcript history
router.get('/rooms/:roomId/transcripts', async (req, res) => {
  try {
    const userId = getUserId(req);
    const pool = getPool();
    const { roomId } = req.params;

    const transcripts = await listVoiceTranscripts({ pool, userId, roomId });
    return res.json({
      success: true,
      data: transcripts,
    });
  } catch (error) {
    return failure(res, error, 'Failed to retrieve transcript history.');
  }
});

// POST /rooms/:roomId/audio-chunk - Stream WebRTC raw audio buffer / base64 chunk
router.post(
  '/rooms/:roomId/audio-chunk',
  express.raw({ type: ['audio/*', 'application/octet-stream'], limit: '5mb' }),
  express.json({ limit: '5mb' }),
  async (req, res) => {
    try {
      const userId = getUserId(req);
      const pool = getPool();
      const { roomId } = req.params;

      let audioBuffer;
      let mimeType = req.headers['content-type'] || 'audio/pcm';
      let sampleRate = Number(req.headers['x-sample-rate']) || 16000;
      let turnIndex = Number(req.headers['x-turn-index']) || 0;
      let speaker = req.headers['x-speaker'] || 'candidate';

      if (Buffer.isBuffer(req.body) && req.body.length > 0) {
        audioBuffer = req.body;
      } else if (req.body && req.body.audioBase64) {
        audioBuffer = Buffer.from(req.body.audioBase64, 'base64');
        mimeType = req.body.mimeType || mimeType;
        sampleRate = Number(req.body.sampleRate) || sampleRate;
        turnIndex = Number(req.body.turnIndex) || turnIndex;
        speaker = req.body.speaker || speaker;
      } else {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_AUDIO_PAYLOAD', message: 'Raw binary audio buffer or base64 JSON payload is required.' },
        });
      }

      const result = await processVoiceAudioChunk({
        pool,
        userId,
        roomId,
        audioBuffer,
        mimeType,
        sampleRate,
        turnIndex,
        speaker,
      });

      return res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      return failure(res, error, 'Failed to process audio streaming chunk.');
    }
  }
);

// POST /rooms/:roomId/close - Close voice room
router.post('/rooms/:roomId/close', async (req, res) => {
  try {
    const userId = getUserId(req);
    const pool = getPool();
    const { roomId } = req.params;

    const result = await closeVoiceRoom({ pool, userId, roomId });
    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    return failure(res, error, 'Failed to close voice interview room.');
  }
});

module.exports = { voiceInterviewRouter: router };
