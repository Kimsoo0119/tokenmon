// 렌더러는 nodeIntegration이 켜져 있어, 밖에서 들어온 문자열을 DOM에 그대로
// 넣으면 그 자리가 곧 실행 지점이 된다. 창마다 따로 두면 한 곳만 빠뜨려도
// 티가 나지 않으므로 한 군데서 가져다 쓴다.
function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

module.exports = { esc };
