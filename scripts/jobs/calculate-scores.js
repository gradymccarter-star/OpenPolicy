/**
 * Calculate Scores Job
 * ====================
 * Computes deterministic scores from evidence items using formulas from
 * the evaluation methodology. No LLM calls in this file.
 *
 * Uses:
 *   - Formula 6.1: Weighted principle score aggregation
 *   - Formula 6.2: Overall score (average of 5 principles)
 *   - Formula 6.3: Three-component confidence
 */

const postgres = require('postgres');

// ============================================================
// CONSTANTS (mirrored from lib/utils/constants.ts for Node.js)
// ============================================================

const EVIDENCE_WEIGHTS = {
  floor_vote: 1.0,
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
  'support,strong,false': 1.0,
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
  'oppose,strong,false': 0.0,
  'oppose,strong,true': 0.05,
};

const PRINCIPLES = ['P1', 'P2', 'P3', 'P4', 'P5'];
const BILL_TYPES = ['floor_vote', 'bill_sponsorship', 'bill_cosponsorship'];
const STATEMENT_TYPES = ['committee_statement', 'floor_speech', 'press_release', 'social_media'];

// ============================================================
// SCORING FUNCTIONS (pure deterministic math)
// ============================================================

function computeDecay(sourceDate) {
  const now = new Date();
  const daysDiff = (now.getTime() - new Date(sourceDate).getTime()) / (1000 * 60 * 60 * 24);
  return Math.exp(-TEMPORAL_DECAY_LAMBDA * Math.max(0, daysDiff));
}

function scoreVoteItem(votePosition, yeaDirection) {
  const position = VOTE_POSITION_MAP[votePosition] ?? 0;
  const direction = yeaDirection ?? 0;
  return (position * direction + 1) / 2;
}

function scoreSponsorshipItem(yeaDirection) {
  const direction = yeaDirection ?? 0;
  return (1 * direction + 1) / 2;
}

function scoreStatementClaims(claims) {
  if (!claims || claims.length === 0) return 0.5;

  const scores = claims.map(c => {
    const key = `${c.stance},${c.strength},${c.is_hedged}`;
    return CLAIM_SCORE_MAP[key] ?? 0.5;
  });

  return scores.reduce((sum, s) => sum + s, 0) / scores.length;
}

function getItemConfidence(evidenceType, billDirConfidence, extractionConfidence) {
  if (evidenceType === 'floor_vote') return billDirConfidence ?? 1.0;
  if (evidenceType === 'bill_sponsorship' || evidenceType === 'bill_cosponsorship') return billDirConfidence ?? 0.9;
  return extractionConfidence ?? 0.7;
}

// ============================================================
// MAIN
// ============================================================

