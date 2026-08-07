const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildIndex } = require('../src/dex');
const {
  monsterIdFor, buildMonster, stageSlugs, seenSlugsFor,
  nextFloor, reachedSlugs, pickLock, mergeStamps,
  setThresholds, removeMonster, addCustomMonster,
} = require('../src/monsters');

const idx = buildIndex({
  pikachu: { no: 25, ko: '피카츄', gen: 1, from: 'pichu' },
  raichu: { no: 26, ko: '라이츄', gen: 1, from: 'pikachu' },
  'mr-mime': { no: 122, ko: '마임맨', gen: 1, from: 'mime-jr' },
  eevee: { no: 133, ko: '이브이', gen: 1 },
  vaporeon: { no: 134, ko: '샤미드', gen: 1, from: 'eevee' },
  jolteon: { no: 135, ko: '쥬피썬더', gen: 1, from: 'eevee' },
  pichu: { no: 172, ko: '피츄', gen: 2 },
  'mime-jr': { no: 439, ko: '흉내내', gen: 4 },
});
const ko = (slug) => (idx.bySlug[slug] ? idx.bySlug[slug].ko : slug);

// 이미 저장된 설정과 같은 id가 나와야 한다 — 어긋나면 몬스터가 둘로 늘어난다
test('monsterIdFor: 슬러그를 이어붙인다', () =>
  assert.equal(monsterIdFor(['pichu', 'pikachu', 'raichu']), 'pichu-pikachu-raichu'));
test('monsterIdFor: 하이픈 슬러그도 예전과 같은 id', () =>
  assert.equal(monsterIdFor(['mime-jr', 'mr-mime']), 'mime-jr-mr-mime'));

test('buildMonster: 단계마다 슬러그를 함께 담는다', () => {
  const m = buildMonster(['pichu', 'pikachu', 'raichu'], ['/a.gif', '/b.gif', '/c.gif'], ko);
  assert.deepEqual(m.stages, [
    { name: '피츄', slug: 'pichu', gif: '/a.gif' },
    { name: '피카츄', slug: 'pikachu', gif: '/b.gif' },
    { name: '라이츄', slug: 'raichu', gif: '/c.gif' },
  ]);
});
test('buildMonster: 이름은 마지막 진화형, 임계값은 균등분할', () => {
  const m = buildMonster(['pichu', 'pikachu', 'raichu'], ['/a', '/b', '/c'], ko);
  assert.equal(m.displayName, '라이츄');
  assert.deepEqual(m.thresholds, [33, 67]);
});

test('stageSlugs: 슬러그가 없는 단계는 null', () =>
  assert.deepEqual(stageSlugs({ stages: [{ slug: 'pichu' }, { name: '이름만' }] }), ['pichu', null]));
test('stageSlugs: 몬스터가 비어 있어도 안전', () => assert.deepEqual(stageSlugs(null), []));

test('seenSlugsFor: 계통 전체로 넓힌다', () => {
  const seen = seenSlugsFor(idx, { 'pichu-pikachu-raichu': { stages: [{ slug: 'pichu' }] } });
  assert.deepEqual(seen.sort(), ['pichu', 'pikachu', 'raichu']);
});
test('seenSlugsFor: 분기 진화는 갈래를 모두 담는다', () => {
  const seen = seenSlugsFor(idx, { 'eevee-jolteon': { stages: [{ slug: 'jolteon' }] } });
  assert.deepEqual(seen.sort(), ['eevee', 'jolteon', 'vaporeon']);
});
test('seenSlugsFor: 여러 몬스터를 합치되 중복은 없앤다', () => {
  const seen = seenSlugsFor(idx, {
    'pichu-pikachu-raichu': { stages: [{ slug: 'pichu' }] },
    'pichu-pikachu': { stages: [{ slug: 'pichu' }, { slug: 'pikachu' }] },
  });
  assert.deepEqual(seen.sort(), ['pichu', 'pikachu', 'raichu']);
});
// 직접 고른 GIF는 도감에 실린 종이 아니라 흔적이 남으면 안 된다
test('seenSlugsFor: 직접 만든 몬스터는 빼놓는다', () =>
  assert.deepEqual(seenSlugsFor(idx, { 'custom-내펫': { stages: [{ slug: 'pichu' }] } }), []));
