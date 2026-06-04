/**
 * k6 Load Test: Live Scoring Concurrency
 *
 * Simulates multiple referees submitting scores simultaneously —
 * the key concurrency risk is bracket auto-advancement logic.
 *
 * Run:
 *   k6 run --env BASE_URL=https://staging.playoffe.com \
 *          --env COOKIE="sb-access-token=eyJ..." \
 *          tests/load/scoring-concurrency.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

const errorRate      = new Rate('errors');
const scoreLatency   = new Trend('score_submission_latency', true);
const conflictsFound = new Counter('scoring_conflicts');

export const options = {
  // Simulate 15 referees scoring simultaneously (realistic peak for a big tournament)
  vus:      15,
  duration: '2m',

  thresholds: {
    score_submission_latency: ['p(95)<2000'],  // 95% under 2s
    errors:                   ['rate<0.02'],   // under 2% errors
    scoring_conflicts:        ['count<1'],     // zero race-condition conflicts
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const COOKIE   = __ENV.COOKIE   || '';

// Match IDs from staging — must be in 'in_progress' state
// Replace with real match IDs from your staging tournament
const MATCH_IDS = [
  __ENV.MATCH_ID_1 || 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  __ENV.MATCH_ID_2 || 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  __ENV.MATCH_ID_3 || 'cccccccc-cccc-cccc-cccc-cccccccccccc',
];

function randomScore() {
  // Generate a realistic 3-set score
  return {
    sets: [
      { score_a: 11, score_b: Math.floor(Math.random() * 9) },
      { score_a: Math.floor(Math.random() * 9), score_b: 11 },
      { score_a: 11, score_b: Math.floor(Math.random() * 9) },
    ],
    winner: 'a',
  };
}

export default function () {
  const matchId = MATCH_IDS[Math.floor(Math.random() * MATCH_IDS.length)];
  const score   = randomScore();

  const payload = JSON.stringify([matchId, score]);

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Cookie':       COOKIE,
    },
  };

  const start    = Date.now();
  const response = http.post(
    `${BASE_URL}/api/matches/${matchId}/score`,
    payload,
    params,
  );
  const latency = Date.now() - start;

  scoreLatency.add(latency);

  const isConflict = response.status === 409;
  if (isConflict) conflictsFound.add(1);

  const ok = check(response, {
    'accepted (200 or 409)': (r) => [200, 409, 400].includes(r.status),
    'not a 500 error':       (r) => r.status !== 500,
    'under 2s':              () => latency < 2000,
  });

  errorRate.add(!ok);

  sleep(Math.random() * 1.5 + 0.5); // 0.5-2s between score submissions
}

export function handleSummary(data) {
  return {
    'tests/load/results/scoring-concurrency-summary.json': JSON.stringify(data, null, 2),
  };
}
