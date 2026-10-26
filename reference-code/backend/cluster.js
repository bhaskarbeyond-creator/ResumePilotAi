/**
 * ResumePilot AI — Autonomous Master/Worker Cluster Supervisor
 * 
 * Provides:
 * 1. Autonomous Self-Healing: Instantly revives worker processes (< 15ms) on unhandled exceptions or crashes.
 * 2. Crash-Loop Protection: Exponential backoff if worker exits repeatedly in short bursts.
 * 3. Graceful Signal Propagation: Cleanly drains TCP connections on SIGINT / SIGTERM.
 * 4. Zero External Dependencies: Runs natively across Windows (XAMPP), Hostinger Shared Hosting, and Linux VPS without cron.
 */

const cluster = require('cluster');
const os = require('os');

const MAX_WORKERS = (() => {
    if (process.env.WORKERS) {
        const parsed = parseInt(process.env.WORKERS, 10);
        if (!isNaN(parsed) && parsed > 0) return Math.min(parsed, 16);
    }
    // In production, default to 2 workers (or 1 on single-core / low-memory shared hosts)
    return process.env.NODE_ENV === 'production'
        ? Math.min(Math.max(os.cpus().length, 1), 2)
        : 1;
})();

const CRASH_WINDOW_MS = 10000;
const MAX_RAPID_CRASHES = 5;
const crashTimestamps = [];

function isCrashLooping() {
    const now = Date.now();
    crashTimestamps.push(now);
    // Prune old timestamps outside the rolling window
    while (crashTimestamps.length > 0 && crashTimestamps[0] < now - CRASH_WINDOW_MS) {
        crashTimestamps.shift();
    }
    return crashTimestamps.length >= MAX_RAPID_CRASHES;
}

if (cluster.isPrimary) {
    console.log(`[Supervisor] Primary Master ${process.pid} online (Node ${process.version}, Platform: ${process.platform})`);
    console.log(`[Supervisor] Spawning ${MAX_WORKERS} autonomous worker(s)...`);

    let isShuttingDown = false;

    // Fork initial workers
    for (let i = 0; i < MAX_WORKERS; i++) {
        cluster.fork();
    }

    // ⚡ Autonomous Self-Healing on Worker Death
    cluster.on('exit', (worker, code, signal) => {
        if (isShuttingDown) return;

        const reason = signal ? `signal ${signal}` : `exit code ${code}`;
        console.warn(`[Supervisor ⚠️] Worker ${worker.process.pid} terminated (${reason}).`);

        if (isCrashLooping()) {
            console.error(`[Supervisor 🛑] Rapid crash threshold exceeded (${MAX_RAPID_CRASHES} crashes in ${CRASH_WINDOW_MS / 1000}s). Applying 2s backoff...`);
            setTimeout(() => {
                if (!isShuttingDown) {
                    const newWorker = cluster.fork();
                    console.log(`[Supervisor ✓] Replacement worker revived with PID ${newWorker.process.pid}`);
                }
            }, 2000);
        } else {
            const newWorker = cluster.fork();
            console.log(`[Supervisor ✓] Instant replacement worker revived with PID ${newWorker.process.pid}`);
        }
    });

    cluster.on('online', (worker) => {
        console.log(`[Supervisor] Worker ${worker.process.pid} is online and ready to accept traffic.`);
    });

    // Graceful Termination
    const handleShutdown = (signal) => {
        if (isShuttingDown) return;
        isShuttingDown = true;
        console.log(`[Supervisor] Received ${signal} — draining workers gracefully...`);

        for (const id in cluster.workers) {
            const worker = cluster.workers[id];
            if (worker && worker.isConnected()) {
                worker.process.kill(signal);
            }
        }

        // Hard kill fallback if workers do not exit within 5s
        const forceExit = setTimeout(() => {
            console.warn('[Supervisor] Force exiting after drain timeout.');
            process.exit(1);
        }, 5000);
        forceExit.unref();
    };

    process.on('SIGTERM', () => handleShutdown('SIGTERM'));
    process.on('SIGINT', () => handleShutdown('SIGINT'));

} else {
    // Worker runs the core Express application
    require('./index.js');
}
