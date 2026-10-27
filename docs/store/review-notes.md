# 심사 메모 (App Review Notes / Play 정책 답변)

작성일 2026-10-27. App Store Connect 의 "앱 심사 정보 > 메모" 칸(최대 4000자)에 아래 영문을 붙여 넣습니다. 심사자는 대부분 영어로 읽으므로 **영문을 먼저** 두는 것을 권장합니다.

## 0. App Store Connect "앱 심사 정보" 칸

| 칸 | 값 |
|---|---|
| 로그인 필요 | **해제 (로그인 없음)**. 데모 계정 불필요 |
| 연락처 이름 | (고객센터 표기 대표자. 실제 연락받을 사람으로 바꿔도 됨) |
| 전화 | +82 70-7798-2008 |
| 이메일 | keynes30@naver.com |
| 첨부 | 선택: 신고·차단·AI 가림 화면 녹화 (아래 "녹화 순서" 참고) |

---

## 1. App Review Notes (English, paste this)

```
Nobangjang is a hobby-community app for Korean users: interest "rooms" (running, KBO baseball, musicals, camping, board games, etc.) where people share event schedules, information and chat.

NO LOGIN REQUIRED
- There is no sign-up and no account. To post, comment or chat, a user picks a nickname and a 4-digit PIN. The PIN is only used to edit or delete their own posts. No email, phone number or real name is collected.
- Every feature can be reviewed without credentials.

WHERE TO SEE THE MAIN FEATURES
1. Home: tap any room chip (e.g. "뮤지컬·연극 덕후방").
2. Room > "🎫 행사·할인" tab: events sorted by D-day; "📅 내 폰 달력에 추가" subscribes the room's events to the iPhone Calendar.
3. Open any event post > "🙋 갈 거예요" / "🙌 혼자 가요, 조 짜 주세요": people going alone are grouped into groups of 4 to 6 by date/time slot; adults and teens (14-18) are never mixed; no 1:1 matching and no contact exchange.
4. Room > "📸 자랑" tab: "🎉 내 덕질 기념일" (fan anniversaries) with one-tap 🎉 congratulations.
5. Room > "💬 채팅" tab: real-time room chat.

USER-GENERATED CONTENT SAFETY (Guideline 1.2)
- Report: every post, comment, chat message and group-chat message has a 🚩 button with reasons (spam/ads, fraud or money requests, abuse/hate, sexual harassment, requests for personal info, no-show, inappropriate for minors, false info, other).
- Automatic hiding: a post is hidden automatically after reports from 5 different users; a comment or chat message after 3. Thresholds are public at https://nobangjang.com/rules
- Block: in the report sheet for comments/chat, "이 사람 차단" hides that user's comments and chat on this device immediately.
- AI moderation: profanity, hate speech, harassment/threats and personal information are hidden automatically right after posting, with the reason shown. Phone numbers, emails and resident registration numbers are masked before saving. Uploaded chat/comment photos are checked for inappropriate images.
- Repeat offenders: content from the same source that is hidden 3 times in 30 days by user reports cannot post for 7 days.
- Community rules: https://nobangjang.com/rules (changed only by user vote), principles https://nobangjang.com/policy, terms https://nobangjang.com/terms, public moderation log https://nobangjang.com/transparency
- Posts written by the operator or its AI curator are always labeled with 🤖.
- The operator reviews reports at /admin/moderation and responds within 24 hours. Contact: keynes30@naver.com, +82 70-7798-2008 (operator: (주)쉐릿, https://nobangjang.com/support).

ADULT-ONLY CONTENT
Two web-only rooms marked 19+ on our website (a public singles-event information room and a wine/whisky room) are not available inside the app. The app does not show them in room lists, feeds, search or direct links.

NATIVE FUNCTIONALITY (Guideline 4.2)
The app is built around our community service and adds:
- Push notifications (APNs) for new posts in "my rooms", new events, replies/mentions to the user's comments, and event-group updates. Permission is requested only after the user adds a room to "my rooms".
- Native push notifications (APNs): new posts in the rooms you saved, replies to your comments, new events. Tapping a notification opens that page in the app.
- Native iOS share sheet for posts and events.
- Offline screen with retry when the network is down, pull-to-refresh, swipe back/forward.
- External links open in an in-app Safari view (SFSafariViewController), so users stay in the app.
App-specific value beyond a website bookmark: per-room event D-day tab, calendar subscription, automatic event grouping (4-6 people), fan-anniversary celebrations, real-time room chat, and push alerts tied to the user's rooms.
```

## 2. 심사 메모 (국문, 참고·번역 확인용. 영문이 3,728자라 국문까지 붙이면 4,000자 한도를 넘으니 메모 칸에는 영문만 넣으세요)

