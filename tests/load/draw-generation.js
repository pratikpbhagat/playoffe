/**
 * k6 Load Test: Draw Generation
 *
 * Tests concurrent draw generation for a tournament with 32 players.
 * This is the most CPU-intensive server action in the app.
 *
 * Run:
 *   k6 run --env BASE_URL=https://staging.playoffe.com \
 *          --env COOKIE="sb-access-token=eyJ..." \
 *          tests/load/draw-generation.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const errorRate   = new Rate('errors');
const drawLatency = new Trend('draw_generation_latency', true);

export const options = {
  stages: [
    { duration: '30s', target: 5  },  // ramp up to 5 concurrent users
    { duration: '60s', target: 10 },  // hold at 10
    { duration: '30s', target: 20 },  // spike to 20
    { duration: '30s', target: 0  },  // ramp down
  ],
  thresholds: {
    // 95% of draw generations must complete in under 3 seconds
    draw_generation_latency: ['p(95)<3000'],
    // Error rate must stay below 1%
    errors: ['rate<0.01'],
    http_req_failed: ['rate<0.01'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const COOKIE   = __ENV.COOKIE   || '';

// Category IDs pre-seeded in the staging DB with 32 players each.
// Replace these with real category IDs from your staging Supabase.
const CATEGORY_IDS = [
  __ENV.CATEGORY_ID_1 || 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
  __ENV.CATEGORY_ID_2 || 'yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy',
];

export default function () {
  const categoryId = CATEGORY_IDS[Math.floor(Math.random() * CATEGORY_IDS.length)];

  const payload = JSON.stringify([
    '1',                     // action ID (Next.js server action bound arg index)
    [categoryId, 'single_elimination', true],
  ]);

  const params = {
    headers: {
      'Content-Type':   'application/json',
      'Next-Action':    '1',  // replace with actual Next.js action hash
      'Cookie':         COOKIE,
    },
  };

  const start    = Date.now();
  const response = http.post(`${BASE_URL}/tournaments/[id]/draws`, payload, params);
  const latency  = Date.now() - start;

  drawLatency.add(latency);

  const ok = check(response, {
    'status 200':              (r) => r.status === 200,
    'no error in body':        (r) => !r.body?.includes('"error"'),
    'completes under 5s':      () => latency < 5000,
  });

  errorRate.add(!ok);

  sleep(Math.random() * 2 + 1); // 1-3s think time between requests
}

export function handleSummary(data) {
  return {
    'tests/load/results/draw-generation-summary.json': JSON.stringify(data, null, 2),
  };
}
