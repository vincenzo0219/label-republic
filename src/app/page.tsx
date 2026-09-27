import { FeedView } from "@/components/FeedView";
import { sortSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export default async function HomePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  return <FeedView sort={sortSchema.parse(sp.sort)} page={Number(sp.page) || 1} />;
}
