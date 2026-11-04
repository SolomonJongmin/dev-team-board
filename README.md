# dev-team-board

Claude Code 옆에 개발팀 현황 패널을 띄우는 모드입니다. 팀원 목록과 직책, 지금 작업 중인 일, 칸반의 진행 중 항목, 최근 끝난 일, 사용자 결정이 필요한 항목을 15초마다 다시 읽어 보여 줍니다.

## 설치

Claude Code 터미널 세션에서:

```
/plugin install dev-team-board --marketplace SolomonJongmin/dev-team-board
```

`Add marketplace?` 에 `y`, 범위는 user 를 고른 뒤 **프로젝트 폴더**(projectRoot)를 입력합니다.

셸에서:

```
claude plugin install dev-team-board --marketplace SolomonJongmin/dev-team-board
```

데스크톱 앱에서는 프롬프트 옆 + → Plugins → Add marketplace 에 `SolomonJongmin/dev-team-board` → Add plugin.

## 프로젝트 폴더 구조

`projectRoot` 아래에 다음 파일을 읽습니다.

- `team/STATUS.md` — 작업 기록 표 (`| 시각 | 이름 | 작업 | running/done/... | 보고서 |`)
- `KANBAN.md` — `## 진행 중` 표와 `## 사용자 차례` 체크리스트
- `team/profiles/<이름>/soul.md` — 첫 줄 `# 이름 — 직책`

## 쓰는 법

세션이 시작되면 패널이 열립니다. 터미널이 좁아 안 보이면 `/dev-team` 을 입력하세요.

## 라이선스

MIT
