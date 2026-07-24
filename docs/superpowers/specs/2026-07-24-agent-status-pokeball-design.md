# 에이전트 상태 몬스터볼 연출 설계

## 목적

터미널에서 Claude Code(또는 Codex) 에이전트가 **작업 중 / 완료 / 답변 대기** 상태일 때
펫이 몬스터볼 포획 연출로 상태를 보여준다.

## 연출 (상태 머신)

| 이벤트 | 연출 |
|---|---|
| `start` (작업 시작) | 플래시와 함께 펫이 볼 안으로 들어가고, 바닥의 몬스터볼이 주기적으로 흔들림 |
| `done` (작업 완료) | 볼이 딸깍! 잠긴 뒤 터지며 펫이 튀어나옴 + 말풍선 "작업 완료!" |
| `waiting` (답변 대기) | 볼이 즉시 터지며 펫이 탈출(놓침) + 말풍선 "답변을 기다리고 있어요!" |

- 볼 상태가 아닐 때 `done`/`waiting`이 오면 기존 알림처럼 점프 + 말풍선만.
- 여러 세션 동시 실행은 구분하지 않고 마지막 이벤트 기준으로 동작.

### 안전장치

- 볼 클릭 시 즉시 펫 복귀 (Stop 이벤트 유실 대비).
- 볼 상태로 30분 무이벤트 시 자동 복귀.
- 볼 상태에서도 드래그로 창 이동 가능.

## 이벤트 형식

`events.jsonl` 한 줄: `{"type":"start"|"done"|"waiting","message":"..."}`.
`type`이 없거나 모르는 값이면 기존 알림(`notify`)으로 처리 — 하위 호환 유지.

## 연결

- Claude Code 훅 (`~/.claude/settings.json`):
  `UserPromptSubmit`→start, `Stop`→done, `Notification`→waiting.
- Codex는 `config.toml`의 `notify`로 done만 연결 가능. 이번엔 Claude Code 위주.

## 구현

- `src/events.js` (신규): `parseEvent(line)` — 한 줄을 `{type, message}`로 해석. 테스트 포함.
- `src/main.js`: watchEvents에서 parseEvent 사용, `agent-event` IPC로 펫 창에 전달.
- `src/pet/pet.html`/`pet.js`: CSS로 그린 몬스터볼 DOM + 흔들림/딸깍/터짐 애니메이션, 상태 머신.
- README: 훅 설정 안내 갱신.
