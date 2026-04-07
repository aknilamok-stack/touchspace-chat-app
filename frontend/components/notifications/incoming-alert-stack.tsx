"use client";

type IncomingAlertItem = {
  id: string;
  title: string;
  subtitle?: string | null;
  preview: string;
  tone?: "green" | "amber" | "blue";
  avatarEmoji?: string | null;
  avatarColor?: string | null;
  primaryLabel?: string;
  secondaryLabel?: string;
  metaLabel?: string | null;
};

const toneStyles = {
  green: {
    card: "bg-[linear-gradient(180deg,#239965_0%,#1E8B5B_100%)] text-white shadow-[0_26px_60px_rgba(7,94,52,0.32)]",
    footer: "border-white/12 bg-black/10",
  },
  amber: {
    card: "bg-[linear-gradient(180deg,#FFF5DE_0%,#FFE8B6_100%)] text-[#4F3410] shadow-[0_26px_60px_rgba(191,132,35,0.28)]",
    footer: "border-[#E9D0A0] bg-white/28",
  },
  blue: {
    card: "bg-[linear-gradient(180deg,#EAF4FF_0%,#D8EBFF_100%)] text-[#123B63] shadow-[0_26px_60px_rgba(10,132,255,0.22)]",
    footer: "border-[#C1DBF7] bg-white/30",
  },
} as const;

function getInitialAvatar(title: string) {
  return title.trim().charAt(0).toUpperCase() || "?";
}

export function IncomingAlertStack({
  items,
  onClose,
  onSecondary,
  onPrimary,
}: {
  items: IncomingAlertItem[];
  onClose: (id: string) => void;
  onSecondary?: (id: string) => void;
  onPrimary?: (id: string) => void;
}) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-[90] flex w-[min(420px,calc(100vw-24px))] flex-col gap-3">
      {items.map((item) => {
        const tone = toneStyles[item.tone ?? "green"];

        return (
          <section
            key={item.id}
            className={`pointer-events-auto overflow-hidden rounded-[24px] border border-black/10 ${tone.card}`}
          >
            <div className="flex items-start justify-between gap-3 px-5 pb-4 pt-5">
              <p className="text-[15px] font-semibold tracking-[0.01em]">Входящее сообщение</p>
              <button
                type="button"
                onClick={() => onClose(item.id)}
                className="text-[36px] leading-none opacity-90 transition hover:opacity-100"
                aria-label="Закрыть уведомление"
              >
                ×
              </button>
            </div>

            <div className="flex gap-4 px-5 pb-5">
              <div
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.24)]"
                style={{ backgroundColor: item.avatarColor || "rgba(255,255,255,0.24)" }}
              >
                {item.avatarEmoji || getInitialAvatar(item.title)}
              </div>

              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-[15px] font-medium leading-[1.35]">{item.title}</p>
                {item.subtitle ? (
                  <p className="mt-1 text-sm opacity-90">{item.subtitle}</p>
                ) : null}
                <p className="mt-4 line-clamp-2 text-[15px] leading-[1.45] opacity-95">{item.preview}</p>
                {item.metaLabel ? (
                  <p className="mt-3 text-xs font-medium opacity-80">{item.metaLabel}</p>
                ) : null}
              </div>
            </div>

            <div className={`grid grid-cols-2 gap-0 border-t px-2 py-2 ${tone.footer}`}>
              <button
                type="button"
                onClick={() => onPrimary?.(item.id)}
                className="rounded-[16px] px-4 py-3 text-sm font-medium transition hover:bg-white/10"
              >
                {item.primaryLabel ?? "Ответить"}
              </button>
              <button
                type="button"
                onClick={() => (onSecondary ? onSecondary(item.id) : onClose(item.id))}
                className="rounded-[16px] px-4 py-3 text-sm font-medium opacity-90 transition hover:bg-white/10"
              >
                {item.secondaryLabel ?? "Позже"}
              </button>
            </div>
          </section>
        );
      })}
    </div>
  );
}
