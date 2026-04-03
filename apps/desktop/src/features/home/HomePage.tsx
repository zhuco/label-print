import { useMemo } from "react";

import type { TemplateSnapshot } from "../editor/core/template-snapshot";
import { RecentLabelThumbnail } from "./RecentLabelThumbnail";

export type HomeRecentItem = {
  id: string;
  fileName: string;
  saved: boolean;
  openedAt: number;
  snapshot: TemplateSnapshot;
};

type HomePageProps = {
  searchKeyword: string;
  recentItems: HomeRecentItem[];
  onSearchKeywordChange: (value: string) => void;
  onCreateLabel: () => void;
  onOpenLabel: () => void;
  onOpenRecent: (id: string) => void;
};

export function HomePage({
  searchKeyword,
  recentItems,
  onSearchKeywordChange,
  onCreateLabel,
  onOpenLabel,
  onOpenRecent,
}: HomePageProps) {
  const formatter = useMemo(
    () =>
      new Intl.DateTimeFormat("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }),
    []
  );

  return (
    <section className="home-page">
      <section className="home-toolbar">
        <div className="home-main-actions">
          <button type="button" className="home-primary-action" onClick={onCreateLabel}>
            新建标签
          </button>
          <button type="button" className="home-primary-action secondary" onClick={onOpenLabel}>
            打开标签
          </button>
        </div>
        <label className="home-search">
          <span>搜索文件名</span>
          <input
            value={searchKeyword}
            onChange={(event) => onSearchKeywordChange(event.target.value)}
            placeholder="输入文件名或标签名"
          />
        </label>
      </section>

      <section className="home-recent-panel">
        <header className="home-recent-header">
          <h3>最近使用</h3>
          <p className="muted">显示最近打开的标签，支持按文件名搜索</p>
        </header>

        {recentItems.length === 0 ? (
          <p className="muted">暂无最近使用记录，点击“新建标签”或“打开标签”开始。</p>
        ) : (
          <div className="home-recent-grid">
            {recentItems.map((item) => (
              <button
                key={item.id}
                type="button"
                className="home-recent-card"
                onClick={() => onOpenRecent(item.id)}
              >
                <div className="home-recent-thumb">
                  <RecentLabelThumbnail snapshot={item.snapshot} />
                </div>
                <div className="home-recent-meta">
                  <h4>{item.fileName}</h4>
                  <p>{item.snapshot.title}</p>
                  <p className="muted">最近打开: {formatter.format(item.openedAt)}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
