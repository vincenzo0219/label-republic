/**
 * 카톡에 붙이는 짧은 링크 (10/23 사용자 "카톡에 올릴 때 미리보기 카드 안 나오게, 육아덕후방 글자도 안 보이게").
 * 주소에 방 이름이 안 드러나는 짧은 코드 → 사람은 바로 그 글로 보내고,
 * 카카오톡 미리보기 수집기(kakaotalk-scrap)에는 제목·OG 없는 빈 페이지를 줘서 카드가 안 뜨게 한다.
 */
const LINKS: Record<string, string | { path: string; from: string }> = {
  "1": "/posts/9110", // 출산·육아 지원금 한 장
  "2": "/posts/9111", // 예방접종 시기 한 장
  "3": "/posts/9112", // 밤에 열날 때
  "4": "/posts/9113", // 베이비페어 일정
  "5": "/c/육아-덕후방",
  "6": "/parent-test",
  "7": { path: "/c/요가-필라테스-덕후방", from: "kakao_pilates" }, // 필라테스 강사 오픈채팅
  "8": { path: "/c/미국주식방", from: "kakao_usstock" }, // 해외주식 오픈채팅
  "9": { path: "/margin-calc", from: "kakao_econ" }, // 경제 오픈채팅
  "10": { path: "/c/요가-필라테스-강사방", from: "kakao_instructor" }, // 요가·필라테스 대강 오픈채팅 → 📋 대강·구인
  "11": { path: "/c/러닝-덕후방?tab=chat", from: "kakao_running" }, // 러닝 오픈채팅 (춘천마라톤 날) → 💬 채팅
};

const SCRAPER = /kakaotalk-scrap|kakaostory-og-reader|facebookexternalhit|Slackbot|Twitterbot|Discordbot|TelegramBot|Line\//i;

export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const link = LINKS[code];
  if (!link) return new Response("Not found", { status: 404 });
  if (SCRAPER.test(req.headers.get("user-agent") ?? "")) {
    return new Response("<!doctype html><meta charset=utf-8><meta name=robots content=noindex>", {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
    });
  }
  const { path, from } = typeof link === "string" ? { path: link, from: "kakao" } : link;
  const to = new URL(path, req.url);
  to.searchParams.set("from", from);
  return new Response(null, { status: 302, headers: { location: to.pathname + to.search, "cache-control": "no-store" } });
}
