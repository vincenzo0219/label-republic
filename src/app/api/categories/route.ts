import { json, route } from "@/lib/http";
import { listCategories } from "@/lib/repo/categories";

export const GET = route(async () => json({ categories: await listCategories() }));
