-- Sprint 39: 방 개설에 필요한 동의 수를 최근 30일 활동 인원에 맞춘다 — 활동 인원 집계용 인덱스
CREATE INDEX IF NOT EXISTS fingerprints_last_seen_idx ON fingerprints (last_seen);
