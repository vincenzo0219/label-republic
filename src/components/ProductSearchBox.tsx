"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ProductTag } from "@/lib/types";

type Item = ProductTag & { post_count: number; fact_count: number };

/**
 * 제품 자동완성 (combobox). 보이는 글이 있는 제품만 나온다.
 * 화살표로 고르고 Enter 로 선택, Esc 로 닫는다.
 */
export function ProductSearchBox({
  category,
  onPick,
  label,
  placeholder = "제품 검색 (브랜드·제품명)",
  exclude = [],
  onQueryChange,
}: {
  category?: string;
  onPick: (p: Item) => void;
  label: string;
  placeholder?: string;
  exclude?: string[];
  onQueryChange?: (q: string) => void;
}) {
  const id = useId();
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const seq = useRef(0);

  useEffect(() => {
    const term = q.trim();
    if (!term) {
      setItems([]);
      return;
    }
    const mine = ++seq.current;
    const t = setTimeout(async () => {
      try {
        const qs = new URLSearchParams({ q: term, ...(category ? { category } : {}) });
        const res = await fetch(`/api/products?${qs}`);
        if (!res.ok || mine !== seq.current) return;
        const data = (await res.json()) as { items: Item[] };
        setItems(data.items.filter((i) => !exclude.includes(i.id)));
        setActive(-1);
      } catch {
        // 자동완성 실패는 조용히 무시 (직접 입력은 계속 가능)
      }
    }, 200);
    return () => clearTimeout(t);
    // exclude 는 렌더마다 새 배열이라 내용으로 비교
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, category, exclude.join(",")]);

  const pick = (p: Item) => {
    onPick(p);
    setQ("");
    onQueryChange?.("");
    setItems([]);
    setOpen(false);
  };

  const showList = open && items.length > 0;
  return (
    <div className="product-search">
      <input
        className="input input-sm"
        role="combobox"
        aria-label={label}
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={`${id}-list`}
        aria-activedescendant={showList && active >= 0 ? `${id}-${active}` : undefined}
        placeholder={placeholder}
        maxLength={60}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          onQueryChange?.(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (!showList) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => (a + 1) % items.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => (a <= 0 ? items.length - 1 : a - 1));
          } else if (e.key === "Enter" && active >= 0) {
            e.preventDefault();
            pick(items[active]!);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      <ul id={`${id}-list`} role="listbox" aria-label={`${label} 결과`} className="product-options" hidden={!showList}>
        {items.map((p, i) => (
          <li
            key={p.id}
            id={`${id}-${i}`}
            role="option"
            aria-selected={i === active}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => pick(p)}
          >
            <b>
              {p.brand} {p.name}
            </b>
            <span className="hint">
              글 {p.post_count}
              {p.fact_count > 0 ? ` · 수치 ${p.fact_count}` : ""}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
