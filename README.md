# day-check

TickTick처럼 항목을 강제로 여러 화면/분류로 나누지 않고, **한 페이지에서 투두를 빠르게 쌓고 나중에 분류를 붙이는** 개인용 일정/체크리스트 앱입니다.

## 현재 구현 상태 (v5)
- 메인 원페이지 투두 UI
- **큰 투두 입력창(한창) 제공**
  - 여러 줄 입력 가능 (줄바꿈마다 할 일 1개 저장)
- 입력 옵션
  - 날짜
  - 우선순위
  - 분류 선택
- **분류 추가 UX 개선 (팝업 없음)**
  - `+ 분류 추가` 클릭 시 입력창이 폼 옆에서 펼쳐짐
  - 새 분류를 즉시 생성 후 선택 가능
- 전체 투두 리스트에서 항목별 분류를 나중에 변경 가능
- 완료/삭제 처리
  - 완료 버튼: doneLog 기록 후 목록에서 제거
  - 삭제 버튼: 기록 없이 제거
- 브라우저 로컬스토리지 저장(남은 체크리스트는 다음날에도 유지)
- 이번 주 리포트
  - 이번 주 완료(지운 일)
  - 아직 남은 일
- 월간 달력 v3
  - 날짜 지정 투두와 달력 메모를 함께 표시
  - 날짜 셀 `일정 N · 완료 M`
  - 날짜 상세(추가/완료/메모) 확인

## 로컬 실행 방법
```bash
python3 -m http.server 4173
```
브라우저에서 `http://localhost:4173` 접속.

## GitHub 온라인 테스트 서버 (GitHub Pages)
이 저장소는 GitHub Actions로 Pages 자동 배포가 되도록 설정되어 있습니다.

1. GitHub 저장소 **Settings → Pages**로 이동
2. **Build and deployment**에서 Source를 `GitHub Actions`로 설정
3. `main` 또는 `work` 브랜치에 push
4. Actions의 `Deploy static site to GitHub Pages` 워크플로가 완료되면 아래 주소로 접속

```text
https://<github-username>.github.io/<repository-name>/
```
