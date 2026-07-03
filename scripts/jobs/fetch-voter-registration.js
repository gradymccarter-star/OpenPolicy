/**
 * PA House District Voter Registration ETL
 *
 * Downloads the PA Department of State "current voter registration stats by
 * legislative districts" Excel file (updated monthly), extracts per-district
 * R/D/Other totals from the Sub Total rows, and writes a static JSON file at
 * public/data/pa-house-voter-registration.json.
 *
 * No third-party packages required — the xlsx format is a zip of XML files
 * that Node's built-in 'zlib' and a small unzip helper can read.
 *
 * Source page:
 *   https://www.pa.gov/agencies/dos/resources/voting-and-elections-resources/voting-and-election-statistics
 */

const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const zlib = require('node:zlib');

const SOURCE_URL =
  'https://www.pa.gov/content/dam/copapwp-pagov/en/dos/resources/voting-and-elections/voting-and-election-statistics/current%20voterregstatsbylegislativedistricts.xlsx';

const OUTPUT_PATH = path.join(
  __dirname,
  '../../public/data/pa-house-voter-registration.json'
);

// ---------------------------------------------------------------------------
// Minimal XLSX reader (no dependencies)
// xlsx is a ZIP archive containing XML parts. We need:
//   xl/sharedStrings.xml  — lookup table for string cell values
//   xl/worksheets/sheet1.xml — the data
//   docProps/core.xml     — last-modified date
// ---------------------------------------------------------------------------

/**
 * Download a URL (following up to 5 redirects) and return a Buffer.
 */
function download(url, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          if (redirectsLeft === 0) {
            reject(new Error('Too many redirects'));
            return;
          }
          download(res.headers.location, redirectsLeft - 1).then(
            resolve,
            reject
          );
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          return;
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      })
      .on('error', reject);
  });
}

/**
 * Minimal ZIP reader — finds and extracts a named entry from a ZIP buffer.
 * Returns a Buffer with the entry's decompressed content, or null if not found.
 *
 * Only supports DEFLATE (method 8) and stored (method 0) entries, which is
 * all that xlsx files use in practice.
 */
function extractZipEntry(buf, entryName) {
  let offset = 0;

  while (offset < buf.length - 4) {
    const sig = buf.readUInt32LE(offset);

    // Local file header signature
    if (sig !== 0x04034b50) {
      // Not a local file header — we've exhausted the local entries section
      break;
    }

    const method = buf.readUInt16LE(offset + 8);
    const compressedSize = buf.readUInt32LE(offset + 18);
    const fileNameLen = buf.readUInt16LE(offset + 26);
    const extraLen = buf.readUInt16LE(offset + 28);
    const fileName = buf
      .slice(offset + 30, offset + 30 + fileNameLen)
      .toString('utf8');
    const dataOffset = offset + 30 + fileNameLen + extraLen;

    if (fileName === entryName) {
      const compressed = buf.slice(dataOffset, dataOffset + compressedSize);
      if (method === 0) {
        return compressed; // stored, no compression
      } else if (method === 8) {
        return zlib.inflateRawSync(compressed);
      } else {
        throw new Error(`Unsupported ZIP compression method: ${method}`);
      }
    }

    offset = dataOffset + compressedSize;
  }

  return null;
}

