# tokenmon

Claude Code / Codex 주간 사용량에 따라 진화하는 macOS 데스크탑 펫.

## 실행

```bash
npm install
npm start
```

## 동작 방식

- 5분마다 주간 한도 소진율을 조회해 트레이에 % 표시
  - Claude: Keychain의 Claude Code OAuth 토큰으로 usage API 조회
  - Codex: `~/.codex/sessions/` 세션 로그의 rate_limits 스냅샷 (Codex를 써야 갱신됨)
- 소진율이 임계값(기본 균등분할)을 넘을 때마다 펫이 진화, 주간 리셋되면 1단계로 회귀
- 펫: 드래그로 이동, 클릭하면 공격 모션 + 사용량 말풍선
- 트레이 → 설정: 포켓몬 한글 이름으로 추가(진화체인 자동 인식), 커스텀 GIF 몬스터, 임계값 편집

## Claude Code 에이전트 연동 (선택)

`~/Library/Application Support/tokenmon/events.jsonl`에 한 줄이 추가되면 펫이 반응합니다:

- `{"type":"start","session":"..."}` — 도트 말풍선 "작업 시작!" + 펫 옆 ×N 작업 배지
- `{"type":"done","session":"..."}` — 몬스터볼이 날아와 펫을 포획(흔들 → 딸깍!)한 뒤 터지며 소환 + "작업 완료!"
- `{"type":"waiting","message":"...","session":"..."}` — 몬스터볼을 던졌지만 펫이 피하고(놓침!) 스킬 시전 + "답변을 기다리고 있어요!"
- `{"message":"..."}` — 점프 + 말풍선 알림 (기존 방식)

말풍선은 포켓몬 게임 대화창 스타일(도트 테두리 + Galmuri9 픽셀 폰트)로 표시됩니다.
`session`으로 여러 터미널의 세션을 구분해 작업 중 개수를 ×N 배지로 보여주고,
`project`(프로젝트 폴더명)를 넣으면 말풍선에 어디서 온 이벤트인지 표시됩니다.
연출이 겹치면 진행 중인 시퀀스만 재생하고 뒤 이벤트는 말풍선으로 처리하며,
이벤트 없이 30분 지난 세션은 자동 제거됩니다.

Claude Code 훅과 연결하려면 `~/.claude/settings.json`에 추가하세요:

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "jq -c '{type:\"start\", session:.session_id, project:(.cwd // \"\" | split(\"/\") | last // \"\")}' >> \"$HOME/Library/Application Support/tokenmon/events.jsonl\" 2>/dev/null || true",
            "timeout": 5,
            "async": true
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "jq -c '{type:\"done\", session:.session_id, project:(.cwd // \"\" | split(\"/\") | last // \"\")}' >> \"$HOME/Library/Application Support/tokenmon/events.jsonl\" 2>/dev/null || true",
            "timeout": 5,
            "async": true
          }
        ]
      }
    ],
    "Notification": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "jq -c '{type:\"waiting\", message:.message, session:.session_id, project:(.cwd // \"\" | split(\"/\") | last // \"\")}' >> \"$HOME/Library/Application Support/tokenmon/events.jsonl\" 2>/dev/null || true",
            "timeout": 5,
            "async": true
          }
        ]
      }
    ]
  }
}
```

## 데이터 출처

- 스프라이트: [pokemondb.net](https://pokemondb.net) 애니메이션 GIF (개인 용도)
- 진화체인/한글 이름: [PokeAPI](https://pokeapi.co)
