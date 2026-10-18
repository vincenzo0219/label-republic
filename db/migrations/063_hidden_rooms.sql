-- Sprint 81: 사람이 없는 방은 숨긴다 (지우지 않음 — 글·주소·검색 유입은 그대로). 탭·홈·AI 자동 글에서 빠진다. 운영자가 /api/admin/rooms 로 켜고 끈다
ALTER TABLE categories ADD COLUMN is_hidden boolean NOT NULL DEFAULT false;
