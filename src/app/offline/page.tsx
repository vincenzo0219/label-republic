import type { Metadata } from "next";
import { OfflineList } from "@/components/OfflineList";

// 서비스 워커가 설치될 때 미리 받아 두는 화면이라 요청마다 만들지 않는다
export const dynamic = "force-static";
export const metadata: Metadata = { title: "저장한 글", robots: { index: false, follow: false } };

export default function OfflinePage() {
  return (
    <>
      <h1 style={{ fontSize: 20, margin: "4px 0 8px" }}>📥 저장한 글</h1>
      <p className="hint">
        이 기기에 저장된 글이에요. 최근 본 글 20개는 7일, &ldquo;오프라인 저장&rdquo;한 글은 30일 동안 연결 없이 볼 수 있어요. 블라인드되거나 지워진 글은 연결될 때
        이 기기에서도 지워집니다.
      </p>
      <OfflineList />
    </>
  );
}
