# tokemon

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

## 데이터 출처

- 스프라이트: [pokemondb.net](https://pokemondb.net) 애니메이션 GIF (개인 용도)
- 진화체인/한글 이름: [PokeAPI](https://pokeapi.co)
