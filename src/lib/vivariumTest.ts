/**
 * 🦎 비바리움 1분 테스트 — "우리 집에서 키울 수 있을까?" (Sprint 83, 방 기본 세트의 1분 테스트).
 * 질문 4개로 첫 사육 후보 하나를 고른다. 일반적인 사육 상식만 쓰고, 시작 전에는 샵·브리더와 상담하라고 안내한다.
 */
export const VIVARIUM_INTRO_POST_ID = "2455";

export type VivAnswers = { space: "desk" | "shelf" | "large"; time: "weekly" | "daily5" | "daily"; insects: boolean; touch: boolean };

export type VivPick = { key: string; emoji: string; name: string; why: string; note: string };

export const VIV_PICKS: Record<string, VivPick> = {
  moss: { key: "moss", emoji: "🌿", name: "이끼 테라리움", why: "생물 없이 이끼·고사리로 꾸미는 작은 숲. 뚜껑 덮은 유리병이면 물 주기도 가끔이면 돼요.", note: "빛은 직사광선 대신 밝은 그늘이나 작은 LED로." },
  isopod: { key: "isopod", emoji: "🐞", name: "등각류(공벌레·쥐며느리)", why: "작은 통 하나로 시작할 수 있고, 낙엽·채소로 먹이를 줘요. 손이 많이 가지 않아요.", note: "바닥재가 마르지 않게 한쪽은 촉촉하게." },
  crested: { key: "crested", emoji: "🦎", name: "크레스티드 게코", why: "실온에 가까운 온도에서 지내고, 가루를 물에 개는 전용 먹이로 키울 수 있어 곤충이 꼭 필요하진 않아요.", note: "높이가 있는 장과 밤 분무가 좋아요." },
  leopard: { key: "leopard", emoji: "🦎", name: "레오파드 게코", why: "건조한 사육장에서 지내고 순한 편이라 손에 올려 보기 좋아요. 살아 있는 곤충을 먹어요.", note: "바닥 일부를 따뜻하게 해 줄 열원이 필요해요." },
  dart: { key: "dart", emoji: "🐸", name: "다트프록(화살독개구리)", why: "습한 비바리움을 꾸미며 보는 재미가 커요. 만지기보다 관찰하는 생물이에요.", note: "초파리 같은 아주 작은 먹이를 꾸준히 준비해야 해요." },
};

export function vivPick(a: VivAnswers): VivPick {
  if (a.time === "weekly") return a.space === "desk" ? VIV_PICKS.moss! : VIV_PICKS.isopod!;
  if (!a.insects) return a.space === "desk" ? VIV_PICKS.isopod! : VIV_PICKS.crested!;
  if (a.touch) return VIV_PICKS.leopard!;
  if (a.space !== "desk" && a.time === "daily") return VIV_PICKS.dart!;
  return VIV_PICKS.crested!;
}

export const vivBragLine = (p: VivPick) => `🦎 비바리움 1분 테스트: 나에게 맞는 첫 생물 = ${p.emoji} ${p.name} / 키우는·키워 보고 싶은 생물: `;
