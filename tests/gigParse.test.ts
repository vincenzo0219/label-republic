import { describe, expect, it } from "vitest";
import { parseGig } from "@/lib/gigParse";
import { stationRegion } from "@/lib/gigStations";

// 2026-10-25(일) 12:00 KST. 아래 글은 카톡 대강방 양식을 본뜬 가짜 글 (번호·업체·주소 모두 지어낸 것)
const NOW = new Date("2026-10-25T03:00:00Z");

describe("📋 카톡 대강 글 붙여넣기", () => {
  it("reads the ✅대강양식✅ template", () => {
    const g = parseGig(
      `[가짜닉] [오후 3:16] ✅대강양식✅
업체명 : 하늘필라테스 신촌점
기간 : 26.10.27(화) 하루
주소 : 서울 마포구 백범로 1 2층
시간(오전/오후) : 오후, 19:30/ 20:30 2타임
페이 : 3.2
연락처/카톡 : 010-0000-1111
사용기구&수업내용 : 캐딜락
대강비 입금일 : 당일 수업 종료 후 입금
3.3% 세금 공제 여부: O
이력서 발송 메일: fake-studio@example.com`,
      NOW,
    );
    expect(g).toMatchObject({
      kind: "sub",
      studio: "하늘필라테스 신촌점",
      sido: "서울",
      sigungu: "마포구",
      dates: ["2026-10-27"],
      times: ["19:30", "20:30"],
      classType: "기구필라테스",
      pay: 32000,
      tax: true,
      payday: "당일 수업 종료 후 입금",
    });
    expect(g.contact).toBe("010-0000-1111 · fake-studio@example.com");
    expect(g.equipment).toContain("캐딜락");
    expect(g.filled).toBe(8);
  });

  it("reads a dash-list post with day-only dates and comma hours", () => {
    const g = parseGig(
      `- 업체명 :  구름바레 위례점
- 위례광장로 999
- 날짜 및 타입: 27일 19시,20시
                        29일 20시,21시
- 페이  : 3.5만원 , 폐강시 2만원
- 수업 방식 : 바레수업
- 연락처 : 010 0000 2222
- 요청사항(특이사항) : 수업지각안하실 강사님 지원부탁드립니다`,
      NOW,
    );
    expect(g).toMatchObject({ kind: "sub", studio: "구름바레 위례점", classType: "바레", pay: 35000, contact: "010-0000-2222" });
    expect(g.dates).toEqual(["2026-10-27", "2026-10-29"]);
    expect(g.times).toEqual(["19:00", "20:00", "21:00"]);
    expect(g.notes).toMatch(/지각/);
  });

  it("reads 오늘 + bare hours + station + total pay for two times", () => {
    const g = parseGig(
      `오늘 저녁 8,9시 매트필라테스 수업 대강 구합니다

장소: 신논현역 OO아파트 gx

페이:7.5

01000003333로 간단 이력서 보내주세요!`,
      NOW,
    );
    expect(g).toMatchObject({ kind: "sub", dates: ["2026-10-25"], times: ["20:00", "21:00"], classType: "매트필라테스", sido: "서울", sigungu: "강남구", station: "신논현", pay: 37500 });
    expect(g.contact).toBe("010-0000-3333");
  });

  it("reads 10/28 (수) dates, 오후 19:00 times and 타임당 3.5", () => {
    const g = parseGig(
      `📢 10/28 (수), 10/30 (금), 11/2 (월) 대강 강사님 구합니다!
안녕하세요 별빛바레 분당야탑역점입니다 :)
시간: 오후 19:00/20:00/21:00
수업: 바레 그룹 수업 (정원 12명)
페이: 타임당 3.5 (폐강 없이 1명이어도 수업 진행합니다)
fake@example.com
010-0000-4444`,
      NOW,
    );
    expect(g.dates).toEqual(["2026-10-28", "2026-10-30", "2026-11-02"]);
    expect(g.times).toEqual(["19:00", "20:00", "21:00"]);
    expect(g).toMatchObject({ kind: "sub", classType: "바레", pay: 35000, sido: "경기", sigungu: "성남시" });
  });

  it("reads a regular weekly post (요일, 35,000원, 3.3% 공제 후)", () => {
    const g = parseGig(
      `[인천 송도] 피트니스 센터 바레 정규 강사님 구인합니다!
근무지: 달빛 휘트니스 송도점
인천 연수구 벤처로 0 가짜스퀘어 2층
강의 시간: 수,금 오전 11시 ~ 11시 50분
급여: 회당 32,000
3.3% 공제 후 지급
문의 010-0000-5555`,
      NOW,
    );
    expect(g).toMatchObject({ kind: "job", sido: "인천", sigungu: "연수구", weekdays: [3, 5], times: ["11:00"], classType: "바레", pay: 32000, tax: true });
    expect(g.dates).toEqual([]);
  });

  it("reads 월/수/금 저녁 7시, 8시, 9시 and 타임당 30,000원", () => {
    const g = parseGig(
      `🔥 [급구/대강가능] 무지개 피트니스 성남 신흥역 월/수/금 저녁 타임 강사님 구합니다!
10/26(월), 10/28(수), 10/30(금) 3일간 대강 가능하신 분 모두 편하게 연락 주세요!
📍 센터 위치
 성남시 수정구 시민로 0 (신흥역 인근)
⏰ 근무 시간
 저녁 7시, 8시, 9시 (하루 총 3타임)
🧘‍♀️ 담당 수업
 기구필라테스 (캐포머 7:1 / 바렐·체어 6:1)
💰 급여
 타임당 30,000원
📩 지원
010-0000-6666 이력서는 문자로 남겨주세요!`,
      NOW,
    );
    expect(g).toMatchObject({ kind: "sub", sido: "경기", sigungu: "성남시", station: "신흥", classType: "기구필라테스", pay: 30000 });
    expect(g.dates).toEqual(["2026-10-26", "2026-10-28", "2026-10-30"]);
    expect(g.times).toEqual(["19:00", "20:00", "21:00"]);
    expect(g.equipment).toEqual(expect.arrayContaining(["캐포머", "체어", "바렐"]));
  });

  it("reads 내일 오전 9시, 10시, 11시 with a city and dong", () => {
    const g = parseGig(
      `급한 일정으로 내일오전 대강부탁드립니다
천안시 신부동 처음처럼필라테스
신부12길 0 2층
9시, 10시, 11시 3타임
수업료 3만원 수업 후 바로지급
010-0000-7777 문자주세요`,
      NOW,
    );
    expect(g).toMatchObject({ kind: "sub", dates: ["2026-10-26"], times: ["09:00", "10:00", "11:00"], sido: "충남", sigungu: "천안시", pay: 30000 });
    expect(g.payday).toMatch(/수업 후 바로지급/);
  });

  it("reads 10월 20일, 세금공제X, 18.19.20.21 hours", () => {
    const g = parseGig(
      `[당일대강급구합니다]
- 업체명 :  쌤쌤필라테스
- 날짜 : 10월 26일
- 마포구 서강로 00
- 시간 : 18.19.20.21
- 페이  : 3만원 세금공제X
- 수업 방식 : 캐포머
- 연락처 : 010 0000 8888`,
      NOW,
    );
    expect(g).toMatchObject({ kind: "sub", studio: "쌤쌤필라테스", dates: ["2026-10-26"], times: ["18:00", "19:00", "20:00", "21:00"], sido: "서울", sigungu: "마포구", pay: 30000, tax: false, classType: "기구필라테스" });
  });

  it("does not take 동구릉역 as 동구, and reads 19:00 / 20:00 / 21:00 yoga regular", () => {
    const g = parseGig(
      `❤️ 초록필라테스 요가 정규 강사 모집 ❤️
📍 근무지
경기도 구리시
(동구릉역 1번 출구 도보 1분)
🧘‍♀️ 요가 그룹레슨 8:1
📅 매주 화 · 목 저녁
⏰ 19:00 / 20:00 / 21:00 (3타임)
💰 페이 : 타임당 35,000원
📧 fake-yoga@example.com`,
      NOW,
    );
    expect(g).toMatchObject({ kind: "job", sido: "경기", sigungu: "구리시", station: "동구릉", classType: "요가", pay: 35000, weekdays: [2, 4] });
    expect(g.times).toEqual(["19:00", "20:00", "21:00"]);
    expect(g.contact).toBe("fake-yoga@example.com");
  });

  it("reads 18: 30 & 19:40 and a pay range 3.5~", () => {
    const g = parseGig(
      `[영등포역 도보 1분] 바레 강사님 구인합니다!
- 근무요일 : 매주 금요일
- 근무시간 : 18: 30 & 19:40 (1시간 수업 - 2타임)
- 페이 : 3.5~
⭐전화번호 : 010-0000-9999`,
      NOW,
    );
    expect(g).toMatchObject({ kind: "job", weekdays: [5], times: ["18:30", "19:40"], pay: 35000, sido: "서울", sigungu: "영등포구", station: "영등포", classType: "바레" });
  });

  it("reads 오후 7:30 / 오후 8:30 and 타임비 1타임 40,000원 (총 2타임 80,000원)", () => {
    const g = parseGig(
      `[별별피트니스] 바레OR발레핏 모집
요일 : 매주 목요일
시간 : 오후 7:30 / 오후 8:30
타임비 1타임 40,000원
(총 2타임 80,000원)
경기도 안양시 만안구 안양로 000
이메일:fake-fit@example.com`,
      NOW,
    );
    expect(g).toMatchObject({ kind: "job", weekdays: [4], times: ["19:30", "20:30"], pay: 40000, sido: "경기", sigungu: "안양시", classType: "바레" });
  });

  it("reads mixed 오전/오후 in one line", () => {
    const g = parseGig(
      `📢바레 대강 강사 구인
📍 지역 | 경기도 안산시 단원구 가짜호텔 3층
📅 요일 | 30일 금요일
⏰ 시간 | 오전 9:30/ 10:30 오후 6:30/7:30
💰 페이 | 타임당 35,000원
📞 연락처 | 010-0000-1212`,
      NOW,
    );
    expect(g).toMatchObject({ kind: "sub", dates: ["2026-10-30"], times: ["09:30", "10:30", "18:30", "19:30"], sido: "경기", sigungu: "안산시", pay: 35000 });
  });

  it("handles 12시~12시50분 (4만원) and a kakao id", () => {
    const g = parseGig(
      `내일
12시~12시50분 가짜백화점 본점 (4만원)
대강강사님 섭외합니다.
발레핏수업입니다.
카톡 아이디: fakeid_99`,
      NOW,
    );
    expect(g).toMatchObject({ kind: "sub", dates: ["2026-10-26"], times: ["12:00"], pay: 40000, classType: "바레", contact: "카톡 fakeid_99" });
  });

  it("fills nothing useful from an off-topic political message", () => {
    const g = parseGig("다들 이번 선거 누구 뽑으실 건가요 ㅋㅋ 정치 이야기 좀 해요", NOW);
    expect(g.kind).toBeNull();
    expect(g.dates).toEqual([]);
    expect(g.classType).toBeNull();
    expect(g.contact).toBe("");
    expect(g.filled).toBe(0);
  });

  it("does not read 수업·금일·월급 as weekdays or 7:1 as a time", () => {
    const g = parseGig("금일 수업 대강 · 7:1 그룹 · 19:00 · 강남구 · 010-0000-1313 · 요가", NOW);
    expect(g.weekdays).toEqual([]);
    expect(g.times).toEqual(["19:00"]);
    expect(g.dates).toEqual(["2026-10-25"]);
  });

  it("rolls a past month-day into next year", () => {
    expect(parseGig("1/5 대강 요가 19시 강남역 010-0000-1414", NOW).dates).toEqual(["2027-01-05"]);
  });

  it("knows a few stations", () => {
    expect(stationRegion("선릉역")).toEqual({ sido: "서울", sigungu: "강남구" });
    expect(stationRegion("야탑")).toEqual({ sido: "경기", sigungu: "성남시" });
    expect(stationRegion("없는역")).toBeNull();
  });
});

describe("📋 업체명", () => {
  it("keeps yoga studio names and the branch", () => {
    expect(parseGig("안녕하세요 라라요가 역삼점입니다\n10/27 19시 요가 대강\n010-0000-1515", NOW).studio).toBe("라라요가 역삼점");
    expect(parseGig("마포구에 위치한 쌤쌤필라테스\n월,수,금 오후 강사님 구인합니다", NOW).studio).toBe("쌤쌤필라테스");
    expect(parseGig("가짜메이드 헬스&PT 철산점입니다\n월수금 줌바", NOW).studio).toBe("가짜메이드 헬스&PT 철산점");
  });
  it("turns 요일-only 대강 into the coming dates", () => {
    expect(parseGig("이번주 화목 오전 10시 바레 대강 구합니다 강남역 010-0000-1616", NOW).dates).toEqual(["2026-10-27", "2026-10-29"]);
  });
});
