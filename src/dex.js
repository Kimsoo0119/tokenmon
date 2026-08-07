// 도감 데이터(assets/dex.json)를 다루는 순수 로직.
//
// 여기서 말하는 "체인"은 from 링크로 이어진 진화 트리이지 PokeAPI의
// evolution_chain_id가 아니다. 그쪽은 마나피와 피오네처럼 진화 관계가 아닌
// 종도 한 묶음으로 보기 때문에, 뿌리를 거슬러 올라가는 쪽만 쓴다.

// 잘못된 데이터로 from이 순환하면 앱이 멈춘다. 실제 최장 체인은 3단계라
// 넉넉히 잡아두고, 넘어가면 그 자리에서 멈춘다.
const MAX_DEPTH = 16;

function buildIndex(dex) {
  const order = Object.keys(dex).sort((a, b) => dex[a].no - dex[b].no);
  const kids = {};
  const roots = [];
  const byGen = {};
  for (const slug of order) {
    const e = dex[slug];
    (byGen[e.gen] = byGen[e.gen] || []).push(slug);
    if (e.from && dex[e.from]) (kids[e.from] = kids[e.from] || []).push(slug);
    else roots.push(slug);
  }
  return { bySlug: dex, order, kids, roots, byGen };
}

function koName(index, slug) {
  const e = index.bySlug[slug];
  return e ? e.ko : slug;
}

function isStarter(index, slug) {
  const e = index.bySlug[slug];
  return !!e && !e.from;
}

function chainRoot(index, slug) {
  let cur = slug;
  for (let i = 0; i < MAX_DEPTH; i++) {
    const e = index.bySlug[cur];
    if (!e || !e.from || !index.bySlug[e.from]) return cur;
    cur = e.from;
  }
  return cur;
}

function depthOf(index, slug) {
  let cur = slug;
  for (let d = 0; d < MAX_DEPTH; d++) {
    const e = index.bySlug[cur];
    if (!e || !e.from || !index.bySlug[e.from]) return d;
    cur = e.from;
  }
  return MAX_DEPTH;
}

// 뿌리에서 잎까지의 모든 경로. pokeapi.js의 chainPaths와 같은 [[slug, ...]] 형태라
// 경로를 고르는 화면이 양쪽 모두에서 같은 코드로 그려진다.
function chainPathsFor(index, slug) {
  const paths = [];
  (function walk(cur, acc) {
    const next = [...acc, cur];
    const children = index.kids[cur];
    if (!children || next.length >= MAX_DEPTH) return paths.push(next);
    for (const child of children) walk(child, next);
  })(chainRoot(index, slug), []);
  return paths;
}

function pathsThrough(index, slug) {
  const all = chainPathsFor(index, slug);
  const hit = all.filter((p) => p.includes(slug));
  return hit.length ? hit : all;
}

// 같은 진화 트리에 속한 모든 종. 하나를 등록하면 이 종들이 함께 도감에 공개된다.
function chainSlugs(index, slug) {
  return [...new Set(chainPathsFor(index, slug).flat())];
}

function searchSlugs(index, q) {
  const needle = String(q == null ? '' : q).trim();
  if (!needle) return [];
  const lower = needle.toLowerCase();
  return index.order.filter((slug) =>
    slug.includes(lower) || index.bySlug[slug].ko.includes(needle));
}

// 미등록은 실루엣, 등록했지만 아직 그 단계에 닿지 못했으면 회색조, 도달했으면 원래 색
function cellState(dexState, slug) {
  if (!dexState) return 'unseen';
  if (dexState.caught && dexState.caught[slug]) return 'caught';
  if (dexState.seen && dexState.seen[slug]) return 'seen';
  return 'unseen';
}

// 도감에 없는 슬러그는 세지 않는다. 데이터가 갱신되거나 손으로 설정을 고쳐도
// 공개 수가 전체 수를 넘어서는 일이 없어야 한다.
function dexCounts(dexState, index) {
  const count = (bag) => (bag ? Object.keys(bag).filter((s) => index.bySlug[s]).length : 0);
  return {
    seen: count(dexState && dexState.seen),
    caught: count(dexState && dexState.caught),
    total: index.order.length,
  };
}

module.exports = {
  buildIndex,
  koName,
  isStarter,
  chainRoot,
  depthOf,
  chainPathsFor,
  pathsThrough,
  chainSlugs,
  searchSlugs,
  cellState,
  dexCounts,
};
