/**
 * Download Photos Job
 * Downloads official photos for all politicians
 */

const postgres = require('postgres');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

async function downloadPhotos() {
  console.log('📸 Downloading politician photos...');

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL not set');
    process.exit(1);
  }

  const sql = postgres(databaseUrl, { ssl: 'require', prepare: false });

  // Create photos directory
  const photosDir = path.join(__dirname, '..', '..', 'public', 'photos');
  if (!fs.existsSync(photosDir)) {
    fs.mkdirSync(photosDir, { recursive: true });
  }

  try {
    const politicians = await sql`
      SELECT id, bioguide_id, full_name, office_type
      FROM politicians
      WHERE is_active = true
    `;

    console.log(`Found ${politicians.length} politicians`);

    let successCount = 0;
    let errorCount = 0;

    for (const politician of politicians) {
      try {
        console.log(`  Downloading photo for ${politician.full_name}...`);

        // Try multiple photo sources
        const photoUrls = [
          `https://bioguide.congress.gov/bioguide/photo/${politician.bioguide_id[0]}/${politician.bioguide_id}.jpg`,
          `https://clerk.house.gov/content/assets/img/member-photos/${politician.bioguide_id}.jpg`,
          `https://www.congress.gov/img/member/${politician.bioguide_id.toLowerCase()}.jpg`,
        ];

        let photoData = null;

        for (const url of photoUrls) {
          try {
            const response = await axios.get(url, {
              responseType: 'arraybuffer',
              timeout: 10000,
            });

            if (response.status === 200) {
              photoData = Buffer.from(response.data);
              console.log(`    ✅ Downloaded from ${url}`);
              break;
            }
          } catch (err) {
            // Try next URL
          }
        }

        if (!photoData) {
          console.log(`    ⚠️  No photo found`);
          errorCount++;
          continue;
        }

        // Optimize and save photo
        const filename = `${politician.bioguide_id}.jpg`;
        const filepath = path.join(photosDir, filename);

        await sharp(photoData)
          .resize(256, 256, {
            fit: 'cover',
            position: 'top',
          })
          .jpeg({ quality: 85 })
          .toFile(filepath);

        // Update database with photo URL
        const photoUrl = `/photos/${filename}`;
        await sql`
          UPDATE politicians
          SET photo_url = ${photoUrl}
          WHERE id = ${politician.id}
        `;

        successCount++;
        console.log(`    💾 Saved to ${filename}`);

        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (error) {
        console.error(`    ❌ Error:`, error.message);
        errorCount++;
      }
    }

    console.log(`\n✅ Download complete: ${successCount} success, ${errorCount} errors`);
  } catch (error) {
    console.error('❌ Job failed:', error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

downloadPhotos();
