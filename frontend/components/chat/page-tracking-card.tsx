"use client";

import { useMemo, useState } from "react";

export type ChatPageViewItem = {
  id: string;
  pageUrl: string;
  pagePath: string;
  pageTitle?: string | null;
  pageName?: string | null;
  routeType?: string | null;
  entityId?: string | null;
  entityName?: string | null;
  referrer?: string | null;
  sourceType: string;
  visitedAt: string;
};

type PageTrackingCardProps = {
  current: ChatPageViewItem | null;
  items: ChatPageViewItem[];
  isLoading?: boolean;
  error?: string;
  className?: string;
};

const formatVisitedTime = (value: string) => {
  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    return "";
  }

  return parsedDate.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
};

const getItemTitle = (item: ChatPageViewItem) =>
  item.pageName?.trim() || item.entityName?.trim() || item.pageTitle?.trim() || "Страница";

const getItemPathLabel = (item: ChatPageViewItem) => item.pagePath?.trim() || item.pageUrl?.trim();

export function PageTrackingCard({
  current,
  items,
  isLoading = false,
  error = "",
  className = "",
}: PageTrackingCardProps) {
  const [isOpen, setIsOpen] = useState(false);

  const historyItems = useMemo(() => {
    const uniqueItems: ChatPageViewItem[] = [];
    const seenIds = new Set<string>();

    items.forEach((item) => {
      if (seenIds.has(item.id)) {
        return;
      }

      seenIds.add(item.id);
      uniqueItems.push(item);
    });

    return uniqueItems.slice(0, 10);
  }, [items]);

  const effectiveCurrent = current ?? historyItems[0] ?? null;

  if (!isLoading && !error && !effectiveCurrent && historyItems.length === 0) {
    return null;
  }

  return (
    <div
      className={`rounded-[18px] border border-[#E7EBF3] bg-[#FBFCFF] shadow-[0_10px_30px_rgba(15,23,42,0.05)] ${className}`}
    >
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex w-full items-start justify-between gap-4 px-4 py-3 text-left transition hover:bg-[#F4F8FF]"
      >
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8E8E93]">
            Текущая страница
          </p>
          {isLoading ? (
            <p className="mt-1 text-sm text-[#8E8E93]">Загружаем переходы...</p>
          ) : error ? (
            <p className="mt-1 text-sm text-[#D63E3E]">{error}</p>
          ) : effectiveCurrent ? (
            <>
              <p className="mt-1 truncate text-sm font-semibold text-[#1E1E1E]">
                {getItemTitle(effectiveCurrent)}
              </p>
              <p className="mt-0.5 truncate text-xs text-[#6C6C70]">
                {getItemPathLabel(effectiveCurrent)}
              </p>
            </>
          ) : (
            <p className="mt-1 text-sm text-[#8E8E93]">Нет данных о переходах</p>
          )}
        </div>
        <span
          className={`mt-1 shrink-0 text-sm text-[#8E8E93] transition ${isOpen ? "rotate-180" : ""}`}
          aria-hidden="true"
        >
          ▾
        </span>
      </button>

      {isOpen ? (
        <div className="border-t border-[#E7EBF3] px-4 py-3">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8E8E93]">
            Последние 10 страниц
          </p>

          {historyItems.length === 0 ? (
            <p className="text-sm text-[#8E8E93]">История переходов пока пуста</p>
          ) : (
            <div className="space-y-2">
              {historyItems.map((item, index) => (
                <div
                  key={item.id}
                  className={`rounded-[14px] px-3 py-2 ${
                    index === 0 ? "bg-[#EEF6FF]" : "bg-[#F7F8FB]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[#1E1E1E]">
                        {getItemTitle(item)}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-[#6C6C70]">
                        {getItemPathLabel(item)}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-[#8E8E93]">
                      {formatVisitedTime(item.visitedAt)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
