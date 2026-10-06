/**
 * 첫 방문·빈 방 온보딩 (Sprint 32).
 *
 * 오픈 직후에는 글이 적어 "무엇을 쓰면 되는지"가 보이지 않는다. 방마다 쓰기 좋은 글의 예시(글쓰기 틀)를 두고,
 * 글이 적은 방과 첫 방문 홈에서 보여 준다. 틀은 제목·본문 뼈대일 뿐 값은 비어 있다 — 사실은 쓰는 사람이 채운다.
 */
import type { PostType } from "./types";

export type WritingTemplate = {
  key: string;
  /** 방 안내에 보이는 한 줄 */
  label: string;
  hint: string;
  postType: PostType;
  title: string;
  body: string;
};

export type BoardGuide = { lead: string; templates: WritingTemplate[] };

/** 방에 보이는 정보 글이 이보다 적으면 안내를 보여 준다 */
export const THIN_BOARD_POSTS = 5;
export const WELCOME_COOKIE = "lr_welcome";

const common = {
  label: (key: string, label: string, hint: string, title: string, body: string, postType: PostType = "info"): WritingTemplate => ({
    key, label, hint, postType, title, body,
  }),
};

const LABEL_BODY = `제품: (브랜드 · 제품명 · 용량)
구입 시기·곳:

라벨에 적힌 값 (사진을 올리면 수치를 자동으로 읽어 줘요)
- 1회 섭취량:
- 주요 성분·함량:

눈여겨볼 점 (사실만, 출처가 있으면 함께):
`;

const GUIDES: Record<string, BoardGuide> = {
  supplements: {
    lead: "영양제 라벨의 성분·함량을 사진과 함께 정리하는 방이에요. 광고 문구보다 라벨에 실제로 적힌 값이 중요해요.",
    templates: [
      common.label("supplement-label", "📸 먹고 있는 영양제 라벨 정리", "라벨 사진 + 1회 섭취량 기준 성분표", "[제품명] 라벨 성분 정리", LABEL_BODY),
      common.label(
        "supplement-compare", "⚖️ 같은 성분 두 제품 비교", "1정당 함량·원료 형태(예: 시트르산 마그네슘)·가격 기준",
        "[성분] 제품 두 개 함량 비교",
        `비교한 제품:
1.
2.

기준 (1정 / 1회 섭취량 / 1일 권장량):

| 항목 | 제품 1 | 제품 2 |
|---|---|---|
| 함량 | | |
| 원료 형태 | | |

정리:
`,
      ),
      common.label(
        "supplement-renewal", "🔄 리뉴얼로 바뀐 라벨 제보", "예전 라벨과 새 라벨의 값이 다를 때 (제조일자도 적어 주세요)",
        "[제품명] 라벨 표시값이 바뀌었어요",
        `제품:
예전 라벨 (제조일자/유통기한): 값 =
새 라벨 (제조일자/유통기한): 값 =

두 라벨 사진을 모두 올려 주세요. 다른 이용자 제보가 모이면 라벨 변경 이력에 반영돼요.
`,
      ),
    ],
  },
  keyboards: {
    lead: "스위치·키보드 스펙을 실측과 제조사 표기로 확인하는 방이에요. 느낌보다 숫자와 조건을 적어 주세요.",
    templates: [
      common.label(
        "keyboard-switch", "🔩 스위치 스펙 실측", "작동압·바닥압·트래블 실측값과 측정 방법",
        "[스위치 이름] 작동압 실측",
        `스위치: (제조사 · 이름 · 로트/구입 시기)
제조사 표기: 작동압  g / 트래블  mm

실측 (측정 도구·방법):
- 작동압:
- 바닥압:
- 트래블:

윤활·스프링 교체 여부:
`,
      ),
      common.label("keyboard-build", "⌨️ 키보드 구성 정리", "하우징·보강판·폼·스태빌라이저 구성과 출처", "[키보드 이름] 구성 정리", `키보드:\n하우징 / 보강판 / 폼 / 스태빌:\n\n제조사 표기와 다른 점:\n`),
    ],
  },
  deskterior: {
    lead: "책상 셋업 제품의 규격·실측을 모으는 방이에요. 설치 조건(책상 두께, 모니터 무게)을 함께 적으면 도움이 돼요.",
    templates: [
      common.label("desk-spec", "📏 제품 규격 실측", "모니터암 하중·조명 밝기·케이블 길이 등 표기와 실측", "[제품명] 규격 실측", `제품:\n표기 규격:\n실측 (측정 방법):\n설치 조건:\n`),
      common.label("desk-setup", "🖥 내 책상 셋업", "쓰는 제품 목록과 선택 이유 (사진 환영)", "내 책상 셋업 정리", `책상·의자:\n모니터·암:\n조명:\n케이블 정리:\n\n고른 이유와 아쉬운 점:\n`),
    ],
  },
  "pet-food": {
    lead: "사료 원재료 순서와 등록성분량(조단백·조지방 등)을 확인하는 방이에요. 포장지 뒷면 사진이 가장 좋은 근거예요.",
    templates: [
      common.label(
        "petfood-label", "🐾 사료 등록성분량 정리", "조단백·조지방·조섬유·조회분·수분 + 원재료 앞 5개",
        "[사료 이름] 등록성분량 정리",
        `사료: (브랜드 · 제품명 · 대상 연령)

등록성분량 (포장지 표기):
- 조단백질:  % 이상
- 조지방:  % 이상
- 조섬유:  % 이하
- 조회분:  % 이하
- 수분:  % 이하

원재료 앞 5개 (순서대로):
`,
      ),
      common.label("petfood-change", "🔄 원재료·성분 변경 제보", "같은 사료의 예전·새 포장 비교", "[사료 이름] 포장 표기가 바뀌었어요", `사료:\n예전 포장 (제조일자):\n새 포장 (제조일자):\n바뀐 점:\n`),
    ],
  },
  "perfume-audio": {
    lead: "이어폰·헤드폰·코덱·동글·DAC 이야기하는 방이에요. 정착템 자랑, 고민 상담 모두 좋아요. 측정치를 적을 땐 출처를 함께 적어 주세요.",
    templates: [
      common.label("audio-daily", "🎧 내 정착템 이야기", "매일 쓰는 이어폰·헤드폰과 쓰는 환경", "", `매일 쓰는 이어폰·헤드폰:\n주로 듣는 환경 (폰 직결 / 동글 / DAC):\n좋은 점 · 아쉬운 점:\n`, "chat"),
      common.label("audio-measure", "🎧 측정치 정리", "주파수 응답·임피던스·감도 — 측정 장비·출처", "[제품명] 측정치 정리", `제품:\n제조사 표기: 임피던스  Ω / 감도  dB\n측정치 (출처·장비):\n\n표기와 다른 점:\n`),
      common.label("perfume-notes", "🌸 향수 농도·노트 확인", "EDP/EDT 표기, 제조사 공개 노트, 재조합 여부", "[향수 이름] 농도·노트 확인", `향수:\n농도 표기 (EDP/EDT 등):\n제조사 공개 노트:\n배치 코드·구입 시기:\n\n확인한 사실 (출처):\n`),
    ],
  },
};

