/**
 * Database Migration Script
 * Runs the schema.sql file to create all tables
 */

const fs = require('fs');
const path = require('path');
const postgres = require('postgres');

async function migrate() {
  console.log('🔧 Starting database migration...');

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL environment variable is not set');
    process.exit(1);
  }

  const sql = postgres(databaseUrl, { ssl: 'require', prepare: false });

  try {
    // Read schema file
    const schemaPath = path.join(__dirname, '..', 'lib', 'db', 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    // Execute schema
    console.log('📝 Executing schema.sql...');
    await sql.unsafe(schema);

    console.log('✅ Migration completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

migrate();
