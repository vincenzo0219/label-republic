"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client-api";

export function ResolveError({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-sm"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await api("/api/admin/errors", "POST", { id });
          router.refresh();
        } finally {
          setBusy(false);
        }
      }}
    >
      해결 표시
    </button>
  );
}
