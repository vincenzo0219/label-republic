"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/client-api";
import { withMyPin } from "@/lib/me";

/** 연락처 보기(버튼을 눌러야 받아 온다) · 내 글이면 마감 */
export function GigActions({ id, done }: { id: string; done: boolean }) {
  const router = useRouter();
  const [contact, setContact] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [mine, setMine] = useState(false);

  useEffect(() => {
    try {
      setMine((JSON.parse(window.localStorage.getItem("lr:myGigs") ?? "[]") as string[]).includes(id));
    } catch {}
  }, [id]);

  const show = async () => {
    setMsg(null);
    const r = await fetch(`/api/gigs/${id}/contact`).catch(() => null);
    const d = r ? ((await r.json().catch(() => ({}))) as { contact?: string; error?: { message: string } }) : {};
    if (r?.ok && d.contact) setContact(d.contact);
    else setMsg(d.error?.message ?? "잠시 후 다시 눌러 주세요");
  };

  const close = async () => {
    if (!window.confirm("마감할까요? 목록에서 내려가요")) return;
    try {
      const ok = await withMyPin((pw) => api(`/api/gigs/${id}/close`, "POST", { pw }), "올릴 때 쓴 비밀번호 4자리");
      if (ok === null) return;
      router.refresh();
    } catch (e) {
      window.alert((e as Error).message);
    }
  };

  const links = contact
    ? contact.split(" · ").map((c) => {
        const tel = /^0\d{1,2}-\d{3,4}-\d{4}$/.test(c) ? `tel:${c.replace(/-/g, "")}` : /@/.test(c) && !/\s/.test(c) ? `mailto:${c}` : /^https:\/\/open\.kakao\.com\//.test(c) ? c : null;
        return { c, href: tel };
      })
    : [];

  return (
    <div className="kids-cta gig-cta">
      {!done && !contact && <button type="button" className="btn btn-primary" onClick={show}>📞 연락처 보기</button>}
      {contact && (
        <p className="gig-contact">
          {links.map(({ c, href }) => (href ? <a key={c} href={href} rel="nofollow noopener" target={href.startsWith("http") ? "_blank" : undefined}>{c}</a> : <span key={c}>{c}</span>))}
        </p>
      )}
      {done && <p className="hint">마감된 글이에요</p>}
      {msg && <p className="hint">{msg}</p>}
      {!done && (
        <button type="button" className={mine ? "btn btn-sm" : "linkish"} onClick={close}>
          {mine ? "✅ 마감" : "글쓴이 마감"}
        </button>
      )}
    </div>
  );
}
