import type { MetadataRoute } from "next";
import { siteManifest } from "@/lib/manifest";

/** 홈 화면에 추가(PWA). 방 안에서는 /c/<slug>/manifest.webmanifest (그 방에서 열림) */
export default function manifest(): MetadataRoute.Manifest {
  return siteManifest();
}
