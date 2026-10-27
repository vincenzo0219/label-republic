/**
 * 스토어 앱 모드 (10/27). iOS 앱(User-Agent 에 nobangjang-ios/)·안드로이드 앱(TWA, 첫 화면 referrer android-app://com.nobangjang.app → nb_app 쿠키)
 * 안에서는 19+ 방(💌 미혼남녀 만남 행사, 🍷 와인·위스키)을 목록·피드·검색·글·방 주소에서 뺀다. 앱 연령 등급을 13+/청소년으로 두기 위해.
 * 사이트(브라우저)는 그대로. 요청 밖(배치 작업)에서는 아무것도 빼지 않는다.
 */
export const APP_HIDDEN_ROOMS: readonly string[] = ["미혼남녀-만남-행사", "와인-위스키-덕후방"];
export const APP_COOKIE = "nb_app";
const ANDROID_REFERRER = "android-app://com.nobangjang.app";

export function isAndroidAppReferrer(ref: string | null | undefined): boolean {
  return !!ref && ref.startsWith(ANDROID_REFERRER);
}

export function isStoreAppRequest(h: { get(name: string): string | null }, cookie?: string | null): boolean {
  return /nobangjang-ios\//.test(h.get("user-agent") ?? "") || isAndroidAppReferrer(h.get("referer")) || cookie === "1";
}

/** 지금 요청이 앱에서 왔으면 숨길 방 slug, 아니면 [] */
export async function appHiddenSlugs(): Promise<string[]> {
  try {
    const { cookies, headers } = await import("next/headers");
    const h = await headers();
    const c = (await cookies()).get(APP_COOKIE)?.value;
    return isStoreAppRequest(h, c) ? [...APP_HIDDEN_ROOMS] : [];
  } catch {
    return [];
  }
}

/** 알림 배치용: iOS 앱 기기(apns://)에는 19+ 방 알림을 보내지 않는다 */
export function roomsForEndpoint(endpoint: string, rooms: string[]): string[] {
  return endpoint.startsWith("apns://") ? rooms.filter((r) => !APP_HIDDEN_ROOMS.includes(r)) : rooms;
}
