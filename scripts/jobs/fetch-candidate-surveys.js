/**
 * Fetch Ballotpedia "Candidate Connection" survey responses.
 *
 * For challengers with no legislative record, the survey is often the only
 * scoreable evidence — it feeds the questionnaire_response evidence type
 * (weight 0.7, just below co-sponsorships).
 *
 * Walks the same 203 district pages as fetch-candidates.js to find each
 * candidate's Ballotpedia page link, then extracts the survey section if the
 * candidate completed one. Rows leave keyword_filter_passed NULL so
 * analyze-statements.js runs its normal pipeline over them.
 *
 * Usage: node --env-file=.env.local scripts/jobs/fetch-candidate-surveys.js
 * Optional: DISTRICTS=1,8,142 to limit districts.
 * Requires SUPABASE_URL, SUPABASE_SERVICE_KEY.
 */

const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const cheerio = require('cheerio');
const crypto = require('node:crypto');

const USER_AGENT = 'Mozilla/5.0 (compatible; PA-Chamber-Intelligence/1.0)';
const TOTAL_DISTRICTS = 203;
const DELAY_MS = 1500;
const MAX_TEXT = 5000;

const NAME_SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'v']);
function normalizeName(name) {
  const norm = (name || '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return norm.split(' ').filter((p) => !NAME_SUFFIXES.has(p)).join(' ');
}

function districtsToProcess() {
  if (process.env.DISTRICTS) {
    return process.env.DISTRICTS.split(',').map((d) => Number.parseInt(d.trim(), 10));
  }
  return Array.from({ length: TOTAL_DISTRICTS }, (_, i) => i + 1);
}

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchPage(url) {
  const res = await axios.get(url, {
    headers: { 'User-Agent': USER_AGENT },
    timeout: 30000,
  });
  return cheerio.load(res.data);
}

/**
 * Extract the newest completed Candidate Connection survey from a candidate
 * page, or null. Survey blocks are introduced by a paragraph like
 * "<Name> completed Ballotpedia's Candidate Connection survey in 2020." with
 * the Q&A following as bold questions and plain answers until the next heading.
 * Old-cycle surveys still count as evidence — temporal decay discounts them.
 */
function extractSurvey($) {
  const blocks = [];
  $('p').each((_, el) => {
    const intro = $(el).text().replace(/\s+/g, ' ').trim();
    const m = intro.match(/completed Ballotpedia'?s(?: (\d{4}))? Candidate Connection survey(?: in (\d{4}))?/i);
    if (!m || /did not complete|has not (yet )?completed/i.test(intro)) return;
    const year = Number(m[1] || m[2]) || null;

    const chunks = [];
    let node = $(el).next();
    while (node.length && !node.is('h1, h2, h3')) {
      const text = node.text().replace(/\s+/g, ' ').trim();
      if (text) chunks.push(text);
      node = node.next();
    }
    const full = chunks.join('\n').trim();
    if (full.length >= 300) blocks.push({ year: year ?? 0, text: full });
  });

  if (blocks.length === 0) return null;
  blocks.sort((a, b) => b.year - a.year);
  const best = blocks[0];
  return { year: best.year || null, text: best.text.substring(0, MAX_TEXT) };
}

/** Ballotpedia candidate infoboxes usually link a "Campaign website" — worth grabbing
 * while the page is already open, especially for candidates with no completed survey,
 * since it's often the only public link we have for them at all. */
function extractCampaignWebsite($) {
  let href = null;
  $('a').each((_, el) => {
    if (href) return;
    if (/^campaign website$/i.test($(el).text().trim())) href = $(el).attr('href') || null;
  });
  return href;
}

const PLACEHOLDER_PHOTO = /submitphoto/i;
const PLACEHOLDER_ALT = /silhouette|placeholder/i;

function isRealPhoto($img) {
  const src = $img.attr('src');
  const alt = $img.attr('alt') || '';
  return Boolean(src) && !PLACEHOLDER_PHOTO.test(src) && !PLACEHOLDER_ALT.test(alt);
}

/** The candidate's headshot lives in the infobox photo carousel's active slide when
 * Ballotpedia has one on file; an unfilled slot renders a "submit a photo" placeholder
 * we need to explicitly exclude rather than storing as a real photo. */
function extractCandidatePhoto($) {
  let src = null;
  $('.carousel-inner .item.active img, table.infobox img').each((_, el) => {
    if (src) return;
    const $img = $(el);
    if (isRealPhoto($img)) src = $img.attr('src');
  });
  return src;
}

async function main() {
  const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
    process.exit(1);
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });

  const { data: members, error } = await supabase
    .from('politicians')
    .select('id, full_name, district, photo_url')
    .eq('is_active', true)
    .eq('office_type', 'pa_house');
  if (error) throw error;

  const byDistrict = new Map();
  for (const m of members) {
    const d = Number(m.district);
    if (!byDistrict.has(d)) byDistrict.set(d, []);
    byDistrict.get(d).push(m);
  }

  let surveysFound = 0;
  let websitesFound = 0;
  let photosFound = 0;
  let candidatesChecked = 0;
  let fetchFailures = 0;

  for (const district of districtsToProcess()) {
    const candidates = byDistrict.get(district) || [];
    if (candidates.length === 0) continue;

    let $district;
    try {
      $district = await fetchPage(`https://ballotpedia.org/Pennsylvania_House_of_Representatives_District_${district}`);
    } catch (err) {
      console.log(`  HD-${district}: district page failed (${err.message})`);
      fetchFailures++;
      await delay(DELAY_MS);
      continue;
    }
    await delay(DELAY_MS);

    // Map normalized anchor text -> href for candidate page lookup
    // (Ballotpedia uses a mix of absolute and relative hrefs)
    const links = new Map();
    $district('a').each((_, el) => {
      const text = normalizeName($district(el).text());
      let href = $district(el).attr('href') || '';
      if (href.startsWith('/')) href = `https://ballotpedia.org${href}`;
      if (text && href.startsWith('https://ballotpedia.org/') && !links.has(text)) {
        links.set(text, href);
      }
    });

    for (const candidate of candidates) {
      const url = links.get(normalizeName(candidate.full_name));
      if (!url) continue;
      candidatesChecked++;

      let $cand;
      try {
        $cand = await fetchPage(url);
      } catch (err) {
        fetchFailures++;
        await delay(DELAY_MS);
        continue;
      }
      await delay(DELAY_MS);

      const website = extractCampaignWebsite($cand);
      if (website) {
        const { error: webErr } = await supabase.from('politicians').update({ official_website: website }).eq('id', candidate.id);
        if (!webErr) {
          websitesFound++;
          console.log(`  HD-${district}: website found for ${candidate.full_name}`);
        }
      }

      if (!candidate.photo_url) {
        const photo = extractCandidatePhoto($cand);
        if (photo) {
          const { error: photoErr } = await supabase.from('politicians').update({ photo_url: photo }).eq('id', candidate.id);
          if (!photoErr) {
            photosFound++;
            console.log(`  HD-${district}: photo found for ${candidate.full_name}`);
          }
        }
      }

      const survey = extractSurvey($cand);
      if (!survey) continue;

      const sourceDate = survey.year
        ? new Date(`${survey.year}-06-01T00:00:00Z`).toISOString()
        : new Date().toISOString();

      const { error: upErr } = await supabase.from('evidence_items').upsert({
        politician_id: candidate.id,
        evidence_type: 'questionnaire_response',
        source_text: survey.text,
        source_url: url,
        source_date: sourceDate,
        content_hash: crypto.createHash('md5').update(`survey-${candidate.id}`).digest('hex'),
      }, { onConflict: 'content_hash', ignoreDuplicates: true });

      if (!upErr) {
        surveysFound++;
        console.log(`  HD-${district}: survey found for ${candidate.full_name}${survey.year ? ` (${survey.year})` : ''}`);
      } else {
        console.log(`  HD-${district}: upsert error for ${candidate.full_name}: ${upErr.message}`);
      }
    }
  }

  console.log(`\nDone. Checked ${candidatesChecked} candidate pages, found ${surveysFound} surveys, ${websitesFound} websites, ${photosFound} photos, ${fetchFailures} fetch failures.`);
}

main().catch((err) => {
  console.error('Job failed:', err.message || err);
  process.exit(1);
});
