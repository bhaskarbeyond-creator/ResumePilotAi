'use strict';

const fs = require('fs');
const path = require('path');

const migrationNames = Object.freeze([
  '001_enterprise_control_plane.sql',
  '002_enterprise_tenant_data_plane_rls.sql',
]);

function splitSqlStatements(sql) {
  const statements = [];
  let current = '';
  let quote = null;
  let lineComment = false;
  let blockComment = false;
  let dollarTag = null;

  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index];
    const next = sql[index + 1];
    current += char;

    if (lineComment) {
      if (char === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === '*' && next === '/') { current += next; index += 1; blockComment = false; }
      continue;
    }
    if (quote) {
      if (char === quote && next === quote) { current += next; index += 1; continue; }
      if (char === quote) quote = null;
      continue;
    }
    if (dollarTag) {
      if (sql.startsWith(dollarTag, index)) {
        for (let offset = 1; offset < dollarTag.length; offset += 1) current += sql[index + offset];
        index += dollarTag.length - 1;
        dollarTag = null;
      }
      continue;
    }
    if (char === '-' && next === '-') { current += next; index += 1; lineComment = true; continue; }
    if (char === '/' && next === '*') { current += next; index += 1; blockComment = true; continue; }
    if (char === "'" || char === '"') { quote = char; continue; }
    if (char === '$') {
      const match = /^\$[A-Za-z_0-9]*\$/.exec(sql.slice(index));
      if (match) {
        dollarTag = match[0];
        for (let offset = 1; offset < dollarTag.length; offset += 1) current += sql[index + offset];
        index += dollarTag.length - 1;
        continue;
      }
    }
    if (char === ';') {
      const statement = current.trim();
      if (statement) statements.push(statement);
      current = '';
    }
  }
  if (current.trim()) statements.push(current.trim());
  return statements;
}

function readMigration(name) {
  if (!migrationNames.includes(name)) throw new Error('Unknown enterprise migration');
  return fs.readFileSync(path.join(__dirname, '..', 'sql', name), 'utf8');
}

async function applyMigrations(client, names = migrationNames) {
  for (const name of names) {
    for (const statement of splitSqlStatements(readMigration(name))) await client.query(statement);
  }
}

module.exports = {
  applyMigrations,
  migrationNames,
  readMigration,
  splitSqlStatements,
};
