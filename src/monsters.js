// 몬스터 하나를 만들고 도감 기록으로 옮기는 순수 로직
const { evenThresholds, stageIndex } = require('./evolution');
const { chainSlugs } = require('./dex');
const { isCustomId } = require('./config');

// 예전부터 쓰던 방식 그대로 — 이미 저장된 설정의 id와 어긋나면 같은 몬스터가
// 둘로 늘어난다. 슬러그에 하이픈이 있어 되돌릴 수 없으므로 stages에 slug를
// 따로 담고, 이 값은 식별자로만 쓴다.
function monsterIdFor(chainPath) {
  return chainPath.join('-');
}

function buildMonster(chainPath, gifs, koOf) {
  const stages = chainPath.map((slug, i) => ({ name: koOf(slug), slug, gif: gifs[i] }));
  return {
    displayName: koOf(chainPath[chainPath.length - 1]),
    stages,
    thresholds: evenThresholds(stages.length),
  };
}

function stageSlugs(monster) {
  const stages = monster && Array.isArray(monster.stages) ? monster.stages : [];
  return stages.map((s) => (s && s.slug) || null);
}

// 등록한 몬스터가 속한 진화 계통 전체. 하나를 키우기 시작하면 그 계통의 마지막
// 모습까지 도감에 실루엣으로 떠야 다음 목표가 보인다.
function seenSlugsFor(index, monsters) {
  const out = new Set();
  for (const [id, m] of Object.entries(monsters || {})) {
    if (isCustomId(id)) continue;
    for (const slug of stageSlugs(m)) {
      if (!slug || !index.bySlug[slug]) continue;
      for (const s of chainSlugs(index, slug)) out.add(s);
    }
  }
  return [...out];
}

// 지금 소진율로 도달한 단계들. 0단계부터 지금 단계까지 함께 돌려준다 — 폴링이
// 5분 간격이라 10%에서 80%로 뛴 사이의 중간 단계를 못 보고 지나칠 수 있는데,
// 그러면 라이츄는 도달했는데 피카츄는 못 만난 도감이 된다.
function reachedSlugs(monster, percent) {
  if (!monster || percent == null) return [];
  return stageSlugs(monster).slice(0, stageIndex(monster.thresholds || [], percent) + 1);
}

// 처음 본 종만 시각을 찍는다. 이미 있는 기록은 덮지 않는다 — 언제 처음
// 만났는지가 남아야 도감다워진다. 무언가 새로 찍었으면 true.
function mergeStamps(target, slugs, now) {
  let changed = false;
  for (const slug of slugs) {
    if (!slug || target[slug]) continue;
    target[slug] = now;
    changed = true;
  }
  return changed;
}

module.exports = { monsterIdFor, buildMonster, stageSlugs, seenSlugsFor, reachedSlugs, mergeStamps };
