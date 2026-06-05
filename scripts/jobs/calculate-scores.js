/**
 * Calculate Scores Job
 * ====================
 * Computes deterministic scores from evidence items using formulas from
 * the evaluation methodology. No LLM calls in this file.
 *
 * Uses:
 *   - Formula 6.1: Weighted principle score aggregation
 *   - Formula 6.2: Overall score (average across 9 PA Chamber principles)
 *   - Formula 6.3: Three-component confidence
 */

const fs = require('node:fs');
const path = require('node:path');

// Load .env.local when running scripts directly (not via Next.js)
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

// ============================================================
// CONSTANTS (mirrored from lib/utils/constants.ts for Node.js)
// ============================================================

const EVIDENCE_WEIGHTS = {
  floor_vote: 1,
  bill_sponsorship: 0.9,
  bill_cosponsorship: 0.7,
  committee_statement: 0.6,
  floor_speech: 0.5,
  press_release: 0.4,
  social_media: 0.2,
};

const TEMPORAL_DECAY_LAMBDA = 0.001;
const CONFIDENCE_TAU = 1.5;
const DIVERSITY_THRESHOLD = 2;

const VOTE_POSITION_MAP = {
  yea: 1,
  nay: -1,
  abstain: 0,
  not_voting: 0,
};

const CLAIM_SCORE_MAP = {
  'support,strong,false': 1,
  'support,strong,true': 0.85,
  'support,moderate,false': 0.8,
  'support,moderate,true': 0.7,
  'support,weak,false': 0.6,
  'support,weak,true': 0.6,
  'conditional,strong,false': 0.55,
  'conditional,strong,true': 0.55,
  'conditional,moderate,false': 0.55,
  'conditional,moderate,true': 0.55,
  'conditional,weak,false': 0.55,
  'conditional,weak,true': 0.55,
  'neutral,strong,false': 0.5,
  'neutral,strong,true': 0.5,
  'neutral,moderate,false': 0.5,
  'neutral,moderate,true': 0.5,
  'neutral,weak,false': 0.5,
  'neutral,weak,true': 0.5,
  'oppose,weak,false': 0.4,
  'oppose,weak,true': 0.4,
  'oppose,moderate,false': 0.25,
  'oppose,moderate,true': 0.25,
  'oppose,strong,false': 0,
  'oppose,strong,true': 0.05,
};

const PRINCIPLES = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9'];
const BILL_TYPES = new Set(['floor_vote', 'bill_sponsorship', 'bill_cosponsorship']);
const STATEMENT_TYPES = new Set(['committee_statement', 'floor_speech', 'press_release', 'social_media']);

// ============================================================
// SCORING FUNCTIONS (pure deterministic math)
// ============================================================

function computeDecay(sourceDate) {
  const daysDiff = (Date.now() - new Date(sourceDate).getTime()) / (1000 * 60 * 60 * 24);
  return Math.exp(-TEMPORAL_DECAY_LAMBDA * Math.max(0, daysDiff));
}

function scoreVoteItem(votePosition, yeaDirection) {
  const position = VOTE_POSITION_MAP[votePosition] ?? 0;
  return ((position * (yeaDirection ?? 0)) + 1) / 2;
}

function scoreSponsorshipItem(yeaDirection) {
  return ((yeaDirection ?? 0) + 1) / 2;
}

function scoreStatementClaims(claims) {
  if (!claims || claims.length === 0) return 0.5;
  const scores = claims.map((c) => {
    const key = `${c.stance},${c.strength},${c.is_hedged}`;
    return CLAIM_SCORE_MAP[key] ?? 0.5;
  });
  return scores.reduce((sum, s) => sum + s, 0) / scores.length;
}

function getItemConfidence(evidenceType, billDirConfidence, extractionConfidence) {
  if (evidenceType === 'floor_vote') return billDirConfidence ?? 1;
  if (BILL_TYPES.has(evidenceType)) return billDirConfidence ?? 0.9;
  return extractionConfidence ?? 0.7;
}

// ============================================================
// PER-ITEM SCORING HELPERS
// ============================================================

function scoreOneBillItem(item, principle, billClassMap) {
  const billClass = billClassMap.get(`${item.bill_id}:${principle}`);
  if (!billClass) return null;
  const score = item.evidence_type === 'floor_vote'
    ? scoreVoteItem(item.vote_position, billClass.yea_direction)
    : scoreSponsorshipItem(billClass.yea_direction);
  return { score, confidence: getItemConfidence(item.evidence_type, billClass.classification_confidence, null) };
}

function scoreOneStatementItem(item, principle, claimsByItemId) {
  const allClaims = claimsByItemId.get(item.id) || [];
  const claims = allClaims.filter((c) => (c.tagged_principles || []).includes(principle));
  const score = scoreStatementClaims(claims);
  const avgExtConf = claims.length > 0
    ? claims.reduce((sum, c) => sum + c.extraction_confidence, 0) / claims.length
    : 0.5;
  return { score, confidence: getItemConfidence(item.evidence_type, null, avgExtConf) };
}

