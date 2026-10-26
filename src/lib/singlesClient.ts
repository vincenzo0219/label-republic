/** 💌 만남 행사: "나 신청 가능?" 입력값은 이 브라우저(localStorage)에만. 서버로 보내지 않는다 (알림을 켤 때 고른 값만 따로) */
import { cleanProfile, type SinglesProfile } from "./singlesEvents";

const KEY = "nb:singlesProfile";

export function loadSinglesProfile(today: string): SinglesProfile {
  try {
    const raw = window.localStorage.getItem(KEY);
    return cleanProfile(raw ? JSON.parse(raw) : null, today);
  } catch {
    return cleanProfile(null, today);
  }
}

export function saveSinglesProfile(p: SinglesProfile): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // 저장이 막힌 브라우저(사생활 보호 모드 등)에서는 이번 화면에서만 쓴다
  }
}

export function clearSinglesProfile(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // 무시
  }
}
