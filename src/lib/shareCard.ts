/** 인스타 스토리 크기(1080×1920) 테스트 결과 카드 (Sprint 59 → 61에서 두 테스트가 같이 쓰도록 분리) */
export type ShareCardText = {
  /** 맨 위 제목 — "🏠 노방장 황금귀 테스트" */
  title: string;
  /** 제목 아래 한 줄 */
  sub: string;
  emoji: string;
  /** 등급 이름 (가장 크게) */
  name: string;
  /** 결과 한 줄 — "10문제 중 7개 정답" */
  score: string;
  /** 상위 % 등 (없으면 생략) */
  extra?: string | null;
  /** 맨 아래 주소 — "nobangjang.com/ear-test" */
  url: string;
};

export async function drawShareCard(t: ShareCardText): Promise<Blob | null> {
  await document.fonts.ready;
  const c = document.createElement("canvas");
  c.width = 1080;
  c.height = 1920;
  const g = c.getContext("2d")!;
  const font = getComputedStyle(document.body).fontFamily;
  g.fillStyle = "#121211";
  g.fillRect(0, 0, 1080, 1920);
  const grad = g.createRadialGradient(860, 260, 0, 860, 260, 760);
  grad.addColorStop(0, "rgba(79,209,165,0.35)");
  grad.addColorStop(1, "rgba(79,209,165,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 1080, 1920);
  g.fillStyle = "#f4f2ec";
  g.textAlign = "center";
  g.font = `700 44px ${font}`;
  g.fillText(t.title, 540, 260);
  g.font = `400 40px ${font}`;
  g.fillStyle = "#c9c5bb";
  g.fillText(t.sub, 540, 330);
  g.font = `400 220px ${font}`;
  g.fillText(t.emoji, 540, 700);
  g.fillStyle = "#4fd1a5";
  g.font = `700 140px ${font}`;
  g.fillText(t.name, 540, 900);
  g.fillStyle = "#f4f2ec";
  g.font = `700 72px ${font}`;
  g.fillText(t.score, 540, 1060);
  if (t.extra) {
    g.font = `700 64px ${font}`;
    g.fillStyle = "#ffb86b";
    g.fillText(t.extra, 540, 1160);
  }
  g.fillStyle = "#4fd1a5";
  const w = 760;
  g.beginPath();
  g.roundRect(540 - w / 2, 1450, w, 130, 65);
  g.fill();
  g.fillStyle = "#121211";
  g.font = `700 52px ${font}`;
  g.fillText("너도 해 봐 👉 1분이면 끝", 540, 1533);
  g.fillStyle = "#a9a59c";
  g.font = `400 40px ${font}`;
  g.fillText(t.url, 540, 1660);
  return new Promise<Blob | null>((r) => c.toBlob(r, "image/png"));
}

/** 휴대폰이면 공유 시트로, 아니면 파일로 저장 */
export async function shareOrDownload(blob: Blob, fileName: string, text: string): Promise<void> {
  const file = new File([blob], fileName, { type: "image/png" });
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], text }).catch(() => {});
    return;
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
