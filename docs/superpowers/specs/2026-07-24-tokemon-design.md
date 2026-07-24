# tokemon — 데스크탑 진화 펫 설계 스펙

작성일: 2026-07-24 · 상태: 승인됨

## 개요

macOS 데스크탑에 포켓몬/디지몬 스프라이트를 띄우고, Claude Code 주간 한도 소진율 또는
Codex 주간 한도 소진율에 따라 펫이 진화하는 Electron 앱.
주간 한도가 리셋되면 펫도 1단계로 회귀한다 (매주 새로 키우는 주기).

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

Electron 앱 하나, 프로세스 구조 최소화:

- **메인 프로세스**
  - 트레이 아이콘 (설정 열기 / 종료 / 소스 상태 표시)
  - 펫 창·설정 창 생명주기 관리
  - 5분 간격 사용량 폴링 → 펫 창에 IPC로 push
  - 설정 저장: `app.getPath('userData')/config.json`
- **펫 창** (투명 + 항상 최상위 + 프레임리스, 마우스 이벤트 수신)
  - `<img>`로 현재 단계 GIF 재생
  - 드래그로 위치 이동, 위치는 config에 저장
  - 클릭: CSS 공격 모션(돌진 + 플래시) + 사용량 툴팁 말풍선(현재 % / 다음 진화까지 남은 %)
  - 진화 순간: 흰색 플래시 이펙트 후 다음 단계 GIF로 교체
- **설정 창** (일반 창, 트레이 메뉴에서 열림)
  - 소스 선택 (Claude / Codex)
  - 몬스터 관리 (추가/삭제/활성 선택)
  - 단계·임계값 편집

## 데이터 소스 (2026-07-24 실증 완료)

| 소스 | 방법 | 주간 % 필드 |
|---|---|---|
| Claude | macOS Keychain `Claude Code-credentials` → accessToken → `GET https://api.anthropic.com/api/oauth/usage` (`anthropic-beta: oauth-2025-04-20`) | `seven_day.utilization` |
| Codex | `~/.codex/sessions/**/*.jsonl` 최신 파일을 뒤에서부터 스캔, `event_msg.token_count` 이벤트 | `rate_limits.secondary.used_percent` (window_minutes=10080) |

에러 처리:
- 토큰 만료/네트워크 실패: 마지막 성공 값 유지, 트레이 아이콘에 경고 배지
- Codex 로그에 rate_limits 없는 세션: 더 이전 파일로 fallback
- 주간 리셋(% 하락) 감지 시 단계 하향도 정상 동작 (진화 로직은 단순히 현재 % 기준 재계산)

## 진화 로직

```jsonc
// config.json 핵심 스키마
{
  "source": "claude",            // "claude" | "codex"
  "pollIntervalMin": 5,
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

- 현재 단계 = thresholds에서 현재 % 이상인 마지막 인덱스 + 1 (0-기반)
- 기본 3단계. 단계 추가/삭제 시 임계값 균등분할로 초기화, 수동 수정 가능
- 임계값 검증: 오름차순, 0~100 사이

## 몬스터 추가

1. 설정에서 한글 이름 입력 (예: "피카츄")
2. 내장 `names-ko.json`(빌드 시 PokeAPI species 전체에서 생성한 한글→영문 슬러그 매핑, ~1000 엔트리)에서 변환. 실패 시 입력값을 영문 슬러그로 간주 (영문 입력 허용)
3. PokeAPI `pokemon-species` → `evolution-chain`으로 계보 인식, 한글 이름으로 표시 (피츄 → 피카츄 → 라이츄)
4. 분기 진화(이브이 등): 첫 번째 분기 기본 선택 + 드롭다운으로 변경
5. 각 단계 GIF를 `https://img.pokemondb.net/sprites/black-white/anim/normal/{slug}.gif`에서 다운로드, `userData/cache/`에 저장
6. 디지몬/커스텀: 단계별 로컬 GIF 파일 직접 지정, 이름 자유 입력

## 하지 않는 것 (YAGNI)

- 걸어다니기/배회 모션
- Windows/Linux 지원
- 자동 업데이트
- 펫 여러 마리 동시 표시
- 누적 토큰량 기반 모드 (한도 소진율만)

## 테스트

- 진화 로직(% → 단계 계산, 리셋 회귀, 임계값 검증): 순수 함수로 분리해 단위 테스트
- Codex JSONL 파서: 실제 로그 샘플 픽스처로 테스트
- 나머지(창/트레이/GIF)는 수동 확인