test('seenSlugsFor: 도감에 없는 슬러그는 무시', () =>
  assert.deepEqual(seenSlugsFor(idx, { greninja: { stages: [{ slug: 'greninja' }] } }), []));

const pichuLine = {
  stages: [{ slug: 'pichu' }, { slug: 'pikachu' }, { slug: 'raichu' }],
  thresholds: [33, 67],
};

test('nextFloor: 0단계에서 시작하면 물려받은 것이 없다', () =>
  assert.equal(nextFloor(pichuLine, 10, null), -1));
test('nextFloor: 중간 단계에서 갈아타면 그 단계까지는 물려받은 것', () =>
  assert.equal(nextFloor(pichuLine, 50, null), 1));
test('nextFloor: 한 번 잡은 시작선은 올라가도 그대로', () =>
  assert.equal(nextFloor(pichuLine, 80, 1), 1));
test('nextFloor: 주간 리셋으로 내려오면 시작선도 내려간다', () =>
  assert.equal(nextFloor(pichuLine, 10, 1), -1));

test('reachedSlugs: 0단계부터 키웠으면 첫 모습부터', () =>
  assert.deepEqual(reachedSlugs(pichuLine, 10, -1), ['pichu']));
// 5분 만에 10%에서 80%로 뛰어도 건너뛴 단계가 도감에 구멍으로 남지 않아야 한다
test('reachedSlugs: 건너뛴 중간 단계도 함께 남긴다', () =>
  assert.deepEqual(reachedSlugs(pichuLine, 80, -1), ['pichu', 'pikachu', 'raichu']));
test('reachedSlugs: 물려받은 단계는 인정하지 않는다', () =>
  assert.deepEqual(reachedSlugs(pichuLine, 50, 1), []));
test('reachedSlugs: 시작선 위로 올라간 것만', () =>
  assert.deepEqual(reachedSlugs(pichuLine, 80, 1), ['raichu']));
test('reachedSlugs: 소진율을 모르면 빈 결과', () =>
  assert.deepEqual(reachedSlugs(pichuLine, null, -1), []));
test('reachedSlugs: 몬스터가 없으면 빈 결과', () => assert.deepEqual(reachedSlugs(null, 50, -1), []));

// 소진율은 계정 전체 값이라, 새 몬스터를 고르면 지금 레벨을 그대로 물려받아
// 손도 대지 않은 진화형까지 도감에 들어가던 문제
test('미뇽으로 키우다 파이리를 추가해도 파이리 계통은 늘지 않는다', () => {
  const dratini = {
    stages: [{ slug: 'dratini' }, { slug: 'dragonair' }, { slug: 'dragonite' }],
    thresholds: [33, 67],
  };
  const charmander = {
    stages: [{ slug: 'charmander' }, { slug: 'charmeleon' }, { slug: 'charizard' }],
    thresholds: [33, 67],
  };
  const caught = {};
  // 0%에서 미뇽을 등록해 50%까지 키운다 → 미뇽, 신뇽
  let floor = nextFloor(dratini, 0, null);
  mergeStamps(caught, reachedSlugs(dratini, 0, floor), 1);
  floor = nextFloor(dratini, 50, floor);
  mergeStamps(caught, reachedSlugs(dratini, 50, floor), 2);
  assert.deepEqual(Object.keys(caught), ['dratini', 'dragonair']);

  // 50% 그대로에서 파이리로 갈아탄다 → 아무것도 늘지 않아야 한다
  let cFloor = nextFloor(charmander, 50, null);
  mergeStamps(caught, reachedSlugs(charmander, 50, cFloor), 3);
  assert.deepEqual(Object.keys(caught), ['dratini', 'dragonair']);

  // 파이리를 데리고 67%를 넘기면 그때 올라간 단계만 인정한다
  cFloor = nextFloor(charmander, 80, cFloor);
  mergeStamps(caught, reachedSlugs(charmander, 80, cFloor), 4);
  assert.deepEqual(Object.keys(caught), ['dratini', 'dragonair', 'charizard']);

  // 주간 리셋으로 0%까지 내려오면 시작선이 풀려 아래 단계부터 다시 쌓인다
  cFloor = nextFloor(charmander, 0, cFloor);
  mergeStamps(caught, reachedSlugs(charmander, 0, cFloor), 5);
  cFloor = nextFloor(charmander, 50, cFloor);
  mergeStamps(caught, reachedSlugs(charmander, 50, cFloor), 6);
  assert.deepEqual(Object.keys(caught).sort(),
    ['charizard', 'charmander', 'charmeleon', 'dragonair', 'dratini']);
});

