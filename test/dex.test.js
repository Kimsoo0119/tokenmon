const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildIndex, koName, isStarter, chainRoot, depthOf,
  chainPathsFor, pathsThrough, chainSlugs, searchSlugs, cellState, dexCounts,
} = require('../src/dex');

// 직선(피츄) · 분기(이브이) · 진화 없음(켄타로스) · 하이픈 슬러그에 부모가 더 큰
// 번호인 경우(흉내내 439 → 마임맨 122)를 한 자리에 모아둔다
const fixture = {
  pikachu: { no: 25, ko: '피카츄', gen: 1, from: 'pichu' },
  raichu: { no: 26, ko: '라이츄', gen: 1, from: 'pikachu' },
  'mr-mime': { no: 122, ko: '마임맨', gen: 1, from: 'mime-jr' },
  tauros: { no: 128, ko: '켄타로스', gen: 1 },
  eevee: { no: 133, ko: '이브이', gen: 1 },
  vaporeon: { no: 134, ko: '샤미드', gen: 1, from: 'eevee' },
  jolteon: { no: 135, ko: '쥬피썬더', gen: 1, from: 'eevee' },
  mewtwo: { no: 150, ko: '뮤츠', gen: 1, legendary: true },
  pichu: { no: 172, ko: '피츄', gen: 2 },
  'mime-jr': { no: 439, ko: '흉내내', gen: 4 },
};
const idx = buildIndex(fixture);

test('buildIndex: 도감 번호 순으로 정렬', () =>
  assert.equal(idx.order[0], 'pikachu'));
test('buildIndex: 부모 없는 종만 뿌리', () =>
  assert.deepEqual(idx.roots.sort(), ['eevee', 'mewtwo', 'mime-jr', 'pichu', 'tauros']));
test('buildIndex: 자식은 도감 번호 순', () =>
  assert.deepEqual(idx.kids.eevee, ['vaporeon', 'jolteon']));
test('buildIndex: 세대별로 나눔', () =>
  assert.deepEqual(idx.byGen[2], ['pichu']));

test('koName: 한글 이름', () => assert.equal(koName(idx, 'pichu'), '피츄'));
test('koName: 모르는 슬러그는 그대로', () => assert.equal(koName(idx, 'ditto'), 'ditto'));

test('isStarter: 뿌리는 참', () => assert.equal(isStarter(idx, 'mime-jr'), true));
test('isStarter: 진화형은 거짓', () => assert.equal(isStarter(idx, 'mr-mime'), false));

test('chainRoot: 부모를 거슬러 올라감', () => assert.equal(chainRoot(idx, 'raichu'), 'pichu'));
test('chainRoot: 하이픈 슬러그도 정확히', () => assert.equal(chainRoot(idx, 'mr-mime'), 'mime-jr'));

test('depthOf: 뿌리는 0', () => assert.equal(depthOf(idx, 'pichu'), 0));
test('depthOf: 중간은 1, 잎은 2', () => {
  assert.equal(depthOf(idx, 'pikachu'), 1);
  assert.equal(depthOf(idx, 'raichu'), 2);
});

// pokeapi.js의 chainPaths와 같은 결과여야 두 구현이 어긋나지 않는다
test('chainPathsFor: 직선 진화 → 경로 1개', () =>
  assert.deepEqual(chainPathsFor(idx, 'pikachu'), [['pichu', 'pikachu', 'raichu']]));
test('chainPathsFor: 분기 진화 → 경로 여러 개', () =>
  assert.deepEqual(chainPathsFor(idx, 'eevee'), [['eevee', 'vaporeon'], ['eevee', 'jolteon']]));
test('chainPathsFor: 진화 없는 종 → 자기 자신만', () =>
  assert.deepEqual(chainPathsFor(idx, 'tauros'), [['tauros']]));

test('pathsThrough: 그 종을 지나는 경로만', () =>
  assert.deepEqual(pathsThrough(idx, 'jolteon'), [['eevee', 'jolteon']]));
test('pathsThrough: 뿌리면 전부', () =>
  assert.equal(pathsThrough(idx, 'eevee').length, 2));

test('chainSlugs: 분기 체인 전체를 중복 없이', () =>
  assert.deepEqual(chainSlugs(idx, 'jolteon'), ['eevee', 'vaporeon', 'jolteon']));

test('searchSlugs: 한글 부분일치', () =>
  assert.deepEqual(searchSlugs(idx, '피카'), ['pikachu']));
test('searchSlugs: 영문 슬러그 부분일치', () =>
  assert.deepEqual(searchSlugs(idx, 'chu'), ['pikachu', 'raichu', 'pichu']));
test('searchSlugs: 공백만 있으면 빈 결과', () => assert.deepEqual(searchSlugs(idx, '   '), []));
test('searchSlugs: 없으면 빈 결과', () => assert.deepEqual(searchSlugs(idx, 'zzz'), []));

const state = { seen: { pichu: 1, pikachu: 1, raichu: 1 }, caught: { pichu: 1 } };
test('cellState: 도달 · 등록 · 미등록', () => {
  assert.equal(cellState(state, 'pichu'), 'caught');
  assert.equal(cellState(state, 'pikachu'), 'seen');
  assert.equal(cellState(state, 'tauros'), 'unseen');
});
test('cellState: 기록이 없으면 미등록', () => assert.equal(cellState(null, 'pichu'), 'unseen'));

test('dexCounts: 공개 수와 전체 수', () =>
  assert.deepEqual(dexCounts(state, idx), { seen: 3, caught: 1, total: 10 }));
test('dexCounts: 도감에 없는 슬러그는 세지 않음', () =>
  assert.deepEqual(dexCounts({ seen: { ditto: 1 }, caught: {} }, idx),
    { seen: 0, caught: 0, total: 10 }));

// 실제 데이터 — 빌드 스크립트가 지켜야 할 약속이 파일에 살아 있는지 본다
const real = buildIndex(require('../assets/dex.json'));

test('실데이터: 649종', () => assert.equal(real.order.length, 649));
test('실데이터: 슬러그와 세대가 규격 안', () => {
  for (const slug of real.order) {
    assert.match(slug, /^[a-z0-9-]+$/);
    const e = real.bySlug[slug];
    assert.ok(e.gen >= 1 && e.gen <= 5, `${slug} 세대 ${e.gen}`);
    assert.ok(e.no >= 1 && e.no <= 649, `${slug} 번호 ${e.no}`);
    assert.ok(e.ko, `${slug} 한글 이름 없음`);
  }
});
test('실데이터: 부모가 모두 도감 안에 있음', () => {
  for (const slug of real.order) {
    const from = real.bySlug[slug].from;
    if (from) assert.ok(real.bySlug[from], `${slug} ← ${from}`);
  }
});
test('실데이터: 이브이는 7갈래로 갈라짐', () =>
  assert.equal(chainPathsFor(real, 'eevee').length, 7));
test('실데이터: 라이츄의 뿌리는 피츄', () =>
  assert.equal(chainRoot(real, 'raichu'), 'pichu'));
// PokeAPI는 둘을 한 진화 체인으로 묶지만 진화 관계가 아니다. 체인 번호로 종을
// 묶으면 피오네를 등록했을 때 마나피까지 공개되므로 뿌리 기준으로 나눠야 한다
test('실데이터: 피오네와 마나피는 서로 다른 계통', () => {
  assert.deepEqual(chainSlugs(real, 'phione'), ['phione']);
  assert.deepEqual(chainSlugs(real, 'manaphy'), ['manaphy']);
});
