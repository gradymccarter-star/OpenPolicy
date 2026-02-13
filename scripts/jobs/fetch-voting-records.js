/**
 * Fetch Voting Records Job
 * Fetches Senate roll call votes from Senate.gov XML data
 * Filters for AI-relevant votes using keyword matching
 */

const postgres = require('postgres');
const axios = require('axios');
const crypto = require('crypto');
const { isAIRelevant } = require('../shared/constants');

function contentHash(bioguideId, congress, session, voteNumber) {
  return crypto
    .createHash('md5')
    .update(`${bioguideId}-${congress}-${session}-${voteNumber}`)
    .digest('hex');
}

// Parse simple XML tags (avoid needing xml2js dependency)
function extractTag(xml, tag) {
  const regex = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`);
  const match = xml.match(regex);
  return match ? match[1].trim() : '';
}

function extractAllTags(xml, tag) {
  const regex = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'g');
  const results = [];
  let match;
  while ((match = regex.exec(xml)) !== null) {
    results.push(match[1].trim());
  }
  return results;
}

async function fetchVoteList(congress, session) {
  const url = `https://www.senate.gov/legislative/LIS/roll_call_lists/vote_menu_${congress}_${session}.xml`;
  try {
    const response = await axios.get(url, { timeout: 30000 });
    return response.data;
  } catch (error) {
    console.log(`  Could not fetch vote list for ${congress}/${session}: ${error.message}`);
    return null;
  }
}

async function fetchVoteDetail(congress, session, voteNumber) {
  const paddedVote = String(voteNumber).padStart(5, '0');
  const url = `https://www.senate.gov/legislative/LIS/roll_call_votes/vote${congress}${session}/vote_${congress}_${session}_${paddedVote}.xml`;
  try {
    const response = await axios.get(url, { timeout: 30000 });
    return response.data;
  } catch (error) {
    return null;
  }
}

async function fetchVotingRecords() {
  console.log('Fetching Senate voting records from Senate.gov...');

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('Missing DATABASE_URL');
    process.exit(1);
  }

  const sql = postgres(databaseUrl, { ssl: 'require', prepare: false });

  try {
    // Build bioguide -> politician ID lookup
    const senators = await sql`
      SELECT id, bioguide_id, full_name, last_name
      FROM politicians
      WHERE is_active = true AND office_type = 'senate'
    `;
    const senatorsByLastName = {};
    const senatorsById = {};
    for (const s of senators) {
      senatorsByLastName[s.last_name.toLowerCase()] = s;
      senatorsById[s.bioguide_id] = s;
    }

    console.log(`  ${senators.length} active senators in DB`);

    let totalInserted = 0;
    let totalVotesChecked = 0;

    // Check current congress (119th) and previous (118th)
    const sessions = [
      { congress: 119, session: 1 },
      { congress: 118, session: 2 },
      { congress: 118, session: 1 },
    ];

    for (const { congress, session } of sessions) {
      console.log(`\n  Checking ${congress}th Congress, Session ${session}...`);

      const voteListXml = await fetchVoteList(congress, session);
      if (!voteListXml) continue;

      // Extract vote entries from the list
      const voteEntries = extractAllTags(voteListXml, 'vote');
      console.log(`    Found ${voteEntries.length} total votes`);

      // Check each vote's question/title for AI relevance
      for (const voteXml of voteEntries) {
        const voteNumber = extractTag(voteXml, 'vote_number');
        const question = extractTag(voteXml, 'question');
        const title = extractTag(voteXml, 'title');
        const issueText = extractTag(voteXml, 'issue');
        const voteDate = extractTag(voteXml, 'vote_date');

        const searchText = `${question} ${title} ${issueText}`;
        totalVotesChecked++;

        if (!isAIRelevant(searchText)) continue;

        console.log(`    AI-relevant vote #${voteNumber}: ${title.substring(0, 80)}...`);

        // Fetch detailed vote data with per-senator votes
        await new Promise((r) => setTimeout(r, 500)); // Rate limit
        const detailXml = await fetchVoteDetail(congress, session, voteNumber);
        if (!detailXml) continue;

        // Extract individual member votes
        const members = extractAllTags(detailXml, 'member');
        let voteInserted = 0;

        for (const memberXml of members) {
          const lastName = extractTag(memberXml, 'last_name').toLowerCase();
          const memberId = extractTag(memberXml, 'lis_member_id');
          const voteCast = extractTag(memberXml, 'vote_cast').toLowerCase();

          // Match senator by last name (imperfect but works for most)
          const senator = senatorsByLastName[lastName];
          if (!senator) continue;

          const votePosition =
            voteCast === 'yea' ? 'yea' :
            voteCast === 'nay' ? 'nay' :
            voteCast === 'not voting' ? 'not_voting' :
            'abstain';

          const hash = contentHash(senator.bioguide_id, congress, session, voteNumber);
          const billTitle = `${title} - ${question}`.substring(0, 500);
          const sourceUrl = `https://www.senate.gov/legislative/LIS/roll_call_votes/vote${congress}${session}/vote_${congress}_${session}_${String(voteNumber).padStart(5, '0')}.htm`;
          const sourceDate = voteDate ? new Date(voteDate) : new Date();

          try {
            await sql`
              INSERT INTO evidence_items (
                politician_id, evidence_type, bill_id, bill_title,
                vote_position, source_text, source_url,
                source_date, content_hash
              ) VALUES (
                ${senator.id}, 'floor_vote', ${issueText || `vote-${voteNumber}`}, ${billTitle},
                ${votePosition}, ${searchText}, ${sourceUrl},
                ${sourceDate}, ${hash}
              )
              ON CONFLICT (content_hash) DO NOTHING
            `;
            voteInserted++;
          } catch (insertError) {
            // Duplicate or constraint error
          }
        }

        totalInserted += voteInserted;
        if (voteInserted > 0) {
          console.log(`      + ${voteInserted} senator votes recorded`);
        }
      }
    }

    console.log(`\nVoting records complete:`);
    console.log(`  Total votes checked: ${totalVotesChecked}`);
    console.log(`  Evidence items inserted: ${totalInserted}`);
  } catch (error) {
    console.error('Job failed:', error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

fetchVotingRecords();
