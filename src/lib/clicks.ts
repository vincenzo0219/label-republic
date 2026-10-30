/**
 * 페이지 버튼 클릭 세기 (10/30 대표님 "저 화면에서 다른 버튼 누르는 비율은?"). 서버가 정한 페이지·버튼 이름만 받는다.
 */
export const CLICK_KEYS: Record<string, Record<string, string>> = {
  "fan-test": {
    kakao: "💬 카톡으로 매주 순위 받기",
    daily: "🔔 내일 질문 알림",
    rank: "📊 결과 순위",
    brag: "결과 남기기",
    poll: "오늘의 질문 투표",
    pk: "⚽ 승부차기 대결",
    retry: "다시 하기",
    room: "⚽ K리그 덕후방 가기",
  },
};

/** 이 페이지에서 세는 버튼인가 */
export const isClickKey = (page: unknown, key: unknown): boolean =>
  typeof page === "string" && typeof key === "string" && Object.prototype.hasOwnProperty.call(CLICK_KEYS, page) && Object.prototype.hasOwnProperty.call(CLICK_KEYS[page]!, key);

/** 누른 곳(가장 가까운 a·button)으로 버튼 이름 찾기: ⚽ 팬 테스트 결과 화면 */
export function fanTestClickKey(el: { closest(sel: string): { getAttribute(n: string): string | null; textContent: string | null } | null }): string | null {
  const t = el.closest("a, button");
  if (!t) return null;
  const marked = t.getAttribute("data-click");
  if (marked) return marked;
  const href = t.getAttribute("href") ?? "";
  const text = (t.textContent ?? "").trim();
  if (el.closest(".debate-sides")) return "poll";
  if (/카톡/.test(text)) return "kakao";
  if (/내일 질문 알림/.test(text)) return "daily";
  if (href.startsWith("/rank")) return "rank";
  if (/결과 남기기/.test(text)) return "brag";
  return null;
}
