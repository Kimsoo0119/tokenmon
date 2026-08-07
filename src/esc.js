// 사용자 입력·외부에서 온 문자열을 innerHTML에 넣기 전 이스케이프.
// 메인·펫·설정 세 곳에서 같은 규칙을 쓰므로 한곳에 둔다.
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

module.exports = { esc };
