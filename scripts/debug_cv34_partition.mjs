import { createPool } from 'mysql2/promise';

const pool = createPool({
  host: '127.0.0.1',
  port: 3306,
  user: 'root',
  password: '',
  database: 'ai_resume_builder',
});

const [rows] = await pool.query("SELECT * FROM resumes WHERE id = 'res_1792228937289' LIMIT 1");
const res = rows[0];
console.log('Resume from DB:');
console.log('id:', res.id);
console.log('firstname:', res.firstname);
console.log('lastname:', res.lastname);
console.log('title:', res.title);
console.log('occupation:', res.occupation);
console.log('summary:', res.summary);
console.log('employments:', res.employments);
console.log('educations:', res.educations);
console.log('skills:', res.skills);
console.log('certifications:', res.certifications);
console.log('languages:', res.languages);
console.log('template:', res.template);

await pool.end();
