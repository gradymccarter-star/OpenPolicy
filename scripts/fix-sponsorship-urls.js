/**
 * One-off migration: Fix sponsorship source_url values.
 * Converts Congress.gov API URLs to human-readable URLs.
 *
 * Before: https://api.congress.gov/v3/bill/119/s/1234
 * After:  https://www.congress.gov/bill/119th-congress/senate-bill/1234
 *
 * Usage: DATABASE_URL=... node scripts/fix-sponsorship-urls.js
 */

const postgres = require('postgres');

const TYPE_SLUGS = {
  s: 'senate-bill',
  hr: 'house-bill',
  sjres: 'senate-joint-resolution',
  hjres: 'house-joint-resolution',
  sres: 'senate-resolution',
  hres: 'house-resolution',
  sconres: 'senate-concurrent-resolution',
  hconres: 'house-concurrent-resolution',
};

async function fixUrls() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('Missing DATABASE_URL');
    process.exit(1);
  }

  const sql = postgres(databaseUrl, { ssl: 'require', prepare: false });

  try {
    // Find all evidence items with API URLs
    const rows = await sql`
      SELECT id, source_url
      FROM evidence_items
      WHERE source_url LIKE 'https://api.congress.gov/v3/bill/%'
    `;

    console.log(`Found ${rows.length} evidence items with API URLs to fix`);

    let updated = 0;
    let skipped = 0;

    for (const row of rows) {
      const match = row.source_url.match(
        /api\.congress\.gov\/v3\/bill\/(\d+)\/([a-z]+)\/(\d+)/
      );
      if (!match) {
        skipped++;
        continue;
      }

      const [, congress, type, number] = match;
      const slug = TYPE_SLUGS[type];
      if (!slug) {
        console.log(`  Unknown bill type "${type}" for id=${row.id}, skipping`);
        skipped++;
        continue;
      }

      const newUrl = `https://www.congress.gov/bill/${congress}th-congress/${slug}/${number}`;

      await sql`
        UPDATE evidence_items
        SET source_url = ${newUrl}
        WHERE id = ${row.id}
      `;
      updated++;
    }

    console.log(`Done: ${updated} updated, ${skipped} skipped`);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

fixUrls();
