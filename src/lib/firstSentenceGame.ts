/**
 * 📖 첫 문장 맞히기 (11/4 대표님 "책방도 책 게임으로 전국 랭킹" → "4번").
 * 하루 한 판, 전국이 같은 10문제: 첫 문장(시는 첫 줄) 하나를 보고 네 권 중 어떤 책인지 고른다.
 * 점수 = 맞힌 개수, 같으면 걸린 시간이 짧은 쪽이 위. 랭킹에는 그날 첫 판만 들어간다.
 *
 * ★ 저작권: 국내 기준 저작권이 끝난 작품만 (저작자가 1963년 1월 1일 전에 세상을 떠난 작품. 그 전 법의 50년 보호가 2013년 전에 끝났다).
 *   - 한국 작품: 원문 그대로 (표기는 현대 표기로 실린 판본).
 *   - 외국 작품: 원문 첫 문장을 노방장이 직접 옮겼다 (출판된 번역본 문장을 쓰지 않는다). 화면에 "직접 옮긴 문장"이라고 적는다.
 *   - 한 문장(또는 그 앞부분)까지만. 너무 긴 문장은 앞부분만 쓰고 "……"로 줄였다.
 * ★ 확인: 문장마다 원문이 실린 곳(위키문헌·Project Gutenberg 등)이나 그 문장을 첫 문장으로 소개한 자료를 11/4 웹 검색으로 대조했다. 확인 안 된 작품은 넣지 않았다.
 * ★ 반복: 6일을 한 바퀴로 날짜마다 섞은 순서에서 10문제씩 꺼낸다. 한 바퀴 안에서는 같은 문제가 다시 나오지 않는다 (62문제 · 하루 10문제).
 * 서버·브라우저·테스트 공용 순수 함수.
 */

export type SentenceGroup = "ko-prose" | "ko-poem" | "world";

export type FirstSentence = {
  id: string;
  /** 첫 문장 (시는 첫 줄) */
  text: string;
  title: string;
  author: string;
  group: SentenceGroup;
  /** 저작자가 세상을 떠난 해 (1963년 전이어야 한다) */
  died: number;
  /** 원문에서 노방장이 직접 옮긴 문장 */
  translated?: boolean;
};

/** 저작권이 끝났다고 보는 기준: 이 해 전에 세상을 떠난 저작자 */
export const PD_BEFORE = 1963;

