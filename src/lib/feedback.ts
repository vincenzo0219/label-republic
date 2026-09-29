/**
 * 피드백·버그 제보 (Sprint 36) — 서버·클라이언트 공용 정의.
 */
export const FEEDBACK_KINDS = { bug: "🐞 고장·오류", idea: "💡 제안", other: "💬 그 밖에" } as const;
export type FeedbackKind = keyof typeof FEEDBACK_KINDS;

export const FEEDBACK_STATUS = {
  new: "접수",
  confirmed: "확인함",
  in_progress: "고치는 중",
  done: "고침",
  wontfix: "그대로 둠",
  duplicate: "같은 제보 있음",
  hidden: "가림",
} as const;
export type FeedbackStatus = keyof typeof FEEDBACK_STATUS;
export const OPEN_STATUSES: FeedbackStatus[] = ["new", "confirmed", "in_progress"];

/** 보던 화면: 같은 사이트의 경로만 (쿼리·해시 제외 — 검색어 같은 내용이 저장되지 않게) */
export function cleanPath(raw: string | null | undefined): string {
  if (!raw) return "";
  let path = raw.trim();
  try {
    if (/^https?:\/\//i.test(path)) path = new URL(path).pathname;
  } catch {
    return "";
  }
  path = path.split(/[?#]/)[0]!;
  if (!path.startsWith("/") || path.startsWith("//")) return "";
  // 제보 화면 자체·운영자·API 경로는 보던 화면으로 보지 않는다
  if (/^\/(feedback|admin|api)(\/|$)/.test(path)) return "";
  return path.slice(0, 200);
}

export type FeedbackEnv = { browser?: string; os?: string; viewport?: string; standalone?: boolean; online?: boolean; app?: string };

/** 브라우저 이름·주 버전, OS 이름만 (전체 UA 문자열은 보내지 않는다) */
export function describeAgent(ua: string): { browser: string; os: string } {
  const pick = (pairs: [RegExp, string][]) => {
    for (const [re, name] of pairs) {
      const m = re.exec(ua);
      if (m) return m[1] ? `${name} ${m[1]}` : name;
    }
    return "알 수 없음";
  };
  const browser = pick([
    [/SamsungBrowser\/(\d+)/, "삼성 인터넷"],
    [/Whale\/(\d+)/, "웨일"],
    [/NAVER\(inapp[^)]*\)/, "네이버 앱"],
    [/KAKAOTALK/, "카카오톡 인앱"],
    [/Edg\/(\d+)/, "Edge"],
    [/Firefox\/(\d+)/, "Firefox"],
    [/CriOS\/(\d+)/, "Chrome(iOS)"],
    [/Chrome\/(\d+)/, "Chrome"],
    [/Version\/(\d+)[\d.]* .*Safari/, "Safari"],
  ]);
  const os = pick([
    [/iPhone OS (\d+)/, "iOS"],
    [/iPad.*OS (\d+)/, "iPadOS"],
    [/Android (\d+)/, "Android"],
    [/Windows NT/, "Windows"],
    [/Mac OS X/, "macOS"],
    [/CrOS/, "ChromeOS"],
    [/Linux/, "Linux"],
  ]);
  return { browser, os };
}
