import mysql from 'mysql2/promise';
async function test() {
  try {
    const connection = await mysql.createConnection({
      host: '127.0.0.1',
      port: 3306,
      user: 'root',
      password: '',
      database: 'ai_resume_builder'
    });
    console.log('Connected');
    const [rows] = await connection.query('SHOW TABLES');
    console.log('Tables:', rows);
    await connection.end();
  } catch (err) {
    console.error('Error:', err);
  }
}
test();