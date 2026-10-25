import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // DB 통합 테스트는 같은 DB를 공유하므로 파일 단위 병렬 실행을 끈다.
    fileParallelism: false,
    // 운영에서는 대표님 허락 없이 자동 댓글을 달지 않는다(10/25). 테스트는 기존 동작을 그대로 검증하려고 켠다.
    env: { WELCOME_REPLIES: "1", CURATOR_SEED_COMMENTS: "1" },
  },
});
