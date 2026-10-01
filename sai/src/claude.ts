import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  CounselorTurnSchema,
  LeakCheckSchema,
  type Brain,
  type CounselorTurn,
  type LeakCheck,
} from "./types.js";

type Effort = "low" | "medium" | "high" | "xhigh" | "max";

const PROTOCOL_PATH = fileURLToPath(new URL("../protocol/counselor.md", import.meta.url));

/** 상담 프로토콜 문서가 곧 시스템 프롬프트다. 서버를 다시 켜면 수정 내용이 반영된다. */
export function loadProtocol(): string {
  return readFileSync(PROTOCOL_PATH, "utf8");
}

const LEAK_SYSTEM = `너는 커플 상담 서비스의 비공개 보호 검사관이다.
상담사가 공동 상담방(두 사람이 모두 보는 곳)에 보내려는 메시지가, 한 사람이 1:1 비공개방에서만 말한 내용을 상대에게 드러내는지 검사한다.

누설로 본다:
- 비공개방에서만 나온 사실, 감정, 생각을 인용하거나 요약해서 전함
- 직접 말하지 않아도 뉘앙스로 암시함 ("관계 자체에 고민이 많으신 것 같네요"처럼 비공개 고백을 떠올리게 하는 말)

누설이 아니다:
- 공동방에서 본인이 직접 말한 내용
- 본인이 공유를 허락한 항목
- 누구의 비밀도 드러내지 않는 일반적인 패턴 관찰, 질문, 진행 멘트

누설이 있으면 그 부분만 빼거나, 본인에게 직접 말하게 하는 질문으로 바꿔 revised_message를 쓴다. 말투와 나머지 내용은 그대로 둔다. 누설이 없으면 원문을 그대로 돌려준다.`;

const REPORT_INSTRUCTION = `위 공동 상담을 바탕으로 두 사람이 함께 볼 '사이 리포트'를 써라.
- 진단이 아니라 상담사의 관찰이다. "~로 보여요" 같은 표현을 쓴다.
- 순서: ① 두 분을 괴롭히는 고리(이름과 한 문장 설명) ② A님이 느낀 것과 필요한 것 ③ B님이 느낀 것과 필요한 것 ④ 함께 정한 약속 ⑤ 다음 상담까지 연습할 것 한 가지 ⑥ 고리가 다시 시작될 때 쓸 한 문장
- 비공개방에서만 나온 내용은 절대 쓰지 않는다. 공동방에서 직접 말했거나 공유를 허락한 것만 쓴다.
- 짧고 따뜻하게. 마크다운 제목과 목록을 써도 된다.`;

export class ClaudeBrain implements Brain {
  private client = new Anthropic();

  constructor(
    private opts: {
      model?: string;
      effort?: Effort;
      guardEffort?: Effort;
      protocol?: () => string;
    } = {},
  ) {}

  private get model() {
    return this.opts.model ?? process.env.SAI_MODEL ?? "claude-opus-5-5";
  }

  async turn(context: string): Promise<CounselorTurn> {
    const res = await this.client.beta.messages.parse({
      model: this.model,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: [{ type: "text", text: (this.opts.protocol ?? loadProtocol)(), cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: context }],
      output_config: {
        effort: this.opts.effort ?? (process.env.SAI_EFFORT as Effort | undefined) ?? "medium",
        format: betaZodOutputFormat(CounselorTurnSchema),
      },
    });
    if (res.stop_reason === "refusal" || !res.parsed_output) {
      throw new Error(`상담사 응답을 해석하지 못했습니다 (stop_reason=${res.stop_reason})`);
    }
    return res.parsed_output;
  }

  async leakCheck(input: { message: string; privateMaterial: string }): Promise<LeakCheck> {
    const res = await this.client.beta.messages.parse({
      model: this.model,
      max_tokens: 8000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: LEAK_SYSTEM,
      messages: [
        {
          role: "user",
          content: `${input.privateMaterial}\n\n[공동방에 보내려는 메시지]\n${input.message}`,
        },
      ],
      output_config: { effort: this.opts.guardEffort ?? "low", format: betaZodOutputFormat(LeakCheckSchema) },
    });
    if (res.stop_reason === "refusal" || !res.parsed_output) {
      // 검사에 실패하면 안전한 쪽으로: 보내지 않고 진행 멘트로 대체한다.
      return { leak: true, reason: "검사 실패", revised_message: "잠시만요, 제가 정리해 볼게요. 두 분 중 먼저 지금 마음을 말씀해 주실 분 있어요?" };
    }
    return res.parsed_output;
  }

  async report(context: string): Promise<string> {
    const res = await this.client.beta.messages.create({
      model: this.model,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: [{ type: "text", text: (this.opts.protocol ?? loadProtocol)(), cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: `${context}\n\n${REPORT_INSTRUCTION}` }],
      output_config: { effort: this.opts.effort ?? "medium" },
    });
    if (res.stop_reason === "refusal") throw new Error("리포트를 만들지 못했습니다");
    return res.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
  }
}
