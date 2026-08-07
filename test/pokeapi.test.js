const { test } = require('node:test');
const assert = require('node:assert/strict');
const { resolveSlug, downloadGif } = require('../src/pokeapi');

test('resolveSlug: 한글 매핑 우선', () =>
  assert.equal(resolveSlug('피카츄', { '피카츄': 'pikachu' }), 'pikachu'));
test('resolveSlug: 매핑 없으면 소문자 영문으로 간주', () =>
  assert.equal(resolveSlug(' Pikachu ', {}), 'pikachu'));

// 이름이 그대로 파일 경로가 되므로 경로를 벗어나는 값은 막아야 한다
test('downloadGif: 잘못된 slug 거부', async () => {
  await assert.rejects(() => downloadGif('../../etc/passwd', '/tmp/x'), /잘못된 이름/);
});