function scorePrincipleItems(evidenceItems, principle, billClassMap, claimsByItemId) {
  const scoredItems = [];

  for (const item of evidenceItems) {
    if (!(item.tagged_principles || []).includes(principle)) continue;

    let result;
    if (BILL_TYPES.has(item.evidence_type)) {
      result = scoreOneBillItem(item, principle, billClassMap);
    } else if (STATEMENT_TYPES.has(item.evidence_type)) {
      result = scoreOneStatementItem(item, principle, claimsByItemId);
    }
    if (!result) continue;

    const weight = EVIDENCE_WEIGHTS[item.evidence_type] ?? 0.3;
    scoredItems.push({ score: result.score, weight, decay: computeDecay(item.source_date), confidence: result.confidence, type: item.evidence_type });
  }

  return scoredItems;
}

function computePrincipleStats(scoredItems) {
  let numerator = 0;
  let denominator = 0;
  for (const si of scoredItems) {
    const combinedWeight = si.weight * si.decay * si.confidence;
    numerator += si.score * combinedWeight;
    denominator += combinedWeight;
  }
  const principleScore = denominator > 0 ? numerator / denominator : 0.5;
  const effectiveSampleSize = denominator;

  const confEvidence = 1 - Math.exp(-effectiveSampleSize / CONFIDENCE_TAU);
  const uniqueTypes = new Set(scoredItems.map((si) => si.type)).size;
  const confDiversity = Math.min(1, uniqueTypes / DIVERSITY_THRESHOLD);
  const confAvg = scoredItems.length > 0
    ? scoredItems.reduce((sum, si) => sum + si.confidence, 0) / scoredItems.length
    : 0;

  return {
    score: principleScore,
    confEvidence, confDiversity, confAvg,
    confOverall: 0.4 * confEvidence + 0.3 * confDiversity + 0.3 * confAvg,
    numItems: scoredItems.length,
    numVotes: scoredItems.filter((si) => si.type === 'floor_vote').length,
    numSponsorships: scoredItems.filter((si) => BILL_TYPES.has(si.type) && si.type !== 'floor_vote').length,
    numStatements: scoredItems.filter((si) => STATEMENT_TYPES.has(si.type)).length,
    uniqueTypes, effectiveSample: effectiveSampleSize,
  };
}

// ============================================================
// OVERALL STATS
// ============================================================

function computeOverallStats(principleResults) {
  let scoreSum = 0;
  let confSum = 0;
  let totalItems = 0;
  let principlesWithData = 0;

  for (const p of PRINCIPLES) {
    const r = principleResults[p];
    scoreSum += r.score;
    confSum += r.confOverall;
    totalItems += r.numItems;
    if (r.numItems > 0) principlesWithData++;
  }

  const overallScore = scoreSum / PRINCIPLES.length;
  const coverageFactor = Math.sqrt(principlesWithData / PRINCIPLES.length);
  const avgPrincipleConf = principlesWithData > 0 ? confSum / principlesWithData : 0;
  return { overallScore, overallConfidence: avgPrincipleConf * coverageFactor, totalItems };
}

// ============================================================
// PER-POLITICIAN PROCESSING
// ============================================================

async function processPolitician(supabase, politician, billClassMap, claimsByItemId) {
  const { data: evidenceItems } = await supabase
    .from('evidence_items')
    .select('id, evidence_type, source_date, vote_position, bill_id, tagged_principles')
    .eq('politician_id', politician.id)
    .eq('is_relevant', true)
    .limit(5000);

  const items = evidenceItems || [];
  const principleResults = {};

  for (const principle of PRINCIPLES) {
    const scoredItems = scorePrincipleItems(items, principle, billClassMap, claimsByItemId);

    if (scoredItems.length === 0) {
      principleResults[principle] = {
        score: 0.5, confEvidence: 0, confDiversity: 0, confAvg: 0, confOverall: 0,
        numItems: 0, numVotes: 0, numSponsorships: 0, numStatements: 0,
        uniqueTypes: 0, effectiveSample: 0,
      };
      console.log(`  ${principle}: No data (50%)`);
      continue;
    }

    const stats = computePrincipleStats(scoredItems);
    principleResults[principle] = stats;

    const evidenceDates = items
      .filter((ei) => (ei.tagged_principles || []).includes(principle))
      .map((ei) => new Date(ei.source_date))
      .sort((a, b) => a - b);

    await supabase.from('principle_scores').upsert({
      politician_id: politician.id,
      principle,
      score: stats.score,
      confidence_evidence: stats.confEvidence,
      confidence_diversity: stats.confDiversity,
      confidence_avg_extraction: stats.confAvg,
      confidence_overall: stats.confOverall,
      num_evidence_items: stats.numItems,
      num_votes: stats.numVotes,
      num_sponsorships: stats.numSponsorships,
      num_statements: stats.numStatements,
      unique_source_types: stats.uniqueTypes,
      effective_sample_size: stats.effectiveSample,
      evidence_date_range_start: evidenceDates[0] || null,
      evidence_date_range_end: evidenceDates.at(-1) || null,
      computed_at: new Date().toISOString(),
    }, { onConflict: 'politician_id,principle' });

    console.log(`  ${principle}: ${(stats.score * 100).toFixed(0)}% (${stats.numItems} items, conf: ${(stats.confOverall * 100).toFixed(0)}%)`);
  }

  const { overallScore, overallConfidence, totalItems } = computeOverallStats(principleResults);
  const pr = principleResults;

  await supabase.from('overall_scores').upsert({
    politician_id: politician.id,
    overall_score: overallScore,
    overall_confidence: overallConfidence,
    p1_score: pr.P1.score, p1_confidence: pr.P1.confOverall,
    p2_score: pr.P2.score, p2_confidence: pr.P2.confOverall,
    p3_score: pr.P3.score, p3_confidence: pr.P3.confOverall,
    p4_score: pr.P4.score, p4_confidence: pr.P4.confOverall,
    p5_score: pr.P5.score, p5_confidence: pr.P5.confOverall,
    p6_score: pr.P6.score, p6_confidence: pr.P6.confOverall,
    p7_score: pr.P7.score, p7_confidence: pr.P7.confOverall,
    p8_score: pr.P8.score, p8_confidence: pr.P8.confOverall,
    p9_score: pr.P9.score, p9_confidence: pr.P9.confOverall,
    overall_rank: 0,
    party_rank: 0,
    total_evidence_items: totalItems,
    computed_at: new Date().toISOString(),
  }, { onConflict: 'politician_id' });

  console.log(`  Overall: ${(overallScore * 100).toFixed(0)}% (conf: ${(overallConfidence * 100).toFixed(0)}%)\n`);
}

