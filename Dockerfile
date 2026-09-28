# syntax=docker/dockerfile:1
# 라벨공화국 운영 이미지 — Next.js 커스텀 서버(server.ts) + WebSocket + 내장 배치 스케줄러

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM deps AS build
COPY . .
# 빌드 시점에는 DB가 필요 없다 (모든 페이지가 동적 렌더링)
RUN npx next build && npm prune --omit=dev --no-audit --no-fund \
 # 런타임에 필요 없는 것 제거 (~180MB): 빌드 캐시, 이 이미지(glibc)와 맞지 않는 musl·wasm 네이티브 바이너리
 && rm -rf .next/cache \
    node_modules/@next/swc-*-musl node_modules/@img/*-linuxmusl-* node_modules/@img/sharp-wasm32

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
# tsx 는 server.ts 실행용 런타임 의존성이라 prune 후에도 남는다
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build --chown=node:node /app/package.json /app/server.ts /app/next.config.ts /app/tsconfig.json ./
COPY --from=build --chown=node:node /app/src ./src
COPY --from=build --chown=node:node /app/scripts ./scripts
COPY --from=build --chown=node:node /app/db ./db
COPY --from=build --chown=node:node /app/assets ./assets
COPY --from=build --chown=node:node /app/public ./public
COPY --chown=node:node docker-entrypoint.sh ./
# 로컬 이미지 저장소 (IMAGE_STORAGE=local). 컨테이너를 다시 만들어도 남도록 볼륨을 연결할 것
ENV UPLOAD_DIR=/app/data/uploads
RUN mkdir -p /app/data/uploads && chown -R node:node /app/data
VOLUME ["/app/data/uploads"]
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["./docker-entrypoint.sh"]
# npx 를 거치면 SIGTERM 이 서버까지 전달되지 않아 graceful shutdown 이 동작하지 않는다 → node 로 직접 실행
CMD ["node", "--import", "tsx", "server.ts"]
