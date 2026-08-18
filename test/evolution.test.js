const { test } = require('node:test');
const assert = require('node:assert/strict');
const { stageIndex, evenThresholds, validThresholds, validBlock, resolveStage, particle } = require('../src/evolution');

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

test('validBlock: 정상 차단 통과', () => assert.ok(validBlock({ idx: 0, blockedTo: 1 }, 3)));
test('validBlock: 단계 삭제로 범위 밖이면 거부', () => assert.ok(!validBlock({ idx: 0, blockedTo: 3 }, 3)));
test('validBlock: 음수/역전/비정수 거부', () => {
  assert.ok(!validBlock({ idx: -1, blockedTo: 1 }, 3));
  assert.ok(!validBlock({ idx: 1, blockedTo: 1 }, 3));
  assert.ok(!validBlock({ idx: 0.5, blockedTo: 1 }, 3));
  assert.ok(!validBlock(null, 3));
});

test('resolveStage: 차단 없으면 계산값 그대로', () =>
  assert.deepEqual(resolveStage(2, null), { idx: 2, clearBlock: false, evolveTo: null }));
test('resolveStage: 차단 범위 안이면 차단 단계에 머묾', () =>
  assert.deepEqual(resolveStage(1, { idx: 0, blockedTo: 1 }), { idx: 0, clearBlock: false, evolveTo: null }));
test('resolveStage: 리셋으로 차단 단계 이하로 오면 차단 해제', () =>
  assert.deepEqual(resolveStage(0, { idx: 0, blockedTo: 1 }), { idx: 0, clearBlock: true, evolveTo: null }));
test('resolveStage: 다음 임계값을 넘으면 진화 재시도', () =>
  assert.deepEqual(resolveStage(2, { idx: 0, blockedTo: 1 }), { idx: 0, clearBlock: true, evolveTo: 2 }));

test('particle: 받침 있으면 은', () => assert.equal(particle('리자몽', '은는'), '은'));
test('particle: 받침 없으면 는', () => assert.equal(particle('파이리', '은는'), '는'));
test('particle: 받침 있으면 으로', () => assert.equal(particle('리자몽', '으로'), '으로'));
test('particle: 받침 없으면 로', () => assert.equal(particle('파이리', '으로'), '로'));
test('particle: ㄹ받침은 로', () => assert.equal(particle('나인테일', '으로'), '로'));
test('particle: 한글이 아니면 받침 없는 쪽', () => assert.equal(particle('pikachu', '은는'), '는'));
test('particle: 한글이 아니면 으로도 로', () => assert.equal(particle('pikachu', '으로'), '로'));
test('particle: 빈 문자열도 안전', () => {
  assert.equal(particle('', '은는'), '는');
  assert.equal(particle('  ', '으로'), '로');
});
