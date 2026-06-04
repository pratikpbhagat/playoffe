# PLAYOFFE Load Tests

k6-based load tests for Phase 12.8. Run these against **staging** before promoting to production.

## Prerequisites

```bash
# Install k6 (macOS)
brew install k6

# Install k6 (Windows)
winget install k6

# Or download from https://k6.io/docs/get-started/installation/
```

## Setup

1. Log in to staging and grab your session cookie from browser DevTools:
   - Open `staging.playoffe.com`, log in as `alex@playoffe.dev`
   - DevTools → Application → Cookies → copy `sb-access-token` value

2. Get IDs from Supabase staging:
   - A `category_id` with 32 players registered and draw generated
   - A `match_id` with status `in_progress`
   - Your `club_id` (Blue Bird Club)
   - Your `tournament_id`

## Running Tests

```bash
# From repo root

# Test 1: Draw generation under load
k6 run \
  --env BASE_URL=https://staging.playoffe.com \
  --env COOKIE="sb-access-token=eyJ..." \
  --env CATEGORY_ID_1="your-category-uuid" \
  tests/load/draw-generation.js

# Test 2: Scoring concurrency (15 simultaneous referees)
k6 run \
  --env BASE_URL=https://staging.playoffe.com \
  --env COOKIE="sb-access-token=eyJ..." \
  --env MATCH_ID_1="uuid1" \
  --env MATCH_ID_2="uuid2" \
  --env MATCH_ID_3="uuid3" \
  tests/load/scoring-concurrency.js

# Test 3: Workers queue throughput
k6 run \
  --env BASE_URL=https://staging.playoffe.com \
  --env COOKIE="sb-access-token=eyJ..." \
  --env CLUB_ID="your-club-uuid" \
  --env TOURNAMENT_ID="your-tournament-uuid" \
  tests/load/workers-throughput.js
```

## Pass/Fail Thresholds

| Test | Metric | Threshold |
|---|---|---|
| Draw generation | p95 latency | < 3s |
| Draw generation | error rate | < 1% |
| Scoring | p95 latency | < 2s |
| Scoring | race condition conflicts | 0 |
| Workers | enqueue p95 | < 500ms |
| Workers | error rate | < 1% |

## Results

Results are written to `tests/load/results/` as JSON files after each run.
These are gitignored — don't commit them.
