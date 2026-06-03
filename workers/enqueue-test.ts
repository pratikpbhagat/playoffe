import 'dotenv/config';
import { podiumQueue } from './src/queue.js';

await podiumQueue.add('final-redesign', {
  type: 'draw_published',
  tournamentId: 'a1000000-0000-0000-0000-000000000001',
  clubId:       'c1000000-0000-0000-0000-000000000001',
  categoryId:   'b1000000-0000-0000-0000-000000000001',
  categoryName: "Men's Doubles Open",
  drawFormat:   'group_stage_knockout',
  participantCount: 32,
}, { jobId: `final-redesign-${Date.now()}` });
console.log('queued');
await podiumQueue.close();
