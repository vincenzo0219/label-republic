import { query } from "../db";
import { radarSchema, type Radar } from "../marketRadar";

/** 방의 내일장 레이더 (없거나 모양이 틀리면 null) */
export async function getRadar(room: string): Promise<Radar | null> {
  const [row] = await query<{ data: unknown }>("SELECT data FROM market_radar WHERE room_slug = $1", [room]);
  const parsed = row ? radarSchema.safeParse(row.data) : null;
  return parsed?.success ? parsed.data : null;
}

/** 운영: 통째로 바꾼다 */
export async function putRadar(room: string, r: Radar): Promise<void> {
  await query(
    `INSERT INTO market_radar (room_slug, data, as_of, updated_at) VALUES ($1, $2, $3, now())
     ON CONFLICT (room_slug) DO UPDATE SET data = EXCLUDED.data, as_of = EXCLUDED.as_of, updated_at = now()`,
    [room, JSON.stringify(r), r.asOf],
  );
}
