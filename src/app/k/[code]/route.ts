/**
 * 카톡에 붙이는 짧은 링크 (10/23 사용자 "카톡에 올릴 때 미리보기 카드 안 나오게, 육아덕후방 글자도 안 보이게").
 * 주소에 방 이름이 안 드러나는 짧은 코드 → 사람은 바로 그 글로 보내고,
 * 카카오톡 미리보기 수집기(kakaotalk-scrap)에는 제목·OG 없는 빈 페이지를 줘서 카드가 안 뜨게 한다.
 */
const LINKS: Record<string, string> = {
  "1": "/posts/9110", // 출산·육아 지원금 한 장
  "2": "/posts/9111", // 예방접종 시기 한 장
  "3": "/posts/9112", // 밤에 열날 때
  "4": "/posts/9113", // 베이비페어 일정
  "5": "/c/육아-덕후방",
  "6": "/parent-test",
};

const SCRAPER = /kakaotalk-scrap|kakaostory-og-reader|facebookexternalhit|Slackbot|Twitterbot|Discordbot|TelegramBot|Line\//i;

export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const path = LINKS[code];
  if (!path) return new Response("Not found", { status: 404 });
  if (SCRAPER.test(req.headers.get("user-agent") ?? "")) {
    return new Response("<!doctype html><meta charset=utf-8><meta name=robots content=noindex>", {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
    });
  }
  const to = new URL(path, req.url);
  to.searchParams.set("from", "kakao");
  return new Response(null, { status: 302, headers: { location: to.pathname + to.search, "cache-control": "no-store" } });
}
