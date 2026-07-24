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

- `{"type":"start"}` — 펫이 몬스터볼에 잡혀 들어가고, 작업 중인 동안 볼이 흔들림
- `{"type":"done"}` — 볼이 딸깍! 잠긴 뒤 터지며 펫이 나옴 (작업 완료)
- `{"type":"waiting","message":"..."}` — 볼이 터지며 펫이 탈출 (답변 대기 알림)
- `{"message":"..."}` — 점프 + 말풍선 알림 (기존 방식)

볼 상태가 꼬이면 볼을 클릭해 바로 꺼낼 수 있고, 30분 무이벤트 시 자동 복귀합니다.

Claude Code 훅과 연결하려면 `~/.claude/settings.json`에 추가하세요:

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "echo '{\"type\":\"start\"}' >> \"$HOME/Library/Application Support/tokenmon/events.jsonl\"",
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
            "command": "echo '{\"type\":\"done\"}' >> \"$HOME/Library/Application Support/tokenmon/events.jsonl\"",
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
            "command": "jq -c '{type: \"waiting\", message: .message}' >> \"$HOME/Library/Application Support/tokenmon/events.jsonl\" 2>/dev/null || true",
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
