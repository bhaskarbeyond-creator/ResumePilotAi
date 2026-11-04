const fs = require('fs');
const path = 'D:/xampp/htdocs/IME365/frontend/tests/candidate/portfolio.spec.ts';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(
  "['data', 'id', 'isPublished', 'metadata', 'publishedAt', 'slug', 'theme', 'title']",
  "['data', 'id', 'isPasswordProtected', 'isPublished', 'metadata', 'publishedAt', 'slug', 'theme', 'title']"
);

fs.writeFileSync(path, content, 'utf8');
console.log('Line 269 updated successfully');
