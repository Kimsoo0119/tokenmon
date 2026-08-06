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

// 소진율은 계정 전체의 값이라 몬스터마다 키운 정도가 따로 없다. 그래서 새 몬스터를
// 고르면 지금 소진율을 그대로 물려받아, 손도 대지 않은 진화형까지 도달한 것이 된다.
// 활성으로 만든 시점의 단계를 시작선으로 잡아두고 그보다 위로 올라간 것만 인정한다.
//
// 시작선이 -1이면 물려받은 것이 없다는 뜻이다 — 0단계에서 시작했으니 그 모습부터
// 이 몬스터로 얻은 것이다.
function nextFloor(monster, percent, prevFloor) {
  const idx = stageIndex((monster && monster.thresholds) || [], percent);
  // 처음 활성이 되었거나, 주간 리셋으로 더 낮은 단계까지 내려왔으면 시작선을 다시 잡는다
  if (prevFloor == null || idx < prevFloor) return idx === 0 ? -1 : idx;
  return prevFloor;
}

// 시작선 위로 올라간 단계들. 중간 단계를 함께 돌려주는 이유는 폴링이 5분 간격이라
// 10%에서 80%로 뛴 사이를 못 보고 지나칠 수 있기 때문이다 — 그러면 라이츄는
// 도달했는데 피카츄는 못 만난 도감이 된다.
function reachedSlugs(monster, percent, floor = -1) {
  if (!monster || percent == null) return [];
  const idx = stageIndex(monster.thresholds || [], percent);
  return stageSlugs(monster).slice(floor + 1, idx + 1);
}

// 한 주에 한 마리. 고를 때 적어둔 리셋 시각이 아직 오지 않았으면 잠근다.
//
// 지금 조회값과 같은지로 보면 안 된다 — usage API가 같은 리셋을 가리키면서도
// 매번 1초 안팎으로 다른 값을 주기 때문에, 폴링이 한 번만 돌아도 잠금이 저절로
// 풀린다. 시각이 지났는지로 봐야 흔들리지 않는다.
function pickLock(cfg, now = Date.now()) {
  const until = cfg && cfg.activePickedResetAt;
  const locked = !!(cfg && cfg.dexEnabled) && !(cfg && cfg.dexFreeMode)
    && !!(cfg && cfg.activeMonster) && typeof until === 'number' && now < until;
  return { locked, unlockAt: locked ? until : null };
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

module.exports = {
  monsterIdFor, buildMonster, stageSlugs, seenSlugsFor,
  nextFloor, reachedSlugs, pickLock, mergeStamps,
};
