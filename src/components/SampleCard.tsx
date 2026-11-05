/**
 * 빈 게시판에 보이는 회색 "예시" 카드 (11/5 시작 쉬움 점검: "아직 없어요"만 보고 나가던 빈 보드).
 * 실제 글이 아니라는 것을 맨 위에 적고, 사람 이름·숫자 기록 없이 어떤 모양으로 올라오는지만 보여 준다.
 */
export function SampleCard({ title, lines }: { title: string; lines: string[] }) {
  return (
    <article className="sample-card" aria-label="예시 카드, 실제 글이 아니에요">
      <span className="sample-tag">예시 · 실제 글이 아니에요</span>
      <b>{title}</b>
      {lines.map((l) => (
        <span key={l} className="hint">
          {l}
        </span>
      ))}
      <span className="hint sample-foot">이렇게 올라와요. 첫 글을 올려 보세요.</span>
    </article>
  );
}