/** 투표로 새로 열린 방 등: 어느 방에나 맞는 틀 */
const GENERIC: BoardGuide = {
  lead: "이 방 주제라면 무엇이든 이야기해요. 정보 글에는 사진·수치·출처를 함께 적으면 더 믿을 수 있어요.",
  templates: [
    common.label("generic-chat", "💬 자유 이야기", "인사·질문·잡담 무엇이든", "", `하고 싶은 이야기:\n`, "chat"),
    common.label("generic-label", "📸 라벨·스펙 정리", "라벨 사진과 적힌 값 그대로", "[제품명] 라벨·스펙 정리", LABEL_BODY),
    common.label("generic-question", "❓ 확인하고 싶은 것", "근거가 궁금한 주장이나 표기", "[제품명] 이 표기 맞나요?", `확인하고 싶은 주장·표기:\n어디서 봤는지 (링크):\n내가 찾아본 것:\n`),
  ],
};

export function boardGuide(slug: string | undefined): BoardGuide {
  return (slug && GUIDES[slug]) || GENERIC;
}

/** 글쓰기 ?template=키 → 틀 (방이 맞지 않으면 그 방 안내를 따르지 않는 틀도 허용 — 키로만 찾는다) */
export function findTemplate(key: string | undefined): WritingTemplate | null {
  if (!key || !/^[a-z-]{1,40}$/.test(key)) return null;
  for (const g of [...Object.values(GUIDES), GENERIC]) {
    const t = g.templates.find((x) => x.key === key);
    if (t) return t;
  }
  return null;
}
