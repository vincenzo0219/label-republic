-- 10/26 📅 내 폰 달력에 추가: 방 행사 구독 주소(/cal/rooms.ics)를 하루에 몇 번 가져갔는지만 센다.
-- 누가·어느 방인지·IP 는 남기지 않는다. 달력 앱은 몇 시간마다 다시 가져가므로 사람 수가 아니라 가져간 횟수다.
CREATE TABLE IF NOT EXISTS calendar_fetches (
  day     date    PRIMARY KEY,
  fetches integer NOT NULL DEFAULT 0
);
