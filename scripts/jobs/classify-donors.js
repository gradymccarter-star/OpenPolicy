/**
 * Re-classify unknown donor organizations with expanded keyword patterns.
 * Safe to run multiple times — only touches orgs with lean='unknown'.
 *
 * Run: node scripts/jobs/classify-donors.js
 */

const fs = require('node:fs');
const path = require('node:path');
try {
  const envFile = fs.readFileSync(path.join(__dirname, '../../.env.local'), 'utf8');
  for (const line of envFile.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    if (!process.env[key]) process.env[key] = trimmed.slice(eqIdx + 1).trim();
  }
} catch (err) {
  if (err.code !== 'ENOENT') throw err;
}

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// ─── Expanded Classification Patterns ────────────────────────────────────────

const ANTI_CHAMBER_PATTERNS = [
  // Unions (P7: Labor conflict)
  /\bunion\b/i,
  /\bAFL[\s-]?CIO\b/i, /\bSEIU\b/i, /\bUFCW\b/i, /\bIBEW\b/i,
  /\bUAW\b/i, /\bUSW\b/i, /\bteamster/i, /\bamalgamated\b/i,
  /\bworkers[\s']*\s*united\b/i,
  /\blaborers\s+international\b/i,
  /\boperating\s+engineers\b/i,
  /\bplumbers\b.*\bpipefitters?\b/i, /\bsteamfitters\b/i,
  /\belectrical\s+workers\b/i, /\bAFSCME\b/i,
  /\bcarpenters?\s+(?:union|council|local|district)\b/i,
  /\biron\s*workers?\b/i,
  /\bsheet\s+metal\s+workers?\b/i,
  /\bbricklayer\b/i, /\bboilermakers?\b/i,
  /\bbuilding\s+(?:and\s+construction\s+)?trades?\b/i,
  /\btrades?\s+council\b/i,
  /\bcommunications?\s+workers?\s+of\s+america\b/i,
  /\bCWA\b.*\bLocal\b/i,
  /\bPSEA\b/i,
  /\bteachers?\s+(?:union|association|federation)\b/i,
  /\bfederation\s+of\s+teachers\b/i,
  /\bAFT\b.*\bLocal\b/i,
  /\bIBT\b.*\bLocal\b/i,
  /\bmachinists?\b.*\baerospace\b/i,
  /\bpainters?\s+(?:local|union|district\s+council)/i,
  // Trial Lawyers (P3: Civil Justice conflict)
  /\btrial\s+lawyers?\b/i,
  /\bassociation\s+for\s+justice\b/i,
  /\bAAJ\b/, /\bPATLA\b/,
  /\bPennsylvania\s+Association\s+for\s+Justice\b/i,
  // Environment (P6: Energy conflict)
  /\bsierra\s+club\b/i,
  /\benvironment(?:al)?\s+(?:action|defense|fund|council)\b/i,
  /\bclimate\s+(?:action|coalition|reality)\b/i,
  /\bclean\s+air\s+(?:action|council)\b/i,
  // Progressive advocacy
  /\bworking\s+families\b/i,
];

const PRO_CHAMBER_PATTERNS = [
  // Chambers & core business groups
  /\bchamber\s+of\s+commerce\b/i,
  /\bNFIB\b/,
  /\bnational\s+fed(?:eration)?\s+of\s+independent\s+business\b/i,
  /\bBusiness\s+(?:Council|Roundtable|Association|League)\b/i,
  /\bRetail\s+(?:Merchants?|Federation|Assoc)\b/i,
  /\bRestaurant\s+Association\b/i,
  /\bHospitality\b.*\bAssociation\b/i,
  // Manufacturing
  /\bmanufactur(?:ers?|ing)\s+(?:assoc|council|alliance|fed)\b/i,
  /\bPAMFG\b/,
  /\bnational\s+assoc\w*\s+of\s+manufacturers?\b/i,
  /\bchemical\s+(?:industry|council|assoc)\b/i,
  // Real estate
  /\bNAR\b/,
  /\bRealtors?\s+(?:Assoc|Association|PAC|political)\b/i,
  /\bPA\b.*\bRealtors?\b/i, /\bRealtors?\b.*\bPA\b/i,
  /\bHomebuilders?\b/i, /\bNAHB\b/,
  /\bbuilders?\s+assoc(?:iation)?\b/i,
  /\breal\s+estate\b.*\bassoc\b/i,
  /\bproperty\s+(?:owners?|managers?)\b.*\bassoc\b/i,
  /\btitle\s+(?:assoc|insurance)\b/i,
  /\bmortgage\s+(?:assoc|bankers?)\b/i,
  // Finance & Insurance
  /\bBankers?\s+Assoc/i,
  /\binsurance\s+(?:assoc|council|alliance|fed(?:eration)?)\b/i,
  /\bfinancial\s+(?:services?|institutions?)\s+(?:assoc|forum|roundtable)\b/i,
  /\bsavings\s+(?:assoc|institution)\b/i,
  /\bPA\s+Bankers\b/i,
  /\bPA\s+Insurance\b/i,
  // Healthcare & Medical (P9: cost alignment)
  /\bphysicians?\s+(?:assoc|society|pac)\b/i,
  /\bmedical\s+(?:society|assoc|association)\b/i,
  /\bhospital\s+(?:assoc|association)\b/i,
  /\bhealth\s+(?:systems?\s+assoc|facilities?\s+assoc)\b/i,
  /\bdental\s+assoc/i, /\bdentists?\s+(?:assoc|society)\b/i,
  /\bpharmac(?:y|ists?|eutical)\s+(?:assoc|society|pac)\b/i,
  /\bveterinar\w+\s+(?:assoc|society)\b/i,
  // Agriculture
  /\bfarm\s+bureau\b/i,
  /\bagriculture\b.*\bassoc\b/i, /\bagriculture\b.*\bcouncil\b/i,
  /\bPA\b.*\bfarm\b.*\bassoc\b/i,
  /\bgrange\b/i,
  /\bmushroom\s+(?:council|assoc|growers?)\b/i,
  /\bpoultry\s+(?:assoc|fed)\b/i,
  /\bdairy\s+(?:assoc|farmers?)\b/i,
  // Energy & Utilities
  /\bpetroleum\s+(?:assoc|council)\b/i,
  /\boil\s*(?:&|and)\s*gas\b.*\bassoc\b/i,
  /\bcoal\s+(?:assoc|alliance|operators?)\b/i,
  /\belectric(?:ity)?\s+assoc\b/i,
  /\butility\s+(?:assoc|contractors?)\b/i,
  // Construction & Contractors
  /\bgeneral\s+contractors?\s+(?:assoc|of)\b/i,
  /\bcontractors?\s+assoc/i,
  /\bconstruction\s+(?:assoc|industry)\b/i,
  /\bspecialty\s+contractors?\b/i,
  /\bmechanical\s+contractors?\s+assoc\b/i,
  // Trucking & Transportation
  /\btrucking\s+assoc/i,
  /\bmotor\s+(?:carriers?|transport)\b.*\bassoc\b/i,
  /\bauto(?:mobile|motive)?\s*dealers?\b.*\bassoc\b/i,
  // Technology & Professional
  /\btechnology\s+(?:council|assoc|alliance)\b/i,
  /\btech(?:nology)?\s+(?:council|alliance|leadership)\b/i,
  /\baccountant\b.*\bassoc\b/i, /\bCPA\s+(?:society|assoc)\b/i,
  /\bPA\s+Institute\s+of\s+(?:CPAs?|Certified\s+Public\s+Accountants?)\b/i,
  /\bconsulting\s+engineers?\b/i,
  /\bwholesale\b.*\bassoc\b/i, /\bdistributors?\s+assoc\b/i,
  /\bbeverage\s+(?:assoc|industry)\b/i,
  /\bbrewers?\s+(?:assoc|guild)\b/i,
  /\bcosmetolog\b/i, /\bbeauty\b.*\bassoc\b/i,
  /\btimber\b.*\bassoc\b/i, /\bforest(?:ry|ers?)?\s+assoc\b/i,
  /\bmining\b.*\bassoc\b/i,
  /\bquarry\b.*\bassoc\b/i,
  /\bprinting\b.*\bassoc\b/i,
  /\bgraphic\s+(?:arts?|communications?)\b.*\bassoc\b/i,
  // PAC signals
  /\bfree\s+enterprise\b/i,
  /\bgrowth\s+pac\b/i,
];

function classifyLean(name) {
  for (const re of ANTI_CHAMBER_PATTERNS) {
    if (re.test(name)) return { lean: 'anti_chamber', pattern: re.toString().slice(1, 60) };
  }
  for (const re of PRO_CHAMBER_PATTERNS) {
    if (re.test(name)) return { lean: 'pro_chamber', pattern: re.toString().slice(1, 60) };
  }
  return null;
}

async function run() {
  console.log('=== Donor Organization Re-Classifier ===\n');

  const { data: unknowns, error } = await supabase
    .from('donor_organizations')
    .select('id, name')
    .eq('lean', 'unknown')
    .order('name');

  if (error) { console.error('Failed to fetch unknowns:', error.message); return; }
  console.log(`${unknowns.length} unclassified donor organizations\n`);

  const updates = [];
  for (const org of unknowns) {
    const result = classifyLean(org.name);
    if (result) updates.push({ id: org.id, name: org.name, ...result });
  }

  const proUpdates = updates.filter(u => u.lean === 'pro_chamber');
  const antiUpdates = updates.filter(u => u.lean === 'anti_chamber');
  const stillUnknown = unknowns.length - updates.length;

  console.log(`Results:`);
  console.log(`  Pro-chamber:   ${proUpdates.length}`);
  console.log(`  Anti-chamber:  ${antiUpdates.length}`);
  console.log(`  Still unknown: ${stillUnknown}`);

  if (updates.length === 0) { console.log('\nNo new classifications found.'); return; }

  console.log('\nPro-chamber newly classified:');
  for (const u of proUpdates) console.log(`  + ${u.name}`);
  console.log('\nAnti-chamber newly classified:');
  for (const u of antiUpdates) console.log(`  - ${u.name}`);

  console.log(`\nApplying ${updates.length} updates...`);
  let ok = 0; let fail = 0;
  for (const u of updates) {
    const { error: err } = await supabase
      .from('donor_organizations')
      .update({ lean: u.lean, lean_rationale: `keyword: ${u.pattern}`, lean_classified_by: 'rule' })
      .eq('id', u.id);
    if (err) { console.error(`  FAIL: ${u.name}:`, err.message); fail++; } else ok++;
  }
  console.log(`\nDone: ${ok} updated, ${fail} failed`);
}

run().catch(console.error);