export const FIRST_SENTENCES: readonly FirstSentence[] = [
  // ── 한국 소설 (원문) ──
  // https://ko.wikisource.org/wiki/운수_좋은_날
  { id: "unsu", text: "새침하게 흐린 품이 눈이 올 듯하더니 눈은 아니 오고 얼다가 만 비가 추적추적 내리었다.", title: "운수 좋은 날", author: "현진건", group: "ko-prose", died: 1943 },
  // 교보문고 「날개」 소개·서울신문 2011-10-24 (첫 문장으로 인용)
  { id: "nalgae", text: "'박제가 되어 버린 천재'를 아시오?", title: "날개", author: "이상", group: "ko-prose", died: 1937 },
  // 교보eBook 「감자」 소개 (첫 문장 인용)
  { id: "gamja", text: "싸움, 간통, 살인, 도적, 구걸, 징역 이 세상의 모든 비극과 활극의 근원지인, 칠성문 밖 빈민굴로 오기 전까지는, 복녀의 부처는 (사농공상의 제2위에 드는) 농민이었었다.", title: "감자", author: "김동인", group: "ko-prose", died: 1951 },
  // 「무정」 1장 전문 (다음카페 전재본)·한국경제 2008-09-24
  { id: "mujeong", text: "경성학교 영어 교사 이형식은 오후 두 시 사년급 영어 시간을 마치고 내리쪼이는 유월 볕에 땀을 흘리면서 안동 김장로의 집으로 간다.", title: "무정", author: "이광수", group: "ko-prose", died: 1950 },
  // https://ko.wikisource.org/wiki/B사감과_러브레터
  { id: "bsagam", text: "C여학교에서 교원 겸 기숙사 사감 노릇을 하는 B여사라면……", title: "B사감과 러브레터", author: "현진건", group: "ko-prose", died: 1943 },
  // 경북매일 2020-01-13·교보eBook 「고향」
  { id: "gohyang", text: "대구에서 서울로 올라오는 차 속에서 생긴 일이다.", title: "고향", author: "현진건", group: "ko-prose", died: 1943 },
  // https://ko.wikisource.org/wiki/배따라기
  { id: "baettaragi", text: "좋은 일기이다.", title: "배따라기", author: "김동인", group: "ko-prose", died: 1951 },
  // https://ko.wikisource.org/wiki/탈출기
  { id: "talchulgi", text: "김군! 수삼 차 편지는 반갑게 받았다.", title: "탈출기", author: "최서해", group: "ko-prose", died: 1932 },

  // ── 한국 시 (첫 줄, 원문) ──
  // thewiki 「서시」·교보eBook 『하늘과 바람과 별과 시』
  { id: "seosi", text: "죽는 날까지 하늘을 우러러 한 점 부끄럼이 없기를,", title: "서시", author: "윤동주", group: "ko-poem", died: 1945 },
  // 경향신문 2013-10-01 (첫 구절로 인용)
  { id: "byeol", text: "계절이 지나가는 하늘에는 가을로 가득 차 있습니다.", title: "별 헤는 밤", author: "윤동주", group: "ko-poem", died: 1945 },
  // 국립국어원 『새국어생활』 1998 「명시의 한 구절」
  { id: "jindallae", text: "나 보기가 역겨워 가실 때에는", title: "진달래꽃", author: "김소월", group: "ko-poem", died: 1934 },
  // 서울신문 1996-08-02·경인일보
  { id: "nim", text: "님은 갔습니다. 아아, 사랑하는 나의 님은 갔습니다.", title: "님의 침묵", author: "한용운", group: "ko-poem", died: 1944 },
  // 서울신문 2006-07-06 「청포도 송이마다 사연도 알알이」
  { id: "cheongpodo", text: "내 고장 칠월은 청포도가 익어 가는 시절", title: "청포도", author: "이육사", group: "ko-poem", died: 1944 },
  // 프레시안·경북매일 2017-04-03
  { id: "deul", text: "지금은 남의 땅, 빼앗긴 들에도 봄은 오는가?", title: "빼앗긴 들에도 봄은 오는가", author: "이상화", group: "ko-poem", died: 1943 },
  // 경북매일 2009-05-26·국립국어원
  { id: "moran", text: "모란이 피기까지는 나는 아직 나의 봄을 기다리고 있을 테요", title: "모란이 피기까지는", author: "김영랑", group: "ko-poem", died: 1950 },
  // 국립국어원 『새국어생활』 2007·서울신문 2023-06-23
  { id: "hyangsu", text: "넓은 벌 동쪽 끝으로 옛이야기 지줄대는 실개천이 회돌아 나가고", title: "향수", author: "정지용", group: "ko-poem", died: 1950 },

  // ── 세계 문학 (원문에서 직접 옮김) ──
  // Pride and Prejudice ch.1 · nls.uk/exhibitions/pride-and-prejudice/first-page
  { id: "pride", text: "재산깨나 있는 독신 남자라면 아내가 필요하다는 것은 누구나 인정하는 진리다.", title: "오만과 편견", author: "제인 오스틴", group: "world", died: 1817, translated: true },
  // Anna Karenina · dictionary.com·bookriot
  { id: "anna", text: "행복한 가정은 모두 비슷하고, 불행한 가정은 저마다의 이유로 불행하다.", title: "안나 카레니나", author: "레프 톨스토이", group: "world", died: 1910, translated: true },
  // Moby-Dick ch.1 · csmonitor 2012-10-18
  { id: "moby", text: "나를 이슈메일이라 불러 다오.", title: "모비 딕", author: "허먼 멜빌", group: "world", died: 1891, translated: true },
  // Die Verwandlung · de.wikisource.org/wiki/Die_Verwandlung_(Franz_Kafka)
  { id: "verwandlung", text: "어느 날 아침 그레고르 잠자가 뒤숭숭한 꿈에서 깨어났을 때, 그는 침대 속에서 한 마리 흉측한 벌레로 변해 있었다.", title: "변신", author: "프란츠 카프카", group: "world", died: 1924, translated: true },
  // L'Étranger · kartable.fr incipit
  { id: "etranger", text: "오늘 엄마가 죽었다.", title: "이방인", author: "알베르 카뮈", group: "world", died: 1960, translated: true },
  // Nineteen Eighty-Four · interestingliterature.com 2021-08
  { id: "1984", text: "4월의 맑고 쌀쌀한 날이었고, 시계들이 열세 시를 치고 있었다.", title: "1984", author: "조지 오웰", group: "world", died: 1950, translated: true },
  // A Tale of Two Cities · bookriot (긴 문장의 앞부분)
  { id: "twocities", text: "최고의 시절이었고, 최악의 시절이었다……", title: "두 도시 이야기", author: "찰스 디킨스", group: "world", died: 1870, translated: true },
  // Jane Eyre ch.1 · archive.org 초판 스캔
  { id: "janeeyre", text: "그날은 산책을 나갈 수가 없었다.", title: "제인 에어", author: "샬럿 브론테", group: "world", died: 1855, translated: true },
  // Mrs Dalloway · gutenberg.org/ebooks/71865
  { id: "dalloway", text: "댈러웨이 부인은 꽃은 자기가 직접 사 오겠다고 했다.", title: "댈러웨이 부인", author: "버지니아 울프", group: "world", died: 1941, translated: true },
  // Gone with the Wind ch.1 · lovereading.co.uk extract
  { id: "gwtw", text: "스칼렛 오하라는 미인은 아니었지만, 탈턴가 쌍둥이처럼 그녀의 매력에 사로잡힌 남자들은 그 사실을 좀처럼 알아채지 못했다.", title: "바람과 함께 사라지다", author: "마거릿 미첼", group: "world", died: 1949, translated: true },
  // Peter and Wendy · goodreads poll 292087
  { id: "peterpan", text: "한 명을 빼고, 아이들은 모두 자란다.", title: "피터 팬", author: "제임스 매슈 배리", group: "world", died: 1937, translated: true },
  // The Old Man and the Sea · shmoop
  { id: "oldman", text: "그는 멕시코 만류에서 작은 배를 타고 혼자 고기를 잡는 노인이었는데, 한 마리도 낚지 못한 채 벌써 여든네 날이 지났다.", title: "노인과 바다", author: "어니스트 헤밍웨이", group: "world", died: 1961, translated: true },
  // Le Petit Prince ch.1 · archive.org 1943 판
  { id: "petitprince", text: "여섯 살 때 나는 원시림에 관한 『체험한 이야기』라는 책에서 멋진 그림 하나를 본 적이 있다.", title: "어린 왕자", author: "앙투안 드 생텍쥐페리", group: "world", died: 1944, translated: true },
  // A Christmas Carol Stave 1 · opentextbc.ca
  { id: "carol", text: "우선, 말리는 죽었다.", title: "크리스마스 캐럴", author: "찰스 디킨스", group: "world", died: 1870, translated: true },
  // Der Process · juedische-allgemeine.de (첫 문장 인용)
  { id: "process", text: "아무 잘못도 하지 않았는데 어느 날 아침 체포된 것을 보면, 누군가 요제프 K를 모함한 것이 틀림없었다.", title: "소송", author: "프란츠 카프카", group: "world", died: 1924, translated: true },
  // The Great Gatsby · en.wikiquote.org/wiki/The_Great_Gatsby
  { id: "gatsby", text: "내가 더 어리고 쉽게 상처받던 시절, 아버지는 내게 충고를 하나 해 주셨는데 나는 그 뒤로 그 말을 줄곧 곱씹어 왔다.", title: "위대한 개츠비", author: "F. 스콧 피츠제럴드", group: "world", died: 1940, translated: true },
  // Les Misérables · gutenberg.org/ebooks/17489
  { id: "miserables", text: "1815년, 샤를프랑수아비앵브뉘 미리엘 씨는 디뉴의 주교였다.", title: "레 미제라블", author: "빅토르 위고", group: "world", died: 1885, translated: true },
  // 吾輩は猫である · flierinc 요약·kadokawa
  { id: "neko", text: "나는 고양이다. 이름은 아직 없다.", title: "나는 고양이로소이다", author: "나쓰메 소세키", group: "world", died: 1916, translated: true },
  // こころ 上 · web.mit.edu 일본문학 텍스트
  { id: "kokoro", text: "나는 그 사람을 늘 선생님이라고 불렀다.", title: "마음", author: "나쓰메 소세키", group: "world", died: 1916, translated: true },
  // 人間失格 はしがき · books.bunshun.jp
  { id: "ningen", text: "나는 그 남자의 사진을 석 장 본 적이 있다.", title: "인간 실격", author: "다자이 오사무", group: "world", died: 1948, translated: true },
  // 羅生門 · 아오조라 문고판(archive.org aozorabunko_00127)
  { id: "rashomon", text: "어느 날 해 질 녘의 일이다.", title: "라쇼몬", author: "아쿠타가와 류노스케", group: "world", died: 1927, translated: true },
  // 狂人日记 · zh.wikisource.org/zh-hant/狂人日記
  { id: "kuangren", text: "오늘 밤은 달빛이 무척 좋다.", title: "광인일기", author: "루쉰", group: "world", died: 1936, translated: true },
  // 阿Q正传 第一章 序 · marxists.org 鲁迅全集
  { id: "ahq", text: "내가 아Q의 정전을 쓰려고 한 지는 벌써 한두 해가 아니다.", title: "아Q정전", author: "루쉰", group: "world", died: 1936, translated: true },
  // Wuthering Heights ch.1 · gutenberg.org/files/768
  { id: "wuthering", text: "1801년. 집주인을 찾아갔다가 방금 돌아왔다.", title: "폭풍의 언덕", author: "에밀리 브론테", group: "world", died: 1848, translated: true },
  // Don Quijote I-1 · es.wikisource.org (긴 문장의 앞부분)
  { id: "quijote", text: "이름을 떠올리고 싶지 않은 라만차의 어느 마을에, 얼마 전까지 한 시골 귀족이 살고 있었다……", title: "돈키호테", author: "미겔 데 세르반테스", group: "world", died: 1616, translated: true },
  // Die Leiden des jungen Werthers · projekt-gutenberg.org/goethe/werther
  { id: "werther", text: "떠나와서 얼마나 기쁜지 모른다!", title: "젊은 베르테르의 슬픔", author: "요한 볼프강 폰 괴테", group: "world", died: 1832, translated: true },
  // Преступление и наказание I-1 · gutenberg.org/files/2554
  { id: "crime", text: "7월 초, 몹시 무더운 어느 저녁, 한 젊은이가 S골목에 세 들어 살던 다락방에서 나와 망설이듯 천천히 K다리 쪽으로 걸어갔다.", title: "죄와 벌", author: "표도르 도스토옙스키", group: "world", died: 1881, translated: true },
  // Animal Farm ch.1 · sandradanby.com
  { id: "animalfarm", text: "매너 농장의 존스 씨는 밤이 되어 닭장 문을 잠갔지만, 너무 취해서 쪽문 닫는 것을 잊어버렸다.", title: "동물 농장", author: "조지 오웰", group: "world", died: 1950, translated: true },
  // Great Expectations ch.1 · etc.usf.edu/lit2go
  { id: "greatexp", text: "아버지의 성은 피립, 내 세례명은 필립이었는데, 어린 내 혀로는 두 이름을 합쳐도 핍보다 길거나 또렷하게 말할 수가 없었다.", title: "위대한 유산", author: "찰스 디킨스", group: "world", died: 1870, translated: true },
  // Adventures of Huckleberry Finn ch.1 · editoreric.com
  { id: "huck", text: "『톰 소여의 모험』이라는 책을 안 읽었으면 나를 모르겠지만, 그건 상관없다.", title: "허클베리 핀의 모험", author: "마크 트웨인", group: "world", died: 1910, translated: true },
  // The Wonderful Wizard of Oz ch.1 · gutenberg.org/ebooks/55
  { id: "oz", text: "도로시는 캔자스의 넓은 대초원 한가운데에서 농부인 헨리 아저씨, 그리고 농부의 아내인 엠 아주머니와 함께 살았다.", title: "오즈의 마법사", author: "L. 프랭크 바움", group: "world", died: 1919, translated: true },
  // Alice's Adventures in Wonderland ch.1 · gutenberg.org/ebooks/11 (긴 문장의 앞부분)
  { id: "alice", text: "앨리스는 언니 옆 강둑에 앉아 아무것도 하지 않고 있는 게 몹시 지루해지기 시작했다……", title: "이상한 나라의 앨리스", author: "루이스 캐럴", group: "world", died: 1898, translated: true },
  // Ulysses ep.1 · gutenberg.org
  { id: "ulysses", text: "당당하고 통통한 벅 멀리건이 거울과 면도칼이 엇갈려 놓인 비누 거품 그릇을 들고 계단 꼭대기에서 나타났다.", title: "율리시스", author: "제임스 조이스", group: "world", died: 1941, translated: true },
  // A Study in Scarlet ch.1 · gutenberg.org/files/244
  { id: "scarlet", text: "1878년 나는 런던 대학교에서 의학 박사 학위를 받고, 군의관 과정을 밟으러 네틀리로 갔다.", title: "주홍색 연구", author: "아서 코넌 도일", group: "world", died: 1930, translated: true },
  // Frankenstein Letter 1 · gutenberg.org/ebooks/41445
  { id: "frankenstein", text: "누나가 그토록 불길하게 여기던 일이 아무 사고 없이 시작되었다는 소식을 들으면 기뻐하겠지요.", title: "프랑켄슈타인", author: "메리 셸리", group: "world", died: 1851, translated: true },
  // The Picture of Dorian Gray ch.1 · gutenberg.org/ebooks/174 (긴 문장의 앞부분)
  { id: "dorian", text: "화실은 장미의 짙은 향기로 가득했다……", title: "도리언 그레이의 초상", author: "오스카 와일드", group: "world", died: 1900, translated: true },
  // Demian 책 첫머리 글 · gutenberg.org/ebooks/41907
  { id: "demian", text: "나는 오직 내 안에서 저절로 솟아 나오려는 것을 살아 보려 했을 뿐이다.", title: "데미안", author: "헤르만 헤세", group: "world", died: 1962, translated: true },
  // Le Comte de Monte-Cristo ch.1 · fr.wikisource.org/wiki/Le_Comte_de_Monte-Cristo/Chapitre_1
  { id: "montecristo", text: "1815년 2월 24일, 노트르담드라가르드의 망루가 스미르나, 트리에스테, 나폴리에서 오는 세대박이 범선 파라옹호를 알렸다.", title: "몬테크리스토 백작", author: "알렉상드르 뒤마", group: "world", died: 1870, translated: true },
  // Madame Bovary I-1 · gutenberg.org/ebooks/48359
  { id: "bovary", text: "우리가 자습실에 있을 때, 교장 선생님이 평상복 차림의 신입생 하나와 커다란 책상을 든 사환을 데리고 들어왔다.", title: "보바리 부인", author: "귀스타브 플로베르", group: "world", died: 1880, translated: true },
  // David Copperfield ch.1 · dickenssociety.org
  { id: "copperfield", text: "내가 내 삶의 주인공이 될지, 아니면 그 자리를 다른 누군가가 차지할지는 이 글이 보여 줄 것이다.", title: "데이비드 코퍼필드", author: "찰스 디킨스", group: "world", died: 1870, translated: true },
  // Strange Case of Dr Jekyll and Mr Hyde · gutenberg.org/ebooks/43 (긴 문장의 앞부분)
  { id: "jekyll", text: "변호사 어터슨 씨는 좀처럼 웃는 법이 없는 험상궂은 얼굴의 사내였다……", title: "지킬 박사와 하이드 씨", author: "로버트 루이스 스티븐슨", group: "world", died: 1894, translated: true },
  // Siddhartha 1부 · gutenberg.org/ebooks/2499 (긴 문장의 앞부분)
  { id: "siddhartha", text: "집 그늘에서, 배들이 있는 강가의 햇살 아래에서, 사라수 숲과 무화과나무 그늘에서 싯다르타는 자랐다……", title: "싯다르타", author: "헤르만 헤세", group: "world", died: 1962, translated: true },
  // A Scandal in Bohemia · en.wikipedia.org/wiki/A_Scandal_in_Bohemia
  { id: "holmes", text: "셜록 홈스에게 그녀는 언제나 '그 여자'다.", title: "셜록 홈스의 모험", author: "아서 코넌 도일", group: "world", died: 1930, translated: true },
  // The Hound of the Baskervilles ch.1 · gutenberg.org/ebooks/2852 (긴 문장의 앞부분)
  { id: "hound", text: "셜록 홈스 씨는 대개 아침에 아주 늦게 일어났다……", title: "바스커빌 가의 개", author: "아서 코넌 도일", group: "world", died: 1930, translated: true },
  // Treasure Island ch.1 · gutenberg.org/files/120 (긴 문장의 앞부분)
  { id: "treasure", text: "트렐로니 지주와 리브시 의사 선생, 그리고 다른 신사들이 보물섬에 관해 처음부터 끝까지 빠짐없이 적어 달라고 했다……", title: "보물섬", author: "로버트 루이스 스티븐슨", group: "world", died: 1894, translated: true },
  // Little Women ch.1 · gutenberg.org/files/514
  { id: "littlewomen", text: "\"선물이 없으면 크리스마스가 크리스마스 같지 않잖아.\" 조가 깔개 위에 누운 채 투덜거렸다.", title: "작은 아씨들", author: "루이자 메이 올컷", group: "world", died: 1888, translated: true },
];

