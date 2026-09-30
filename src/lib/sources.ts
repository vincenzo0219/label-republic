/**
 * 글 출처(인용) — 서버·클라이언트 공용 순수 함수.
 *
 * 출처는 표시만 할 뿐 신뢰도 배지 계산에는 쓰지 않는다 (배지는 커뮤니티 추천으로만 — 방장 없는 원칙).
 * 종류는 주소(도메인)로만 자동 분류하므로 "주장"이 아니라 "링크가 어디를 가리키는지"를 보여준다.
 */

export const MAX_SOURCES = 8;
export const MAX_URL_LENGTH = 500;

export type SourceKind = "paper" | "gov" | "community" | "web";

export const SOURCE_KIND_LABEL: Record<SourceKind, string> = {
  paper: "🎓 논문·학술",
  gov: "🏛 공공기관",
  community: "💬 커뮤니티·블로그",
  web: "🔗 웹페이지",
};

/** host 가 domain 자체이거나 그 하위 도메인인가 */
function under(host: string, domain: string) {
  return host === domain || host.endsWith(`.${domain}`);
}

const PAPER_DOMAINS = [
  "doi.org", "pubmed.ncbi.nlm.nih.gov", "scholar.google.com", "sciencedirect.com", "springer.com", "nature.com",
  "wiley.com", "mdpi.com", "frontiersin.org", "plos.org", "jamanetwork.com", "nejm.org", "thelancet.com", "bmj.com",
  "academic.oup.com", "tandfonline.com", "arxiv.org", "biorxiv.org", "medrxiv.org", "cochranelibrary.com",
  "sagepub.com", "acs.org", "cell.com", "science.org", "pnas.org", "karger.com", "hindawi.com", "semanticscholar.org",
  "kci.go.kr", "dbpia.co.kr", "riss.kr", "koreascience.kr", "scienceon.kisti.re.kr", "koreamed.org", "jkma.org",
];
/** PMC 는 ncbi.nlm.nih.gov/pmc/… 경로 — 도메인만으로는 공공기관으로 분류되므로 경로로 먼저 확인 */
const PAPER_PATHS: [string, RegExp][] = [["ncbi.nlm.nih.gov", /^\/(pmc|pubmed)\b/i]];

const GOV_SUFFIXES = ["go.kr", "gov", "gov.uk", "gov.au", "gc.ca", "mil", "europa.eu", "who.int", "un.org", "go.jp", "gov.cn"];

const COMMUNITY_DOMAINS = [
  "blog.naver.com", "cafe.naver.com", "post.naver.com", "kin.naver.com", "tistory.com", "brunch.co.kr", "velog.io",
  "youtube.com", "youtu.be", "instagram.com", "facebook.com", "x.com", "twitter.com", "threads.net", "tiktok.com",
  "reddit.com", "dcinside.com", "clien.net", "ruliweb.com", "fmkorea.com", "theqoo.net", "ppomppu.co.kr",
  "quasarzone.com", "geekhack.org", "deskthority.net", "medium.com", "blogspot.com", "wordpress.com", "cafe.daum.net",
];

/** 단축·제휴(수수료) 링크 — 출처로 받지 않는다 (원래 주소를 넣도록 안내) */
const BLOCKED_DOMAINS = [
  "bit.ly", "t.co", "goo.gl", "tinyurl.com", "han.gl", "me2.do", "me2.kr", "url.kr", "vo.la", "t.ly", "buly.kr",
  "naver.me", "coupa.ng", "link.coupang.com", "s.click.aliexpress.com", "a.aliexpress.com", "amzn.to", "linktr.ee",
  "open.kakao.com", "t.me",
];

export function classifySource(host: string, pathname = "/"): SourceKind {
  const h = host.toLowerCase();
  if (PAPER_DOMAINS.some((d) => under(h, d))) return "paper";
  if (PAPER_PATHS.some(([d, re]) => under(h, d) && re.test(pathname))) return "paper";
  if (GOV_SUFFIXES.some((d) => under(h, d))) return "gov";
  if (COMMUNITY_DOMAINS.some((d) => under(h, d))) return "community";
  return "web";
}

/** 사설·내부 주소로 보이는 호스트 (입력 단계 1차 차단 — 실제 접속 시에는 DNS 결과로 다시 검사) */
function looksInternal(host: string) {
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return true;
  if (!host.includes(".") && !host.includes(":")) return true; // 점 없는 이름 (사내 호스트)
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  if (host.startsWith("[")) return true; // IPv6 리터럴은 받지 않는다
  return false;
}

/** 추적용 쿼리 파라미터 — 제거해서 같은 문서는 같은 주소가 되게 한다 */
const TRACKING = /^(utm_[a-z]+|fbclid|gclid|dclid|msclkid|igshid|mc_cid|mc_eid|_hsenc|_hsmi|ref_src|spm|si)$/i;

export type NormalizedSource = { url: string; host: string; kind: SourceKind };

/** 출처 주소 검증·정규화. 문제가 있으면 사용자에게 보여줄 문장을 던진다 */
export function normalizeSourceUrl(raw: string): NormalizedSource {
  const text = raw.trim();
  if (!text) throw new Error("출처 주소를 입력해주세요.");
  let u: URL;
  try {
    u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`);
  } catch {
    throw new Error(`올바른 주소가 아닙니다: ${text.slice(0, 60)}`);
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("http·https 주소만 출처로 쓸 수 있습니다.");
  if (u.username || u.password) throw new Error("아이디·비밀번호가 들어간 주소는 쓸 수 없습니다.");
  if (u.port && !["80", "443"].includes(u.port)) throw new Error("기본 포트(80·443)가 아닌 주소는 쓸 수 없습니다.");
  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  if (looksInternal(host)) throw new Error("내부망·사설 주소는 출처로 쓸 수 없습니다.");
  if (BLOCKED_DOMAINS.some((d) => under(host, d))) throw new Error(`단축·제휴·메신저 링크(${host})는 출처로 쓸 수 없어요. 원래 문서 주소를 넣어주세요.`);
  for (const key of [...u.searchParams.keys()]) if (TRACKING.test(key)) u.searchParams.delete(key);
  u.hash = "";
  u.hostname = host;
  const url = u.toString();
  if (url.length > MAX_URL_LENGTH) throw new Error(`주소가 너무 깁니다 (${MAX_URL_LENGTH}자까지).`);
  return { url, host, kind: classifySource(host, u.pathname) };
}

/** 본문에서 http(s) 주소 추출 (편집기에서 "본문 링크를 출처로 추가" 제안용) */
export function extractUrls(text: string, limit = MAX_SOURCES): string[] {
  const found = text.match(/https?:\/\/[^\s<>"'()[\]{}]+/gi) ?? [];
  const out: string[] = [];
  for (const raw of found) {
    const cleaned = raw.replace(/[.,;:!?。、)\]]+$/u, "");
    try {
      const { url } = normalizeSourceUrl(cleaned);
      if (!out.includes(url)) out.push(url);
    } catch {
      // 출처로 쓸 수 없는 링크는 제안하지 않는다
    }
    if (out.length >= limit) break;
  }
  return out;
}

export function displayHost(host: string) {
  return host.replace(/^(www|m)\./, "");
}
