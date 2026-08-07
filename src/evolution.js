function stageIndex(thresholds, percent) {
  let s = 0;
  for (const t of thresholds) if (percent >= t) s++;
  return s;
}

function evenThresholds(stageCount) {
  return Array.from({ length: stageCount - 1 }, (_, i) =>
    Math.round(((i + 1) * 100) / stageCount));
}

function validThresholds(t) {
  return t.every((v, i) => v > 0 && v < 100 && (i === 0 || v > t[i - 1]));
}

// config에서 읽은 진화 차단이 지금 단계 구성에서 유효한가.
// 사용자가 config.json을 손으로 고치거나 단계를 지웠을 수 있으므로 모양부터 검증한다.
function validBlock(block, stageCount) {
  return !!block
    && Number.isInteger(block.idx) && block.idx >= 0
    && Number.isInteger(block.blockedTo) && block.blockedTo < stageCount
    && block.idx < block.blockedTo;
}

// 진화 차단(이스터에그: 연출 중 B 키)을 감안해 표시할 단계를 정한다.
// block: { idx, blockedTo } — idx 단계에서 blockedTo로의 진화를 막아둔 상태.
// 반환: idx(표시 단계), clearBlock(차단을 지울지), evolveTo(다시 진화 연출을 시작할 목표 단계 | null)
// - %가 떨어져 차단 시점 이하로 오면(주간 리셋) 차단을 지우고 그대로 따라간다
// - 차단했던 것보다 더 높은 임계값을 넘으면 게임처럼 진화를 재시도한다
function resolveStage(computed, block) {
  if (!block) return { idx: computed, clearBlock: false, evolveTo: null };
  if (computed <= block.idx) return { idx: computed, clearBlock: true, evolveTo: null };
  if (computed > block.blockedTo) return { idx: block.idx, clearBlock: true, evolveTo: computed };
  return { idx: block.idx, clearBlock: false, evolveTo: null };
}

// 이름 뒤에 붙을 조사를 받침 유무로 고른다. kind: '은는' | '으로'
// 마지막 글자가 한글이 아니면(영문 슬러그 등) 받침 없는 쪽을 쓴다.
// '으로'는 ㄹ받침이면 '로'가 붙는 표준 규칙을 따른다 (예: 파이리 → 로, 리자몽 → 으로)
function particle(name, kind) {
  const c = String(name).trim().slice(-1).charCodeAt(0) - 0xac00;
  const jong = c >= 0 && c <= 11171 ? c % 28 : 0;
  if (kind === '은는') return jong ? '은' : '는';
  return jong && jong !== 8 ? '으로' : '로';
}

module.exports = { stageIndex, evenThresholds, validThresholds, validBlock, resolveStage, particle };
