"use client";

/** 📬 이 브라우저의 값으로 리포트 요청 재료를 읽는다 — 배지와 /me 가 같이 쓴다 (10/25) */
import { getInterests, getSeenAt } from "./interests";
import { getMyRooms } from "./myRooms";
import { getReadPosts } from "./readPosts";
import { reportBoards, type ReportInput } from "./reportQuery";
import { seenParam } from "./seen";
import { getMyComments, getWatchedPosts, getWatchedProducts } from "./watchlist";

export function readReportInput(): ReportInput {
  const mine = getMyRooms();
  const interests = getInterests();
  return {
    mine,
    interests,
    products: getWatchedProducts(),
    posts: getWatchedPosts(),
    comments: getMyComments(),
    since: getSeenAt(),
    seen: seenParam(reportBoards(mine, interests)),
    read: getReadPosts(),
  };
}
