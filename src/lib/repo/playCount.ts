/** 🧩 놀이 탭 숫자 (11/2 대표님 "1."): 오늘(KST) 이 방 놀이에 참여한 사람 수. 실제 참여만 센다 (기록판·사진·하트·투표·고르기·별점·응원·유형 테스트·1분 퀴즈·미니게임·문장 고르기) */
import { query } from "../db";
import { kstDay } from "../metrics";
import { boardsInRoom } from "../roomBoards";
import { SENTENCE_BOARD } from "../sentencePick";
import { TYPE_TESTS } from "../typeTests";
import { BOOK_ROOM_SLUG } from "../books";

const SENTENCE_ROOMS = new Set([BOOK_ROOM_SLUG, "미혼남녀-만남-행사"]);

export async function playCountToday(slug: string, now = new Date()): Promise<number> {
  const day = kstDay(now);
  const since = new Date(`${day}T00:00:00+09:00`);
  const boards = boardsInRoom(slug).map((b) => b.key);
  if (SENTENCE_ROOMS.has(slug)) boards.push(SENTENCE_BOARD);
  const tests = Object.values(TYPE_TESTS).filter((t) => t.room === slug).map((t) => t.key);
  const [row] = await query<{ n: number }>(
    `SELECT count(DISTINCT v)::int AS n FROM (
       SELECT visitor_hash AS v FROM room_logs WHERE board = ANY($1) AND created_at >= $2
       UNION ALL SELECT visitor_hash FROM room_photos WHERE board = ANY($1) AND created_at >= $2
       UNION ALL SELECT h.visitor_hash FROM room_photo_hearts h JOIN room_photos p ON p.id = h.photo_id WHERE p.board = ANY($1) AND h.created_at >= $2
       UNION ALL SELECT visitor_hash FROM room_votes WHERE board = ANY($1) AND created_at >= $2
       UNION ALL SELECT b.visitor_hash FROM room_vote_ballots b JOIN room_votes v ON v.id = b.vote_id WHERE v.board = ANY($1) AND b.created_at >= $2
       UNION ALL SELECT visitor_hash FROM room_picks WHERE board = ANY($1) AND created_at >= $2
       UNION ALL SELECT visitor_hash FROM room_ratings WHERE board = ANY($1) AND updated_at >= $2
       UNION ALL SELECT visitor_hash FROM room_pets WHERE board = ANY($1) AND created_at >= $2
       UNION ALL SELECT c.visitor_hash FROM room_pet_cheers c JOIN room_pets p ON p.id = c.pet_id WHERE p.board = ANY($1) AND c.day = $3::date
       UNION ALL SELECT visitor_hash FROM type_test_results WHERE test_key = ANY($4) AND updated_at >= $2
       UNION ALL SELECT visitor_hash FROM quiz_answers WHERE room = $5 AND day = $3::date
       UNION ALL SELECT visitor_hash FROM game_plays WHERE room = $5 AND day = $3::date
     ) x`,
    [boards, since, day, tests, slug],
  );
  return row?.n ?? 0;
}
