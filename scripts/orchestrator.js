/**
 * Pipeline Orchestrator
 * Runs the full data pipeline sequentially:
 *   1. fetch-politicians (critical)
 *   2. fetch-voting-records (non-critical)
 *   3. fetch-sponsorships (non-critical)
 *   4. fetch-statements (non-critical)
 *   5. download-photos (non-critical)
 *   6. analyze-statements (critical)
 *   7. calculate-scores (critical)
 */

const { spawn } = require('child_process');
const path = require('path');

const JOBS_DIR = path.join(__dirname, 'jobs');

const PIPELINE = [
  { script: 'fetch-politicians.js', critical: true },
  { script: 'fetch-voting-records.js', critical: false },
  { script: 'fetch-sponsorships.js', critical: false },
  { script: 'fetch-statements.js', critical: false },
  { script: 'fetch-floor-speeches.js', critical: false },
  { script: 'fetch-bluesky.js', critical: false },
  { script: 'fetch-youtube.js', critical: false },
  { script: 'download-photos.js', critical: false },
  { script: 'analyze-statements.js', critical: true },
  { script: 'calculate-scores.js', critical: true },
];

function runJob(scriptName) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(JOBS_DIR, scriptName);
    const child = spawn('node', [scriptPath], {
      stdio: 'inherit',
      env: process.env,
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true });
      } else {
        reject(new Error(`${scriptName} exited with code ${code}`));
      }
    });

    child.on('error', (err) => {
      reject(new Error(`Failed to start ${scriptName}: ${err.message}`));
    });
  });
}

async function runPipeline() {
  console.log('='.repeat(60));
  console.log('  OpenPolicy AI - Full Pipeline');
  console.log('='.repeat(60));

  const startTime = Date.now();
  const results = [];

  for (const job of PIPELINE) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`  Running: ${job.script} ${job.critical ? '(critical)' : '(non-critical)'}`);
    console.log(`${'─'.repeat(60)}\n`);

    const jobStart = Date.now();

    try {
      await runJob(job.script);
      const elapsed = ((Date.now() - jobStart) / 1000).toFixed(1);
      results.push({ script: job.script, status: 'success', elapsed });
      console.log(`\n  [OK] ${job.script} completed in ${elapsed}s`);
    } catch (error) {
      const elapsed = ((Date.now() - jobStart) / 1000).toFixed(1);
      results.push({
        script: job.script,
        status: 'failed',
        elapsed,
        error: error.message,
      });
      console.error(`\n  [FAIL] ${job.script} failed after ${elapsed}s: ${error.message}`);

      if (job.critical) {
        console.error(`\n  Pipeline stopped: critical job "${job.script}" failed.`);
        break;
      } else {
        console.log(`  Continuing (non-critical)...`);
      }
    }
  }

  const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(`\n${'='.repeat(60)}`);
  console.log('  Pipeline Summary');
  console.log(`${'='.repeat(60)}`);

  for (const r of results) {
    const icon = r.status === 'success' ? '+' : 'x';
    console.log(`  ${icon} ${r.script.padEnd(30)} ${r.status.padEnd(10)} ${r.elapsed}s`);
  }

  console.log(`\n  Total time: ${totalElapsed}s`);

  const failed = results.filter((r) => r.status === 'failed');
  if (failed.length > 0) {
    console.log(`  Failed jobs: ${failed.length}`);
    process.exit(1);
  } else {
    console.log(`  All jobs completed successfully.`);
  }
}

runPipeline();
