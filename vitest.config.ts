import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // DB 통합 테스트는 같은 DB를 공유하므로 파일 단위 병렬 실행을 끈다.
    fileParallelism: false,
  },
});