```
노방장은 취향별 "방"(러닝, KBO, 뮤지컬, 캠핑, 보드게임 등)에서 행사 일정·정보·수다를 나누는 커뮤니티 앱입니다.

로그인 없음
- 회원가입·계정이 없습니다. 글·댓글·채팅은 닉네임과 4자리 PIN 으로 하며, PIN 은 내 글 수정·삭제에만 씁니다. 이메일·전화번호·실명을 받지 않습니다.
- 모든 기능을 로그인 없이 심사할 수 있습니다.

주요 기능 보는 법
1. 홈에서 방 칩(예: 뮤지컬·연극 덕후방)을 누릅니다.
2. 방 > 🎫 행사·할인 탭: D-day 순 행사, "📅 내 폰 달력에 추가"로 iPhone 달력 구독.
3. 행사 글 > "🙋 갈 거예요" / "🙌 혼자 가요, 조 짜 주세요": 날짜·시간대별 4~6명 조, 성인과 청소년(만 14~18)은 섞지 않음, 1:1 매칭·연락처 교환 없음.
4. 방 > 📸 자랑 탭: 🎉 내 덕질 기념일, 버튼 한 번으로 축하.
5. 방 > 💬 채팅 탭: 실시간 채팅.

이용자 콘텐츠 안전장치 (가이드라인 1.2)
- 🚩 신고: 글·댓글·채팅·조 채팅마다 사유 선택 신고 (광고·홍보, 사기·금전 요구, 욕설·비방·혐오, 성희롱·불쾌한 연락, 개인정보 요구·노출, 약속 불이행, 미성년자에게 부적절, 허위 정보, 기타).
- 자동 가림: 글은 서로 다른 5명, 댓글·채팅은 3명이 신고하면 자동으로 가려집니다 (기준은 /rules 에 공개).
- 🚫 차단: 댓글·채팅 신고 창의 "이 사람 차단"으로 이 기기에서 그 사람의 댓글·채팅을 바로 숨깁니다.
- AI 자동 가림: 욕설·혐오·인신공격·위협·개인정보가 담긴 글과 댓글을 게시 직후 가리고 이유를 표시합니다. 전화번호·이메일·주민등록번호는 저장 전에 가립니다. 댓글·채팅 사진은 부적절한 사진인지 검사합니다.
- 반복 위반: 같은 곳에서 쓴 글이 30일 안에 신고로 3번 가려지면 7일 동안 쓸 수 없습니다.
- 규칙: /rules (이용자 투표로만 변경), /policy, /terms, 공개 운영 기록 /transparency
- 운영자·AI 가 쓴 글에는 항상 🤖 표시.
- 운영자는 /admin/moderation 에서 신고를 확인하고 24시간 안에 조치합니다. 연락처: keynes30@naver.com, 070-7798-2008 ((주)쉐릿, https://nobangjang.com/support).

19+ 방 처리
웹사이트에서 만 19세 이상으로 표시한 두 방(공공 미혼남녀 만남 행사 정보 방, 와인·위스키 방)은 앱에서 제공하지 않습니다. 방 목록·피드·검색·직접 링크 모두에서 보이지 않습니다.

네이티브 기능 (가이드라인 4.2)
- 애플 푸시 알림(APNs): 내 방 새 글, 새 행사, 내 댓글의 답글·멘션, 조 편성 소식. 권한은 이용자가 "내 방"을 담은 뒤에만 묻습니다.
- 네이티브 푸시 알림(APNs): 담아 둔 방의 새 글, 내 댓글에 온 답글, 새 행사. 알림을 누르면 그 화면이 앱 안에서 열립니다.
- iOS 공유 시트로 글·행사 공유
- 네트워크가 끊기면 오프라인 화면과 다시 시도, 당겨서 새로고침, 좌우 스와이프로 뒤로/앞으로
- 외부 링크는 앱 안 Safari 화면(SFSafariViewController)으로 열려 앱을 벗어나지 않습니다.
```

## 3. 가이드라인 4.2 (최소 기능) 대비

