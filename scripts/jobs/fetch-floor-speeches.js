/**
 * Fetch Floor Speeches Job
 * Fetches AI-relevant Senate floor speeches from the Congressional Record
 * via the GovInfo Search API (POST endpoint, DEMO_KEY with ~40 req/hour).
 */

const postgres = require('postgres');
const axios = require('axios');
const crypto = require('crypto');
const { isAIRelevant } = require('../shared/constants');

const GOVINFO_BASE = 'https://api.govinfo.gov';
const GOVINFO_API_KEY = process.env.GOVINFO_API_KEY || 'DEMO_KEY';

// Focused search queries for Congressional Record (CREC)
const SEARCH_QUERIES = [
  '"artificial intelligence"',
  '"machine learning"',
  '"deepfake" OR "deep fake"',
  '"data privacy"',
  '"algorithmic" AND ("bias" OR "accountability")',
  '"generative ai" OR "large language model"',
  '"ai regulation" OR "ai safety" OR "ai governance"',
  '"chips and science" OR "semiconductor"',
  '"autonomous weapon" OR "autonomous vehicle"',
  '"facial recognition" OR "surveillance"',
];

function contentHash(bioguideId, granuleId) {
  return crypto
    .createHash('md5')
    .update(`${bioguideId}-${granuleId}`)
    .digest('hex');
}

// Parse speaker from Congressional Record text
function extractSpeakers(text) {
  const pattern = /(?:Mr\.|Mrs\.|Ms\.|Miss)\s+([A-Z][A-Z'-]+)/g;
  const speakers = new Set();
  let match;
  while ((match = pattern.exec(text)) !== null) {
    speakers.add(match[1].toLowerCase().replace(/['-]/g, ''));
  }
  return [...speakers];
}

async function searchCREC(query, startDate, endDate) {
  // 6 second delay between requests for DEMO_KEY (~10 req/min max)
  await new Promise((r) => setTimeout(r, 6000));

  const response = await axios.post(
    `${GOVINFO_BASE}/search?api_key=${GOVINFO_API_KEY}`,
    {
      query: query,
      collection: 'CREC',
      publishDateStartDate: startDate,
      publishDateEndDate: endDate,
      pageSize: 100,
      offsetMark: '*',
    },
    { timeout: 30000, headers: { 'Content-Type': 'application/json' } }
  );
  return response.data;
}

async function fetchGranuleText(txtLink) {
  await new Promise((r) => setTimeout(r, 6000));
  const response = await axios.get(
    `${txtLink}?api_key=${GOVINFO_API_KEY}`,
    { timeout: 30000 }
  );
  return typeof response.data === 'string'
    ? response.data.substring(0, 8000)
    : '';
}

async function fetchFloorSpeeches() {
  console.log('Fetching Senate floor speeches from Congressional Record...');

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('Missing DATABASE_URL');
    process.exit(1);
  }

  const sql = postgres(databaseUrl, { ssl: 'require', prepare: false });

  try {
    const senators = await sql`
      SELECT id, bioguide_id, full_name, last_name
      FROM politicians
      WHERE is_active = true AND office_type = 'senate'
    `;

    const senatorsByLastName = {};
    for (const s of senators) {
      const key = s.last_name.toLowerCase().replace(/['-]/g, '');
      senatorsByLastName[key] = s;
    }

    console.log(`  ${senators.length} active senators in DB\n`);

    let totalInserted = 0;
    let totalSearched = 0;
    const seenGranules = new Set();

    // Search across 118th + 119th Congress
    const dateRanges = [
      { label: '119th Congress', start: '2025-01-03', end: '2026-12-31' },
      { label: '118th Congress', start: '2023-01-03', end: '2025-01-02' },
    ];

    for (const dr of dateRanges) {
      console.log(`  Searching ${dr.label} (${dr.start} to ${dr.end})...`);

      for (const query of SEARCH_QUERIES) {
        try {
          const searchResult = await searchCREC(query, dr.start, dr.end);
          const results = searchResult?.results || [];
          totalSearched += results.length;

          if (results.length > 0) {
            console.log(`    "${query.substring(0, 50)}" → ${results.length} results`);
          }

          for (const result of results) {
            const granuleId = result.granuleId || result.packageId || '';
            const title = result.title || '';

            if (seenGranules.has(granuleId)) continue;
            seenGranules.add(granuleId);

            // Filter for Senate section
            const isSenate =
              title.toLowerCase().includes('senate') ||
              (result.granuleClass || '').toLowerCase().includes('senate') ||
              (result.collectionCode === 'CREC'); // CREC is always congressional
            if (!isSenate && !title.toLowerCase().includes('congress')) continue;

            // Try to get full text
            let textContent = title;
            const txtLink = result.download?.txtLink || result.download?.htmLink;
            if (txtLink) {
              try {
                const txt = await fetchGranuleText(txtLink);
                if (txt) textContent = txt;
              } catch {
                // Use title only
              }
            }

            if (!isAIRelevant(textContent)) continue;

            const speakers = extractSpeakers(textContent);
            const speechDate = result.dateIssued
              ? new Date(result.dateIssued)
              : new Date(dr.start);

            const sourceUrl = result.resultLink ||
              `https://www.govinfo.gov/app/details/${granuleId}`;

            let matchedAny = false;
            for (const speakerName of speakers) {
              const senator = senatorsByLastName[speakerName];
              if (!senator) continue;

              const hash = contentHash(senator.bioguide_id, granuleId);

              try {
                await sql`
                  INSERT INTO evidence_items (
                    politician_id, evidence_type, bill_title,
                    source_text, source_url, source_date, content_hash
                  ) VALUES (
                    ${senator.id}, 'floor_speech', ${title.substring(0, 500)},
                    ${textContent.substring(0, 5000)}, ${sourceUrl},
                    ${speechDate}, ${hash}
                  )
                  ON CONFLICT (content_hash) DO NOTHING
                `;
                totalInserted++;
                matchedAny = true;
              } catch {
                // Duplicate or constraint error
              }
            }

            if (matchedAny) {
              console.log(`      + ${title.substring(0, 60)}... (${speakers.length} speakers)`);
            }
          }
        } catch (error) {
          if (error?.response?.status === 429) {
            console.log(`    Rate limited, waiting 60s...`);
            await new Promise((r) => setTimeout(r, 60000));
          } else {
            console.log(`    x Search failed: ${error.message}`);
          }
        }
      }
    }

    console.log(`\nFloor speeches complete:`);
    console.log(`  Results searched: ${totalSearched}`);
    console.log(`  Evidence items inserted: ${totalInserted}`);
  } catch (error) {
    console.error('Job failed:', error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

fetchFloorSpeeches();
