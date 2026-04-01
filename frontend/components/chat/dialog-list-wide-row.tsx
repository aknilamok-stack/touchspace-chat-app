"use client";

import { getDialogAvatar } from "@/lib/dialog-list";

type DialogListWideRowProps = {
  title: string;
  identityKey: string;
  avatarColor?: string | null;
  avatarEmoji?: string | null;
  statusDotClassName: string;
  managerLabel: string;
  lastMessageTimeLabel: string;
  firstResponseLabel: string;
  durationLabel: string;
  statusLabel: string;
  statusBadgeClassName: string;
  channelLabel: string;
  topicLabel: string;
  onClick: () => void;
};

export function DialogListWideRow({
  title,
  identityKey,
  avatarColor,
  avatarEmoji,
  statusDotClassName,
  managerLabel,
  lastMessageTimeLabel,
  firstResponseLabel,
  durationLabel,
  statusLabel,
  statusBadgeClassName,
  channelLabel,
  topicLabel,
  onClick,
}: DialogListWideRowProps) {
  const avatar = getDialogAvatar(identityKey, avatarColor, avatarEmoji);

  return (
    <button
      type="button"
      onClick={onClick}
      className="grid w-full grid-cols-[minmax(260px,1.6fr)_150px_160px_120px_180px_minmax(220px,1.8fr)] items-start gap-5 rounded-[18px] border border-transparent px-4 py-4 text-left transition hover:border-[#D9E6FF] hover:bg-[#F8FBFF]"
    >
      <div className="flex min-w-0 items-start gap-4">
        <div className="relative mt-1 h-12 w-12 shrink-0 overflow-hidden rounded-full">
          <span
            className="flex h-full w-full items-center justify-center text-[22px]"
            style={{ backgroundColor: avatar.color }}
            aria-hidden="true"
          >
            {avatar.emoji}
          </span>
          <span
            className={`absolute -right-0.5 -top-0.5 h-4 w-4 rounded-full border-2 border-white ${statusDotClassName}`}
            aria-hidden="true"
          />
        </div>

        <div className="min-w-0">
          <p className="truncate text-[24px] font-semibold leading-[1.15] text-[#1E1E1E]">{title}</p>
          <div className="mt-1 flex items-center justify-between gap-3 text-[15px] text-[#8E8E93]">
            <p className="truncate">{managerLabel}</p>
            <span className="shrink-0">{lastMessageTimeLabel || "—"}</span>
          </div>
        </div>
      </div>

      <div>
        <p className="text-[13px] font-medium text-[#9AA3AF]">Ожидание первого ответа</p>
        <p className="mt-2 text-[18px] font-medium text-[#1E1E1E]">{firstResponseLabel}</p>
      </div>

      <div>
        <p className="text-[13px] font-medium text-[#9AA3AF]">Длительность</p>
        <p className="mt-2 text-[18px] font-medium text-[#1E1E1E]">{durationLabel}</p>
      </div>

      <div>
        <p className="text-[13px] font-medium text-[#9AA3AF]">Статус</p>
        <span
          className={`mt-2 inline-flex items-center rounded-full px-3 py-1.5 text-[13px] font-semibold ${statusBadgeClassName}`}
        >
          {statusLabel}
        </span>
      </div>

      <div>
        <p className="text-[13px] font-medium text-[#9AA3AF]">Канал</p>
        <p className="mt-2 truncate text-[16px] text-[#1E1E1E]" title={channelLabel}>
          {channelLabel}
        </p>
      </div>

      <div>
        <p className="text-[13px] font-medium text-[#9AA3AF]">Тема обращения</p>
        <p className="mt-2 line-clamp-2 text-[16px] leading-[1.35] text-[#1E1E1E]" title={topicLabel}>
          {topicLabel}
        </p>
      </div>
    </button>
  );
}
