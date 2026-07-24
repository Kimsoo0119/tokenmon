const { test } = require('node:test');
const assert = require('node:assert/strict');
const { resolveSlug, chainPaths, fetchEvolutionPaths, downloadGif } = require('../src/pokeapi');

test('resolveSlug: 한글 매핑 우선', () =>
  assert.equal(resolveSlug('피카츄', { '피카츄': 'pikachu' }), 'pikachu'));
test('resolveSlug: 매핑 없으면 소문자 영문으로 간주', () =>
  assert.equal(resolveSlug(' Pikachu ', {}), 'pikachu'));

const linear = {
  species: { name: 'pichu' },
  evolves_to: [{
    species: { name: 'pikachu' },
    evolves_to: [{ species: { name: 'raichu' }, evolves_to: [] }],
  }],
};
test('chainPaths: 직선 진화 → 경로 1개', () =>
  assert.deepEqual(chainPaths(linear), [['pichu', 'pikachu', 'raichu']]));

const branched = {
  species: { name: 'eevee' },
  evolves_to: [
    { species: { name: 'vaporeon' }, evolves_to: [] },
    { species: { name: 'jolteon' }, evolves_to: [] },
  ],
};
test('chainPaths: 분기 진화 → 경로 여러 개', () =>
  assert.deepEqual(chainPaths(branched), [['eevee', 'vaporeon'], ['eevee', 'jolteon']]));

test('chainPaths: 진화 없는 종 → 자기 자신만', () =>
  assert.deepEqual(chainPaths({ species: { name: 'tauros' }, evolves_to: [] }), [['tauros']]));

test('downloadGif: 잘못된 slug 거부', async () => {
  await assert.rejects(() => downloadGif('../../etc/passwd', '/tmp/x'), /잘못된 이름/);
});
test('fetchEvolutionPaths: 잘못된 slug 거부', async () => {
  await assert.rejects(() => fetchEvolutionPaths('피카츄!'), /잘못된 이름/);
});
