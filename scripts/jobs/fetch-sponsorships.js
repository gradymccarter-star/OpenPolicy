/**
 * Fetch Sponsorships Job
 * Fetches bill sponsorships and co-sponsorships for all active senators
 * from Congress.gov API. Filters for AI-relevant legislation.
 */

const postgres = require('postgres');
const axios = require('axios');
const crypto = require('crypto');
const { isAIRelevant } = require('../shared/constants');

const BASE_URL = 'https://api.congress.gov/v3';

let lastRequestTime = 0;

async function rateLimitedFetch(url, apiKey) {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < 1000) {
    await new Promise((resolve) => setTimeout(resolve, 1000 - elapsed));
  }
  lastRequestTime = Date.now();

  const response = await axios.get(url, {
    params: { api_key: apiKey, format: 'json' },
    timeout: 30000,
  });
  return response.data;
}

async function fetchBillSummary(congress, billType, billNumber, apiKey) {
  try {
    const typeMap = { S: 's', HR: 'hr', HJRES: 'hjres', SJRES: 'sjres', HRES: 'hres', SRES: 'sres', HCONRES: 'hconres', SCONRES: 'sconres' };
    const mappedType = typeMap[billType.toUpperCase()] || billType.toLowerCase();
    const url = `${BASE_URL}/bill/${congress}/${mappedType}/${billNumber}/summaries`;
    const data = await rateLimitedFetch(url, apiKey);
    const summaries = data?.summaries || [];
    return summaries.map((s) => s.text || '').join(' ').substring(0, 5000);
  } catch {
    return '';
  }
}

const BILL_TYPE_SLUGS = {
  S: 'senate-bill',
  HR: 'house-bill',
  SJRES: 'senate-joint-resolution',
  HJRES: 'house-joint-resolution',
  SRES: 'senate-resolution',
  HRES: 'house-resolution',
  SCONRES: 'senate-concurrent-resolution',
  HCONRES: 'house-concurrent-resolution',
};

function congressGovUrl(congress, type, number) {
  const slug = BILL_TYPE_SLUGS[(type || '').toUpperCase()];
  if (!slug || !congress || !number) return null;
  return `https://www.congress.gov/bill/${congress}th-congress/${slug}/${number}`;
}

function contentHash(bioguideId, billId, type) {
  return crypto
    .createHash('md5')
    .update(`${bioguideId}-${billId}-${type}`)
    .digest('hex');
}

async function fetchSponsorships() {
  console.log('Fetching bill sponsorships from Congress.gov...');

  const databaseUrl = process.env.DATABASE_URL;
  const apiKey = process.env.CONGRESS_GOV_API_KEY;

  if (!databaseUrl || !apiKey) {
    console.error('Missing DATABASE_URL or CONGRESS_GOV_API_KEY');
    process.exit(1);
  }

  const sql = postgres(databaseUrl, { ssl: 'require', prepare: false });

  try {
    const senators = await sql`
      SELECT id, bioguide_id, full_name
      FROM politicians
      WHERE is_active = true AND office_type = 'senate'
      ORDER BY full_name
    `;

    console.log(`  Processing ${senators.length} senators...\n`);

    let totalInserted = 0;
    let senatorErrors = 0;

    for (const senator of senators) {
      try {
        console.log(`  ${senator.full_name}...`);
        let senatorInserted = 0;

        // Fetch sponsored legislation
        for (const [fetchType, evidenceType, sponsorshipType] of [
          ['sponsored-legislation', 'bill_sponsorship', 'sponsor'],
          ['cosponsored-legislation', 'bill_cosponsorship', 'cosponsor'],
        ]) {
          let data;
          try {
            const url = `${BASE_URL}/member/${senator.bioguide_id}/${fetchType}?limit=250`;
            data = await rateLimitedFetch(url, apiKey);
          } catch (error) {
            const status = error?.response?.status;
            if (status === 404) continue;
            if (status === 429) {
              console.log(`    Rate limited, waiting 60s...`);
              await new Promise((r) => setTimeout(r, 60000));
              const url = `${BASE_URL}/member/${senator.bioguide_id}/${fetchType}?limit=250`;
              data = await rateLimitedFetch(url, apiKey);
            } else {
              throw error;
            }
          }

          const bills =
            data?.sponsoredLegislation || data?.cosponsoredLegislation || [];

          for (const bill of bills) {
            const title = bill.title || '';
            const policyArea = bill.policyArea?.name || '';
            const searchText = `${title} ${policyArea}`;
            let sourceText = null;

            let relevant = isAIRelevant(searchText);

            // Bill summary fallback disabled for speed — expanded keywords catch most bills.
            // To enable: set FETCH_SUMMARIES=1 env var for a deeper pass (~1hr).
            if (!relevant && process.env.FETCH_SUMMARIES === '1'
              && bill.congress >= 118 && bill.type && bill.number && policyArea) {
              const SUMMARY_POLICY_AREAS = [
                'science, technology, communications',
                'government operations and politics',
                'armed forces and national security',
                'commerce', 'law', 'civil rights and liberties, minority issues',
                'crime and law enforcement',
              ];
              if (SUMMARY_POLICY_AREAS.some(p => policyArea.toLowerCase().includes(p))) {
                const summary = await fetchBillSummary(bill.congress, bill.type, bill.number, apiKey);
                if (summary && isAIRelevant(summary)) {
                  relevant = true;
                  sourceText = summary;
                }
              }
            }

            if (!relevant) continue;

            const billId = `${bill.type || ''}${bill.number || ''}`;
            const hash = contentHash(
              senator.bioguide_id,
              billId,
              sponsorshipType
            );

            const sourceDate = bill.introducedDate
              ? new Date(bill.introducedDate)
              : new Date();

            try {
              await sql`
                INSERT INTO evidence_items (
                  politician_id, evidence_type, bill_id, bill_title,
                  sponsorship_type, source_text, source_url, source_date, content_hash
                ) VALUES (
                  ${senator.id}, ${evidenceType}, ${billId}, ${title},
                  ${sponsorshipType}, ${sourceText}, ${congressGovUrl(bill.congress, bill.type, bill.number)},
                  ${sourceDate}, ${hash}
                )
                ON CONFLICT (content_hash) DO NOTHING
              `;
              senatorInserted++;
            } catch (insertError) {
              // Duplicate or constraint error — skip
            }
          }
        }

        totalInserted += senatorInserted;
        if (senatorInserted > 0) {
          console.log(`    + ${senatorInserted} AI-relevant sponsorships`);
        } else {
          console.log(`    (no AI-relevant sponsorships)`);
        }
      } catch (error) {
        console.error(
          `    x Error for ${senator.full_name}: ${error.message}`
        );
        senatorErrors++;
      }
    }

    console.log(`\nSponsorships complete:`);
    console.log(`  Inserted: ${totalInserted}`);
    console.log(`  Errors: ${senatorErrors}`);
  } catch (error) {
    console.error('Job failed:', error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

fetchSponsorships();
