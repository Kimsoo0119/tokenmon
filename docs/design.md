# tokenmon 설계 문서

Claude Code / Codex 주간 한도 소진율에 따라 진화하는 macOS 데스크탑 펫의 설계 배경을 정리한 문서입니다. 최초 설계는 2026-07-24에 작성했고, 이후 구현하며 달라진 부분을 반영해 갱신했습니다.

## 개요

macOS 데스크탑에 포켓몬 스프라이트를 띄우고, Claude Code 또는 Codex의 주간 한도 소진율에 따라 펫이 진화합니다. 주간 한도가 리셋되면 펫도 1단계로 돌아옵니다. 매주 새로 키우는 주기입니다.

## 확정 사항

| 항목 | 결정 |
|---|---|
| 진화 기준 | 주간 한도 소진율 % (Claude `seven_day.utilization` / Codex `secondary.used_percent`) |
| 스택 | Electron (투명 프레임리스 BrowserWindow) |
| 소스↔펫 | 펫 1마리, 설정에서 Claude/Codex 중 소스 선택 |
| 모션 | GIF 재생 (`<img>` 네이티브 재생, 애니메이션 코드 없음) |
| 몬스터 추가 | 한글 이름 입력 → 자동 다운로드 + PokeAPI 진화체인 자동 인식. 커스텀은 로컬 GIF 지정 |
| 플랫폼 | macOS 전용 |

## 아키텍처

Electron 앱 하나로, 메인 프로세스와 렌더러 창 세 개로 구성됩니다.

**메인 프로세스** (`src/main.js`)

- 트레이 아이콘: 현재 펫 스프라이트 + `Lv.{주간 소진율}` 표시. 조회에 실패하면 `⚠️`
- 펫 · 패널 · 말풍선 창의 생명주기 관리
- 5분 간격 사용량 폴링 후 각 창에 IPC로 전달 (`pollIntervalMin`으로 조정)
- 설정 저장: `app.getPath('userData')/config.json`
- `events.jsonl` 감시 (아래 *외부 알림 연동* 참고)

**펫 창** (`src/pet/`) — 투명 · 프레임리스 · 항상 최상위

- `<img>`로 현재 단계 GIF 재생
- 드래그로 위치 이동, 위치는 config에 저장
- 클릭하면 CSS 공격 모션과 함께 사용량 말풍선 표시
- 진화하는 순간에는 플래시 이펙트 후 다음 단계 GIF로 교체
- 몬스터가 없으면 알 이미지를 흔들며 띄우고, 클릭하면 설정이 열립니다 (첫 실행 온보딩)
- 스프라이트 바깥의 투명한 여백은 클릭이 아래 창으로 통과합니다

**패널 창** (`src/panel/`) — 트레이를 누르면 열리는 사용량 카드

- 5시간 / 주간 사용량 게이지와 다음 진화까지 남은 수치
- 설정도 이 안에 접이식 섹션으로 들어 있습니다. 별도의 설정 창은 두지 않습니다
- 카드 실제 높이에 맞춰 창 크기가 따라갑니다. 고정 높이로 두면 투명 창 주변에 OS 그림자가 남습니다

**말풍선 창** (`src/pet/bubble.html`) — 독립된 투명 창

펫 창 안에 말풍선을 그리면 펫 창 크기에 갇혀 잘리기 때문에 별도 창으로 분리했습니다. 펫 위치를 기준으로 위아래를 자동으로 정하고, 화면 밖으로 나가지 않도록 좌표를 직접 보정한 뒤 꼬리 위치만 따로 옮깁니다.

## 데이터 소스

| 소스 | 방법 | 주간 % 필드 |
|---|---|---|
| Claude | macOS Keychain `Claude Code-credentials` → accessToken → `GET https://api.anthropic.com/api/oauth/usage` (`anthropic-beta: oauth-2025-04-20`) | `seven_day.utilization` |
| Codex | `~/.codex/sessions/**/*.jsonl` 중 수정 시각이 최근인 50개를 스캔 | `rate_limits.secondary.used_percent` (window_minutes=10080) |

에러 처리:

- **429 응답**: usage 엔드포인트에는 호출 제한이 있습니다. 2026년 7월에 실측해보니 **5분 남짓한 창에 4회까지 통과하고 5회째부터 429**가 나오며, `retry-after`로 300초를 줍니다. 응답에 `anthropic-ratelimit-*` 헤더가 없어 남은 횟수를 미리 알 방법은 없습니다. 429를 받으면 `retry-after`만큼(헤더가 없으면 300초) 조회를 멈추고 여유분 30초를 더해 재시도하며, 그동안에는 마지막 값을 그대로 보여줍니다.

  참고로 [공개 API 문서의 rate limit](https://platform.claude.com/docs/en/api/rate-limits)은 Messages API 기준이라 이 엔드포인트에는 적용되지 않습니다.

  기본값인 5분 주기는 이 한계에서 충분히 여유가 있어 429를 맞지 않습니다. 주기를 줄이더라도 2분 아래로는 내리지 않는 편이 좋습니다. 1분으로 잡으면 5분에 5회를 호출해 한계선에 걸리기 때문에 주기적으로 429를 맞고, 그때마다 5분 넘게 값이 멈춰 오히려 갱신이 느려집니다. Codex는 로컬 파일만 읽기 때문에 이 제한과 무관합니다.
- **토큰 만료 · 네트워크 실패**: 마지막 성공 값을 계속 표시하고 트레이에 경고를 띄웁니다. 이 값은 config에 저장해두어 앱을 다시 켰을 때도 곧바로 보여줍니다.
- **Codex 로그에 rate_limits가 없는 세션**: 더 이전 파일로 넘어갑니다.
- **주간 리셋**: 소진율이 떨어지면 단계도 자연히 내려갑니다. 진화 로직이 현재 % 기준으로 매번 다시 계산하기 때문에 따로 처리할 것이 없습니다.

## 진화 로직

```jsonc
// config.json 핵심 스키마
{
  "source": "claude",            // "claude" | "codex"
  "pollIntervalMin": 5,
  "petSize": 140,
  "lastUsage": null,             // 마지막 성공 조회값 캐시
  "petPosition": { "x": 0, "y": 0 },
  "activeMonster": "pikachu-line",
  "monsters": {
    "pikachu-line": {
      "displayName": "피카츄",
      "stages": [
        { "name": "피츄",   "gif": "cache/pichu.gif" },
        { "name": "피카츄", "gif": "cache/pikachu.gif" },
        { "name": "라이츄", "gif": "cache/raichu.gif" }
      ],
      "thresholds": [33, 66]     // 길이 = stages.length - 1
    }
  }
}
```

- 현재 단계는 thresholds 중 현재 % 이상인 마지막 인덱스에 1을 더한 값입니다 (0-기반)
- 기본은 3단계입니다. 단계를 추가하거나 지우면 임계값을 균등분할로 다시 잡고, 이후 수동으로 고칠 수 있습니다
- 임계값은 오름차순이면서 0에서 100 사이여야 합니다

## 몬스터 추가

1. 설정에서 한글 이름을 입력합니다 (예: "피카츄")
2. 내장 `assets/names-ko.json`에서 영문 슬러그로 변환합니다. 이 파일은 빌드 시 PokeAPI species 전체에서 만든 한글→영문 매핑입니다. 변환에 실패하면 입력값을 영문 슬러그로 봅니다
3. PokeAPI의 `pokemon-species` → `evolution-chain`으로 계보를 인식해 한글 이름으로 표시합니다 (피츄 → 피카츄 → 라이츄)
4. 분기 진화(이브이 등)는 첫 번째 분기를 기본으로 고르고 드롭다운으로 바꿉니다
5. 각 단계 GIF를 `https://img.pokemondb.net/sprites/black-white/anim/normal/{slug}.gif`에서 받아 `userData/cache/`에 저장합니다
6. 커스텀 몬스터는 단계별로 로컬 GIF를 직접 지정하고 이름도 자유롭게 적습니다

스프라이트는 저장소에 포함하지 않고 실행 중에만 내려받습니다.

## 외부 알림 연동

`userData/events.jsonl`에 `{"message":"..."}` 한 줄이 추가되면 펫이 점프하며 말풍선으로 알립니다. 메인 프로세스가 `fs.watch`로 파일을 감시하다가 새로 늘어난 줄만 읽어 펫 창에 전달합니다. Claude Code의 Notification 훅과 연결하는 방법은 [README](../README.md)에 적어두었습니다.

알림 메시지는 외부에서 들어온 문자열이므로 DOM에 넣기 전에 반드시 이스케이프합니다.

## 보안상의 선택

렌더러는 `nodeIntegration: true`, `contextIsolation: false`로 둡니다. 외부 콘텐츠를 전혀 띄우지 않는 로컬 전용 앱이라 preload 다리를 놓는 비용이 이득보다 크다고 판단했습니다. 대신 외부에서 들어오는 문자열(알림 메시지, 사용자가 입력한 몬스터 이름, PokeAPI 슬러그)은 이스케이프와 검증을 거칩니다.

## 하지 않는 것

- 걸어다니기 · 배회 모션
- Windows / Linux 지원
- 자동 업데이트
- 펫 여러 마리 동시 표시
- 누적 토큰량 기반 모드 (한도 소진율만 씁니다)

## 테스트

진화 로직(% → 단계 계산, 리셋 회귀, 임계값 검증), Codex JSONL 파서, config 병합, PokeAPI 슬러그 검증을 순수 함수로 떼어내 `node:test`로 검증합니다. Electron이나 네트워크에 기대지 않아 CI에서 Electron 바이너리 없이 돕니다.

창 · 트레이 · GIF 재생은 수동으로 확인합니다.
