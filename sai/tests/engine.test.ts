import { describe, expect, it } from "vitest";
import { Engine } from "../src/engine.js";
import type { Brain, CaseNotes, CounselorTurn, LeakCheck } from "../src/types.js";

const notes = (over: Partial<CaseNotes> = {}): CaseNotes => ({
  summary: "",
  feelings: [],
  needs: [],
  patterns: [],
  private_do_not_share: [],
  consented_to_share: [],
  ...over,
});

/** 가짜 상담사: 받은 컨텍스트를 기록하고, 테스트가 정한 답을 돌려준다. */
class FakeBrain implements Brain {
  contexts: string[] = [];
  leakInputs: string[] = [];
  next: Partial<CounselorTurn["plan"]> = {};
  nextNotes: CaseNotes | null = null;
  nextAgreements: string[] = [];
  leak: LeakCheck | null = null;

  async turn(context: string): Promise<CounselorTurn> {
    this.contexts.push(context);
    const joint = context.includes("공동 상담방 (A, B, 상담사 셋이 모두 봄)");
    return {
      plan: {
        stage: joint ? "pattern" : "intake",
        goal: "",
        technique: "",
        next_speaker: joint ? "A" : "none",
        safety: "none",
        suggest_invite: false,
        ready_for_joint: false,
        ...this.next,
      },
      notes: joint ? null : this.nextNotes,
      agreements: this.nextAgreements,
      message: joint ? "공동방 상담사 발화" : "비공개 상담사 발화",
    };
  }
  async leakCheck(input: { message: string; privateMaterial: string }): Promise<LeakCheck> {
    this.leakInputs.push(input.privateMaterial);
    return this.leak ?? { leak: false, reason: "", revised_message: input.message };
  }
  async report(): Promise<string> {
    return "리포트";
  }
}

async function setup() {
  const brain = new FakeBrain();
  const engine = new Engine(brain);
  const { roomId, token: a } = engine.createRoom("민수");
  await engine.idle(roomId);
  return { brain, engine, roomId, a };
}

async function withPartner() {
  const s = await setup();
  const room = s.engine.inspect(s.roomId);
  const { token: b } = s.engine.join(s.roomId, room.inviteToken, "지영");
  await s.engine.idle(s.roomId);
  return { ...s, b, room };
}

async function inJoint() {
  const s = await withPartner();
  await s.engine.requestJoint(s.roomId, s.a);
  await s.engine.requestJoint(s.roomId, s.b);
  await s.engine.idle(s.roomId);
  return s;
}

describe("상담사가 먼저 말을 건다", () => {
  it("방을 만들면 사용자가 입력하기 전에 상담사 첫마디가 비공개방에 온다", async () => {
    const { engine, roomId, a } = await setup();
    const v = engine.view(roomId, a);
    expect(v.messages).toHaveLength(1);
    expect(v.messages[0]).toMatchObject({ channel: "privA", author: "AI" });
  });

  it("초대받은 사람이 들어오면 그 사람의 비공개방에서도 상담사가 먼저 말한다", async () => {
    const { engine, roomId, b } = await withPartner();
    const v = engine.view(roomId, b);
    expect(v.messages.filter((m) => m.channel === "privB" && m.author === "AI")).toHaveLength(1);
  });
});

