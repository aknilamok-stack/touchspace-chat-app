"use client";

type IncomingAlertItem = {
  id: string;
  title: string;
  subtitle?: string | null;
  preview: string;
  tone?: "blue" | "green" | "amber";
  avatarEmoji?: string | null;
  avatarColor?: string | null;
  primaryLabel?: string;
  secondaryLabel?: string;
  metaLabel?: string | null;
};

const notificationTone = {
  blue: {
    card: "border-[#0A84FF] bg-[#0A84FF] text-white shadow-[0_26px_60px_rgba(10,132,255,0.32)]",
    footer: "border-white/20 bg-[#0A84FF]",
  },
  green: {
    card: "bg-[#34C759] text-white shadow-[0_26px_60px_rgba(52,199,89,0.28)]",
    footer: "border-white/20 bg-[#2EAD4F]",
  },
  amber: {
    card: "bg-[#FFCC00] text-[#3A2A00] shadow-[0_26px_60px_rgba(255,204,0,0.28)]",
    footer: "border-black/10 bg-[#E6B800]",
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

  const stopNotificationAction = (event: {
    preventDefault: () => void;
    stopPropagation: () => void;
  }) => {
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-[90] flex w-[min(420px,calc(100vw-24px))] flex-col gap-3">
      {items.map((item) => {
        const tone = notificationTone[item.tone ?? "blue"];

        return (
          <section
            key={item.id}
            className={`pointer-events-auto overflow-hidden rounded-[24px] border ${tone.card}`}
          >
            <div className="flex items-start justify-between gap-3 px-5 pb-4 pt-5">
              <p className="text-[15px] font-semibold tracking-[0.01em]">Входящее сообщение</p>
              <button
                type="button"
                onClick={(event) => {
                  stopNotificationAction(event);
                  onClose(item.id);
                }}
                onMouseDown={stopNotificationAction}
                onMouseUp={stopNotificationAction}
                onPointerDown={stopNotificationAction}
                onPointerUp={stopNotificationAction}
                className="text-[36px] leading-none opacity-90 transition hover:opacity-100"
                aria-label="Закрыть уведомление"
              >
                ×
              </button>
            </div>

            <div
              className="flex cursor-pointer gap-4 px-5 pb-5"
              onClick={() => onPrimary?.(item.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onPrimary?.(item.id);
                }
              }}
            >
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
                onClick={(event) => {
                  event.stopPropagation();
                  onPrimary?.(item.id);
                }}
                className="rounded-[16px] px-4 py-3 text-sm font-medium transition hover:bg-white/10"
              >
                {item.primaryLabel ?? "Ответить"}
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  if (onSecondary) {
                    onSecondary(item.id);
                    return;
                  }
                  onClose(item.id);
                }}
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
