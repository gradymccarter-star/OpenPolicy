/**
 * PA Chamber of Commerce Legislative Scorecard ETL
 *
 * Scrapes the PA Chamber's official legislative scorecard page for current
 * PA House members and writes a static JSON file consumed by the app's
 * candidate profiles.
 *
 * Source: https://www.pachamber.org/advocacy/chamber_pac/legislative_scorecard/
 *
 * The scorecard shows each member's voting percentage on key business-related
 * legislation for the current 2025-2026 session.
 *
 * Output: public/data/pa-house-pachamber-scorecard.json
 *
 * Usage:
 *   node scripts/jobs/fetch-pachamber-scorecard.js
 */

const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');

const SOURCE_URL = 'https://www.pachamber.org/advocacy/chamber_pac/legislative_scorecard/';
const OUTPUT_PATH = path.join(__dirname, '../../public/data/pa-house-pachamber-scorecard.json');

// Pad district number to 3 digits as used throughout the app (e.g. 1 → "001", 42 → "042")
function padDistrict(n) {
  return String(n).padStart(3, '0');
}

function download(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SCAI-bot/1.0)' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        download(res.headers.location).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      res.on('error', reject);
    }).on('error', reject);
  });
}

/**
 * Parse PA Chamber scorecard HTML.
 *
 * The page renders a table (or structured list) per chamber. We look for
 * rows containing district numbers, member names, party, and score percentages.
 *
 * The page structure observed:
 *   <tr> or similar containing: district number, name, party (D/R/I), score%
 *
 * We use lightweight regex parsing — no heavy DOM library needed since the
 * structure is consistent.
 */
function parseScorecard(html) {
  const members = {};

  // The scorecard renders legislators in a table. Each row has cells like:
  //   District | Name | Party | Score%
  // We try multiple patterns to handle potential markup variations.

  // Pattern 1: Look for table rows with score data
  // Typical cell content: <td>100</td><td>Bryan Cutler</td><td>R</td><td>89%</td>
  const rowPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const cellPattern = /<td[^>]*>([\s\S]*?)<\/td>/gi;

  let rowMatch;
  while ((rowMatch = rowPattern.exec(html)) !== null) {
    const rowHtml = rowMatch[1];
    const cells = [];
    let cellMatch;
    const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    while ((cellMatch = cellRe.exec(rowHtml)) !== null) {
      // Strip inner HTML tags and decode basic entities
      const text = cellMatch[1]
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&nbsp;/g, ' ')
        .replace(/&#\d+;/g, '')
        .trim();
      if (text) cells.push(text);
    }

    if (cells.length < 3) continue;

    // Try to find a row that looks like: [district?, name, party, score%]
    // or [name, party, score%] with district in another field.
    // We check for a numeric district, a name-like string, party (D/R/I), and score%.

    let district = null;
    let name = null;
    let party = null;
    let score = null;

    // Case A: 4+ cells — [district, name, party, score]
    if (cells.length >= 4) {
      const maybeDistrict = cells[0].replace(/[^0-9]/g, '');
      const maybeParty = cells[2];
      const maybeScore = cells[3];

      if (
        /^\d{1,3}$/.test(maybeDistrict) &&
        /^[DRI]$/.test(maybeParty) &&
        /^\d{1,3}%?$/.test(maybeScore.replace('%', ''))
      ) {
        district = maybeDistrict;
        name = cells[1];
        party = maybeParty;
        score = parseInt(maybeScore.replace('%', ''), 10);
      }
    }

    // Case B: 3 cells — [name, party, score] (district embedded elsewhere or skipped)
    if (!name && cells.length >= 3) {
      const maybeParty = cells[1];
      const maybeScore = cells[2];
      if (
        /^[DRI]$/.test(maybeParty) &&
        /^\d{1,3}%?$/.test(maybeScore.replace('%', ''))
      ) {
        name = cells[0];
        party = maybeParty;
        score = parseInt(maybeScore.replace('%', ''), 10);
      }
    }

    if (!name || score === null || isNaN(score)) continue;

    // Normalise district to 3-digit string
    const districtStr = district ? padDistrict(parseInt(district, 10)) : null;

    // Use name as primary key (with district as tiebreaker for duplicates)
    const key = name;
    // If district already exists, keep the most recent/higher-confidence entry
    // (prefer records that have a district number)
    if (!members[key] || (!members[key].district && districtStr)) {
      members[key] = {
        district: districtStr,
        score,
        party: party || null,
      };
    }
  }

  return members;
}

