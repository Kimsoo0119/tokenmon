const { test } = require('node:test');
const assert = require('node:assert/strict');
const { esc } = require('../src/esc');

test('esc: 태그와 따옴표를 막는다', () =>
  assert.equal(esc('<img src=x onerror="a">'), '&lt;img src=x onerror=&quot;a&quot;&gt;'));
test('esc: 앰퍼샌드를 먼저 바꿔 이중 이스케이프가 되지 않는다', () =>
  assert.equal(esc('a & b'), 'a &amp; b'));
test('esc: 작은따옴표도 막는다', () => assert.equal(esc("it's"), 'it&#39;s'));
test('esc: 문자열이 아니어도 안전', () => assert.equal(esc(null), 'null'));
test('esc: 평범한 한글은 그대로', () => assert.equal(esc('피카츄'), '피카츄'));
