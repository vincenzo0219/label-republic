/**
 * 🙌 한 번 누르는 답장 버튼 (10/29 대표님 "1번"): 사람이 쓴 글 아래 버튼 하나로 바로 댓글.
 * 운영자는 댓글을 달지 않는다. 사람끼리 첫 답장을 쉽게 하려는 장치. 방마다 말을 바꿀 수 있다.
 */
export const QUICK_REPLY_DEFAULT = ["🙌 환영해요", "저도요!", "궁금해요", "어디서요?"] as const;

/** 방(주소)별 버튼. "neo" 는 💳 넣어둬 댓글, "tennis" 는 🎾 게임 모집 댓글 */
export const QUICK_REPLY_ROOMS: Record<string, readonly string[]> = {
  "테니스-덕후방": ["🙌 환영해요", "저 갈게요", "몇 시까지예요?", "저도 쳐요!"],
  tennis: ["저 갈게요", "몇 시까지예요?", "아직 자리 있어요?"],
  neo: ["🛒 사라!", "💳 참아!", "저도 고민 중", "대안 있어요?"],
  "미혼남녀-만남-행사": ["공감해요", "저도 솔로예요", "🙌 환영해요", "궁금해요"],
};

export const quickRepliesFor = (key: string | null | undefined): readonly string[] => (key && QUICK_REPLY_ROOMS[key]) || QUICK_REPLY_DEFAULT;

/** 버튼을 보일지: 사람 글이고, 내 글이 아니고, 아직 내가 댓글을 안 달았을 때 */
export function showQuickReplies(o: { human: boolean; mine: boolean; commented: boolean }): boolean {
  return o.human && !o.mine && !o.commented;
}

export const isQuickReply = (body: string, key: string | null | undefined): boolean => quickRepliesFor(key).includes(body.trim());
