/**
 * Database Seed Script
 * Seeds OECD AI Principles
 */

const fs = require('fs');
const path = require('path');
const postgres = require('postgres');

async function seed() {
  console.log('🌱 Starting database seed...');

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL environment variable is not set');
    process.exit(1);
  }

  const sql = postgres(databaseUrl);

  try {
    // Read seed file
    const seedPath = path.join(__dirname, '..', 'lib', 'db', 'seed.sql');
    const seedSql = fs.readFileSync(seedPath, 'utf8');

    // Execute seed
    console.log('📝 Seeding OECD AI Principles...');
    await sql.unsafe(seedSql);

    console.log('✅ Seed completed successfully!');

    // Verify
    const principles = await sql`SELECT id, short_name FROM oecd_principles ORDER BY id`;
    console.log('\n📊 Seeded principles:');
    principles.forEach(p => {
      console.log(`   ${p.id}. ${p.short_name}`);
    });
  } catch (error) {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

seed();