const picked = {
  dexEnabled: true, dexFreeMode: false,
  activeMonster: 'pichu-pikachu-raichu', activePickedResetAt: 2000,
};

test('pickLock: 고른 주가 끝나기 전이면 잠긴다', () =>
  assert.deepEqual(pickLock(picked, 1500), { locked: true, unlockAt: 2000 }));
test('pickLock: 리셋 시각이 지나면 풀린다', () =>
  assert.equal(pickLock(picked, 2000).locked, false));
// usage API가 같은 리셋을 가리키면서도 매번 1초 안팎으로 다른 값을 준다.
// 지금 조회값과 같은지로 보면 폴링이 한 번만 돌아도 잠금이 저절로 풀렸다.
test('pickLock: 리셋 시각이 1초쯤 흔들려도 잠금이 유지된다', () => {
  assert.equal(pickLock({ ...picked, activePickedResetAt: 1786193999071 }, 1786000000000).locked, true);
  assert.equal(pickLock({ ...picked, activePickedResetAt: 1786194000292 }, 1786000000000).locked, true);
});
test('pickLock: 도감을 쓰지 않으면 잠그지 않는다', () =>
  assert.equal(pickLock({ ...picked, dexEnabled: false }, 1500).locked, false));
test('pickLock: 규칙 없이 둘러보는 중이면 잠그지 않는다', () =>
  assert.equal(pickLock({ ...picked, dexFreeMode: true }, 1500).locked, false));
test('pickLock: 아직 한 마리도 없으면 골라야 한다', () =>
  assert.equal(pickLock({ ...picked, activeMonster: null }, 1500).locked, false));
test('pickLock: 리셋 시각을 모르면 막지 않는다', () =>
  assert.equal(pickLock({ ...picked, activePickedResetAt: null }, 1500).locked, false));

test('mergeStamps: 처음 본 종만 찍고 변경 여부를 알려준다', () => {
  const bag = { pichu: 100 };
  assert.equal(mergeStamps(bag, ['pichu', 'pikachu'], 200), true);
  assert.deepEqual(bag, { pichu: 100, pikachu: 200 });
});
test('mergeStamps: 새로 찍을 게 없으면 거짓', () => {
  const bag = { pichu: 100 };
  assert.equal(mergeStamps(bag, ['pichu', null], 200), false);
  assert.deepEqual(bag, { pichu: 100 });
});

// 설정 창은 열릴 때 읽어둔 사본을 들고 있어서, 목록을 직접 고쳐 저장하면 그 사이
// 도감이 등록한 몬스터를 덮는다. 목록을 바꾸는 일은 모두 메인의 살아 있는 설정에
// 대고 하므로, 다른 창이 등록한 것이 함께 사라지지 않는다.
const twoStage = (name) => ({ displayName: name, stages: [{ name: 'a' }, { name: 'b' }], thresholds: [50] });
const listCfg = () => ({
  monsters: { 'pikachu-raichu': twoStage('라이츄') },
  activeMonster: 'pikachu-raichu',
});

test('setThresholds: 임계값을 바꿔도 그 사이 등록된 몬스터는 남는다', () => {
  const cfg = listCfg();
  cfg.monsters['charmander-charizard'] = twoStage('리자몽'); // 도감이 방금 등록
  assert.deepEqual(setThresholds(cfg, 'pikachu-raichu', [70]), { ok: true });
  assert.deepEqual(cfg.monsters['pikachu-raichu'].thresholds, [70]);
  assert.deepEqual(Object.keys(cfg.monsters), ['pikachu-raichu', 'charmander-charizard']);
});
test('setThresholds: 없는 몬스터는 거절한다', () =>
  assert.equal(setThresholds(listCfg(), 'nope', [50]).ok, false));
