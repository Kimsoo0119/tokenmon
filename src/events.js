const TYPES = ['start', 'done', 'waiting'];

// events.jsonl 한 줄 → {type, message}. type이 없거나 모르는 값이면 'notify' (하위 호환)
function parseEvent(line) {
  let obj;
  try { obj = JSON.parse(line); } catch { return { type: 'notify', message: line.trim().slice(0, 80), session: '' }; }
  return {
    type: TYPES.includes(obj?.type) ? obj.type : 'notify',
    message: String(obj?.message ?? '').slice(0, 80),
    session: String(obj?.session ?? ''),
  };
}

module.exports = { parseEvent };
