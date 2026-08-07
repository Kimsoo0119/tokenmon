# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Claude Code / Codex 주간 한도 소진율에 따라 진화하는 macOS 전용 Electron 데스크탑 펫. 설계 배경과 상세 아키텍처는 `docs/design.md`에 있으니 구조를 바꾸는 작업 전에 먼저 읽을 것.

## 명령어

```bash
npm start     # 앱 실행 (electron .)
npm run lint  # ESLint
npm test      # node --test — test/*.test.js 전체 실행
node --test test/evolution.test.js   # 단일 테스트 파일
```

테스트는 Node 내장 러너만 사용하며 Electron·네트워크에 의존하지 않는다. CI도 `npm ci --ignore-scripts`로 Electron 바이너리 없이 lint + test(Node 20/22)만 돈다.

## 아키텍처

Electron 앱 하나. 메인 프로세스(`src/main.js`)가 트레이, 5분 주기 사용량 폴링, config 저장(`userData/config.json`), `events.jsonl` 감시를 맡고, 렌더러 창 세 개에 IPC로 뿌린다:

- **펫 창** `src/pet/` — 투명·프레임리스·최상위. GIF 재생, 드래그, 클릭 시 공격 모션 + 말풍선
- **패널 창** `src/panel/` — 트레이 클릭 시 열리는 사용량 카드. 설정(`src/settings/`)도 이 안에 접이식으로 포함, 별도 설정 창 없음
- **말풍선 창** `src/pet/bubble.html` — 펫 창 크기에 갇히지 않도록 분리한 독립 투명 창

순수 로직은 렌더러/메인과 분리된 모듈로 떼어져 있고, 이것들만 테스트 대상이다:

- `src/evolution.js` — 소진율 % → 단계 계산 (thresholds 기반, 매번 재계산이라 주간 리셋 처리가 따로 없음)
- `src/config.js` — config 기본값 병합·검증
- `src/usage/claude.js` — Keychain의 OAuth 토큰으로 usage API 조회 (`seven_day.utilization`)
- `src/usage/codex.js` — `~/.codex/sessions/**/*.jsonl` 파싱 (`rate_limits.secondary.used_percent`)
- `src/pokeapi.js` — 슬러그 검증, 진화체인 인식

`assets/names-ko.json`(한글 이름 → 영문 슬러그)은 `scripts/build-names-ko.js`로 PokeAPI에서 생성한 빌드 산출물이다.

## 프로젝트 방침 (CONTRIBUTING.md 요약)

- **의존성 추가 금지.** 런타임 의존성은 Electron 하나뿐이며 나머지는 Node 내장 모듈로 해결한다.
- **렌더러는 `nodeIntegration: true`, `contextIsolation: false`가 의도된 선택이다.** 되돌리려 하지 말 것. 대신 외부에서 온 문자열(알림 메시지, 사용자 입력 몬스터 이름, PokeAPI 슬러그)은 DOM에 넣기 전 반드시 이스케이프한다.
- **스프라이트 이미지는 저장소에 넣지 않는다.** 실행 중에 내려받아 `userData/cache/`에만 둔다.
- 로직을 추가·수정하면 순수 함수 단위 테스트를 `test/`에 함께 넣는다.
- Claude usage API에는 호출 제한이 있다(약 5분 창에 4회). 폴링 주기를 2분 아래로 내리는 변경은 하지 말 것 — 근거는 `docs/design.md`의 429 실측 기록 참고.

## 커밋 메시지

`타입(범위): 한국어 존댓말 평서문` — 제목은 `~합니다`로 끝나는 40자 내외 한 문장, 마침표 없음. 타입은 `feat`/`fix`/`refactor`/`perf`/`style`/`docs`/`test`/`chore`, 범위는 주로 `pet`/`panel`/`bubble`/`tray`/`usage`/`config`/`ci`(애매하면 생략). 본문에는 diff로 알 수 없는 "왜"를 적는다. 상세 규칙과 예시는 `CONTRIBUTING.md`, 템플릿은 `.gitmessage`.
