/** ✍️ 나는 어떤 장르 작가? 1분 테스트 (10/24, 작가지망생방, 육아 테스트와 같은 틀). 쓰고 싶은 장면·설정 취향만 묻는다. 결과는 짧고 모두 긍정적으로. */
export const WRITER_INTRO_POST_ID = "11114"; // 작가지망생방 채팅 (seed_key roomchat:작가지망생방)

export type WriterGenre = "fantasy" | "hyunpan" | "rofan" | "murim" | "romance" | "althist";
export type WriterAnswers = {
  start: WriterGenre; // 주인공이 눈뜬 곳
  scene: WriterGenre; // 제일 쓰고 싶은 장면
  notes: WriterGenre; // 설정 노트에 많은 것
  grow: WriterGenre; // 주인공이 크는 방식
  comment: "cider" | "world" | "flutter"; // 듣고 싶은 댓글
};
export type WriterType = { key: WriterGenre; emoji: string; name: string; what: string };

export const WRITER_TYPES: Record<WriterGenre, WriterType> = {
  fantasy: { key: "fantasy", emoji: "🐉", name: "판타지 설계자", what: "세계관부터 짜요. 설정집이 본편보다 두꺼워요." },
  hyunpan: { key: "hyunpan", emoji: "🏙️", name: "현판 사이다꾼", what: "회귀, 각성, 상태창. 1화부터 시원하게 터뜨려요." },
  rofan: { key: "rofan", emoji: "👑", name: "로판 빙의러", what: "눈 떠 보니 악녀. 드레스 입고 운명을 바꿔요." },
  murim: { key: "murim", emoji: "⚔️", name: "무협 고수", what: "문파 이름 짓는 게 제일 즐거워요. 검으로 말해요." },
  romance: { key: "romance", emoji: "💌", name: "로맨스 설렘꾼", what: "눈 마주치는 한 장면에 공을 들여요. 현로도 좋아요." },
  althist: { key: "althist", emoji: "🚀", name: "대체역사·SF 탐구자", what: "그때 다른 선택을 했다면. 자료부터 쌓아요." },
};

const COMMENT_GENRES: Record<WriterAnswers["comment"], WriterGenre[]> = {
  cider: ["hyunpan", "murim"],
  world: ["fantasy", "althist"],
  flutter: ["rofan", "romance"],
};

/** 고른 장르마다 1점, 댓글 질문은 두 장르에 1점씩. 동점이면 첫 질문에서 고른 장르, 그다음 판타지 → 현판 → 로판 → 무협 → 로맨스 → 대체역사 순 */
export function writerPick(a: WriterAnswers): WriterType {
  const s: Record<WriterGenre, number> = { fantasy: 0, hyunpan: 0, rofan: 0, murim: 0, romance: 0, althist: 0 };
  for (const g of [a.start, a.scene, a.notes, a.grow, ...COMMENT_GENRES[a.comment]]) s[g] += 1;
  const order: WriterGenre[] = [a.start, "fantasy", "hyunpan", "rofan", "murim", "romance", "althist"];
  const best = order.reduce((b, k) => (s[k] > s[b] ? k : b), order[0]!);
  return WRITER_TYPES[best];
}

export const writerBragLine = (t: WriterType) => `✍️ 장르 작가 테스트: ${t.emoji} ${t.name} / 쓰는 중: `;
