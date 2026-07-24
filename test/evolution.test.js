const { test } = require('node:test');
const assert = require('node:assert/strict');
const { stageIndex, evenThresholds, validThresholds } = require('../src/evolution');

test('stageIndex: 임계값 미만이면 0단계', () => assert.equal(stageIndex([33, 66], 10), 0));
test('stageIndex: 첫 임계값 도달 시 1단계', () => assert.equal(stageIndex([33, 66], 33), 1));
test('stageIndex: 마지막 임계값 이상이면 최종 단계', () => assert.equal(stageIndex([33, 66], 90), 2));
test('stageIndex: 리셋으로 % 떨어지면 단계도 회귀', () => assert.equal(stageIndex([33, 66], 5), 0));
test('stageIndex: 임계값 없으면 항상 0', () => assert.equal(stageIndex([], 99), 0));
test('evenThresholds: 3단계 → [33, 67]', () => assert.deepEqual(evenThresholds(3), [33, 67]));
test('evenThresholds: 4단계 → [25, 50, 75]', () => assert.deepEqual(evenThresholds(4), [25, 50, 75]));
test('validThresholds: 정상', () => assert.ok(validThresholds([33, 66])));
test('validThresholds: 내림차순 거부', () => assert.ok(!validThresholds([66, 33])));
test('validThresholds: 0 이하/100 이상 거부', () => assert.ok(!validThresholds([0, 120])));
