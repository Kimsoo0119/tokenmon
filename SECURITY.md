# 보안 정책

## 이 앱이 다루는 민감한 정보

tokenmon은 사용량을 조회하기 위해 다음 정보를 읽습니다.

- **Claude Code OAuth 토큰**: macOS Keychain의 `Claude Code-credentials` 항목에서 읽어 Anthropic usage API 호출에만 사용합니다.
- **Codex 세션 로그**: `~/.codex/sessions/`의 JSONL 파일에서 사용량 한도 스냅샷만 읽습니다. 대화 내용은 읽지 않습니다.

읽어온 토큰은 디스크에 따로 저장하거나 화면에 표시하지 않으며, Anthropic API 외의 어떤 서버로도 전송하지 않습니다. 앱이 저장하는 것은 `~/Library/Application Support/tokenmon/`의 설정과 마지막 사용량 수치(퍼센트)뿐입니다.

## 취약점 제보

보안 문제를 발견하셨다면 공개 이슈 대신 [Security Advisory](https://github.com/Kimsoo0119/tokenmon/security/advisories/new)로 비공개 제보해주세요. 확인 후 회신드리겠습니다.

개인이 운영하는 작은 프로젝트라 정해진 응답 시한을 약속드리기는 어렵지만, 확인하는 대로 처리하겠습니다.

## 지원 범위

가장 최신 커밋(`main`)만 유지보수합니다.
