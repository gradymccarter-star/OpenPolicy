/**
 * Fetch Politicians Job
 * Fetches all 100 current US senators from Congress.gov API
 */

const postgres = require('postgres');
const axios = require('axios');

const CONGRESS_API_BASE = 'https://api.congress.gov/v3';

// State abbreviation lookup
const STATE_ABBREVS = {
  'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR',
  'California': 'CA', 'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE',
  'Florida': 'FL', 'Georgia': 'GA', 'Hawaii': 'HI', 'Idaho': 'ID',
  'Illinois': 'IL', 'Indiana': 'IN', 'Iowa': 'IA', 'Kansas': 'KS',
  'Kentucky': 'KY', 'Louisiana': 'LA', 'Maine': 'ME', 'Maryland': 'MD',
  'Massachusetts': 'MA', 'Michigan': 'MI', 'Minnesota': 'MN', 'Mississippi': 'MS',
  'Missouri': 'MO', 'Montana': 'MT', 'Nebraska': 'NE', 'Nevada': 'NV',
  'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY',
  'North Carolina': 'NC', 'North Dakota': 'ND', 'Ohio': 'OH', 'Oklahoma': 'OK',
  'Oregon': 'OR', 'Pennsylvania': 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
  'South Dakota': 'SD', 'Tennessee': 'TN', 'Texas': 'TX', 'Utah': 'UT',
  'Vermont': 'VT', 'Virginia': 'VA', 'Washington': 'WA', 'West Virginia': 'WV',
  'Wisconsin': 'WI', 'Wyoming': 'WY',
};

function mapParty(partyName) {
  if (partyName === 'Democratic') return 'D';
  if (partyName === 'Republican') return 'R';
  return 'I';
}

function parseName(fullName) {
  // Congress.gov returns "Last, First" format
  const parts = fullName.split(', ');
  const last = parts[0] || '';
  const first = (parts[1] || '').split(' ')[0]; // Drop middle name/suffix
  return { first, last, full: `${first} ${last}` };
}

async function fetchCurrentSenators(apiKey) {
  let lastError = null;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await axios.get(
        `${CONGRESS_API_BASE}/member`,
        {
          params: {
            currentMember: true,
            limit: 250,
            api_key: apiKey,
            format: 'json',
          },
          timeout: 30000,
        }
      );

      const members = response.data.members || [];

      // Filter for senators only
      const senators = members.filter((m) => {
        const terms = m.terms?.item || [];
        return terms.some((t) => t.chamber === 'Senate');
      });

      return senators.map((m) => {
        const name = parseName(m.name);
        const state = STATE_ABBREVS[m.state] || m.state;

        return {
          bioguide_id: m.bioguideId,
          first_name: name.first,
          last_name: name.last,
          full_name: name.full,
          party: mapParty(m.partyName),
          state: state,
          official_website: m.officialWebsiteUrl || null,
        };
      });
    } catch (error) {
      lastError = error;
      console.error(`  Attempt ${attempt}/3 failed: ${error.message}`);
      if (attempt < 3) {
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw new Error(
    `Failed to fetch senators after 3 attempts: ${lastError?.message}`
  );
}

async function fetchPoliticians() {
  console.log('Fetching all current US senators from Congress.gov...');

  const databaseUrl = process.env.DATABASE_URL;
  const apiKey = process.env.CONGRESS_GOV_API_KEY;

  if (!databaseUrl) {
    console.error('Missing DATABASE_URL environment variable');
    process.exit(1);
  }
  if (!apiKey) {
    console.error('Missing CONGRESS_GOV_API_KEY environment variable');
    process.exit(1);
  }

  const sql = postgres(databaseUrl, { ssl: 'require', prepare: false });

  try {
    const senators = await fetchCurrentSenators(apiKey);
    console.log(`  Found ${senators.length} current senators`);

    let successCount = 0;
    let errorCount = 0;

    for (const senator of senators) {
      try {
        await sql`
          INSERT INTO politicians (
            bioguide_id, first_name, last_name, full_name,
            party, state, office_type, title,
            official_website, is_active
          ) VALUES (
            ${senator.bioguide_id},
            ${senator.first_name},
            ${senator.last_name},
            ${senator.full_name},
            ${senator.party},
            ${senator.state},
            'senate',
            'Senator',
            ${senator.official_website},
            true
          )
          ON CONFLICT (bioguide_id)
          DO UPDATE SET
            first_name = EXCLUDED.first_name,
            last_name = EXCLUDED.last_name,
            full_name = EXCLUDED.full_name,
            party = EXCLUDED.party,
            state = EXCLUDED.state,
            official_website = EXCLUDED.official_website,
            is_active = EXCLUDED.is_active,
            updated_at = NOW()
        `;

        successCount++;
        console.log(
          `  + ${senator.full_name} (${senator.party}-${senator.state})`
        );
      } catch (error) {
        console.error(
          `  x Error inserting ${senator.full_name}:`,
          error.message
        );
        errorCount++;
      }
    }

    // Mark senators no longer in the dataset as inactive
    const bioguideIds = senators.map((s) => s.bioguide_id);
    await sql`
      UPDATE politicians
      SET is_active = false, updated_at = NOW()
      WHERE office_type = 'senate'
        AND bioguide_id != ALL(${bioguideIds})
        AND is_active = true
    `;

    console.log(
      `\nFetch complete: ${successCount} success, ${errorCount} errors`
    );

    const result = await sql`SELECT COUNT(*) as count FROM politicians WHERE is_active = true`;
    console.log(`Total active politicians in database: ${result[0].count}`);

    // Second pass: fetch official websites from member detail endpoint
    console.log('\nFetching official website URLs from member details...');
    const senatorsNeedingWebsite = await sql`
      SELECT bioguide_id, full_name FROM politicians
      WHERE is_active = true AND office_type = 'senate' AND official_website IS NULL
    `;

    let websiteCount = 0;
    for (const s of senatorsNeedingWebsite) {
      try {
        // Rate limit: 1 req/s
        await new Promise((r) => setTimeout(r, 1000));
        const detailResp = await axios.get(
          `${CONGRESS_API_BASE}/member/${s.bioguide_id}`,
          {
            params: { api_key: apiKey, format: 'json' },
            timeout: 15000,
          }
        );
        const website = detailResp.data?.member?.officialWebsiteUrl;
        if (website) {
          await sql`
            UPDATE politicians SET official_website = ${website}, updated_at = NOW()
            WHERE bioguide_id = ${s.bioguide_id}
          `;
          websiteCount++;
          console.log(`  + ${s.full_name}: ${website}`);
        }
      } catch (err) {
        console.log(`  x ${s.full_name}: ${err.message}`);
      }
    }
    console.log(`Updated ${websiteCount}/${senatorsNeedingWebsite.length} website URLs`);
  } catch (error) {
    console.error('Job failed:', error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

fetchPoliticians();