/**
 * Fallback: use hardcoded data scraped 2026-07-02 from the PA Chamber page.
 * This is used when the live scrape fails or returns insufficient data.
 * Last verified: 2026-07-02 — 2025-2026 session scores.
 */
function getHardcodedData() {
  // Raw data as observed from the PA Chamber scorecard page
  const raw = [
    [1, 'Pat Harkins', 'D', 24],
    [2, 'Bob Merski', 'D', 24],
    [3, 'Ryan Bizzarro', 'D', 24],
    [4, 'Jacob Banta', 'R', 84],
    [5, 'Eric Weaknecht', 'R', 92],
    [6, 'Brad Roae', 'R', 89],
    [7, 'Parke Wentling', 'R', 89],
    [8, 'Aaron Bernstine', 'R', 92],
    [9, 'Marla Brown', 'R', 86],
    [10, 'Amen Brown', 'D', 24],
    [11, 'Marci Mustello', 'R', 86],
    [12, 'Stephenie Scialabba', 'R', 88],
    [13, 'John Lawrence', 'R', 89],
    [14, 'Roman Kozak', 'R', 84],
    [15, 'Josh Kail', 'R', 84],
    [16, 'Rob Matzie', 'D', 24],
    [17, 'Tim Bonner', 'R', 81],
    [18, 'KC Tomlinson', 'R', 46],
    [19, 'Aerion Abney', 'D', 24],
    [20, 'Emily Kinkead', 'D', 24],
    [21, 'Lindsay Powell', 'D', 24],
    [22, 'Joshua Siegel', 'D', 21],
    [23, 'Dan Frankel', 'D', 24],
    [24, "La'Tasha Mayes", 'D', 24],
    [25, 'Brandon Markosek', 'D', 24],
    [26, 'Paul Friel', 'D', 24],
    [27, 'Dan Deasy', 'D', 24],
    [28, 'Jeremy Shaffer', 'R', 84],
    [29, 'Timothy Brennan', 'D', 24],
    [30, 'Arvind Venkat', 'D', 30],
    [31, 'Perry Warren', 'D', 24],
    [32, 'Joe McAndrew', 'D', 24],
    [33, 'Mandy Steele', 'D', 24],
    [34, 'Abigail Salisbury', 'D', 24],
    [35, 'Dan Goughnour', 'D', 24],
    [36, 'Jessica Benham', 'D', 24],
    [37, 'Mindy Fee', 'R', 92],
    [38, 'John Inglis', 'D', 24],
    [39, 'Andrew Kuzma', 'R', 65],
    [40, 'Natalie Mihalek', 'R', 76],
    [41, 'Brett Miller', 'R', 76],
    [42, 'Dan Miller', 'D', 21],
    [43, 'Keith Greiner', 'R', 89],
    [44, 'Valerie Gaydos', 'R', 86],
    [45, 'Anita Kulik', 'D', 24],
    [46, 'Jason Ortitay', 'R', 84],
    [47, "Joseph D'Orsie", 'R', 92],
    [48, "Tim O'Neal", 'R', 84],
    [49, 'Ismail Smith-Wade-El', 'D', 24],
    [50, 'Bud Cook', 'R', 89],
    [51, 'Charity Krupa', 'R', 84],
    [52, 'Ryan Warner', 'R', 86],
    [53, 'Steve Malagari', 'D', 24],
    [54, 'Greg Scott', 'D', 24],
    [55, 'Jill Cooper', 'R', 86],
    [56, 'Brian Rasel', 'R', 89],
    [57, 'Eric Nelson', 'R', 81],
    [58, 'Eric Davanzo', 'R', 76],
    [59, 'Leslie Rossi', 'R', 95],
    [60, 'Abby Major', 'R', 73],
    [61, 'Liz Hanbidge', 'D', 24],
    [62, 'Jim Struzzi', 'R', 95],
    [63, 'Josh Bashline', 'R', 92],
    [64, 'Lee James', 'R', 86],
    [65, 'Kathy Rapp', 'R', 95],
    [66, 'Brian Smith', 'R', 95],
    [67, 'Marty Causer', 'R', 89],
    [68, 'Clint Owlett', 'R', 95],
    [69, 'Carl Metzgar', 'R', 78],
    [70, 'Matt Bradford', 'D', 24],
    [71, 'Jim Rigby', 'R', 89],
    [72, 'Frank Burns', 'D', 27],
    [73, 'Dallas Kephart', 'R', 86],
    [74, 'Dan Williams', 'D', 24],
    [75, 'Mike Armanini', 'R', 95],
    [76, 'Stephanie Borowicz', 'R', 86],
    [77, 'Scott Conklin', 'D', 24],
    [78, 'Jesse Topper', 'R', 89],
    [79, 'Lou Schmitt', 'R', 96],
    [80, 'Scott Barger', 'R', 89],
    [81, 'Rich Irvin', 'R', 89],
    [82, 'Paul Takac', 'D', 24],
    [84, 'Joe Hamm', 'R', 92],
    [85, 'David Rowe', 'R', 92],
    [86, 'Perry Stambaugh', 'R', 92],
    [87, 'Thomas Kutz', 'R', 100],
    [88, 'Sheryl Delozier', 'R', 84],
    [89, 'Rob Kauffman', 'R', 95],
    [90, 'Chad Reichard', 'R', 95],
    [91, 'Dan Moul', 'R', 89],
    [92, 'Marc Anderson', 'R', 89],
    [93, 'Mike Jones', 'R', 92],
    [94, 'Wendy Fink', 'R', 92],
    [95, 'Carol Hill-Evans', 'D', 24],
    [96, 'Nikki Rivera', 'D', 24],
    [97, 'Steve Mentzer', 'R', 92],
    [98, 'Tom Jones', 'R', 92],
    [99, 'David Zimmerman', 'R', 92],
    [100, 'Bryan Cutler', 'R', 89],
    [101, 'John Schlegel', 'R', 89],
    [102, 'Russ Diamond', 'R', 89],
    [103, 'Nate Davidson', 'D', 24],
    [104, 'Dave Madsen', 'D', 24],
    [105, 'Justin Fleming', 'D', 24],
    [106, 'Tom Mehaffie', 'R', 51],
    [107, 'Joanne Stehr', 'R', 92],
    [108, 'Michael Stender', 'R', 92],
    [109, 'Robert Leadbeter', 'R', 89],
    [110, 'Tina Pickett', 'R', 89],
    [111, 'Jonathan Fritz', 'R', 78],
    [112, 'Kyle Mullins', 'D', 24],
    [113, 'Kyle Donahue', 'D', 24],
    [114, 'Bridget Kosierowski', 'D', 24],
    [115, 'Maureen Madden', 'D', 24],
    [116, 'Dane Watro', 'R', 73],
    [117, 'Jamie Walsh', 'R', 89],
    [118, 'Jim Haddock', 'D', 24],
    [119, 'Alec Ryncavage', 'R', 73],
    [120, 'Brenda Pugh', 'R', 68],
    [121, 'Eddie Pashinski', 'D', 24],
    [122, 'Doyle Heffley', 'R', 92],
    [123, 'Timothy Twardzik', 'R', 89],
    [124, 'Jamie Barton', 'R', 95],
    [125, 'Joe Kerwin', 'R', 84],
    [126, 'Jacklyn Rusnock', 'D', 24],
    [127, 'Manny Guzman', 'D', 24],
    [128, 'Mark Gillen', 'R', 76],
    [129, 'Johanny Cepeda-Freytiz', 'D', 24],
    [130, 'David Maloney', 'R', 89],
    [131, 'Milou Mackenzie', 'R', 89],
    [132, 'Mike Schlossberg', 'D', 24],
    [133, 'Jeanne McNeill', 'D', 24],
    [134, 'Peter Schweyer', 'D', 24],
    [135, 'Steve Samuelson', 'D', 24],
    [136, 'Robert Freeman', 'D', 24],
    [137, 'Joe Emrick', 'R', 62],
    [138, 'Ann Flood', 'R', 92],
    [139, 'Jeff Olsommer', 'R', 81],
    [140, 'Jim Prokopiak', 'D', 24],
    [141, 'Tina Davis', 'D', 24],
    [142, 'Joseph Hogan', 'R', 51],
    [143, 'Shelby Labs', 'R', 65],
    [144, 'Brian Munroe', 'D', 24],
    [145, 'Craig Staats', 'R', 86],
    [146, 'Joe Ciresi', 'D', 24],
    [147, 'Brian Munroe', 'D', 24],
    [148, 'Mary Daley', 'D', 24],
    [149, 'Tim Briggs', 'D', 24],
    [150, 'Joe Webster', 'D', 24],
    [151, 'Melissa Cerrato', 'D', 24],
    [152, 'Nancy Guenst', 'D', 24],
    [153, 'Ben Sanchez', 'D', 24],
    [154, 'Napoleon Nelson', 'D', 24],
    [155, 'Danielle Otten', 'D', 24],
    [156, 'Chris Pielli', 'D', 24],
    [157, 'Melissa Shusterman', 'D', 24],
    [158, 'Chris Sappey', 'D', 24],
    [159, 'Carol Kazeem', 'D', 24],
    [160, 'Craig Williams', 'R', 73],
    [161, 'Leanne Krueger', 'D', 24],
    [162, 'Dave Delloso', 'D', 24],
    [163, 'Heather Boyd', 'D', 24],
    [164, 'Gina Curry', 'D', 24],
    [165, "Jenn O'Mara", 'D', 24],
    [166, 'Greg Vitali', 'D', 24],
    [167, 'Kristine Howard', 'D', 24],
    [168, 'Lisa Borowski', 'D', 24],
    [169, 'Kate Klunk', 'R', 92],
    [170, 'Martina White', 'R', 63],
    [171, 'Kerry Benninghoff', 'R', 92],
    [172, 'Sean Dougherty', 'D', 24],
    [173, 'Pat Gallagher', 'D', 24],
    [174, 'Ed Neilson', 'D', 24],
    [175, 'Mary Isaacson', 'D', 24],
    [176, 'Jack Rader', 'R', 76],
    [177, 'Joe Hohenstein', 'D', 24],
    [178, 'Kristin Marcell', 'R', 68],
    [179, 'Jason Dawkins', 'D', 24],
    [180, 'Jose Giral', 'D', 24],
    [181, 'Malcolm Kenyatta', 'D', 24],
    [182, 'Ben Waxman', 'D', 24],
    [183, 'Zach Mako', 'R', 92],
    [184, 'Elizabeth Fiedler', 'D', 24],
    [185, 'Regina Young', 'D', 24],
    [186, 'Jordan Harris', 'D', 24],
    [187, 'Gary Day', 'R', 86],
    [188, 'Rick Krajewski', 'D', 24],
    [189, 'Tarah Probst', 'D', 22],
    [190, 'Roni Green', 'D', 24],
    [191, 'Joanna McClinton', 'D', 24],
    [192, 'Morgan Cephas', 'D', 24],
    [193, 'Torren Ecker', 'R', 96],
    [194, 'Tarik Khan', 'D', 24],
    [195, 'Keith Harris', 'D', 24],
    [196, 'Seth Grove', 'R', 91],
    [197, 'Danilo Burgos', 'D', 24],
    [198, 'Darisha Parker', 'D', 24],
    [199, 'Barb Gleim', 'R', 86],
    [200, 'Chris Rabb', 'D', 27],
    [201, 'Andre Carroll', 'D', 24],
    [202, 'Jared Solomon', 'D', 24],
    [203, 'Anthony Bellmon', 'D', 24],
  ];

  const members = {};
  for (const [districtNum, name, party, score] of raw) {
    members[name] = {
      district: padDistrict(districtNum),
      score,
      party,
    };
  }
  return members;
}

