import type { Metadata } from "next";
import { cache } from "react";
import { AutoMyRoom } from "@/components/MyRooms";
import { roomShortName } from "@/lib/myRooms";
import { getCategoryBySlug as getUncached } from "@/lib/repo/categories";

const getCategoryBySlug = cache((slug: string) => getUncached(slug).catch(() => null));

type Props = { params: Promise<{ slug: string }> };

function decodeSlug(raw: string) {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** 방 안 어디서든 홈 화면에 추가하면 이 방에서 열리게 (방별 manifest) */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const room = await getCategoryBySlug(decodeSlug((await params).slug));
  if (!room) return {};
  return {
    manifest: `/c/${encodeURIComponent(room.slug)}/manifest.webmanifest`,
    appleWebApp: { capable: true, title: roomShortName(room), statusBarStyle: "default" },
  };
}

/** 방 안 어디서든(탭·제품·스펙·라벨 변경): 내 방이 아직 없으면 이 방이 첫 내 방 */
export default async function RoomLayout({ params, children }: Props & { children: React.ReactNode }) {
  const room = await getCategoryBySlug(decodeSlug((await params).slug));
  return (
    <>
      {room && <AutoMyRoom slug={room.slug} />}
      {children}
    </>
  );
}
