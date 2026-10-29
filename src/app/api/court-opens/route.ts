import { json, route } from "@/lib/http";
import { listCourtOpens } from "@/lib/repo/tennisAlerts";

/** GET /api/court-opens — 🎾 알림을 켤 수 있는 공공 코트 예약 오픈 규칙 (운영자가 공식 공지로 확인한 것만) */
export const GET = route(async () => json({ courts: await listCourtOpens() }));
