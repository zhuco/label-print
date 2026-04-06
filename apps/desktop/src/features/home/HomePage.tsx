import { useMemo, type ChangeEvent, type KeyboardEvent } from "react";

import type { TemplateSnapshot } from "../editor/core/template-snapshot";
import { RecentLabelThumbnail } from "./RecentLabelThumbnail";

const HOME_SEARCH_MAX_LENGTH = 40;

export type HomeRecentItem = {
  id: string;
  fileName: string;
  filePath?: string | null;
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
  const openedFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }),
    []
  );

  const usageDateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }),
    []
  );

  const onSearchInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const next = event.target.value.slice(0, HOME_SEARCH_MAX_LENGTH);
    onSearchKeywordChange(next);
  };

  const onSearchSubmit = () => {
    onSearchKeywordChange(searchKeyword.trim());
  };

  const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") {
      return;
    }
    event.preventDefault();
    onSearchSubmit();
  };

  const onSearchClear = () => {
    onSearchKeywordChange("");
  };

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
          <div className="home-search-row">
            <input
              className="home-search-input"
              value={searchKeyword}
              maxLength={HOME_SEARCH_MAX_LENGTH}
              onChange={onSearchInputChange}
              onKeyDown={onSearchKeyDown}
              placeholder="输入文件名、标签名或使用日期"
            />
            {searchKeyword.length > 0 ? (
              <button type="button" className="home-search-clear" onClick={onSearchClear}>
                清除
              </button>
            ) : null}
            <button type="button" className="home-search-submit" onClick={onSearchSubmit}>
              搜索
            </button>
          </div>
        </label>
      </section>

      <section className="home-recent-panel">
        <header className="home-recent-header">
          <h3>最近使用</h3>
          <p className="muted">显示最近打开的标签，支持按文件名和日期搜索</p>
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
                  <p className="muted">使用日期: {usageDateFormatter.format(item.openedAt)}</p>
                  <p className="muted">最近打开: {openedFormatter.format(item.openedAt)}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
