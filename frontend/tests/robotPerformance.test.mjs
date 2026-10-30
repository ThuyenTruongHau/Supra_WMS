import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildRobotSpeedSeries, robotReportRange, robotReportShouldPoll, robotReportToday,
} from '../src/utils/robotPerformance.ts';

test('date presets and polling use Vietnam calendar across month and UTC day boundaries', () => {
  const now = new Date('2026-10-31T18:00:00Z');
  assert.equal(robotReportToday(now), '2026-11-01');
  assert.deepEqual(robotReportRange('week', now), { start_date: '2026-10-26', end_date: '2026-11-01' });
  assert.deepEqual(robotReportRange('day', now), { start_date: '2026-11-01', end_date: '2026-11-01' });
  assert.equal(robotReportShouldPoll({ start_date: '2026-10-26', end_date: '2026-11-01' }, now), true);
  assert.equal(robotReportShouldPoll({ start_date: '2026-10-26', end_date: '2026-10-31' }, now), false);
  assert.equal(robotReportShouldPoll({ start_date: '2026-11-02', end_date: '2026-11-03' }, now), false);
});

test('speed chart preserves missing samples, measured zero and coverage; excludes unknown robot lines', () => {
  const response = {
    robots: [{ device_num: 'R.1' }, { device_num: 'R2' }, { device_num: null }],
    points: [
      { label: '08:00', robots: [
        { device_num: 'R.1', average_speed_mps: 0.5, speed_eligible_count: 1, completed_count: 3 },
        { device_num: 'R2', average_speed_mps: 0, speed_eligible_count: 1, completed_count: 1 },
        { device_num: null, average_speed_mps: 9 },
      ] },
      { label: '09:00', robots: [{ device_num: 'R.1', average_speed_mps: null }] },
    ],
  };
  const series = buildRobotSpeedSeries(response);
  assert.deepEqual(series.robots, [{ device: 'R.1', key: 'speed_0' }, { device: 'R2', key: 'speed_1' }]);
  assert.equal(series.points[0].speed_0, 0.5);
  assert.equal(series.points[0].speed_1, 0);
  assert.equal(series.points[1].speed_0, null);
  assert.equal(series.points[1].speed_1, null);
  assert.equal(series.points[0].point.robots[0].speed_eligible_count, 1);
  assert.equal(series.points[0].point.robots[0].completed_count, 3);
});
