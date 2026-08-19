import { useEffect, useLayoutEffect, useRef, useState, type ChangeEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";

import type { LabelCategory } from "@label/api-contract";

import type { CachedCloudLabel, CloudConflictResolution } from "../cloud";
import type { RecentTemplateItem } from "./recent-store";
import { CloudLabelThumbnail } from "./CloudLabelThumbnail";
import { matchesLabelSearch } from "./label-search";
import { LabelListItem } from "./LabelListItem";
import { RecentLabelThumbnail } from "./RecentLabelThumbnail";

const HOME_SEARCH_MAX_LENGTH = 40;

export type { RecentTemplateItem as HomeRecentItem } from "./recent-store";

type HomePageProps = {
  searchKeyword: string;
  activeLibraryTab?: "recent" | "labels";
  onLibraryTabChange?: (tab: "recent" | "labels") => void;
  selectedCategoryId?: string | null | undefined;
  onSelectedCategoryIdChange?: (categoryId: string | null | undefined) => void;
  cloudLabelListScrollTop?: number;
  onCloudLabelListScrollTopChange?: (scrollTop: number) => void;
  recentItems: RecentTemplateItem[];
  onSearchKeywordChange: (value: string) => void;
  onCreateLabel: () => void;
  onOpenLabel: () => void;
  onOpenRecent: (id: string) => void;
  onPrintRecent: (id: string) => void;
  onDeleteRecent: (id: string) => void;
  cloud?: {
    state: "loading" | "anonymous" | "authenticated";
    user: {
      displayName: string | null;
      plan: "free" | "pro";
      labelUsage: { used: number; limit: number; canCreate: boolean };
    } | null;
    labels: CachedCloudLabel[];
    categories?: LabelCategory[];
    view: "active" | "trash";
    loading: boolean;
    loadingMore?: boolean;
    hasMore?: boolean;
    error: string;
    source: "cloud" | "cache" | null;
    updateStatus: string;
    onRequestLogin: () => void;
    onOpenLocalFile: () => void;
    onOpenLabel: (id: string) => void;
    onPrintLabel: (id: string) => void;
    onRefresh: () => void;
    onLoadMore?: () => void;
    onSetView: (view: "active" | "trash") => void;
    onMoveToTrash: (id: string) => void;
    onRestore: (id: string) => void;
    onPermanentlyDelete: (id: string) => void;
    onCreateCategory?: (name: string) => void;
    onDeleteCategory?: (id: string) => void;
    onSetLabelCategory?: (labelId: string, categoryId: string | null) => void;
    onResolveConflict: (id: string, resolution: CloudConflictResolution) => void;
    onOpenPlan: () => void;
    onOpenOfficialTemplates: () => void;
    onLogout: () => void;
    onRequestAccountDeletion?: () => void;
    onCheckForUpdates: () => void;
  };
};

type PendingDelete =
  | { kind: "recent"; id: string; name: string; source: RecentTemplateItem["source"] }
  | { kind: "cloud"; id: string; name: string };

export function HomePage({
  searchKeyword,
  activeLibraryTab: controlledLibraryTab,
  onLibraryTabChange,
  selectedCategoryId: controlledSelectedCategoryId,
  onSelectedCategoryIdChange,
  cloudLabelListScrollTop,
  onCloudLabelListScrollTopChange,
  recentItems,
  onSearchKeywordChange,
  onCreateLabel,
  onOpenLabel,
  onOpenRecent,
  onPrintRecent,
  onDeleteRecent,
  cloud,
}: HomePageProps) {
  const [uncontrolledLibraryTab, setUncontrolledLibraryTab] = useState<"recent" | "labels">("recent");
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  // undefined means all labels; null represents labels without a category.
  const [uncontrolledSelectedCategoryId, setUncontrolledSelectedCategoryId] = useState<string | null | undefined>(undefined);
  const cloudLabelListRef = useRef<HTMLDivElement | null>(null);
  const activeLibraryTab = controlledLibraryTab ?? uncontrolledLibraryTab;
  const selectLibraryTab = onLibraryTabChange ?? setUncontrolledLibraryTab;
  const selectedCategoryId = onSelectedCategoryIdChange ? controlledSelectedCategoryId : uncontrolledSelectedCategoryId;
  const selectCategory = onSelectedCategoryIdChange ?? setUncontrolledSelectedCategoryId;

  const onSearchInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const next = event.target.value.slice(0, HOME_SEARCH_MAX_LENGTH);
    onSearchKeywordChange(next);
  };

  const onSearchSubmit = () => {
    onSearchKeywordChange(searchKeyword.trim());
  };

  const onSearchKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") {
      return;
    }
    event.preventDefault();
    onSearchSubmit();
  };

  const onSearchClear = () => {
    onSearchKeywordChange("");
  };

  const onSelectCategory = (categoryId: string | null | undefined) => {
    if (searchKeyword) {
      onSearchKeywordChange("");
    }
    selectCategory(categoryId);
  };

  const confirmDelete = () => {
    if (!pendingDelete) return;
    if (pendingDelete.kind === "recent") {
      onDeleteRecent(pendingDelete.id);
    } else {
      cloud?.onMoveToTrash(pendingDelete.id);
    }
    setPendingDelete(null);
  };

  useEffect(() => {
    if (!pendingDelete) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.repeat) return;
      if (event.key === "Escape") {
        event.preventDefault();
        setPendingDelete(null);
      } else if (event.key === "Enter" && !(event.target as HTMLElement | null)?.closest("button")) {
        event.preventDefault();
        confirmDelete();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pendingDelete]);

  const cloudUser = cloud?.state === "authenticated" ? cloud.user : null;
  const cloudIsAuthenticated = Boolean(cloudUser);
  const cloudCanCreate = cloudUser?.labelUsage.canCreate ?? true;
  const categoryFilteredCloudLabels = cloud?.view !== "active" || selectedCategoryId === undefined
    ? cloud?.labels ?? []
    : selectedCategoryId === null
      ? (cloud?.labels ?? []).filter((label) => (label.categoryId ?? null) === null)
      : (cloud?.labels ?? []).filter((label) => label.categoryId === selectedCategoryId);
  const visibleCloudLabels = categoryFilteredCloudLabels.filter((label) => matchesLabelSearch(label.name, searchKeyword));

  const requestCreateCategory = () => {
    const name = window.prompt("请输入分类名称（最多 40 个字符）")?.trim();
    if (name) cloud?.onCreateCategory?.(name);
  };

  const requestDeleteCategory = (category: LabelCategory) => {
    if (window.confirm(`删除分类“${category.name}”后，其中的标签将移至“未分类”。是否继续？`)) {
      selectCategory(undefined);
      cloud?.onDeleteCategory?.(category.id);
    }
  };

  useLayoutEffect(() => {
    if (activeLibraryTab !== "labels" || !cloudLabelListRef.current) return;
    cloudLabelListRef.current.scrollTop = cloudLabelListScrollTop ?? 0;
  }, [activeLibraryTab, cloudLabelListScrollTop, visibleCloudLabels.length]);

  return (
    <section className="home-page">
      <section className="home-toolbar">
        <div className="home-main-actions">
          <button
            type="button"
            className="home-primary-action"
            onClick={() => {
              if (cloudIsAuthenticated && !cloudCanCreate) return;
              onCreateLabel();
            }}
            disabled={Boolean(cloudIsAuthenticated && !cloudCanCreate)}
          >
            新建标签
          </button>
          <button type="button" className="home-primary-action secondary" onClick={onOpenLabel}>
            打开标签
          </button>
        </div>
        <label className="home-search">
          <div className="home-search-row">
            <input
              className="home-search-input"
              value={searchKeyword}
              maxLength={HOME_SEARCH_MAX_LENGTH}
              onChange={onSearchInputChange}
              onKeyDown={onSearchKeyDown}
              aria-label="搜索标签"
              placeholder="输入标签名称、拼音或首字母"
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

      <section className="home-library-panel" aria-label="标签内容">
        <div className="home-library-tabs" role="tablist" aria-orientation="vertical" aria-label="标签内容分类">
          <button
            type="button"
            className={activeLibraryTab === "recent" ? "home-library-tab active" : "home-library-tab"}
            role="tab"
            aria-selected={activeLibraryTab === "recent"}
            aria-controls="home-recent-panel"
            id="home-recent-tab"
            onClick={() => selectLibraryTab("recent")}
          >
            最近使用
          </button>
          <button
            type="button"
            className={activeLibraryTab === "labels" ? "home-library-tab active" : "home-library-tab"}
            role="tab"
            aria-selected={activeLibraryTab === "labels"}
            aria-controls="home-cloud-panel"
            id="home-cloud-tab"
            onClick={() => selectLibraryTab("labels")}
          >
            我的标签
          </button>
          {activeLibraryTab === "labels" && cloudIsAuthenticated && cloud?.view === "active" ? (
            <div className="home-category-nav" aria-label="我的标签分类">
              <div className="home-category-nav-heading">
                <span>分类</span>
                <button type="button" className="home-category-add" onClick={requestCreateCategory} aria-label="新建分类">+</button>
              </div>
              <button type="button" className={selectedCategoryId === undefined ? "home-category-item active" : "home-category-item"} onClick={() => onSelectCategory(undefined)}>全部标签</button>
              <button type="button" className={selectedCategoryId === null ? "home-category-item active" : "home-category-item"} onClick={() => onSelectCategory(null)}>未分类</button>
              {(cloud.categories ?? []).map((category) => (
                <div className="home-category-row" key={category.id}>
                  <button type="button" className={selectedCategoryId === category.id ? "home-category-item active" : "home-category-item"} onClick={() => onSelectCategory(category.id)} title={category.name}>{category.name}</button>
                  <button type="button" className="home-category-delete" onClick={() => requestDeleteCategory(category)} aria-label={`删除分类${category.name}`}>×</button>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="home-library-content">
          {activeLibraryTab === "recent" ? (
            <section
              className="home-recent-panel"
              id="home-recent-panel"
              role="tabpanel"
              aria-labelledby="home-recent-tab"
            >
              <header className="home-recent-header">
                <h3>最近使用</h3>
                <p className="muted">标签列表</p>
              </header>

              {recentItems.length === 0 ? (
                <p className="muted">暂无最近使用记录，点击“新建标签”或“打开标签”开始。</p>
              ) : (
                <div className="home-label-list">
                  {recentItems.map((item) => (
                    <LabelListItem
                      key={item.id}
                      name={item.fileName}
                      source={item.source}
                      thumbnail={<RecentLabelThumbnail snapshot={item.snapshot} />}
                      onEdit={() => onOpenRecent(item.id)}
                      onPrint={() => onPrintRecent(item.id)}
                      onDelete={() => setPendingDelete({
                        kind: "recent",
                        id: item.id,
                        name: item.fileName,
                        source: item.source,
                      })}
                    />
                  ))}
                </div>
              )}
            </section>
          ) : null}

          {activeLibraryTab === "labels" && cloud ? (
            <section
              className="home-cloud-panel"
              id="home-cloud-panel"
              role="tabpanel"
              aria-labelledby="home-cloud-tab"
            >
          <header className="home-cloud-header">
            <div>
              <h3>我的标签</h3>
              {cloudIsAuthenticated ? (
                <p className="muted">
                  已使用 {cloudUser!.labelUsage.used} / {cloudUser!.labelUsage.limit} · {cloudUser!.plan === "pro" ? "专业版" : "免费版"}
                  {cloud.source === "cache" ? " · 离线缓存" : ""}
                </p>
              ) : (
                <p className="muted">登录后可将标签安全保存到个人云空间。</p>
              )}
            </div>
            <div className="home-cloud-actions">
              <button type="button" className="tool-ghost" data-testid="open-local-file" onClick={cloud.onOpenLocalFile}>从本机打开</button>
              {cloudIsAuthenticated ? (
                <>
                  <button type="button" className={cloud.view === "active" ? "tool-ghost active" : "tool-ghost"} onClick={() => cloud.onSetView("active")}>我的标签</button>
                  <button type="button" className={cloud.view === "trash" ? "tool-ghost active" : "tool-ghost"} onClick={() => cloud.onSetView("trash")}>回收站</button>
                  <button type="button" className="tool-ghost" onClick={cloud.onRefresh} disabled={cloud.loading}>刷新</button>
                  <button type="button" className="tool-ghost" onClick={cloud.onOpenPlan}>套餐与配额</button>
                  <button type="button" className="tool-ghost" onClick={cloud.onOpenOfficialTemplates}>官方模板</button>
                  <button type="button" className="tool-ghost" onClick={cloud.onCheckForUpdates}>检查更新</button>
                  <button type="button" className="tool-ghost" onClick={cloud.onLogout}>退出登录</button>
                  {cloud.onRequestAccountDeletion ? <button type="button" className="tool-ghost cloud-danger" onClick={cloud.onRequestAccountDeletion}>注销账号</button> : null}
                </>
              ) : (
                <button type="button" className="primary" onClick={cloud.onRequestLogin} disabled={cloud.state === "loading"}>登录 / 注册</button>
              )}
            </div>
          </header>

          {cloud.error ? <p className="warning">{cloud.error}</p> : null}
          {cloud.updateStatus ? <p className="muted">{cloud.updateStatus}</p> : null}
          {cloudIsAuthenticated && !cloudCanCreate ? <p className="warning">标签数量已达当前套餐上限。你仍可以编辑、打印、导出或永久删除已有标签。</p> : null}
          {cloudIsAuthenticated && !cloud.loading && visibleCloudLabels.length === 0 ? (
            <p className="muted">{cloud.view === "trash" ? "回收站为空。" : "还没有云标签。打开本地文件后，点击“保存到云端”即可手动迁移。"}</p>
          ) : null}
          {cloudIsAuthenticated && visibleCloudLabels.length > 0 ? (
            <>
              <div
                className="home-label-list"
                ref={cloudLabelListRef}
                onScroll={(event) => onCloudLabelListScrollTopChange?.(event.currentTarget.scrollTop)}
              >
                {visibleCloudLabels.map((label) => (
                  cloud.view === "trash" ? (
                    <article className="home-label-item with-thumbnail" key={label.id}>
                      <div className="home-label-item-thumbnail" aria-hidden="true">
                        <CloudLabelThumbnail label={label} />
                      </div>
                      <div className="home-label-item-name">
                        <strong title={label.name}>{label.name}</strong>
                      </div>
                      <div className="home-label-item-actions" role="group" aria-label={`标签“${label.name}”回收站操作`}>
                        <button type="button" className="home-label-action" onClick={() => cloud.onRestore(label.id)}>恢复</button>
                        <button type="button" className="home-label-action danger" onClick={() => cloud.onPermanentlyDelete(label.id)}>永久删除</button>
                      </div>
                    </article>
                  ) : (
                    <div className="home-cloud-label-entry" key={label.id}>
                      <LabelListItem
                        name={label.name}
                        thumbnail={<CloudLabelThumbnail label={label} />}
                        status={label.syncStatus === "synced" ? undefined : formatSyncStatus(label.syncStatus)}
                        statusClassName={label.syncStatus}
                        onEdit={() => cloud.onOpenLabel(label.id)}
                        onPrint={() => cloud.onPrintLabel(label.id)}
                        onDelete={() => setPendingDelete({ kind: "cloud", id: label.id, name: label.name })}
                      />
                      {cloud.onSetLabelCategory ? <label className="home-label-category-select">
                        <span>分类</span>
                        <select value={label.categoryId ?? ""} onChange={(event) => cloud.onSetLabelCategory?.(label.id, event.target.value || null)}>
                          <option value="">未分类</option>
                          {(cloud.categories ?? []).map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}
                        </select>
                      </label> : null}
                      {label.syncStatus === "conflict" ? (
                        <details className="home-cloud-conflict-actions">
                          <summary>处理同步冲突</summary>
                          <div>
                            <button type="button" className="tool-ghost" onClick={() => cloud.onResolveConflict(label.id, "overwrite")}>覆盖云端</button>
                            <button type="button" className="tool-ghost" onClick={() => cloud.onResolveConflict(label.id, "discard-local")}>保留云端</button>
                            <button type="button" className="tool-ghost" onClick={() => cloud.onResolveConflict(label.id, "save-copy")}>另存副本</button>
                          </div>
                        </details>
                      ) : null}
                    </div>
                  )
                ))}
              </div>
              {cloud.hasMore && cloud.onLoadMore ? (
                <div className="home-cloud-load-more">
                  <button type="button" className="tool-ghost" onClick={cloud.onLoadMore} disabled={cloud.loadingMore}>
                    {cloud.loadingMore ? "正在加载..." : "加载更多"}
                  </button>
                </div>
              ) : null}
            </>
          ) : null}
            </section>
          ) : null}
        </div>
      </section>

      {pendingDelete ? (
        <div className="modal-mask" onClick={() => setPendingDelete(null)}>
          <section
            className="modal-card confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="home-delete-confirm-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="modal-header confirm-modal-header">
              <h3 id="home-delete-confirm-title">确认删除标签</h3>
            </header>
            <p className="confirm-modal-lead">
              {pendingDelete.kind === "recent"
                ? `确认从最近使用中移除“${pendingDelete.name}”吗？`
                : `确认删除云端标签“${pendingDelete.name}”吗？`}
            </p>
            <p className="confirm-modal-detail">
              {pendingDelete.kind === "recent"
                ? pendingDelete.source === "cloud"
                  ? "只会移除最近记录，不会删除云端标签。"
                  : "只会移除最近记录，不会删除电脑中的标签文件。"
                : "删除后将进入回收站，可以恢复。"}
            </p>
            <div className="confirm-modal-actions">
              <button type="button" className="tool-ghost confirm-cancel" onClick={() => setPendingDelete(null)}>
                取消
              </button>
              <button type="button" className="primary confirm-confirm confirm-modal-danger" onClick={confirmDelete}>
                确认删除
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}

function formatSyncStatus(status: CachedCloudLabel["syncStatus"]): string {
  switch (status) {
    case "synced": return "已同步";
    case "pending": return "离线，等待同步";
    case "syncing": return "正在同步";
    case "conflict": return "存在云端冲突";
    case "failed": return "同步失败";
  }
}
