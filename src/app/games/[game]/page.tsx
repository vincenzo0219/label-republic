import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MiniGame } from "@/components/MiniGame";
import { GAMES, isGameId } from "@/lib/miniGames";

type Props = { params: Promise<{ game: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { game } = await params;
  if (!isGameId(game)) return {};
  const g = GAMES[game];
  return { title: `${g.emoji} ${g.name}`, description: `${g.roomName}에서 30초 미니게임`, alternates: { canonical: `/games/${game}` } };
}

/** 🎮 방 미니게임 (10/29). 방 "1분 테스트" 옆 버튼으로 들어온다 */
export default async function GamePage({ params }: Props) {
  const { game } = await params;
  if (!isGameId(game)) notFound();
  return <MiniGame game={game} />;
}
