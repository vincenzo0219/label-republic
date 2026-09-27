import type { MetadataRoute } from "next";
import { config } from "@/lib/config";

export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/write", "/search", "/posts/*/edit"] },
    sitemap: `${config.siteUrl}/sitemap.xml`,
  };
}