/** Decode common XML entities in a string. */
function decodeXmlEntities(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

/**
 * Parse the xlsx shared strings table from xl/sharedStrings.xml.
 * Each shared string is an <si> element containing one or more <t> elements
 * (which may be self-closing: <t/> for empty string). We must iterate by <si>
 * rather than by <t> so that self-closing <t/> entries are counted correctly.
 */
function parseSharedStrings(xml) {
  const results = [];
  // Iterate over each <si>...</si> block
  const siRe = /<si>([\s\S]*?)<\/si>/g;
  let siMatch;
  while ((siMatch = siRe.exec(xml)) !== null) {
    const inner = siMatch[1];
    // Collect all <t> text content (handles self-closing <t/> and <t>text</t>)
    let text = '';
    const tRe = /<t(?:\s[^>]*)?\/>|<t(?:\s[^>]*)?>([^<]*)<\/t>/g;
    let tMatch;
    while ((tMatch = tRe.exec(inner)) !== null) {
      // tMatch[1] is undefined for self-closing <t/>
      text += tMatch[1] !== undefined ? decodeXmlEntities(tMatch[1]) : '';
    }
    results.push(text);
  }
  return results;
}

/**
 * Parse the xlsx buffer and return an array of row arrays (string values).
 *
 * Columns (0-indexed):
 *   0  DistrictCode   (numeric string, or blank for county sub-rows / sub-totals)
 *   1  CountyName     ("Sub Total" for the aggregated district row, blank for spacers)
 *   2  Democratic
 *   3  Republican
 *   4  Libertarian
 *   5  Green
 *   6  No Affiliation
 *   7  Other
 *   8  Total
 */
function parseXlsx(buf) {
  // --- Shared strings ---
  const ssXml = extractZipEntry(buf, 'xl/sharedStrings.xml').toString('utf8');
  const sharedStrings = parseSharedStrings(ssXml);

  // --- Worksheet ---
  const wsXml = extractZipEntry(buf, 'xl/worksheets/sheet1.xml').toString(
    'utf8'
  );

  // Extract all <row> elements then parse <c> children
  const rowMatches = [...wsXml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)];

  const rows = [];
  for (const rowMatch of rowMatches) {
    const rowContent = rowMatch[1];
    const cellMatches = [
      ...rowContent.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g),
    ];

    // Determine how many columns we need based on max column reference
    const cells = {};
    for (const cm of cellMatches) {
      const attrs = cm[1];
      const inner = cm[2];

      // Column reference like r="A1" -> "A"
      const rMatch = attrs.match(/\br="([A-Z]+)\d+"/);
      if (!rMatch) continue;
      const colRef = rMatch[1];
      // Convert column letters to 0-based index (A=0, B=1, …, Z=25, AA=26, …)
      let colIdx = 0;
      for (const ch of colRef) {
        colIdx = colIdx * 26 + (ch.charCodeAt(0) - 64);
      }
      colIdx -= 1; // make 0-based

      const tMatch = attrs.match(/\bt="([^"]+)"/);
      const cellType = tMatch ? tMatch[1] : '';

      const vMatch = inner.match(/<v>([^<]*)<\/v>/);
      const rawVal = vMatch ? vMatch[1] : '';

      let value = '';
      if (rawVal !== '') {
        if (cellType === 's') {
          // shared string index
          value = sharedStrings[parseInt(rawVal, 10)] || '';
        } else {
          value = rawVal;
        }
      }

      cells[colIdx] = value;
    }

    // Build flat array padded to 9 columns
    const row = [];
    for (let i = 0; i < 9; i++) {
      row.push(cells[i] !== undefined ? cells[i] : '');
    }
    rows.push(row);
  }

  return rows;
}

/**
 * Extract last-modified date from docProps/core.xml (ISO 8601 UTC string).
 * Returns a YYYY-MM-DD string or null.
 */
function parseAsOfDate(buf) {
  const coreXml = extractZipEntry(buf, 'docProps/core.xml');
  if (!coreXml) return null;
  const xml = coreXml.toString('utf8');
  const m = xml.match(/<dcterms:modified[^>]*>([^<]+)<\/dcterms:modified>/);
  return m ? m[1].slice(0, 10) : null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('Downloading PA House district voter registration stats…');
  const buf = await download(SOURCE_URL);
  console.log(`Downloaded ${buf.length.toLocaleString()} bytes`);

  const asOf = parseAsOfDate(buf);
  console.log(`File last modified: ${asOf}`);

  const rows = parseXlsx(buf);
  console.log(`Parsed ${rows.length} rows from worksheet`);

  // Skip header row (row 0: column labels) and state-total row.
  // Strategy: iterate rows; when we see a DistrictCode (numeric), start
  // accumulating county rows. When we see "Sub Total", store those aggregated
  // numbers for the district.  When there is only one county row per district
  // (no multi-county split), the Sub Total row still appears and holds the
  // same numbers — always use it.
  const districts = {};
  let currentDistrict = null;

  for (const row of rows) {
    const [code, label, dem, rep, lib, grn, noAff, other, total] = row;

    if (code && /^\d+$/.test(code.trim())) {
      currentDistrict = code.trim().padStart(3, '0');
      continue;
    }

    if (label === 'Sub Total' && currentDistrict) {
      const d = parseInt(dem, 10) || 0;
      const r = parseInt(rep, 10) || 0;
      const l = parseInt(lib, 10) || 0;
      const g = parseInt(grn, 10) || 0;
      const n = parseInt(noAff, 10) || 0;
      const o = parseInt(other, 10) || 0;
      const t = parseInt(total, 10) || 0;

      districts[currentDistrict] = {
        democrat: d,
        republican: r,
        // "other" bucket: Libertarian + Green + No Affiliation + Other
        other: l + g + n + o,
        total: t,
      };
      currentDistrict = null;
    }
  }

  const districtCount = Object.keys(districts).length;
  console.log(`Extracted data for ${districtCount} districts`);

  if (districtCount < 190) {
    throw new Error(
      `Only found ${districtCount} districts — expected ~203. Possible parse error.`
    );
  }

  const output = {
    as_of: asOf,
    source_url: SOURCE_URL,
    districts,
  };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
  console.log(`Wrote ${OUTPUT_PATH}`);

  // Print sample — a few well-known districts
  const samples = ['001', '050', '100', '150', '200', '203'];
  console.log('\nSample districts:');
  for (const d of samples) {
    if (districts[d]) {
      const { democrat: dem2, republican: rep2, other: other2, total: t2 } =
        districts[d];
      console.log(
        `  District ${d}: D=${dem2.toLocaleString()}  R=${rep2.toLocaleString()}  Other=${other2.toLocaleString()}  Total=${t2.toLocaleString()}`
      );
    }
  }
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
