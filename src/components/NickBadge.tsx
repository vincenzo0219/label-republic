/** 닉네임 옆 방 배지 (예: 🐉 판타지 설계자) — 1분 테스트 결과가 있는 사람만 */
export function NickBadge({ label }: { label?: string }) {
  return label ? <span className="badge nick-badge">{label}</span> : null;
}
