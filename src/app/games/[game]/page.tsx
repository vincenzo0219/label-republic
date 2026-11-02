import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MiniGame } from "@/components/MiniGame";
import { friendMetadata, type SearchParams } from "@/lib/friendMeta";
import { GAMES, isGameId } from "@/lib/miniGames";

type Props = { params: Promise<{ game: string }>; searchParams: SearchParams };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { game } = await params;
  if (!isGameId(game)) return {};
  const g = GAMES[game];
  const base: Metadata = { title: `${g.emoji} ${g.name}`, description: `${g.roomName}에서 30초 미니게임`, alternates: { canonical: `/games/${game}` } };
  // ⚡ 반응속도 친구 대결 링크(?vs=)면 미리보기를 친구 기록 카드로 (11/2)
  return game === "reaction" ? friendMetadata(base, "reaction", searchParams) : base;
}

/** 🎮 방 미니게임 (10/29). 방 "1분 테스트" 옆 버튼으로 들어온다 */
export default async function GamePage({ params }: Props) {
  const { game } = await params;
  if (!isGameId(game)) notFound();
  return <MiniGame game={game} />;
}
