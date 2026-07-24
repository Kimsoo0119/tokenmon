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

### 다중 세션

이벤트의 `session`(Claude Code `session_id`)으로 작업 중인 세션 집합을 유지:
하나라도 working → 볼 유지(2개 이상이면 ×N 배지), 전부 끝나면 펫 복귀.
딸깍+터짐은 마지막 작업 세션이 끝날 때만, 중간 완료는 "완료 · N개 작업 중"
말풍선만. `waiting`은 상태가 아니라 일회성 알림이다 — 상태로 유지하면 답하지
않은 세션이 쌓였을 때 새 작업이 볼에 못 들어간다. 다른 세션이 작업 중이면
탈출 대신 볼을 유지한 채 말풍선만 띄운다.

### 안전장치

- 볼 클릭 시 즉시 펫 복귀 + 세션 맵 초기화 (Stop 이벤트 유실 대비).
- 이벤트 없이 30분 지난 세션은 자동 제거 (1분 주기 점검).
- 볼 상태에서도 드래그로 창 이동 가능.

## 이벤트 형식

`events.jsonl` 한 줄: `{"type":"start"|"done"|"waiting","message":"...","session":"..."}`.
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
