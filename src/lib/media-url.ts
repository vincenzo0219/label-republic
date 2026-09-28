/** 첨부 이미지 URL — 서버·클라이언트 공용. 파일은 /media 라우트가 글 상태를 확인한 뒤 내려준다. */
export const imageUrl = (id: string) => `/media/${id}.webp`;
export const thumbUrl = (id: string) => `/media/${id}_t.webp`;
