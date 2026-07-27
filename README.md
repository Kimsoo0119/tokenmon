# tokenmon

[![test](https://github.com/Kimsoo0119/tokenmon/actions/workflows/test.yml/badge.svg)](https://github.com/Kimsoo0119/tokenmon/actions/workflows/test.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Claude Code / Codex 주간 사용량에 따라 진화하는 macOS 데스크탑 펫.

토큰을 쓸수록 펫이 자랍니다. 주간 한도 소진율이 임계값을 넘을 때마다 진화하고, 한도가 리셋되면 다시 1단계로 돌아옵니다.

<!--
  스크린샷 자리입니다. 아래 주석을 풀고 assets/ 에 이미지를 넣으면 바로 표시됩니다.
  펫과 사용량 패널이 함께 보이는 컷이면 한 장으로 설명이 끝납니다.

![tokenmon 실행 화면](assets/screenshot.png)
-->

## 요구 사항

- macOS (트레이 아이콘, Keychain 연동이 macOS 전용입니다)
- Node.js 20 이상
- Claude Code 또는 Codex CLI 사용 이력 (사용량을 읽어올 대상)

## 실행

```bash
npm install
npm start
```

## 동작 방식

- 5분마다 주간 한도 소진율을 조회해 트레이에 `Lv.` 표시
  - Claude: Keychain의 Claude Code OAuth 토큰으로 usage API 조회
  - Codex: `~/.codex/sessions/` 세션 로그의 rate_limits 스냅샷 (Codex를 써야 갱신됨)
- 소진율이 임계값(기본 균등분할)을 넘을 때마다 펫이 진화, 주간 리셋되면 1단계로 회귀
- 펫: 드래그로 이동, 클릭하면 공격 모션 + 사용량 말풍선
- 트레이 → 설정: 포켓몬 한글 이름으로 추가(진화체인 자동 인식), 커스텀 GIF 몬스터, 임계값 편집

설정과 캐시는 `~/Library/Application Support/tokenmon/` 에 저장됩니다.

## Claude Code 알림 연동 (선택)

`~/Library/Application Support/tokenmon/events.jsonl`에 `{"message":"..."}` 한 줄이 추가되면 펫이 점프하며 말풍선으로 알려줍니다. Claude Code의 Notification 훅과 연결하려면 `~/.claude/settings.json`에 추가하세요:

```json
{
  "hooks": {
    "Notification": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "jq -c '{message: .message}' >> \"$HOME/Library/Application Support/tokenmon/events.jsonl\" 2>/dev/null || true",
            "timeout": 5,
            "async": true
          }
        ]
      }
    ]
  }
}
```

## 개발

의존성은 Electron 하나뿐이고, 테스트는 Node 내장 러너로 돕니다.

```bash
npm test
```

버그 제보나 기능 제안은 [이슈](https://github.com/Kimsoo0119/tokenmon/issues)로 남겨주세요. Pull Request도 환영합니다. 보내기 전에 `npm test`가 통과하는지만 확인해주시면 됩니다.

## 데이터 출처 및 고지

- 스프라이트: [pokemondb.net](https://pokemondb.net)의 애니메이션 GIF
- 진화체인 / 한글 이름: [PokeAPI](https://pokeapi.co)

스프라이트 이미지는 이 저장소에 포함되어 있지 않으며, 앱이 실행 중에 내려받아 로컬에만 저장합니다. 포켓몬의 이름과 이미지에 대한 권리는 Nintendo / Creatures Inc. / GAME FREAK Inc. 에 있습니다. 이 프로젝트는 위 회사들과 아무런 관련이 없는 비공식 팬 프로젝트이며, 개인적인 용도로만 사용하시기 바랍니다.

## 라이선스

이 저장소의 **코드**는 [MIT 라이선스](LICENSE)를 따릅니다. 위에 적은 대로 포켓몬 관련 자산은 MIT 적용 대상이 아닙니다.
