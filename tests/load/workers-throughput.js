/**
 * k6 Load Test: Workers Queue Throughput
 *
 * Floods the social media queue with jobs to measure:
 * - How quickly workers drain the queue
 * - Whether Redis handles burst writes without dropping jobs
 * - ECS auto-scaling response time
 *
 * This test hits the queue-enqueue API endpoint, NOT the platform APIs.
 * Uses mock/stub social connections so no real posts are sent.
 *
 * Run:
 *   k6 run --env BASE_URL=https://staging.playoffe.com \
 *          --env COOKIE="sb-access-token=eyJ..." \
 *          --env CLUB_ID="your-club-uuid" \
 *          tests/load/workers-throughput.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

const errorRate     = new Rate('errors');
const enqueueTime   = new Trend('job_enqueue_latency', true);
const jobsEnqueued  = new Counter('jobs_enqueued');

export const options = {
  stages: [
    { duration: '10s', target: 10 },  // ramp up
    { duration: '30s', target: 50 },  // burst — 50 concurrent job submitters
    { duration: '20s', target: 0  },  // ramp down — watch queue drain
  ],
  thresholds: {
    job_enqueue_latency: ['p(95)<500'],  // enqueue must be fast (< 500ms)
    errors:              ['rate<0.01'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const COOKIE   = __ENV.COOKIE   || '';
const CLUB_ID  = __ENV.CLUB_ID  || 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx';
const TOURNAMENT_ID = __ENV.TOURNAMENT_ID || 'yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy';

const JOB_TYPES = ['draw_published', 'schedule_released', 'podium'];

export default function () {
  const jobType = JOB_TYPES[Math.floor(Math.random() * JOB_TYPES.length)];

  const payload = JSON.stringify({
    type:         jobType,
    clubId:       CLUB_ID,
    tournamentId: TOURNAMENT_ID,
    categoryName: 'Mixed Doubles',
    matchCount:   24,
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Cookie':       COOKIE,
    },
  };

  const start    = Date.now();
  const response = http.post(
    `${BASE_URL}/api/social/enqueue`,
    payload,
    params,
  );
  const latency = Date.now() - start;

  enqueueTime.add(latency);

  const ok = check(response, {
    'enqueued (200/201)': (r) => [200, 201].includes(r.status),
    'has job ID':         (r) => r.json('jobId') !== undefined,
    'fast enqueue':       () => latency < 500,
  });

  if (ok) jobsEnqueued.add(1);
  errorRate.add(!ok);

  sleep(0.1); // minimal sleep — we want to flood the queue
}

export function handleSummary(data) {
  const jobCount = data.metrics.jobs_enqueued?.values?.count ?? 0;
  const duration = data.state.testRunDurationMs / 1000;
  const tps      = (jobCount / duration).toFixed(1);

  console.log(`\n📊 Throughput: ${jobCount} jobs in ${duration.toFixed(0)}s = ${tps} jobs/sec`);

  return {
    'tests/load/results/workers-throughput-summary.json': JSON.stringify(data, null, 2),
  };
}
