/**
 * Fetch Statements Job
 * Scrapes senator official websites for AI-related press releases and statements.
 * High failure tolerance — many websites will fail, that's expected.
 */

const postgres = require('postgres');
const axios = require('axios');
const cheerio = require('cheerio');
const crypto = require('crypto');
const { isAIRelevant } = require('../shared/constants');

// Common press release page paths on senator websites
const PRESS_PATHS = [
  '/news',
  '/newsroom',
  '/press-releases',
  '/media/press-releases',
  '/news/press-releases',
  '/newsroom/press-releases',
  '/media',
];

function contentHash(url) {
  return crypto.createHash('md5').update(url).digest('hex');
}

async function scrapePressList(baseUrl) {
  const results = [];

  for (const path of PRESS_PATHS) {
    try {
      const url = `${baseUrl.replace(/\/$/, '')}${path}`;
      const response = await axios.get(url, {
        timeout: 15000,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (compatible; OpenPolicyAI/1.0; +https://openpolicy.ai)',
        },
        maxRedirects: 3,
      });

      const $ = cheerio.load(response.data);
      const links = [];

      // Find press release links — common patterns
      $('a[href]').each((_, el) => {
        const href = $(el).attr('href');
        const text = $(el).text().trim();
        if (
          href &&
          text.length > 10 &&
          text.length < 500 &&
          !href.includes('#') &&
          !href.endsWith('.pdf')
        ) {
          const fullUrl = href.startsWith('http')
            ? href
            : `${baseUrl.replace(/\/$/, '')}${href.startsWith('/') ? '' : '/'}${href}`;
          links.push({ url: fullUrl, title: text });
        }
      });

      // Filter for AI-relevant titles
      for (const link of links) {
        if (isAIRelevant(link.title)) {
          results.push(link);
        }
      }

      if (results.length > 0) break; // Found a working press page
    } catch {
      // Expected — many paths won't exist
    }
  }

  return results.slice(0, 20); // Cap at 20 per senator
}

async function scrapeArticle(url) {
  try {
    const response = await axios.get(url, {
      timeout: 15000,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; OpenPolicyAI/1.0; +https://openpolicy.ai)',
      },
      maxRedirects: 3,
    });

    const $ = cheerio.load(response.data);

    // Remove nav, footer, sidebar
    $('nav, footer, aside, .sidebar, .menu, script, style').remove();

    // Try common content selectors
    let text = '';
    for (const selector of [
      'article',
      '.press-release-content',
      '.entry-content',
      '.field-item',
      'main',
      '.content',
    ]) {
      const el = $(selector);
      if (el.length && el.text().trim().length > 100) {
        text = el.text().trim();
        break;
      }
    }

    if (!text) {
      text = $('body').text().trim();
    }

    // Extract date if possible
    let date = null;
    const dateEl =
      $('time[datetime]').attr('datetime') ||
      $('meta[property="article:published_time"]').attr('content') ||
      $('meta[name="date"]').attr('content');
    if (dateEl) {
      date = new Date(dateEl);
      if (isNaN(date.getTime())) date = null;
    }

    // Truncate text to ~5000 chars
    return {
      text: text.substring(0, 5000).replace(/\s+/g, ' ').trim(),
      date,
    };
  } catch {
    return null;
  }
}

async function fetchStatements() {
  console.log('Fetching statements from senator websites...');

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('Missing DATABASE_URL');
    process.exit(1);
  }

  const sql = postgres(databaseUrl, { ssl: 'require', prepare: false });

  try {
    const senators = await sql`
      SELECT id, bioguide_id, full_name, official_website
      FROM politicians
      WHERE is_active = true
        AND office_type = 'senate'
        AND official_website IS NOT NULL
      ORDER BY full_name
    `;

    console.log(`  Processing ${senators.length} senators with websites...\n`);

    let totalInserted = 0;
    let totalScraped = 0;
    let senatorErrors = 0;

    for (const senator of senators) {
      try {
        console.log(`  ${senator.full_name} (${senator.official_website})...`);

        const pressLinks = await scrapePressList(senator.official_website);

        if (pressLinks.length === 0) {
          console.log(`    (no AI-relevant press releases found)`);
          continue;
        }

        console.log(
          `    Found ${pressLinks.length} AI-relevant press releases`
        );
        let senatorInserted = 0;

        for (const link of pressLinks) {
          // Rate limit: 2s between scrapes
          await new Promise((r) => setTimeout(r, 2000));

          const hash = contentHash(link.url);

          // Check if already exists
          const existing = await sql`
            SELECT id FROM evidence_items WHERE content_hash = ${hash}
          `;
          if (existing.length > 0) continue;

          const article = await scrapeArticle(link.url);
          totalScraped++;

          if (!article || !article.text || article.text.length < 50) continue;

          // Re-check relevance on full text
          if (!isAIRelevant(article.text)) continue;

          const sourceDate = article.date || new Date();

          try {
            await sql`
              INSERT INTO evidence_items (
                politician_id, evidence_type, bill_title,
                source_text, source_url, source_date, content_hash
              ) VALUES (
                ${senator.id}, 'press_release', ${link.title},
                ${article.text}, ${link.url},
                ${sourceDate}, ${hash}
              )
              ON CONFLICT (content_hash) DO NOTHING
            `;
            senatorInserted++;
          } catch (insertError) {
            // Duplicate or constraint error — skip
          }
        }

        totalInserted += senatorInserted;
        if (senatorInserted > 0) {
          console.log(`    + ${senatorInserted} statements inserted`);
        }
      } catch (error) {
        console.error(
          `    x Error for ${senator.full_name}: ${error.message}`
        );
        senatorErrors++;
      }
    }

    console.log(`\nStatements complete:`);
    console.log(`  Pages scraped: ${totalScraped}`);
    console.log(`  Inserted: ${totalInserted}`);
    console.log(`  Senator errors: ${senatorErrors}`);
  } catch (error) {
    console.error('Job failed:', error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

fetchStatements();
