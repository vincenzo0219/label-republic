import { AI_TEST_BRAG_POST_ID } from "./aiTest";
import { BASEBALL_INTRO_POST_ID } from "./baseballTest";
import { RUNNER_INTRO_POST_ID } from "./runnerTest";
import { YOGA_INTRO_POST_ID } from "./yogaTest";
import { SHOE_INTRO_POST_ID } from "./shoeTest";
import { GAME_INTRO_POST_ID } from "./gameTest";
import { DRAMA_INTRO_POST_ID } from "./dramaTest";
import { COFFEE_INTRO_POST_ID } from "./coffeeTest";
import { ANIME_INTRO_POST_ID } from "./animeTest";
import { WINE_INTRO_POST_ID } from "./wineTest";
import { DEBATE_TEST_POST_ID } from "./debateTest";
import { PARENT_INTRO_POST_ID } from "./parentTest";
import { WRITER_INTRO_POST_ID } from "./writerTest";
import { DOG_INTRO_POST_ID } from "./dogTest";
import { EAR_BRAG_POST_ID } from "./earTest";
import { FAN_INTRO_POST_ID } from "./fanTest";
import { FIRST_LINE_BRAG_POST_ID } from "./firstLineTest";
import { HEARING_BRAG_POST_ID } from "./hearingTest";
import { TYPING_BRAG_POST_ID } from "./typingTest";
import { VEGAN_INTRO_POST_ID } from "./veganTest";
import { VIVARIUM_INTRO_POST_ID } from "./vivariumTest";

/** 테스트 결과를 댓글로 모으는 글들 */
export const TEST_POST_IDS: ReadonlySet<string> = new Set([
  AI_TEST_BRAG_POST_ID, BASEBALL_INTRO_POST_ID, DOG_INTRO_POST_ID, EAR_BRAG_POST_ID, FAN_INTRO_POST_ID, FIRST_LINE_BRAG_POST_ID,
  HEARING_BRAG_POST_ID, RUNNER_INTRO_POST_ID, TYPING_BRAG_POST_ID,
  YOGA_INTRO_POST_ID, SHOE_INTRO_POST_ID, VEGAN_INTRO_POST_ID, VIVARIUM_INTRO_POST_ID,
  GAME_INTRO_POST_ID, DRAMA_INTRO_POST_ID, COFFEE_INTRO_POST_ID, ANIME_INTRO_POST_ID, WINE_INTRO_POST_ID, DEBATE_TEST_POST_ID, PARENT_INTRO_POST_ID, WRITER_INTRO_POST_ID, // 비바리움 타입 테스트(/viv-test)는 VIVARIUM 글을 같이 쓴다
]);
