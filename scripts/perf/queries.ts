/**
 * 피드·검색 쿼리 단건 지연 측정 (서버 없이 DB에 직접).
 *
 *   DATABASE_URL=.../labelrep_perf npx tsx scripts/perf/queries.ts
 *
 * 각 쿼리를 두 번 실행해 첫 실행(cold)과 두 번째(warm) 시간을 출력한다.
 */
async function main() {
  const { pool } = await import("../../src/lib/db");
  const posts = await import("../../src/lib/repo/posts");
  const cats = await import("../../src/lib/repo/categories");
  const [first, mid] = [(await cats.listCategories())[0]!.id, (await cats.listCategories())[19]?.id ?? 1];

  async function time(label: string, fn: () => Promise<unknown>) {
    const t0 = performance.now();
    await fn();
    const cold = performance.now() - t0;
    const t1 = performance.now();
    await fn();
    console.log(label.padEnd(36), `${String(Math.round(cold)).padStart(5)}ms cold  ${String(Math.round(performance.now() - t1)).padStart(5)}ms warm`);
  }

  for (const sort of ["trust", "latest", "votes"] as const) {
    await time(`홈 ${sort}`, () => posts.listPosts({ sort }));
    await time(`홈 ${sort} 200쪽`, () => posts.listPosts({ sort, page: 200 }));
    await time(`보드 ${sort}`, () => posts.listPosts({ sort, categoryId: first }));
    await time(`보드 ${sort} 정모만`, () => posts.listPosts({ sort, categoryId: first, type: "meetup" }));
    await time(`작은 보드 ${sort} 잡담 10쪽`, () => posts.listPosts({ sort, categoryId: mid, type: "chat", page: 10 }));
  }
  for (const q of ["마그네슘", "비교", "성분표 함량", "스위치 윤활", "철분", "비오틴", "철분 윤활", "없는검색어입니다", "zz"]) {
    for (const sort of ["trust", "latest"] as const) await time(`검색 "${q}" ${sort}`, () => posts.listPosts({ sort, q }));
  }
  await time("리포트 새 글", () => posts.listNewPosts([first, first + 1, first + 2], new Date(Date.now() - 7 * 86400e3)));
  await time("전체 피드", () => posts.listFeedPosts());
  await time("보드 피드", () => posts.listFeedPosts(first + 2));
  await time("다가오는 정모", () => posts.listUpcomingMeetups([first, first + 1, first + 2]));
  await time("글 상세", () => posts.getPost("12345"));
  await pool().end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

export {};
