/**
 * Applies lib/db/migrations/*.sql (idempotent) after the base schema exists.
 * Run: node --env-file=.env.local scripts/run-migrations.js
 */

const fs = require('fs');
const path = require('path');
const postgres = require('postgres');

async function run() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL environment variable is not set');
    process.exit(1);
  }

  const sql = postgres(databaseUrl, { ssl: 'require', prepare: false });
  const dir = path.join(__dirname, '..', 'lib', 'db', 'migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

  try {
    for (const file of files) {
      console.log(`📝 Applying ${file}...`);
      await sql.unsafe(fs.readFileSync(path.join(dir, file), 'utf8'));
    }
    console.log(`✅ ${files.length} migrations applied`);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

run();
