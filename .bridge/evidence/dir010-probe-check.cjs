// Standalone probe: mirrors resolveTargetJobFromMariaDb() in the DIR-010 spec.
const { execFileSync } = require('node:child_process');

const raw = execFileSync('node', ['-e', `
    const mysql = require('mysql2/promise');
    (async () => {
        const conn = await mysql.createConnection({
            host: '127.0.0.1', user: 'root', password: '',
            database: 'ai_resume_builder'
        });
        const [rows] = await conn.query(
            'SELECT a.job_id AS jobId, j.title, COUNT(*) AS cnt FROM applications a JOIN jobs j ON a.job_id = j.id GROUP BY a.job_id, j.title ORDER BY cnt DESC, a.job_id ASC LIMIT 1'
        );
        await conn.end();
        if (rows.length) console.log(JSON.stringify({ jobId: rows[0].jobId, title: rows[0].title, rows: Number(rows[0].cnt) }));
        else console.log('null');
    })();
`], { encoding: 'utf8', timeout: 10000, stdio: ['ignore', 'pipe', 'pipe'] }).trim();

console.log('PROBE OUTPUT:', raw);