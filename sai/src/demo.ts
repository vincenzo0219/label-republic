import type { Brain, CounselorTurn, LeakCheck } from "./types.js";

/**
 * API 키 없이 화면과 흐름만 확인하는 데모용 상담사. 실제 판단은 하지 않고 정해진 말만 한다.
 * SAI_DEMO=1 이거나 ANTHROPIC_API_KEY 가 없을 때 쓰인다.
 */
export class DemoBrain implements Brain {
  private count = new Map<string, number>();

  async turn(context: string): Promise<CounselorTurn> {
    const joint = context.includes("공동 상담방 (A, B, 상담사 셋이 모두 봄)");
    const key = joint ? "joint" : context.includes("(A)님과의 1:1") ? "A" : "B";
    const n = (this.count.get(key) ?? 0) + 1;
    this.count.set(key, n);
    await new Promise((r) => setTimeout(r, 400));

    if (joint) {
      const next = n % 2 === 1 ? "A" : "B";
      return {
        plan: { stage: "pattern", goal: "", technique: "", next_speaker: next, safety: "none", suggest_invite: false, ready_for_joint: true },
        notes: null,
        agreements: n >= 3 ? ["화나면 '20분'이라고 말하고 멈추기", "멈췄으면 그날 안에 다시 이야기하기"] : [],
        message:
          n === 1
            ? "[데모] 두 분 이야기를 모두 들었습니다. 누가 맞고 틀린지 판단하지 않겠습니다. A님부터, 그날 어떤 마음이었는지 말씀해 주세요."
            : `[데모] 잘 들었어요. 이번에는 ${next === "A" ? "A" : "B"}님 차례예요.`,
      };
    }
    const opening = n === 1;
    return {
      plan: {
        stage: opening ? "intake" : "explore",
        goal: "",
        technique: "",
        next_speaker: "none",
        safety: "none",
        suggest_invite: key === "A" && n >= 3,
        ready_for_joint: n >= 2,
      },
      notes: { summary: "데모", feelings: [], needs: [], patterns: [], private_do_not_share: [], consented_to_share: [] },
      agreements: [],
      message: opening
        ? key === "A"
          ? "[데모] 어서 오세요. 여기 내용은 상대에게 가지 않아요. 요즘 누구랑 제일 부딪히세요?"
          : "[데모] 반가워요. 셋이 이야기하기 전에 제가 먼저 당신 이야기를 듣겠습니다. 여기서 한 말은 상대에게 그대로 공개되지 않아요. 요즘 어떠세요?"
        : key === "A" && n >= 3
          ? "[데모] 이제 상대방 이야기도 들어볼 때가 됐어요. 아래 버튼으로 초대해 볼까요?"
          : "[데모] 그랬군요. 그때 정확히 어떤 말을 들었어요?",
    };
  }

  async leakCheck(input: { message: string }): Promise<LeakCheck> {
    return { leak: false, reason: "", revised_message: input.message };
  }

  async report(): Promise<string> {
    return "[데모] 사이 리포트\n\n두 분을 괴롭히는 고리: 버럭할수록 멀어지고, 멀어질수록 버럭하는 고리";
  }
}
