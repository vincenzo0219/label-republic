/**
 * 방 배지 (10/24): 방의 1분 테스트 결과를 닉네임 옆 작은 칩으로. 지금은 작가지망생방(장르 작가 테스트)만.
 */
import { WRITER_TYPES, type WriterGenre } from "./writerTest";

/** 장르 배지 켜기/끄기 (사용자 10/24 "반응을 보고 뺄 수도"). false 면 배지 조회가 비고 칩이 안 보인다 */
export const WRITER_BADGE_ENABLED = true;

export type RoomBadgeTest = { test: string; label: (result: string) => string | undefined };

export const ROOM_BADGES: Record<string, RoomBadgeTest> = !WRITER_BADGE_ENABLED ? {} : {
  작가지망생방: {
    test: "writer",
    label: (r) => {
      const t = Object.hasOwn(WRITER_TYPES, r) ? WRITER_TYPES[r as WriterGenre] : undefined;
      return t && `${t.emoji} ${t.name}`;
    },
  },
};

/** 테스트 키 → 결과로 받을 수 있는 값 */
export const TEST_RESULT_KEYS: Record<string, ReadonlySet<string>> = {
  writer: new Set(Object.keys(WRITER_TYPES)),
};

/** nickname_claims.key 와 같은 모양 (클라이언트에서도 쓴다) */
export const identityKey = (nickname: string) => nickname.replace(/\s/g, "").toLowerCase();

export type BadgeMap = Record<string, string>;

/** 화면에서: 배지 맵에서 이 닉네임의 배지 */
export const badgeOf = (badges: BadgeMap | undefined, nickname: string) => {
  const k = identityKey(nickname);
  return badges && Object.hasOwn(badges, k) ? badges[k] : undefined;
};
