import type { ReactNode } from "react";

type LabelListItemProps = {
  name: string;
  source?: "local" | "cloud";
  status?: string;
  statusClassName?: string;
  thumbnail?: ReactNode;
  disabled?: boolean;
  onEdit: () => void;
  onPrint: () => void;
  onDelete: () => void;
};

type HomeLabelActionIconProps = {
  kind: "edit" | "print" | "delete";
};

function HomeLabelSourceIcon({ source }: { source: "local" | "cloud" }) {
  const label = source === "cloud" ? "云端标签" : "本地标签";
  return (
    <span className={`home-label-source ${source}`} role="img" aria-label={label} title={label}>
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        {source === "cloud" ? (
          <path d="M7.2 18.5h10.1a4.2 4.2 0 0 0 .5-8.4A6.1 6.1 0 0 0 6.2 8.8a4.9 4.9 0 0 0 1 9.7Z" />
        ) : (
          <>
            <path d="M3.5 6.5h6l2 2H20a1 1 0 0 1 1 1v8.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18V7a.5.5 0 0 1 .5-.5Z" />
            <path d="M3.5 10h17" />
          </>
        )}
      </svg>
    </span>
  );
}

function HomeLabelActionIcon({ kind }: HomeLabelActionIconProps) {
  if (kind === "edit") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M4 16.8V20h3.2L18.5 8.7l-3.2-3.2L4 16.8Z" />
        <path d="m13.8 7 3.2 3.2" />
        <path d="M4 20h16" />
      </svg>
    );
  }

  if (kind === "print") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M7 8V3h10v5" />
        <path d="M6 18H4V10a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8h-2" />
        <path d="M7 14h10v7H7z" />
        <path d="M17 11h.01" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M4 7h16" />
      <path d="M9 7V4h6v3" />
      <path d="M6 7l1 13h10l1-13" />
      <path d="M10 11v5M14 11v5" />
    </svg>
  );
}

/**
 * Shared presentation for actionable labels on the home screen.
 * Loading, printing and storage operations deliberately stay in App.tsx.
 */
export function LabelListItem({
  name,
  source,
  status,
  statusClassName,
  thumbnail,
  disabled = false,
  onEdit,
  onPrint,
  onDelete,
}: LabelListItemProps) {
  return (
    <article className={thumbnail ? "home-label-item with-thumbnail" : "home-label-item"}>
      {thumbnail ? (
        <button
          type="button"
          className="home-label-item-thumbnail"
          onClick={onEdit}
          disabled={disabled}
          aria-label={`编辑标签“${name}”`}
          title="编辑标签"
        >
          <span className="home-label-item-thumbnail-content" aria-hidden="true">{thumbnail}</span>
        </button>
      ) : null}
      <div className="home-label-item-name">
        {source ? <HomeLabelSourceIcon source={source} /> : null}
        <strong title={name}>{name}</strong>
        {status ? <span className={`cloud-sync-status ${statusClassName ?? ""}`.trim()}>{status}</span> : null}
      </div>
      <div className="home-label-item-actions" role="group" aria-label={`标签“${name}”操作`}>
        <button type="button" className="home-label-action edit" onClick={onEdit} disabled={disabled}>
          <span className="home-label-action-icon"><HomeLabelActionIcon kind="edit" /></span>
          <span>编辑</span>
        </button>
        <button type="button" className="home-label-action" onClick={onPrint} disabled={disabled}>
          <span className="home-label-action-icon"><HomeLabelActionIcon kind="print" /></span>
          <span>打印</span>
        </button>
        <button type="button" className="home-label-action danger" onClick={onDelete} disabled={disabled}>
          <span className="home-label-action-icon"><HomeLabelActionIcon kind="delete" /></span>
          <span>删除</span>
        </button>
      </div>
    </article>
  );
}