// ============================================================
// RANKINGS (computed in JS — Supabase JS can't run window CTEs)
// ============================================================

async function updateRankings(supabase) {
  const { data: allScores } = await supabase
    .from('overall_scores')
    .select('id, overall_score, politicians(party)')
    .limit(500);

  const sorted = [...(allScores || [])].sort((a, b) => b.overall_score - a.overall_score);

  const partyGroups = {};
  for (const row of sorted) {
    const party = row.politicians?.party ?? 'I';
    if (!partyGroups[party]) partyGroups[party] = [];
    partyGroups[party].push(row);
  }

  const updates = sorted.map((row, idx) => {
    const party = row.politicians?.party ?? 'I';
    return { id: row.id, overall_rank: idx + 1, party_rank: partyGroups[party].indexOf(row) + 1 };
  });

  for (const u of updates) {
    await supabase.from('overall_scores').update({ overall_rank: u.overall_rank, party_rank: u.party_rank }).eq('id', u.id);
  }
}

// ============================================================
// MAIN
// ============================================================

async function calculateScores() {
  console.log('Calculating deterministic scores...\n');

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

  try {
    const { data: politicians } = await supabase
      .from('politicians')
      .select('id, full_name, party')
      .eq('is_active', true)
      .limit(500);

    console.log(`Found ${(politicians || []).length} politicians\n`);

    // Pre-load all bill classifications and claims to avoid per-politician DB round-trips
    const [{ data: allBillClasses }, { data: allClaims }] = await Promise.all([
      supabase.from('bill_classifications').select('bill_id, principle, yea_direction, classification_confidence').limit(100000),
      supabase.from('extracted_claims').select('evidence_item_id, stance, strength, is_hedged, extraction_confidence, tagged_principles').limit(100000),
    ]);

    const globalBillClassMap = new Map();
    for (const bc of allBillClasses || []) {
      globalBillClassMap.set(`${bc.bill_id}:${bc.principle}`, bc);
    }

    const globalClaimsByItemId = new Map();
    for (const claim of allClaims || []) {
      if (!globalClaimsByItemId.has(claim.evidence_item_id)) globalClaimsByItemId.set(claim.evidence_item_id, []);
      globalClaimsByItemId.get(claim.evidence_item_id).push(claim);
    }

    for (const politician of politicians || []) {
      console.log(`${politician.full_name} (${politician.party})`);
      await processPolitician(supabase, politician, globalBillClassMap, globalClaimsByItemId);
    }

    console.log('Calculating rankings...');
    await updateRankings(supabase);
    console.log('Rankings updated!\n');

    const { data: top5 } = await supabase
      .from('overall_scores')
      .select('overall_score, overall_confidence, overall_rank, politicians(full_name, party, district)')
      .order('overall_rank')
      .limit(5);

    console.log('Top 5 Representatives:');
    for (const row of top5 || []) {
      const p = row.politicians;
      console.log(`  ${row.overall_rank}. ${p.full_name} (${p.party}-HD${p.district}) — ${(row.overall_score * 100).toFixed(0)}% (conf: ${(row.overall_confidence * 100).toFixed(0)}%)`);
    }

    console.log('\nScores calculated!');
  } catch (error) {
    console.error('Job failed:', error);
    process.exit(1);
  }
}

calculateScores();
