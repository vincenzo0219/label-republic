/**
 * 줄 단위 비교 (수정 이력 화면용). LCS 로 같은 줄·지운 줄·더한 줄을 구한다.
 * 줄 수가 너무 많으면 계산하지 않고 null — 화면은 두 판을 통째로 보여준다.
 */
export type DiffLine = { op: "same" | "del" | "add"; text: string };

const MAX_CELLS = 400_000;

export function diffLines(before: string, after: string): DiffLine[] | null {
  const a = before.split("\n");
  const b = after.split("\n");
  // 앞뒤의 같은 줄은 표 밖에서 처리해 계산량을 줄인다
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);
  if ((midA.length + 1) * (midB.length + 1) > MAX_CELLS) return null;

  // lcs[i][j] = midA[i..], midB[j..] 의 LCS 길이
  const n = midA.length;
  const m = midB.length;
  const lcs = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i]![j] = midA[i] === midB[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }
  const out: DiffLine[] = a.slice(0, start).map((text) => ({ op: "same", text }));
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (midA[i] === midB[j]) {
      out.push({ op: "same", text: midA[i]! });
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      out.push({ op: "del", text: midA[i++]! });
    } else {
      out.push({ op: "add", text: midB[j++]! });
    }
  }
  while (i < n) out.push({ op: "del", text: midA[i++]! });
  while (j < m) out.push({ op: "add", text: midB[j++]! });
  for (const text of a.slice(endA)) out.push({ op: "same", text });
  return out;
}

/** 바뀐 줄 앞뒤 context 줄만 남기고 나머지 같은 줄은 "…" 로 접는다 */
export function foldDiff(lines: DiffLine[], context = 2): (DiffLine | { op: "skip"; count: number })[] {
  const keep = lines.map(() => false);
  lines.forEach((l, i) => {
    if (l.op === "same") return;
    for (let k = Math.max(0, i - context); k <= Math.min(lines.length - 1, i + context); k++) keep[k] = true;
  });
  const out: (DiffLine | { op: "skip"; count: number })[] = [];
  let skipped = 0;
  lines.forEach((l, i) => {
    if (keep[i]) {
      if (skipped) out.push({ op: "skip", count: skipped });
      skipped = 0;
      out.push(l);
    } else skipped++;
  });
  if (skipped) out.push({ op: "skip", count: skipped });
  return out;
}