async function calculateScores() {
  console.log('Calculating deterministic scores...\n');

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }

  const sql = postgres(databaseUrl, { ssl: 'require', prepare: false });

  try {
    const politicians = await sql`
      SELECT id, full_name, party
      FROM politicians
      WHERE is_active = true
    `;

    console.log(`Found ${politicians.length} politicians\n`);

    for (const politician of politicians) {
      console.log(`${politician.full_name} (${politician.party})`);

      const principleResults = {};

      for (const principle of PRINCIPLES) {
        // Gather all relevant evidence tagged with this principle
        const evidenceItems = await sql`
          SELECT ei.id, ei.evidence_type, ei.source_date, ei.vote_position, ei.bill_id
          FROM evidence_items ei
          WHERE ei.politician_id = ${politician.id}
            AND ei.is_relevant = true
            AND ${principle} = ANY(ei.tagged_principles)
        `;

        if (evidenceItems.length === 0) {
          principleResults[principle] = {
            score: 0.5, confEvidence: 0, confDiversity: 0, confAvg: 0, confOverall: 0,
            numItems: 0, numVotes: 0, numSponsorships: 0, numStatements: 0,
            uniqueTypes: 0, effectiveSample: 0,
          };
          console.log(`  ${principle}: No data (0.50)`);
          continue;
        }

        // Score each item
        const scoredItems = [];

        for (const item of evidenceItems) {
          let score, confidence;

          if (BILL_TYPES.includes(item.evidence_type)) {
            // Get bill direction from cache
            const [billClass] = await sql`
              SELECT yea_direction, classification_confidence
              FROM bill_classifications
              WHERE bill_id = ${item.bill_id} AND principle = ${principle}
              LIMIT 1
            `;

            if (!billClass) {
              continue; // Skip if no classification
            }

            if (item.evidence_type === 'floor_vote') {
              score = scoreVoteItem(item.vote_position, billClass.yea_direction);
            } else {
              score = scoreSponsorshipItem(billClass.yea_direction);
            }
            confidence = getItemConfidence(item.evidence_type, billClass.classification_confidence, null);

          } else if (STATEMENT_TYPES.includes(item.evidence_type)) {
            // Get extracted claims
            const claims = await sql`
              SELECT stance, strength, is_hedged, extraction_confidence
              FROM extracted_claims
              WHERE evidence_item_id = ${item.id}
                AND ${principle} = ANY(tagged_principles)
            `;

            score = scoreStatementClaims(claims);
            const avgExtConf = claims.length > 0
              ? claims.reduce((sum, c) => sum + c.extraction_confidence, 0) / claims.length
              : 0.5;
            confidence = getItemConfidence(item.evidence_type, null, avgExtConf);
          } else {
            continue;
          }

          const weight = EVIDENCE_WEIGHTS[item.evidence_type] ?? 0.3;
          const decay = computeDecay(item.source_date);

          scoredItems.push({ score, weight, decay, confidence, type: item.evidence_type });
        }

        // --- Formula 6.1: Weighted aggregation ---
        let numerator = 0;
        let denominator = 0;

        for (const si of scoredItems) {
          const combinedWeight = si.weight * si.decay * si.confidence;
          numerator += si.score * combinedWeight;
          denominator += combinedWeight;
        }

        const principleScore = denominator > 0 ? numerator / denominator : 0.5;
        const effectiveSampleSize = denominator;

        // --- Formula 6.3: Confidence ---
        const confEvidence = 1 - Math.exp(-effectiveSampleSize / CONFIDENCE_TAU);
        const uniqueTypes = new Set(scoredItems.map(si => si.type)).size;
        const confDiversity = Math.min(1, uniqueTypes / DIVERSITY_THRESHOLD);
        const confAvg = scoredItems.length > 0
          ? scoredItems.reduce((sum, si) => sum + si.confidence, 0) / scoredItems.length
          : 0;
        const confOverall = 0.4 * confEvidence + 0.3 * confDiversity + 0.3 * confAvg;

        // Count types
        const numVotes = scoredItems.filter(si => si.type === 'floor_vote').length;
        const numSponsorships = scoredItems.filter(si =>
          si.type === 'bill_sponsorship' || si.type === 'bill_cosponsorship'
        ).length;
        const numStatements = scoredItems.filter(si => STATEMENT_TYPES.includes(si.type)).length;

        // Get date range
        const dates = evidenceItems.map(ei => new Date(ei.source_date)).sort((a, b) => a - b);

        principleResults[principle] = {
          score: principleScore,
          confEvidence, confDiversity, confAvg, confOverall,
          numItems: scoredItems.length, numVotes, numSponsorships, numStatements,
          uniqueTypes, effectiveSample: effectiveSampleSize,
          dateStart: dates[0], dateEnd: dates[dates.length - 1],
        };

        // Upsert principle score
        await sql`
          INSERT INTO principle_scores (
            politician_id, principle, score,
            confidence_evidence, confidence_diversity, confidence_avg_extraction, confidence_overall,
            num_evidence_items, num_votes, num_sponsorships, num_statements,
            unique_source_types, effective_sample_size,
            evidence_date_range_start, evidence_date_range_end,
            computed_at
          ) VALUES (
            ${politician.id}, ${principle}, ${principleScore},
            ${confEvidence}, ${confDiversity}, ${confAvg}, ${confOverall},
            ${scoredItems.length}, ${numVotes}, ${numSponsorships}, ${numStatements},
            ${uniqueTypes}, ${effectiveSampleSize},
            ${dates[0] || null}, ${dates[dates.length - 1] || null},
            NOW()
          )
          ON CONFLICT (politician_id, principle)
          DO UPDATE SET
            score = EXCLUDED.score,
            confidence_evidence = EXCLUDED.confidence_evidence,
            confidence_diversity = EXCLUDED.confidence_diversity,
            confidence_avg_extraction = EXCLUDED.confidence_avg_extraction,
            confidence_overall = EXCLUDED.confidence_overall,
            num_evidence_items = EXCLUDED.num_evidence_items,
            num_votes = EXCLUDED.num_votes,
            num_sponsorships = EXCLUDED.num_sponsorships,
            num_statements = EXCLUDED.num_statements,
            unique_source_types = EXCLUDED.unique_source_types,
            effective_sample_size = EXCLUDED.effective_sample_size,
            evidence_date_range_start = EXCLUDED.evidence_date_range_start,
            evidence_date_range_end = EXCLUDED.evidence_date_range_end,
            computed_at = NOW()
        `;

        console.log(`  ${principle}: ${(principleScore * 100).toFixed(0)}% (${scoredItems.length} items, conf: ${(confOverall * 100).toFixed(0)}%)`);
      }

      // --- Formula 6.2: Overall score ---
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

      const overallScore = scoreSum / 5;
      // Average confidence across principles with data, scaled by coverage
      const coverageFactor = Math.sqrt(principlesWithData / 5);
      const avgPrincipleConf = principlesWithData > 0 ? confSum / principlesWithData : 0;
      const overallConfidence = avgPrincipleConf * coverageFactor;

      await sql`
        INSERT INTO overall_scores (
          politician_id, overall_score, overall_confidence,
          p1_score, p1_confidence, p2_score, p2_confidence,
          p3_score, p3_confidence, p4_score, p4_confidence,
          p5_score, p5_confidence,
          overall_rank, party_rank,
          total_evidence_items, computed_at
        ) VALUES (
          ${politician.id}, ${overallScore}, ${overallConfidence},
          ${principleResults.P1.score}, ${principleResults.P1.confOverall},
          ${principleResults.P2.score}, ${principleResults.P2.confOverall},
          ${principleResults.P3.score}, ${principleResults.P3.confOverall},
          ${principleResults.P4.score}, ${principleResults.P4.confOverall},
          ${principleResults.P5.score}, ${principleResults.P5.confOverall},
          0, 0,
          ${totalItems}, NOW()
        )
        ON CONFLICT (politician_id)
        DO UPDATE SET
          overall_score = EXCLUDED.overall_score,
          overall_confidence = EXCLUDED.overall_confidence,
          p1_score = EXCLUDED.p1_score, p1_confidence = EXCLUDED.p1_confidence,
          p2_score = EXCLUDED.p2_score, p2_confidence = EXCLUDED.p2_confidence,
          p3_score = EXCLUDED.p3_score, p3_confidence = EXCLUDED.p3_confidence,
          p4_score = EXCLUDED.p4_score, p4_confidence = EXCLUDED.p4_confidence,
          p5_score = EXCLUDED.p5_score, p5_confidence = EXCLUDED.p5_confidence,
          total_evidence_items = EXCLUDED.total_evidence_items,
          computed_at = NOW()
      `;

      console.log(`  Overall: ${(overallScore * 100).toFixed(0)}% (conf: ${(overallConfidence * 100).toFixed(0)}%)\n`);
    }

    // ========== RANKINGS ==========
    console.log('Calculating rankings...');

    await sql`
      WITH ranked AS (
        SELECT politician_id, ROW_NUMBER() OVER (ORDER BY overall_score DESC) as rank
        FROM overall_scores
      )
      UPDATE overall_scores os
      SET overall_rank = r.rank
      FROM ranked r
      WHERE os.politician_id = r.politician_id
    `;

    await sql`
      WITH ranked AS (
        SELECT os.politician_id, ROW_NUMBER() OVER (
          PARTITION BY p.party ORDER BY os.overall_score DESC
        ) as rank
        FROM overall_scores os
        JOIN politicians p ON os.politician_id = p.id
      )
      UPDATE overall_scores os
      SET party_rank = r.rank
      FROM ranked r
      WHERE os.politician_id = r.politician_id
    `;

    console.log('Rankings updated!\n');

    // Show top 5
    const topPoliticians = await sql`
      SELECT p.full_name, p.party, p.state, os.overall_score, os.overall_confidence, os.overall_rank
      FROM overall_scores os
      JOIN politicians p ON os.politician_id = p.id
      ORDER BY os.overall_rank
      LIMIT 5
    `;

    console.log('Top 5 Politicians:');
    topPoliticians.forEach(p => {
      console.log(`  ${p.overall_rank}. ${p.full_name} (${p.party}-${p.state}) - ${(p.overall_score * 100).toFixed(0)}% (conf: ${(p.overall_confidence * 100).toFixed(0)}%)`);
    });

    console.log('\nScores calculated!');

  } catch (error) {
    console.error('Job failed:', error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

calculateScores();
