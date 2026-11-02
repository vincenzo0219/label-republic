/** 🧩 놀이판 입력 검사 (서버 전용: 운영 규칙 모듈을 불러온다). 설정은 src/lib/roomBoards.ts */
import { heuristicAbuse, maskPersonalInfo } from "./abuse";
import { investProblem } from "./investRooms";
import { heuristicSpam } from "./moderation";
import { cleanLabel, num, type LogBoard } from "./roomBoards";
import { trollCheck } from "./troll";

/** 짧은 글(제목·이름) 공통 검사: 연락처·링크·욕설·도배·투자 종목 이야기. 문제 없으면 null */
export function shortTextProblem(text: string, room: string, max: number): string | null {
  const t = text.normalize("NFC").replace(/\s+/g, " ").trim();
  if (t.length < 1) return "내용을 적어 주세요.";
  if (t.length > max) return `${max}자까지 적을 수 있어요.`;
  if (maskPersonalInfo(t).masked || /01[016789][-\s.]?\d{3,4}[-\s.]?\d{4}|카톡|오픈채팅|텔레그램|@[a-z0-9_.]{3,}/i.test(t)) return "연락처·아이디는 넣을 수 없어요.";
  if (/https?:\/\/|www\.|\.(?:com|net|kr|io|me|ly|co)\b/i.test(t) || heuristicSpam(t, "").score >= 0.3) return "링크·홍보 문구는 넣을 수 없어요.";
  if (heuristicAbuse(t) || trollCheck([t])) return "욕설·비하·도배 표현은 쓸 수 없어요.";
  const inv = investProblem(room, t);
  if (inv) return inv;
  return null;
}

/** 기록판 한 줄 검사 → 저장할 { label, value } 또는 오류 문장 */
export function logEntry(b: LogBoard, input: { value?: number | null; label?: string | null }): { label: string; value: number } | string {
  switch (b.input) {
    case "check":
      return { label: "", value: 1 };
    case "number": {
      const v = Number(input.value);
      if (!Number.isFinite(v) || v < (b.min ?? 0) || v > (b.max ?? 1e6)) return `${num(b.min ?? 0)}~${num(b.max ?? 1e6)}${b.unit ?? ""} 사이로 적어 주세요.`;
      const step = b.step ?? 1;
      const r = Math.round(Math.round(v / step) * step * 10) / 10;
      return { label: "", value: Math.max(b.min ?? 0, r) };
    }
    case "chips": {
      const label = cleanLabel(input.label ?? "");
      if (!b.options?.includes(label)) return "목록에서 골라 주세요.";
      const v = Math.floor(Number(input.value ?? 1));
      if (!Number.isFinite(v) || v < 1 || v > (b.countMax ?? 1)) return `1~${b.countMax ?? 1}${b.unit ?? ""} 사이로 골라 주세요.`;
      return { label, value: v };
    }
    case "select": {
      const label = cleanLabel(input.label ?? "");
      if (!b.options?.includes(label)) return "목록에서 골라 주세요.";
      return { label, value: 1 };
    }
    case "text": {
      const label = cleanLabel(input.label ?? "");
      const p = shortTextProblem(label, b.room, 30);
      if (p) return p;
      return { label, value: 1 };
    }
  }
}
