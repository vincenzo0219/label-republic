import { z } from "zod/v4";

/** A = 먼저 온 사람(방을 만든 사람), B = 초대받은 사람 */
export type Who = "A" | "B";
/** 비공개방 두 개와 공동방 하나. 화면에선 채팅방 하나 + 전환 버튼으로 보인다. */
export type Channel = "privA" | "privB" | "joint";
export type Safety = "none" | "concern" | "high";

export const privateChannelOf = (who: Who): Channel => (who === "A" ? "privA" : "privB");
export const otherOf = (who: Who): Who => (who === "A" ? "B" : "A");

export interface ChatMessage {
  id: string;
  channel: Channel;
  author: Who | "AI" | "system";
  text: string;
  at: number;
}

export const CaseNotesSchema = z.object({
  summary: z.string().describe("이 사람의 이야기 요약 (사건, 관계 의지 포함)"),
  feelings: z.array(z.string()).describe("겉감정과 그 밑의 1차 감정"),
  needs: z.array(z.string()).describe("건드려진 욕구 (인정, 존중, 연결, 안전, 자율 등)"),
  patterns: z.array(z.string()).describe("반복 패턴, 본인 몫에 대한 관찰"),
  private_do_not_share: z.array(z.string()).describe("상대에게 절대 전하면 안 되는 내용"),
  consented_to_share: z.array(z.string()).describe("본인이 상대에게 요약 전달을 허락한 내용"),
});
export type CaseNotes = z.infer<typeof CaseNotesSchema>;

export const STAGES = [
  "intake", // 사건 듣기
  "explore", // 감정·욕구·패턴 파고들기
  "invite", // 상대 초대 제안
  "partner_intake", // 초대받은 사람 1:1
  "joint_open", // 공동 상담 여는 말
  "pattern", // 고리 이름 붙이기, 확인
  "insight", // 짧은 이론 설명, 서로 듣기
  "agreement", // 행동 합의
  "roleplay", // 역할극 훈련
  "wrapup", // 마무리
  "safety", // 안전 모드
] as const;

export const CounselorTurnSchema = z.object({
  plan: z.object({
    stage: z.enum(STAGES),
    goal: z.string().describe("이번 발화로 얻으려는 것, 한 문장"),
    technique: z.string().describe("고른 기법 하나"),
    next_speaker: z
      .enum(["A", "B", "both", "none"])
      .describe("공동방에서 다음에 말할 사람. 비공개방에서는 none"),
    safety: z.enum(["none", "concern", "high"]),
    suggest_invite: z.boolean().describe("이 발화에서 상대 초대를 제안했는가 (A의 비공개방에서만)"),
    ready_for_joint: z.boolean().describe("이 사람 쪽 이야기를 공동 상담에 들어갈 만큼 충분히 들었는가"),
  }),
  notes: CaseNotesSchema.nullable().describe("비공개방: 이 사람의 상담 기록 전체를 최신으로. 공동방: null"),
  agreements: z.array(z.string()).describe("공동방에서 지금까지 합의된 약속 전체. 비공개방에선 빈 목록"),
  message: z.string().describe("사람에게 실제로 보낼 말"),
});
export type CounselorTurn = z.infer<typeof CounselorTurnSchema>;

export const LeakCheckSchema = z.object({
  leak: z.boolean(),
  reason: z.string(),
  revised_message: z.string().describe("누설이 있으면 그 부분만 고친 메시지, 없으면 원문 그대로"),
});
export type LeakCheck = z.infer<typeof LeakCheckSchema>;

/** 상담사의 '두뇌'. 실제 구현은 Claude, 테스트에서는 가짜로 바꿔 끼운다. */
export interface Brain {
  turn(context: string): Promise<CounselorTurn>;
  leakCheck(input: { message: string; privateMaterial: string }): Promise<LeakCheck>;
  report(context: string): Promise<string>;
}

export interface Participant {
  who: Who;
  name: string;
  token: string;
  joinedAt: number;
  wantsJoint: boolean;
}

export interface Room {
  id: string;
  createdAt: number;
  inviteToken: string;
  participants: Partial<Record<Who, Participant>>;
  messages: ChatMessage[];
  notes: Partial<Record<Who, CaseNotes>>;
  agreements: string[];
  stage: Partial<Record<Channel, string>>;
  inviteSuggested: boolean;
  readyForJoint: Partial<Record<Who, boolean>>;
  jointStarted: boolean;
  nextSpeaker: Who | "both";
  safety: Safety;
  thinking: Channel[];
  report?: string;
}