test('setThresholds: 개수가 단계 수 - 1이 아니면 거절한다', () =>
  assert.equal(setThresholds(listCfg(), 'pikachu-raichu', [30, 60]).ok, false));
test('setThresholds: 오름차순 0~100을 벗어나면 거절한다', () => {
  assert.equal(setThresholds(listCfg(), 'pikachu-raichu', [0]).ok, false);
  assert.equal(setThresholds(listCfg(), 'pikachu-raichu', [100]).ok, false);
});
test('setThresholds: 숫자가 아니면 거절한다', () =>
  assert.equal(setThresholds(listCfg(), 'pikachu-raichu', ['가']).ok, false));

test('removeMonster: 지우면 목록에서 빠진다', () => {
  const cfg = listCfg();
  cfg.monsters['charmander-charizard'] = twoStage('리자몽');
  assert.deepEqual(removeMonster(cfg, 'charmander-charizard'), { ok: true });
  assert.deepEqual(Object.keys(cfg.monsters), ['pikachu-raichu']);
  assert.equal(cfg.activeMonster, 'pikachu-raichu');
});
test('removeMonster: 키우던 몬스터를 지우면 남은 것으로 넘어간다', () => {
  const cfg = listCfg();
  cfg.monsters['charmander-charizard'] = twoStage('리자몽');
  removeMonster(cfg, 'pikachu-raichu');
  assert.equal(cfg.activeMonster, 'charmander-charizard');
});
test('removeMonster: 마지막 한 마리를 지우면 키우는 몬스터가 없어진다', () => {
  const cfg = listCfg();
  removeMonster(cfg, 'pikachu-raichu');
  assert.equal(cfg.activeMonster, null);
});
// 지우는 것은 고르는 것이 아니다 — 여기서 고른 시각을 찍으면 없던 잠금이 생긴다
test('removeMonster: 고른 시각은 건드리지 않는다', () => {
  const cfg = { ...listCfg(), activePickedResetAt: 2000 };
  cfg.monsters['charmander-charizard'] = twoStage('리자몽');
  removeMonster(cfg, 'pikachu-raichu');
  assert.equal(cfg.activePickedResetAt, 2000);
});
test('removeMonster: 없는 몬스터는 거절한다', () =>
  assert.equal(removeMonster(listCfg(), 'nope').ok, false));

test('addCustomMonster: 단계 수에 맞는 임계값을 붙여 넣는다', () => {
  const cfg = listCfg();
  const stages = [{ name: '뿌꾸 1단계', gif: '/c/custom-뿌꾸-0.gif' }, { name: '뿌꾸 2단계', gif: '/c/custom-뿌꾸-1.gif' }];
  assert.deepEqual(addCustomMonster(cfg, ' 뿌꾸 ', stages), { ok: true, id: 'custom-뿌꾸' });
  assert.deepEqual(cfg.monsters['custom-뿌꾸'].thresholds, [50]);
  assert.equal(cfg.monsters['custom-뿌꾸'].displayName, '뿌꾸');
  assert.deepEqual(Object.keys(cfg.monsters), ['pikachu-raichu', 'custom-뿌꾸']);
});
test('addCustomMonster: 쓸 수 없는 이름은 거절한다', () => {
  assert.equal(addCustomMonster(listCfg(), '', [{ name: 'a', gif: '/c/a.gif' }]).ok, false);
  assert.equal(addCustomMonster(listCfg(), '../etc', [{ name: 'a', gif: '/c/a.gif' }]).ok, false);
});
test('addCustomMonster: GIF가 없으면 거절한다', () => {
  assert.equal(addCustomMonster(listCfg(), '뿌꾸', []).ok, false);
  assert.equal(addCustomMonster(listCfg(), '뿌꾸', [{ name: 'a' }]).ok, false);
});