### 확인된 사실 (사이트 코드 기준)
- iOS 앱은 `nobangjang-ios` 라는 이름의 WKWebView 앱으로, User-Agent 끝에 `nobangjang-ios/<버전>` 을 붙이고 `window.nobangjangNative` 브리지로 **APNs 권한 요청·기기 토큰 등록·해제**를 제공합니다 (`src/lib/pushClient.ts`, `src/components/IosAppPush.tsx`, `src/app/api/push/apns/route.ts`, 10/27 추가).
- 서버는 같은 알림(내 방 새 글·행사·답글)을 웹 푸시와 APNs 양쪽으로 보냅니다 (`src/lib/apns.ts`). 서버 기본 번들 ID 는 `com.nobangjang.app`, 팀 ID 기본값 `GJK5YFK5ZW` (환경 변수로 바뀔 수 있음).
- **서버에 APNs 키(APNS_KEY_ID, APNS_PRIVATE_KEY)가 운영 환경에 들어 있는지는 확인하지 못했습니다.** 없으면 앱이 권한을 묻지 않고(코드상 "서버에 앱 알림 키가 없으면 묻지 않는다"), 심사자는 푸시 기능을 보지 못합니다. 그러면 4.2 반려 위험이 커집니다.

### 앱만의 가치 (메모에 쓸 근거)
1. 내 방 기준 푸시 알림 (iOS 웹뷰에는 웹 푸시가 없어 앱에서만 가능)
2. 방별 행사 D-day 탭과 달력 구독
3. 같이 가기 자동 조 편성(4~6명, 성인·청소년 분리)과 조 채팅
4. 덕질 기념일 축하
5. 방마다 실시간 채팅
6. 신고·차단·AI 가림 같은 안전장치

### 빌드한 쪽에 물어볼 것 (답을 받아 메모의 `{{...}}` 를 채우세요)
1. 앱 안에서 쓰는 네이티브 기능 목록: 푸시 외에 공유 시트, 당겨서 새로고침, 오프라인 안내 화면, 유니버설 링크(딥링크), 사진 선택기, 햅틱, 위젯 등이 있는지
2. 외부 링크(뉴스·예매처)를 앱 안에서 여는지, Safari/SFSafariViewController 로 넘기는지 (연령 설문의 "제한 없는 웹 접근" 답이 달라짐)
3. 네트워크가 없을 때 무엇이 보이는지 (흰 화면이면 4.2·2.1 반려 위험)
4. 앱이 시작할 때 자동으로 알림 권한을 묻는지 (코드상 `nobangjangNativeAutoPrompt=false` 로 끄도록 되어 있음, 앱이 이를 따르는지)
5. 앱 바이너리에 분석·충돌 SDK, ATT 문구(`NSUserTrackingUsageDescription`)가 들어 있는지
6. 번들 ID, 버전·빌드 번호, 암호화 사용 신고값(`ITSAppUsesNonExemptEncryption`, HTTPS 만 쓰면 보통 NO)
7. Android: TWA 인지(Bubblewrap/PWABuilder), 패키지명, 서명 키 SHA-256, 알림 위임(Notification delegation) 사용 여부

## 4. 그 밖의 애플 반려 위험과 대비

| 위험 | 내용 | 대비 |
|---|---|---|
| 1.2 차단 범위 | 차단이 댓글·채팅·조 채팅에만 적용되고 **게시글 목록에는 적용되지 않음** | 차단한 닉네임의 글도 피드에서 숨기도록 확장 권장 (개발 작업) |
| 1.2 연락처 공개 | 앱 안에서 운영자 연락처를 찾을 수 있어야 함 | 하단 "고객센터"(/support)에 회사·전화·이메일 공개됨. OK |
| 5.1.1(v) 계정 삭제 | 회원가입은 없지만 "닉네임 정하기"가 닉네임+PIN 을 한 사람에게 묶음 (`nickname_claims`). 심사자가 계정으로 볼 수 있음 | 메모에 "계정 없음, 글은 PIN 으로 삭제, 그 밖의 삭제는 이메일 요청"을 명시(위에 반영). 가능하면 마이페이지에 "닉네임 반납·내 기록 삭제 요청" 버튼 추가 권장 |
| 5.1.2 추적 | 메타 픽셀이 앱 안에서도 돎 | privacy.md 0-(1): 앱에서 끄기 권장, 아니면 ATT 구현 |
| 5.1.1 처리방침 | 방침에 "법률 검토 전 초안" 배너, 미혼남녀 알림 정보·APNs 토큰 누락 | 시행일 설정, 항목 추가 |
| 2.1 완성도 | 운영자 AI 글 일부가 "⚠ 광고 의심"으로 표시됨 (예: 러닝 방 행사 글) | 심사 전에 운영자 글 오탐을 정리하면 첫인상이 좋아짐 |
| 1.4.1 / 1.1 | 다이어트 방(극단적 다이어트 조장은 AI 가 가림), 투자 방(투자 권유 가림) | 별도 조치 불필요. 질문 받으면 AI 가림 이유 `diet`, `invest` 가 있다고 답변 |

## 5. Google Play: 사용자 제작 콘텐츠(UGC) 정책 답변

Play Console 의 앱 콘텐츠 설문과 정책 문의 답변에 쓰는 문구입니다.