describe("비공개 원칙", () => {
  it("상대의 비공개 대화는 내 화면에도, 내 비공개방 상담사 컨텍스트에도 들어가지 않는다", async () => {
    const { engine, roomId, a, b, brain } = await withPartner();
    await engine.post(roomId, b, "privB", "사실 헤어질까 생각했어요");
    await engine.idle(roomId);
    await engine.post(roomId, a, "privA", "여자친구가 버럭했어요");
    await engine.idle(roomId);

    expect(engine.view(roomId, a).messages.some((m) => m.text.includes("헤어질까"))).toBe(false);
    const aContext = brain.contexts.at(-1)!;
    expect(aContext).toContain("여자친구가 버럭했어요");
    expect(aContext).not.toContain("헤어질까");
  });

  it("상대의 비공개 상담 기록 중 공유를 허락한 내용만 내 비공개방 컨텍스트로 온다", async () => {
    const { engine, roomId, a, b, brain } = await withPartner();
    brain.nextNotes = notes({ private_do_not_share: ["헤어짐을 고민함"], consented_to_share: ["잠수가 불안하다"] });
    await engine.post(roomId, b, "privB", "그가 사라지면 불안해요");
    await engine.idle(roomId);
    brain.nextNotes = null;
    await engine.post(roomId, a, "privA", "네");
    await engine.idle(roomId);
    const aContext = brain.contexts.at(-1)!;
    expect(aContext).toContain("잠수가 불안하다");
    expect(aContext).not.toContain("헤어짐을 고민함");
  });

  it("다른 사람의 비공개방에는 글을 쓸 수 없다", async () => {
    const { engine, roomId, b } = await withPartner();
    await expect(engine.post(roomId, b, "privA", "몰래")).rejects.toThrow("볼 수 없는 방");
  });

  it("공동방 발화는 누설 검사를 거치고, 누설이 있으면 고친 문장이 나간다", async () => {
    const { engine, roomId, a, brain } = await withPartner();
    brain.leak = { leak: true, reason: "비공개 고백 암시", revised_message: "고친 문장" };
    await engine.requestJoint(roomId, a);
    await engine.requestJoint(roomId, engine.inspect(roomId).participants.B!.token);
    await engine.idle(roomId);
    const joint = engine.view(roomId, a).messages.filter((m) => m.channel === "joint" && m.author === "AI");
    expect(joint.at(-1)!.text).toBe("고친 문장");
    expect(brain.leakInputs.at(-1)).toContain("비공개 대화 원문");
  });
});

describe("함께 상담 전환과 턴 통제", () => {
  it("두 사람이 모두 눌러야 공동방이 열린다", async () => {
    const { engine, roomId, a, b } = await withPartner();
    await engine.requestJoint(roomId, a);
    expect(engine.view(roomId, a).jointStarted).toBe(false);
    expect(engine.view(roomId, b).wantsJoint.partner).toBe(true);
    await engine.requestJoint(roomId, b);
    await engine.idle(roomId);
    expect(engine.view(roomId, a).jointStarted).toBe(true);
  });

  it("상담사가 지정한 사람만 공동방에서 말할 수 있다", async () => {
    const { engine, roomId, a, b } = await inJoint();
    expect(engine.view(roomId, a).nextSpeaker).toBe("A");
    await expect(engine.post(roomId, b, "joint", "끼어들기")).rejects.toThrow("민수님 차례");
    await engine.post(roomId, a, "joint", "제 차례죠");
    await engine.idle(roomId);
  });

  it("공동 상담 중에도 각자 비공개방으로 잠시 빠져 상담사와 말할 수 있다", async () => {
    const { engine, roomId, b } = await inJoint();
    await engine.post(roomId, b, "privB", "잠깐 상담사님께만요");
    await engine.idle(roomId);
    expect(engine.view(roomId, b).messages.at(-1)).toMatchObject({ channel: "privB", author: "AI" });
  });

  it("합의된 약속은 공동방에서만 보인다", async () => {
    const { engine, roomId, a, brain } = await inJoint();
    brain.nextAgreements = ["화나면 '20분'이라고 말하고 멈추기"];
    await engine.post(roomId, a, "joint", "좋아요");
    await engine.idle(roomId);
    expect(engine.view(roomId, a).agreements).toEqual(["화나면 '20분'이라고 말하고 멈추기"]);
  });
});

describe("안전", () => {
  it("위험 신호가 나오면 초대 링크와 함께 상담이 막힌다", async () => {
    const { engine, roomId, a, brain } = await setup();
    brain.next = { safety: "high", suggest_invite: true };
    await engine.post(roomId, a, "privA", "남자친구가 벽을 쳤어요. 무서워요");
    await engine.idle(roomId);
    const v = engine.view(roomId, a);
    expect(v.inviteUrlPath).toBeNull();
    expect(v.inviteSuggested).toBe(false);
    expect(v.jointBlocked).toBe(true);
    const room = engine.inspect(roomId);
    expect(() => engine.join(roomId, room.inviteToken, "준혁")).toThrow();
  });

  it("공동 상담 중 위험 신호가 나오면 공동방을 닫고 각자 1:1로 돌아간다", async () => {
    const { engine, roomId, a, b, brain } = await inJoint();
    brain.next = { safety: "high" };
    await engine.post(roomId, b, "privB", "사실 무서워요");
    await engine.idle(roomId);
    expect(engine.view(roomId, a).jointStarted).toBe(false);
    await expect(engine.requestJoint(roomId, a)).rejects.toThrow("안전");
  });
});