export const QUESTIONS_PER_DAY = 10;
/** 1회 (KST) */
export const GAME_START = "2026-11-05";

const byId = new Map(FIRST_SENTENCES.map((s) => [s.id, s]));
export const sentenceById = (id: string): FirstSentence | undefined => byId.get(id);

/** 날짜 → 1회부터 며칠째 (0부터, 시작 전이면 0) */
export function dayNumber(day: string): number {
  return Math.max(0, Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${GAME_START}T00:00:00Z`)) / 86_400_000));
}

/** 시드가 같으면 늘 같은 순서 (mulberry32) */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffled<T>(xs: readonly T[], seed: number): T[] {
  const r = rng(seed);
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** 한 바퀴 날 수: 한 바퀴 안에서는 같은 문제가 다시 나오지 않는다 */
export const CYCLE_DAYS = Math.floor(FIRST_SENTENCES.length / QUESTIONS_PER_DAY);

export type DailyQuestion = { id: string; text: string; translated: boolean; options: string[] };

/** 그날 10문제 (전국 같음). 보기는 같은 갈래(한국 소설·한국 시·세계 문학) 책 제목 4개 */
export function dailyQuestions(day: string): DailyQuestion[] {
  const n = dayNumber(day);
  const cycle = Math.floor(n / CYCLE_DAYS);
  const k = n % CYCLE_DAYS;
  const order = shuffled(FIRST_SENTENCES, 7919 * (cycle + 1));
  return order.slice(k * QUESTIONS_PER_DAY, (k + 1) * QUESTIONS_PER_DAY).map((s, i) => {
    const pool = [...new Set(FIRST_SENTENCES.filter((o) => o.group === s.group && o.title !== s.title).map((o) => o.title))];
    const wrong = shuffled(pool, 104729 * (n + 1) + i).slice(0, 3);
    return { id: s.id, text: s.text, translated: !!s.translated, options: shuffled([s.title, ...wrong], 15485863 * (n + 1) + i) };
  });
}

/** 걸린 시간 상한 (999.9초) */
export const MAX_MS = 999_900;
/** 너무 빠른 기록은 받지 않는다 (10문제를 3초 안에 읽고 고를 수는 없다) */
export const MIN_MS = 3_000;

/** 랭킹 점수 한 숫자: 맞힌 개수가 먼저, 같으면 빠를수록 높다 */
export const encodeScore = (correct: number, ms: number): number => correct * 10_000 + (9_999 - Math.min(9_999, Math.floor(Math.max(0, ms) / 100)));
export const decodeScore = (score: number): { correct: number; tenths: number } => ({ correct: Math.floor(score / 10_000), tenths: 9_999 - (score % 10_000) });
export const SCORE_MAX = encodeScore(QUESTIONS_PER_DAY, 0);

/** "8/10 · 42.3초" */
export function formatSentenceScore(score: number): string {
  const { correct, tenths } = decodeScore(score);
  return `${correct}/${QUESTIONS_PER_DAY} · ${(tenths / 10).toFixed(1)}초`;
}

/** 답 채점: 그날 문제 순서대로 고른 제목 → 맞힌 개수와 문제별 정답 */
export function gradeAnswers(day: string, picks: readonly (string | null)[]): { correct: number; answers: { id: string; title: string; author: string; ok: boolean }[] } {
  const qs = dailyQuestions(day);
  const answers = qs.map((q, i) => {
    const s = byId.get(q.id)!;
    return { id: q.id, title: s.title, author: s.author, ok: picks[i] === s.title };
  });
  return { correct: answers.filter((a) => a.ok).length, answers };
}
