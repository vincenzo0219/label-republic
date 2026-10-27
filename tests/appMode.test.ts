import { describe, expect, it } from "vitest";
import { APP_HIDDEN_ROOMS, appHiddenSlugs, isAndroidAppReferrer, isStoreAppRequest, roomsForEndpoint } from "@/lib/appMode";

// 스토어 앱 모드 (10/27): 앱 안에서만 19+ 방을 뺀다
describe("store app mode", () => {
  const h = (o: Record<string, string>) => new Headers(o);
  it("detects the iOS app by user agent, the Android app by referrer or cookie", () => {
    expect(isStoreAppRequest(h({ "user-agent": "Mozilla/5.0 (iPhone) AppleWebKit nobangjang-ios/1.0.0" }))).toBe(true);
    expect(isStoreAppRequest(h({ referer: "android-app://com.nobangjang.app/" }))).toBe(true);
    expect(isStoreAppRequest(h({}), "1")).toBe(true);
    expect(isStoreAppRequest(h({ "user-agent": "Mozilla/5.0 (iPhone) Safari", referer: "https://www.instagram.com/" }))).toBe(false);
    expect(isAndroidAppReferrer("android-app://com.other.app/")).toBe(false);
  });
  it("hides the singles and wine rooms only", () => {
    expect([...APP_HIDDEN_ROOMS].sort()).toEqual(["미혼남녀-만남-행사", "와인-위스키-덕후방"].sort());
  });
  it("drops hidden rooms from alerts to iOS app devices only", () => {
    const rooms = ["러닝-덕후방", "와인-위스키-덕후방", "미혼남녀-만남-행사"];
    expect(roomsForEndpoint(`apns://${"ab".repeat(32)}`, rooms)).toEqual(["러닝-덕후방"]);
    expect(roomsForEndpoint("https://fcm.googleapis.com/fcm/send/x", rooms)).toEqual(rooms);
  });
  it("hides nothing outside a request (batch jobs)", async () => {
    expect(await appHiddenSlugs()).toEqual([]);
  });
});
