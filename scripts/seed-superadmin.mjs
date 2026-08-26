import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });
dotenv.config({ path: path.join(__dirname, '../backend/.env') });

async function seed() {
  const conn = await mysql.createConnection({
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT) || 3306,
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'ai_resume_builder',
  });

  const query = `
    INSERT INTO users (id, email, firstname, lastname, displayName, role, membership, created_at, updated_at, revision)
    VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1)
    ON DUPLICATE KEY UPDATE role = 'SUPER_ADMIN', email = VALUES(email);
  `;

  await conn.execute(query, [
    'OhZdiSIFL7ePA1TMkfu9bnR935D3',
    'bhaskar.beyond@gmail.com',
    'Bhaskar',
    'Beyond',
    'Bhaskar SuperAdmin',
    'SUPER_ADMIN',
    'Lifetime'
  ]);

  console.log('Seeded SUPER_ADMIN user into MySQL successfully');

  const [rows] = await conn.execute('SELECT id, email, role, membership FROM users WHERE email = ?', ['bhaskar.beyond@gmail.com']);
  console.log('Verified user in MySQL:', rows);
  await conn.end();
}

seed().catch(err => {
  console.error('Seed error:', err);
  process.exit(1);
});
