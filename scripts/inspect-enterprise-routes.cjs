const fs = require('fs');
const content = fs.readFileSync('backend/routes/enterprise.js', 'utf8');
const regex = /router\.(get|post|put|delete|patch)\(\s*['"]([^'"]+)['"]/g;
let match;
const endpoints = [];
while ((match = regex.exec(content)) !== null) {
  endpoints.push(`${match[1].toUpperCase()} ${match[2]}`);
}
console.log('Enterprise Endpoints (' + endpoints.length + '):');
endpoints.forEach(e => console.log(' ', e));