```
노방장은 이용자 제작 콘텐츠(글·댓글·사진·채팅)를 제공하며, Google Play UGC 정책에 맞춰 다음을 운영합니다.
1. 이용약관(https://nobangjang.com/terms)과 커뮤니티 운영 원칙(https://nobangjang.com/policy)에서 금지 콘텐츠(광고·도배, 허위·과장, 명예훼손·개인정보 침해·저작권 침해, 투표·신고 조작)를 정의하고 이용자가 글을 쓰기 전에 볼 수 있게 합니다.
2. 모든 글·댓글·채팅·조 채팅에 🚩 신고(사유 선택)가 있고, 서로 다른 이용자의 신고가 기준(글 5명, 댓글·채팅 3명)에 닿으면 자동으로 가립니다.
3. 🚫 차단: 신고 창에서 그 이용자의 댓글·채팅을 이 기기에서 숨길 수 있습니다.
4. AI 사전 검토: 욕설·혐오·괴롭힘·위협·개인정보가 담긴 글과 댓글은 게시 직후 자동으로 가리고, 전화번호·이메일·주민등록번호는 저장 전에 가립니다. 첨부 사진은 부적절한 사진인지 검사합니다.
5. 반복 위반자는 30일 안에 3번 가려지면 7일 동안 글을 쓸 수 없습니다.
6. 운영자는 신고를 확인하고 조치하며, 법령에 따른 임시조치를 포함한 모든 운영 조치를 https://nobangjang.com/transparency 에 공개합니다.
7. 운영자·AI 가 쓴 글에는 🤖 표시를 붙입니다.
문의: keynes30@naver.com
```

## 6. Google Play: 대상 연령 및 콘텐츠 / 기타 앱 콘텐츠 답

| 항목 | 답 |
|---|---|
| 대상 연령 | 옵션 B: 13~15, 16~17, 18세 이상 / 옵션 A: 18세 이상 (ratings.md 3장) |
| 아동의 관심을 끌 수 있는가 | 아니요 |
| 앱 액세스 | "모든 기능을 특별한 액세스 권한 없이 사용 가능" (로그인 없음) |
| 광고 포함 | 아니요 (앱 안 광고 없음). 운영사의 다른 서비스(비즈파일럿) 계정 글이 🏪 오늘도 장사중 방에 올라오는데, 광고 표시 영역이 아니라 게시글이므로 "아니요"로 답하되, 질문을 받으면 같은 운영사 콘텐츠라고 설명 |
| 뉴스 앱인가 | 아니요 (커뮤니티. 운영자 정보 글에 출처 링크가 있지만 언론 서비스 아님) |
| 금융 기능 | 해당 없음 (투자 방은 이야기만, 거래·추천 기능 없음) |
| 건강 앱 | 아니요 (건강 기능 앱 아님) |
| 정부 앱 | 아니요 |
| 데이터 보안 | privacy.md 2장 |
| 개인정보처리방침 | https://nobangjang.com/privacy |
| 연락처 공개 | 이메일 keynes30@naver.com, 전화(선택) 070-7798-2008, 웹사이트 https://nobangjang.com |

### 웹 콘텐츠 앱(TWA) 관련
- Play 는 "웹사이트를 그대로 감싼 앱"을 스팸·최소 기능으로 볼 수 있습니다. 위 4.2 근거(내 방 알림, 행사 D-day, 같이 가기, 달력 구독, 채팅)를 스토어 설명과 스크린샷으로 보여 주는 것이 중요합니다.
- **TWA 주소창 문제**: `https://nobangjang.com/.well-known/assetlinks.json` 이 2026-10-27 기준 **404** 입니다 (코드는 저장소에 있으나 운영에 반영 전이거나 지문이 비어 있음). 이대로면 앱 상단에 크롬 주소창이 보입니다. Play Console 에 앱을 만든 뒤 "앱 무결성 > 앱 서명"의 SHA-256 지문을 서버 환경 변수 `ANDROID_CERT_SHA256` 에 넣고 배포해야 합니다 (checklist.md 참고).

## 7. 녹화 순서 (선택, 심사 첨부용 30~60초)
1. 앱 실행 → 홈 → 뮤지컬·연극 방 → 🎫 행사·할인 탭 (D-day)
2. 📅 내 폰 달력에 추가 펼치기
3. 행사 글 → 🙋 갈 거예요 → 🙌 혼자 가요, 조 짜 주세요 (폼만 보여 주고 신청하지 않음)
4. 방 💬 채팅 → 메시지의 🚩 → 사유 목록 → "이 사람 차단" 체크 표시 (실제 신고는 테스트용 글에서만)
5. 하단 고객센터·커뮤니티 규칙 화면
