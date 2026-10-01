import { randomBytes, randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { buildJointContext, buildPrivateContext, privateMaterial, type TurnEvent } from "./context.js";
import {
  privateChannelOf,
  type Brain,
  type Channel,
  type ChatMessage,
  type Room,
  type Safety,
  type Who,
} from "./types.js";

export class SaiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const token = () => randomBytes(18).toString("base64url");
const SAFETY_RANK: Record<Safety, number> = { none: 0, concern: 1, high: 2 };

/** 참여자에게 보여줄 방 상태. 상대의 비공개 대화와 상담 기록은 절대 포함하지 않는다. */
export interface RoomView {
  roomId: string;
  me: { who: Who; name: string };
  partner: { name: string } | null;
  inviteUrlPath: string | null;
  inviteSuggested: boolean;
  messages: ChatMessage[];
  jointStarted: boolean;
  jointBlocked: boolean;
  wantsJoint: { me: boolean; partner: boolean };
  aiRecommendsJoint: boolean;
  nextSpeaker: Who | "both";
  thinking: { private: boolean; joint: boolean };
  agreements: string[];
  report: string | null;
}

export class Engine {
  private rooms = new Map<string, Room>();
  private queues = new Map<string, Promise<unknown>>();
  readonly events = new EventEmitter();

  constructor(
    private brain: Brain,
    private onChange: (rooms: Room[]) => void = () => {},
  ) {
    this.events.setMaxListeners(0);
  }

  load(rooms: Room[]) {
    for (const r of rooms) this.rooms.set(r.id, { ...r, thinking: [] });
  }

  all(): Room[] {
    return [...this.rooms.values()];
  }

  // ---------- 방 만들기 / 들어오기 ----------

  /** 방을 만들고 바로 돌려준다. 상담사의 첫마디는 뒤에서 만들어져 실시간으로 도착한다. */
  createRoom(name: string): { roomId: string; token: string } {
    const room: Room = {
      id: randomUUID().slice(0, 8),
      createdAt: Date.now(),
      inviteToken: token(),
      participants: { A: { who: "A", name: cleanName(name), token: token(), joinedAt: Date.now(), wantsJoint: false } },
      messages: [],
      notes: {},
      agreements: [],
      stage: {},
      inviteSuggested: false,
      readyForJoint: {},
      jointStarted: false,
      nextSpeaker: "both",
      safety: "none",
      thinking: [],
    };
    this.rooms.set(room.id, room);
    // 사용자가 입력하기 전에 상담사가 먼저 말을 건다.
    void this.enqueue(room, () => this.aiTurn(room, "privA", { kind: "opening", who: "A" }));
    return { roomId: room.id, token: room.participants.A!.token };
  }

  join(roomId: string, inviteToken: string, name: string): { token: string } {
    const room = this.get(roomId);
    if (inviteToken !== room.inviteToken) throw new SaiError(403, "초대 링크가 올바르지 않아요.");
    if (room.participants.B) throw new SaiError(409, "이미 상대방이 들어온 방이에요.");
    if (room.safety === "high") throw new SaiError(403, "지금은 이 방에 초대할 수 없어요.");
    room.participants.B = { who: "B", name: cleanName(name), token: token(), joinedAt: Date.now(), wantsJoint: false };
    this.system(room, "privA", `${room.participants.B.name}님이 들어왔어요. 상담사가 ${room.participants.B.name}님 이야기를 먼저 1:1로 들은 뒤 함께 상담을 시작해요.`);
    void this.enqueue(room, () => this.aiTurn(room, "privB", { kind: "opening", who: "B" }));
    return { token: room.participants.B.token };
  }

  // ---------- 대화 ----------

  async post(roomId: string, tok: string, channel: Channel, text: string): Promise<void> {
    const room = this.get(roomId);
    const who = this.auth(room, tok);
    const body = text.trim().slice(0, 4000);
    if (!body) throw new SaiError(400, "내용을 입력해 주세요.");

    if (channel === "joint") {
      if (!room.jointStarted) throw new SaiError(409, "아직 함께 상담이 시작되지 않았어요.");
      if (room.nextSpeaker !== "both" && room.nextSpeaker !== who) {
        const name = room.participants[room.nextSpeaker]?.name ?? "상대방";
        throw new SaiError(409, `지금은 ${name}님 차례예요. 상담사가 순서를 드릴 거예요.`);
      }
      if (room.thinking.includes("joint")) throw new SaiError(409, "상담사가 말하는 중이에요. 잠시만요.");
    } else if (channel !== privateChannelOf(who)) {
      throw new SaiError(403, "볼 수 없는 방이에요.");
    }

    this.push(room, { channel, author: who, text: body });
    await this.enqueue(room, () => this.aiTurn(room, channel, { kind: "message", who }));
  }

  /** 🎭 연습하기: 상담사가 상대 역할을 맡아 말하기 기술을 연습시킨다. 상대가 없어도 된다. */
  async practice(roomId: string, tok: string): Promise<void> {
    const room = this.get(roomId);
    const who = this.auth(room, tok);
    const channel = privateChannelOf(who);
    if (room.thinking.includes(channel)) throw new SaiError(409, "상담사가 말하는 중이에요. 잠시만요.");
    this.system(room, channel, "🎭 연습을 시작해요. 상담사가 상대 역할을 맡아요.");
    await this.enqueue(room, () => this.aiTurn(room, channel, { kind: "practice_start", who }));
  }

  /** ✉️ 보내기 전 코치: 상대에게 실제로 보낼 메시지를 붙여넣으면 어떻게 들릴지와 고친 문장을 준다. */
  async precheck(roomId: string, tok: string, text: string): Promise<void> {
    const room = this.get(roomId);
    const who = this.auth(room, tok);
    const channel = privateChannelOf(who);
    const body = text.trim().slice(0, 2000);
    if (!body) throw new SaiError(400, "보내려는 메시지를 붙여넣어 주세요.");
    if (room.thinking.includes(channel)) throw new SaiError(409, "상담사가 말하는 중이에요. 잠시만요.");
    this.push(room, { channel, author: who, text: body, kind: "precheck" });
    await this.enqueue(room, () => this.aiTurn(room, channel, { kind: "precheck", who }));
  }

  /** '함께 상담' 버튼. 두 사람 모두 누르면 공동방이 열린다. */
  async requestJoint(roomId: string, tok: string): Promise<void> {
    const room = this.get(roomId);
    const who = this.auth(room, tok);
    if (!room.participants.B) throw new SaiError(409, "상대방이 아직 들어오지 않았어요.");
    if (room.safety === "high") throw new SaiError(403, "지금은 함께 상담보다 안전이 먼저예요. 상담사와 1:1로 이야기해 주세요.");
    if (room.jointStarted) return;
    room.participants[who]!.wantsJoint = true;
    const both = room.participants.A!.wantsJoint && room.participants.B.wantsJoint;
    if (!both) {
      this.changed(room);
      return;
    }
    room.jointStarted = true;
    room.nextSpeaker = "both";
    this.system(room, "joint", "두 분 모두 준비됐어요. 지금부터 상담사가 진행합니다.");
    await this.enqueue(room, () => this.aiTurn(room, "joint", { kind: "joint_open" }));
  }

  /** 상담 마무리 리포트: 두 사람이 함께 보는 '갈등 패턴 관찰' 한 장 */
  async makeReport(roomId: string, tok: string): Promise<string> {
    const room = this.get(roomId);
    this.auth(room, tok);
    if (!room.jointStarted) throw new SaiError(409, "리포트는 함께 상담을 한 뒤에 만들 수 있어요.");
    return this.enqueue(room, async () => {
      room.thinking.push("joint");
      this.changed(room);
      try {
        const draft = await this.brain.report(buildJointContext(room, { kind: "joint_open" }));
        const checked = await this.brain.leakCheck({ message: draft, privateMaterial: privateMaterial(room) });
        room.report = checked.leak ? checked.revised_message : draft;
        return room.report;
      } finally {
        room.thinking = room.thinking.filter((c) => c !== "joint");
        this.changed(room);
      }
    });
  }

  /** 내부 상태 전체 (시뮬레이션·평가용. 절대 사용자에게 보내지 않는다) */
  inspect(roomId: string): Room {
    return this.get(roomId);
  }

  /** 이 방에 대기 중인 상담사 턴이 모두 끝날 때까지 기다린다 (테스트·시뮬레이션용) */
  async idle(roomId: string): Promise<void> {
    await this.queues.get(roomId);
  }

  view(roomId: string, tok: string): RoomView {
    const room = this.get(roomId);
    const who = this.auth(room, tok);
    const partnerWho: Who = who === "A" ? "B" : "A";
    const partner = room.participants[partnerWho];
    const mine = privateChannelOf(who);
    return {
      roomId: room.id,
      me: { who, name: room.participants[who]!.name },
      partner: partner ? { name: partner.name } : null,
      inviteUrlPath:
        who === "A" && !room.participants.B && room.safety !== "high" ? `/r/${room.id}?invite=${room.inviteToken}` : null,
      inviteSuggested: room.inviteSuggested,
      messages: room.messages.filter((m) => m.channel === mine || m.channel === "joint"),
      jointStarted: room.jointStarted,
      jointBlocked: room.safety === "high",
      wantsJoint: { me: room.participants[who]!.wantsJoint, partner: partner?.wantsJoint ?? false },
      aiRecommendsJoint: !!room.readyForJoint.A && !!room.readyForJoint.B,
      nextSpeaker: room.nextSpeaker,
      thinking: { private: room.thinking.includes(mine), joint: room.thinking.includes("joint") },
      agreements: room.jointStarted ? room.agreements : [],
      report: room.report ?? null,
    };
  }

  // ---------- 내부 ----------

  private async aiTurn(room: Room, channel: Channel, event: TurnEvent): Promise<void> {
    room.thinking.push(channel);
    this.changed(room);
    try {
      if (channel === "joint") {
        const out = await this.brain.turn(buildJointContext(room, event));
        this.raiseSafety(room, out.plan.safety);
        room.stage.joint = out.plan.stage;
        room.agreements = out.agreements;
        room.nextSpeaker = out.plan.next_speaker === "none" ? "both" : out.plan.next_speaker;
        // 공동방 발화는 내보내기 전에 비공개 내용 누설 검사를 한 번 더 거친다.
        const check = await this.brain.leakCheck({ message: out.message, privateMaterial: privateMaterial(room) });
        this.push(room, { channel, author: "AI", text: check.leak ? check.revised_message : out.message });
      } else {
        const who: Who = channel === "privA" ? "A" : "B";
        const out = await this.brain.turn(buildPrivateContext(room, who, event));
        this.raiseSafety(room, out.plan.safety);
        room.stage[channel] = out.plan.stage;
        if (out.notes) room.notes[who] = out.notes;
        room.readyForJoint[who] = out.plan.ready_for_joint;
        if (who === "A" && out.plan.suggest_invite && room.safety !== "high") room.inviteSuggested = true;
        this.push(room, { channel, author: "AI", text: out.message });
      }
    } catch (err) {
      console.error("[sai] 상담사 응답 실패", err);
      this.system(room, channel, "상담사가 잠시 응답하지 못했어요. 방금 말을 한 번 더 보내주세요.");
    } finally {
      room.thinking = room.thinking.filter((c) => c !== channel);
      this.changed(room);
    }
  }

  private raiseSafety(room: Room, s: Safety) {
    if (SAFETY_RANK[s] > SAFETY_RANK[room.safety]) room.safety = s;
    if (room.safety === "high" && room.jointStarted) {
      // 위험 신호가 나오면 중재를 멈춘다. 공동방은 닫고 각자 1:1로 돌아간다.
      room.jointStarted = false;
      for (const p of Object.values(room.participants)) if (p) p.wantsJoint = false;
      for (const c of ["joint", "privA", "privB"] as const) {
        this.system(room, c, "함께 상담을 잠시 멈춰요. 상담사가 각자와 1:1로 이야기할게요.");
      }
    }
  }

  /** 한 방의 상담사 턴은 한 번에 하나씩 처리한다. */
  private enqueue<T>(room: Room, fn: () => Promise<T>): Promise<T> {
    const prev = this.queues.get(room.id) ?? Promise.resolve();
    const next = prev.then(fn, fn);
    this.queues.set(
      room.id,
      next.catch(() => {}),
    );
    return next;
  }

  private push(room: Room, m: Omit<ChatMessage, "id" | "at">) {
    room.messages.push({ ...m, id: randomUUID(), at: Date.now() });
    this.changed(room);
  }

  private system(room: Room, channel: Channel, text: string) {
    this.push(room, { channel, author: "system", text });
  }

  private changed(room: Room) {
    this.events.emit(room.id);
    this.onChange(this.all());
  }

  private get(roomId: string): Room {
    const room = this.rooms.get(roomId);
    if (!room) throw new SaiError(404, "상담방을 찾을 수 없어요.");
    return room;
  }

  private auth(room: Room, tok: string): Who {
    for (const p of Object.values(room.participants)) if (p && p.token === tok) return p.who;
    throw new SaiError(403, "이 상담방에 들어올 권한이 없어요.");
  }
}

function cleanName(name: string): string {
  const n = (name ?? "").trim().slice(0, 20);
  return n || "익명";
}
