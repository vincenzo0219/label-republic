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

/** 운영 닉네임 (src/lib/repo/metrics.ts OPERATOR_NICKS 와 같게). 화면에서 사람 말인지 가를 때 */
export const OPERATOR_NICKS_CLIENT = ["노방장", "돈키호테", "덕후1호", "💬 수다방", "울트라매니아", "동탄맨", "부산수지", "예은이", "러블리", "AI 큐레이터", "비즈파일럿"];

/** 💬 수다방 한 줄 아래 버튼 (10/29 대표님 "반가워요 등등이 바로 보여서 클릭만 하면"): 누르면 "@닉네임 반가워요!" */
export const CHAT_CHIPS = ["🙌 반가워요!", "저도요!", "ㅋㅋ 공감"] as const;
export const chatChipText = (nickname: string, chip: string) => `@${nickname} ${chip}`;

/** 버튼을 붙일 말: 사람(운영·AI 아님)이 쓴, 내 것이 아닌, 아직 내가 버튼으로 답하지 않은 최근 말 몇 개 */
export function chatChipTargets(
  msgs: { id: string; nickname: string; is_ai_curated?: boolean; hidden_reason?: string | null }[],
  myNick: string,
  done: ReadonlySet<string>,
  limit = 3,
): string[] {
  const me = myNick.trim();
  const out: string[] = [];
  for (let i = msgs.length - 1; i >= 0 && out.length < limit; i--) {
    const m = msgs[i]!;
    if (m.is_ai_curated || m.hidden_reason || OPERATOR_NICKS_CLIENT.includes(m.nickname.trim())) continue;
    if (me && m.nickname.trim() === me) continue;
    if (done.has(m.id)) continue;
    out.push(m.id);
  }
  return out;
}
