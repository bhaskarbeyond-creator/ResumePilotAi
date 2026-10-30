'use strict';

/**
 * Live MariaDB Integration Test Suite for Module 29:
 * WebRTC Real-Time Audio Voice Simulator & Transcription Infrastructure
 *
 * Verifies:
 * 1. Cryptographic WebRTC SFU token minting, verification, and tamper rejection
 * 2. Room lifecycle in MariaDB (create, retrieve, status transitions)
 * 3. Speech-to-text transcript turn recording, confidence bounds, and chronological retrieval
 * 4. User and session isolation guards (cross-user access rejected)
 * 5. Foreign key cascading deletion (session deletion drops rooms and transcripts)
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const express = require('express');
const request = require('supertest');
const {
  createVoiceRoom,
  getVoiceRoom,
  recordVoiceTranscript,
  listVoiceTranscripts,
  closeVoiceRoom,
  mintWebRtcToken,
  verifyWebRtcToken,
} = require('../services/voiceInterviewService');
const { voiceInterviewRouter } = require('../routes/voiceInterview');
const { getPool } = require('../database/mysql');

const TEST_SECRET = 'super_secret_test_livekit_key_at_least_32_chars';

test('Module 29: WebRTC SFU token minting, signature verification and tamper detection', () => {
  const identity = 'usr_test_candidate_123';
  const roomName = 'room_behavioral_456';

  // 1. Mint valid token
  const token = mintWebRtcToken({
    identity,
    name: 'Jane Doe',
    roomName,
    apiSecret: TEST_SECRET,
    ttlSeconds: 3600,
    metadata: { test: true },
  });

  assert.ok(typeof token === 'string' && token.split('.').length === 3, 'Token must be a 3-part JWT');

  // 2. Verify authentic token
  const verified = verifyWebRtcToken(token, TEST_SECRET);
  assert.ok(verified, 'Authentic token must verify successfully');
  assert.equal(verified.sub, identity, 'Token identity must match');
  assert.equal(verified.video.room, roomName, 'Token roomName must match');
  assert.equal(verified.video.canPublish, true, 'Participant must have audio publishing rights');

  // 3. Reject wrong secret
  const wrongSecretVerified = verifyWebRtcToken(token, 'wrong_secret_key_that_does_not_match_32_chars');
  assert.equal(wrongSecretVerified, null, 'Token with invalid signature must be rejected');

  // 4. Reject tampered payload
  const [h, p, s] = token.split('.');
  const tamperedPayload = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(p, 'base64').toString()), sub: 'hacker' })).toString('base64');
  const tamperedToken = `${h}.${tamperedPayload}.${s}`;
  assert.equal(verifyWebRtcToken(tamperedToken, TEST_SECRET), null, 'Tampered token payload must be rejected');
});

test('Module 29: Live MariaDB Voice Room & Transcription Integration Suite', async (t) => {
  const pool = getPool();
  const testUserId = `usr_voice_test_${crypto.randomUUID().substring(0, 16)}`;
  const otherUserId = `usr_voice_other_${crypto.randomUUID().substring(0, 16)}`;
  const testSessionId = `live_sess_${crypto.randomUUID().substring(0, 16)}`;

  // Setup: create test users and test live interview session
  await pool.query(
    `INSERT INTO users (id, email, role, created_at)
     VALUES (?, ?, 'CANDIDATE', NOW(3)),
            (?, ?, 'CANDIDATE', NOW(3))`,
    [testUserId, `${testUserId}@example.com`, otherUserId, `${otherUserId}@example.com`]
  );

  await pool.query(
    `INSERT INTO live_interview_sessions (id, user_id, status, revision, state_json, expires_at, created_at)
     VALUES (?, ?, 'active', 1, '{}', DATE_ADD(NOW(3), INTERVAL 2 HOUR), NOW(3))`,
    [testSessionId, testUserId]
  );

  t.after(async () => {
    // Teardown: deleting users cascades through sessions, rooms, transcripts
    try {
      await pool.query('DELETE FROM users WHERE id IN (?, ?)', [testUserId, otherUserId]);
    } catch (_) {}
  });

  let createdRoomId = null;

  await t.test('1. createVoiceRoom generates room, participant token and persists to MariaDB', async () => {
    const room = await createVoiceRoom({
      pool,
      userId: testUserId,
      sessionId: testSessionId,
      sfuProvider: 'livekit',
      maxDurationSeconds: 1800,
    });

    assert.ok(room.roomId && room.roomId.startsWith('vroom_'), 'Room ID must have prefix');
    assert.equal(room.userId, testUserId);
    assert.equal(room.sessionId, testSessionId);
    assert.equal(room.status, 'active');
    assert.ok(room.participantToken, 'Must mint a participant token');

    createdRoomId = room.roomId;

    // Verify row in database
    const [rows] = await pool.query('SELECT * FROM voice_interview_rooms WHERE id = ?', [createdRoomId]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].status, 'active');
    assert.equal(rows[0].max_duration_seconds, 1800);
  });

  await t.test('2. getVoiceRoom enforces ownership (user isolation guard)', async () => {
    // Other user cannot view room
    await assert.rejects(
      getVoiceRoom({ pool, userId: otherUserId, roomId: createdRoomId }),
      /Voice interview room not found or access denied/,
      'Cross-user access to voice room must be rejected with 404'
    );

    // Owner can view room
    const fetched = await getVoiceRoom({ pool, userId: testUserId, roomId: createdRoomId });
    assert.equal(fetched.roomId, createdRoomId);
    assert.equal(fetched.status, 'active');
  });

  await t.test('3. recordVoiceTranscript persists turns with confidence bounds', async () => {
    // Turn 1: AI interviewer asks question
    const turn1 = await recordVoiceTranscript({
      pool,
      userId: testUserId,
      roomId: createdRoomId,
      turnIndex: 0,
      speaker: 'ai_interviewer',
      transcriptText: 'Can you describe a time you optimized database query performance?',
      confidence: 0.9850,
      durationMs: 4200,
    });

    assert.ok(turn1.transcriptId.startsWith('vtx_'));
    assert.equal(turn1.speaker, 'ai_interviewer');
    assert.equal(turn1.turnIndex, 0);

    // Turn 2: Candidate answers
    const turn2 = await recordVoiceTranscript({
      pool,
      userId: testUserId,
      roomId: createdRoomId,
      turnIndex: 1,
      speaker: 'candidate',
      transcriptText: 'I added composite B-Tree indexes on tenant_id and created_at, reducing latency from 240ms to 8ms.',
      confidence: 0.9620,
      durationMs: 8500,
    });

    assert.equal(turn2.speaker, 'candidate');
    assert.equal(turn2.turnIndex, 1);

    // Verify chronological listing
    const transcripts = await listVoiceTranscripts({ pool, userId: testUserId, roomId: createdRoomId });
    assert.equal(transcripts.length, 2);
    assert.equal(transcripts[0].speaker, 'ai_interviewer');
    assert.equal(transcripts[1].speaker, 'candidate');
  });

  await t.test('4. closeVoiceRoom completes room and rejects further transcript writes', async () => {
    const closed = await closeVoiceRoom({ pool, userId: testUserId, roomId: createdRoomId });
    assert.equal(closed.status, 'completed');
    assert.ok(closed.closedAt);

    // Subsequent transcript writes fail with 409
    await assert.rejects(
      recordVoiceTranscript({
        pool,
        userId: testUserId,
        roomId: createdRoomId,
        turnIndex: 2,
        speaker: 'candidate',
        transcriptText: 'Late answer after room closed',
      }),
      /Cannot add transcript to a closed voice room/,
      'Adding transcripts to closed room must fail'
    );
  });

  await t.test('5. Cascading deletion: deleting session drops voice rooms and transcripts', async () => {
    // Verify transcripts exist before delete
    const [transcriptsBefore] = await pool.query('SELECT COUNT(*) AS count FROM voice_interview_transcripts WHERE room_id = ?', [createdRoomId]);
    assert.equal(Number(transcriptsBefore[0].count), 2);

    // Delete parent live_interview_sessions
    await pool.query('DELETE FROM live_interview_sessions WHERE id = ?', [testSessionId]);

    // Verify room is deleted via CASCADE
    const [roomsAfter] = await pool.query('SELECT COUNT(*) AS count FROM voice_interview_rooms WHERE id = ?', [createdRoomId]);
    assert.equal(Number(roomsAfter[0].count), 0, 'Room must be deleted via foreign key cascade');

    // Verify transcripts are deleted via CASCADE
    const [transcriptsAfter] = await pool.query('SELECT COUNT(*) AS count FROM voice_interview_transcripts WHERE room_id = ?', [createdRoomId]);
    assert.equal(Number(transcriptsAfter[0].count), 0, 'Transcripts must be deleted via foreign key cascade');
  });

  await t.test('6. HTTP API Suite: /api/candidate/voice-interview endpoints', async (subT) => {
    const app = express();
    app.use(express.json());
    // Test auth middleware
    app.use((req, res, next) => {
      const uid = req.headers['x-test-user-id'];
      if (uid) {
        req.user = { uid, id: uid, email: `${uid}@example.com` };
      }
      next();
    });
    app.use('/api/candidate/voice-interview', voiceInterviewRouter);

    // Recreate a session for HTTP tests
    const httpSessionId = `live_sess_http_${crypto.randomUUID().substring(0, 14)}`;
    await pool.query(
      `INSERT INTO live_interview_sessions (id, user_id, status, revision, state_json, expires_at, created_at)
       VALUES (?, ?, 'active', 1, '{}', DATE_ADD(NOW(3), INTERVAL 2 HOUR), NOW(3))`,
      [httpSessionId, testUserId]
    );

    // 6a: 401 when unauthenticated
    await subT.test('6a. Anonymous request is rejected with 401 AUTH_REQUIRED', async () => {
      const res = await request(app).post('/api/candidate/voice-interview/rooms').send({ sessionId: httpSessionId });
      assert.equal(res.status, 401);
      assert.equal(res.body.error.code, 'AUTH_REQUIRED');
    });

    // 6b: 201 Room creation
    let httpRoomId = null;
    await subT.test('6b. POST /rooms creates room and returns SFU participant token', async () => {
      const res = await request(app)
        .post('/api/candidate/voice-interview/rooms')
        .set('x-test-user-id', testUserId)
        .send({ sessionId: httpSessionId, sfuProvider: 'livekit', maxDurationSeconds: 1200 });

      assert.equal(res.status, 201);
      assert.equal(res.body.success, true);
      assert.ok(res.body.data.roomId.startsWith('vroom_'));
      assert.ok(res.body.data.participantToken);
      httpRoomId = res.body.data.roomId;
    });

    // 6c: GET /rooms/:roomId
    await subT.test('6c. GET /rooms/:roomId returns room metadata and active status', async () => {
      const res = await request(app)
        .get(`/api/candidate/voice-interview/rooms/${httpRoomId}`)
        .set('x-test-user-id', testUserId);

      assert.equal(res.status, 200);
      assert.equal(res.body.data.roomId, httpRoomId);
      assert.equal(res.body.data.status, 'active');
    });

    // 6d: POST /rooms/:roomId/transcription
    await subT.test('6d. POST /rooms/:roomId/transcription persists turn into MariaDB', async () => {
      const res = await request(app)
        .post(`/api/candidate/voice-interview/rooms/${httpRoomId}/transcription`)
        .set('x-test-user-id', testUserId)
        .send({
          turnIndex: 0,
          speaker: 'candidate',
          transcriptText: 'I engineered the streaming interview architecture with zero simulated latency.',
          confidence: 0.991,
          durationMs: 5400,
        });

      assert.equal(res.status, 201);
      assert.equal(res.body.success, true);
      assert.ok(res.body.data.transcriptId.startsWith('vtx_'));
    });

    // 6e: GET /rooms/:roomId/transcripts
    await subT.test('6e. GET /rooms/:roomId/transcripts returns chronological transcript history', async () => {
      const res = await request(app)
        .get(`/api/candidate/voice-interview/rooms/${httpRoomId}/transcripts`)
        .set('x-test-user-id', testUserId);

      assert.equal(res.status, 200);
      assert.equal(res.body.data.length, 1);
      assert.equal(res.body.data[0].speaker, 'candidate');
    });

    // 6f: Cross-user access rejected
    await subT.test('6f. Cross-user access to another candidate room is rejected with 404', async () => {
      const res = await request(app)
        .get(`/api/candidate/voice-interview/rooms/${httpRoomId}`)
        .set('x-test-user-id', otherUserId);

      assert.equal(res.status, 404);
    });

    // 6g: POST /rooms/:roomId/close
    await subT.test('6g. POST /rooms/:roomId/close completes the room and subsequent writes are 409', async () => {
      const closeRes = await request(app)
        .post(`/api/candidate/voice-interview/rooms/${httpRoomId}/close`)
        .set('x-test-user-id', testUserId);

      assert.equal(closeRes.status, 200);
      assert.equal(closeRes.body.data.status, 'completed');

      const lateTurnRes = await request(app)
        .post(`/api/candidate/voice-interview/rooms/${httpRoomId}/transcription`)
        .set('x-test-user-id', testUserId)
        .send({
          turnIndex: 1,
          speaker: 'candidate',
          transcriptText: 'Attempting write after closure',
        });

      assert.equal(lateTurnRes.status, 409);
    });
  });
});
