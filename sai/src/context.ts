import type { CaseNotes, Channel, ChatMessage, Room, Who } from "./types.js";

export type TurnEvent =
  | { kind: "opening"; who: Who } // 이 사람이 방에 처음 들어옴. 상담사가 먼저 말을 건다.
  | { kind: "message"; who: Who } // 이 사람이 방금 말함
  | { kind: "joint_open" }; // 둘 다 '함께 상담'을 눌러 공동방이 열림

const nameOf = (room: Room, who: Who) => room.participants[who]?.name ?? (who === "A" ? "A" : "B");

function transcript(room: Room, channel: Channel): string {
  const lines = room.messages
    .filter((m) => m.channel === channel)
    .map((m) => `${speakerLabel(room, m)}: ${m.text}`);
  return lines.length ? lines.join("\n") : "(아직 대화 없음)";
}

function speakerLabel(room: Room, m: ChatMessage): string {
  if (m.author === "AI") return "상담사";
  if (m.author === "system") return "[알림]";
  return `${nameOf(room, m.author)}(${m.author})`;
}

function notesBlock(notes: CaseNotes | undefined): string {
  return notes ? JSON.stringify(notes, null, 2) : "(아직 기록 없음)";
}

function people(room: Room): string {
  const a = room.participants.A;
  const b = room.participants.B;
  return [
    `- A = ${a?.name ?? "?"} (먼저 상담을 시작한 사람)`,
    b ? `- B = ${b.name} (초대받아 들어온 사람)` : "- B = 아직 초대되지 않았거나 들어오지 않음",
  ].join("\n");
}

function eventLine(room: Room, event: TurnEvent): string {
  switch (event.kind) {
    case "opening":
      return event.who === "A"
        ? `${nameOf(room, "A")}님이 상담방에 방금 처음 들어왔습니다. 아직 아무 말도 하지 않았습니다. 네가 먼저 말을 건다.`
        : `${nameOf(room, "B")}님이 초대 링크로 방금 처음 들어왔습니다. 공동 상담 전에 1:1로 먼저 이야기를 듣는다는 것과 비공개 원칙을 알려주고 시작한다. A가 비공개방에서 한 말은 절대 전하지 않는다.`;
    case "message":
      return `${nameOf(room, event.who)}(${event.who})님이 방금 말했습니다. 다음 발화를 정한다.`;
    case "joint_open":
      return "두 사람 모두 '함께 상담'을 눌러 공동 상담방이 방금 열렸습니다. 진행자로서 여는 말을 하고, 첫 번째로 말할 사람을 지정한다.";
  }
}

/**
 * 비공개방 컨텍스트: 그 사람의 비공개 대화 + 그 사람 기록 + 공동방 대화 + 상대가 공유를 허락한 내용만.
 * 상대의 비공개 대화와 기록은 구조적으로 넣지 않는다 — 모르는 건 흘릴 수도 없다.
 */
export function buildPrivateContext(room: Room, who: Who, event: TurnEvent): string {
  const other: Who = who === "A" ? "B" : "A";
  const shared = room.notes[other]?.consented_to_share ?? [];
  const channel: Channel = who === "A" ? "privA" : "privB";
  return [
    "[상담방 상황]",
    `- 지금 응답할 곳: ${nameOf(room, who)}(${who})님과의 1:1 비공개방`,
    people(room),
    `- 공동 상담: ${room.jointStarted ? "진행 중 (이 사람이 잠시 비공개방으로 나와서 이야기하는 중)" : "아직 시작 전"}`,
    `- 상대 초대: ${room.participants.B ? "상대가 들어와 있음" : room.inviteSuggested ? "초대를 제안함, 아직 안 들어옴" : "아직 제안 안 함"}`,
    `- 안전 판단(지금까지): ${room.safety}`,
    "",
    "[이번 이벤트]",
    eventLine(room, event),
    "",
    `[${nameOf(room, who)}님 상담 기록]`,
    notesBlock(room.notes[who]),
    "",
    `[상대(${other})가 공유를 허락한 내용]`,
    shared.length ? shared.map((s) => `- ${s}`).join("\n") : "(없음)",
    "",
    "[합의된 약속]",
    room.agreements.length ? room.agreements.map((s) => `- ${s}`).join("\n") : "(없음)",
    "",
    "[공동방 대화]",
    room.jointStarted ? transcript(room, "joint") : "(공동 상담 시작 전)",
    "",
    `[이 비공개방 대화]`,
    transcript(room, channel),
    "",
    "notes에는 이 사람의 상담 기록 전체를 최신 상태로 다시 써라. agreements는 위 합의 목록을 그대로 둔다. next_speaker는 none.",
  ].join("\n");
}

/**
 * 공동방 컨텍스트: 두 사람의 상담 기록(공유 금지 항목 표시 포함) + 공동방 대화.
 * 비공개 대화 원문은 넣지 않는다. 그래도 기록에서 새어나갈 수 있으므로 누설 검사를 한 번 더 거친다.
 */
export function buildJointContext(room: Room, event: TurnEvent): string {
  return [
    "[상담방 상황]",
    "- 지금 응답할 곳: 공동 상담방 (A, B, 상담사 셋이 모두 봄)",
    people(room),
    `- 지금 차례로 지정돼 있던 사람: ${room.nextSpeaker}`,
    `- 안전 판단(지금까지): ${room.safety}`,
    "",
    "[이번 이벤트]",
    eventLine(room, event),
    "",
    `[A(${nameOf(room, "A")})님 상담 기록 — private_do_not_share 항목은 공동방에서 절대 인용·암시 금지]`,
    notesBlock(room.notes.A),
    "",
    `[B(${nameOf(room, "B")})님 상담 기록 — private_do_not_share 항목은 공동방에서 절대 인용·암시 금지]`,
    notesBlock(room.notes.B),
    "",
    "[합의된 약속]",
    room.agreements.length ? room.agreements.map((s) => `- ${s}`).join("\n") : "(없음)",
    "",
    "[공동방 대화]",
    transcript(room, "joint"),
    "",
    "notes는 null. agreements에는 지금까지 합의된 약속 전체를 써라. next_speaker에 다음에 말할 사람을 지정하고, message 안에서도 그 사람을 이름으로 불러라.",
  ].join("\n");
}

/** 누설 검사에 쓰는 비공개 자료: 두 사람의 공유 금지 항목과 비공개 대화 원문 */
export function privateMaterial(room: Room): string {
  const parts: string[] = [];
  for (const who of ["A", "B"] as const) {
    const notes = room.notes[who];
    const channel: Channel = who === "A" ? "privA" : "privB";
    parts.push(
      `[${nameOf(room, who)}(${who}) 공유 금지 항목]`,
      notes?.private_do_not_share.length ? notes.private_do_not_share.map((s) => `- ${s}`).join("\n") : "(없음)",
      `[${nameOf(room, who)}(${who}) 공유 허락 항목 — 이건 말해도 됨]`,
      notes?.consented_to_share.length ? notes.consented_to_share.map((s) => `- ${s}`).join("\n") : "(없음)",
      `[${nameOf(room, who)}(${who}) 비공개 대화 원문]`,
      transcript(room, channel),
      "",
    );
  }
  parts.push("[공동방에서 이미 본인이 직접 말한 내용 — 이건 말해도 됨]", transcript(room, "joint"));
  return parts.join("\n");
}