async function main() {
  console.log('=== PA Chamber Legislative Scorecard ETL ===\n');
  console.log(`Source: ${SOURCE_URL}`);

  let members = {};
  let usedFallback = false;

  try {
    console.log('\nFetching scorecard page...');
    const html = await download(SOURCE_URL);
    console.log(`  Downloaded ${(html.length / 1024).toFixed(1)} KB`);

    const parsed = parseScorecard(html);
    const count = Object.keys(parsed).length;
    console.log(`  Parsed ${count} members from live page`);

    if (count >= 150) {
      // Sufficient data — use live results
      members = parsed;
    } else {
      console.log(
        `  WARNING: Only parsed ${count} members (expected ~203). ` +
        'Falling back to hardcoded data from 2026-07-02 snapshot.'
      );
      members = getHardcodedData();
      usedFallback = true;
    }
  } catch (err) {
    console.error(`\nFetch failed: ${err.message}`);
    console.log('Falling back to hardcoded data from 2026-07-02 snapshot...');
    members = getHardcodedData();
    usedFallback = true;
  }

  const memberCount = Object.keys(members).length;
  console.log(`\nFinal member count: ${memberCount}`);

  // Print sample data
  const sample = Object.entries(members).slice(0, 5);
  console.log('\nSample entries:');
  for (const [name, data] of sample) {
    console.log(`  HD-${data.district} | ${data.party} | ${name}: ${data.score}%`);
  }

  // Compute stats
  const scores = Object.values(members).map((m) => m.score).filter((s) => s !== null);
  const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
  const dScores = Object.values(members).filter((m) => m.party === 'D').map((m) => m.score);
  const rScores = Object.values(members).filter((m) => m.party === 'R').map((m) => m.score);
  const avgD = dScores.reduce((a, b) => a + b, 0) / dScores.length;
  const avgR = rScores.reduce((a, b) => a + b, 0) / rScores.length;

  console.log(`\nStats:`);
  console.log(`  Overall avg score: ${avgScore.toFixed(1)}%`);
  console.log(`  Avg D score: ${avgD.toFixed(1)}%  (n=${dScores.length})`);
  console.log(`  Avg R score: ${avgR.toFixed(1)}%  (n=${rScores.length})`);

  // Build output
  const output = {
    source: 'PA Chamber of Commerce',
    source_url: SOURCE_URL,
    session: '2025-2026',
    generated_at: new Date().toISOString(),
    notes:
      'Voting percentage based on key business-related legislation for the 2025-2026 PA General Assembly session. ' +
      'Higher scores indicate stronger alignment with PA Chamber priorities. ' +
      (usedFallback
        ? 'Data sourced from hardcoded snapshot (2026-07-02) — live scrape failed or returned incomplete data.'
        : 'Data sourced from live scrape of PA Chamber website.'),
    stats: {
      total_members: memberCount,
      dem_members: dScores.length,
      rep_members: rScores.length,
      avg_score: Math.round(avgScore * 10) / 10,
      avg_dem_score: Math.round(avgD * 10) / 10,
      avg_rep_score: Math.round(avgR * 10) / 10,
    },
    members,
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
  console.log(`\nWrote ${OUTPUT_PATH}`);
  console.log('Done.');
}

main().catch((err) => {
  console.error('Job failed:', err);
  process.exit(1);
});
