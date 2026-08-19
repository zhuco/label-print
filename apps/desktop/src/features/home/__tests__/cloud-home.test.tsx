import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CachedCloudLabel } from "../../cloud";
import { HomePage } from "../HomePage";

function selectCloudTab(container: HTMLElement) {
  const tab = container.querySelector<HTMLButtonElement>("#home-cloud-tab");
  expect(tab).not.toBeNull();
  fireEvent.click(tab!);
}

const cloudLabel: CachedCloudLabel = {
  id: "cloud-1",
  name: "食品标签",
  content: null,
  schemaVersion: 1,
  revision: 3,
  createdAt: "2026-08-04T00:00:00.000Z",
  updatedAt: "2026-08-04T00:00:00.000Z",
  deletedAt: null,
  lastOpenedAt: null,
  syncStatus: "synced",
  lastSyncedAt: "2026-08-04T00:00:00.000Z",
};

describe("HomePage cloud space", () => {
  afterEach(() => {
    cleanup();
  });

  it("clears the search filter before selecting any cloud category", () => {
    const onSearchKeywordChange = vi.fn();
    const onSelectedCategoryIdChange = vi.fn();
    render(
      <HomePage
        searchKeyword="紫带"
        activeLibraryTab="labels"
        selectedCategoryId={undefined}
        onSelectedCategoryIdChange={onSelectedCategoryIdChange}
        recentItems={[]}
        onSearchKeywordChange={onSearchKeywordChange}
        onCreateLabel={vi.fn()}
        onOpenLabel={vi.fn()}
        onOpenRecent={vi.fn()}
        onPrintRecent={vi.fn()}
        onDeleteRecent={vi.fn()}
        cloud={{
          state: "authenticated",
          user: { displayName: "User", plan: "pro", labelUsage: { used: 50, limit: 200, canCreate: true } },
          labels: [cloudLabel],
          categories: [{ id: "category-1", name: "食品", createdAt: "2026-08-10T00:00:00.000Z" }],
          view: "active",
          loading: false,
          error: "",
          source: "cloud",
          updateStatus: "",
          onRequestLogin: vi.fn(),
          onOpenLocalFile: vi.fn(),
          onOpenLabel: vi.fn(),
          onPrintLabel: vi.fn(),
          onRefresh: vi.fn(),
          onSetView: vi.fn(),
          onMoveToTrash: vi.fn(),
          onRestore: vi.fn(),
          onPermanentlyDelete: vi.fn(),
          onResolveConflict: vi.fn(),
          onOpenPlan: vi.fn(),
          onOpenOfficialTemplates: vi.fn(),
          onLogout: vi.fn(),
          onCheckForUpdates: vi.fn(),
        }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "全部标签" }));
    fireEvent.click(screen.getByRole("button", { name: "未分类" }));
    fireEvent.click(screen.getByRole("button", { name: /^食品$/ }));

    expect(onSearchKeywordChange).toHaveBeenCalledTimes(3);
    expect(onSearchKeywordChange).toHaveBeenNthCalledWith(1, "");
    expect(onSearchKeywordChange).toHaveBeenNthCalledWith(2, "");
    expect(onSearchKeywordChange).toHaveBeenNthCalledWith(3, "");
    expect(onSelectedCategoryIdChange).toHaveBeenNthCalledWith(1, undefined);
    expect(onSelectedCategoryIdChange).toHaveBeenNthCalledWith(2, null);
    expect(onSelectedCategoryIdChange).toHaveBeenNthCalledWith(3, "category-1");
  });

  it("shows quota and routes label and recycle-bin actions", () => {
    const onOpenLabel = vi.fn();
    const onPrintLabel = vi.fn();
    const onSetView = vi.fn();
    const onMoveToTrash = vi.fn();
    const onResolveConflict = vi.fn();
    const { container } = render(
      <HomePage
        searchKeyword=""
        recentItems={[]}
        onSearchKeywordChange={vi.fn()}
        onCreateLabel={vi.fn()}
        onOpenLabel={vi.fn()}
        onOpenRecent={vi.fn()}
        onPrintRecent={vi.fn()}
        onDeleteRecent={vi.fn()}
        cloud={{
          state: "authenticated",
          user: { displayName: "甲", plan: "free", labelUsage: { used: 12, limit: 50, canCreate: true } },
          labels: [cloudLabel],
          view: "active",
          loading: false,
          error: "",
          source: "cloud",
          updateStatus: "",
          onRequestLogin: vi.fn(),
          onOpenLocalFile: vi.fn(),
          onOpenLabel,
          onPrintLabel,
          onRefresh: vi.fn(),
          onSetView,
          onMoveToTrash,
          onRestore: vi.fn(),
          onPermanentlyDelete: vi.fn(),
          onResolveConflict,
          onOpenPlan: vi.fn(),
          onOpenOfficialTemplates: vi.fn(),
          onLogout: vi.fn(),
          onCheckForUpdates: vi.fn(),
        }}
      />
    );

    selectCloudTab(container);
    expect(screen.getByText("已使用 12 / 50 · 免费版")).toBeInTheDocument();
    expect(container.querySelector(".home-cloud-thumbnail-placeholder")).not.toBeNull();
    fireEvent.click(container.querySelector<HTMLButtonElement>(".home-label-item-thumbnail")!);
    expect(onOpenLabel).toHaveBeenCalledWith("cloud-1");
    fireEvent.click(screen.getByRole("button", { name: "编辑" }));
    expect(onOpenLabel).toHaveBeenCalledWith("cloud-1");
    fireEvent.click(screen.getByRole("button", { name: "打印" }));
    expect(onPrintLabel).toHaveBeenCalledWith("cloud-1");
    fireEvent.click(screen.getByRole("button", { name: "删除" }));
    expect(screen.getByText("确认删除云端标签“食品标签”吗？")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "确认删除" }));
    expect(onMoveToTrash).toHaveBeenCalledWith("cloud-1");
    fireEvent.click(screen.getByText("回收站"));
    expect(onSetView).toHaveBeenCalledWith("trash");
  });

  it("keeps cloud content behind a login gate for anonymous users", () => {
    const onRequestLogin = vi.fn();
    const { container } = render(
      <HomePage
        searchKeyword=""
        recentItems={[]}
        onSearchKeywordChange={vi.fn()}
        onCreateLabel={vi.fn()}
        onOpenLabel={vi.fn()}
        onOpenRecent={vi.fn()}
        onPrintRecent={vi.fn()}
        onDeleteRecent={vi.fn()}
        cloud={{
          state: "anonymous",
          user: null,
          labels: [],
          view: "active",
          loading: false,
          error: "",
          source: null,
          updateStatus: "",
          onRequestLogin,
          onOpenLocalFile: vi.fn(),
          onOpenLabel: vi.fn(),
          onPrintLabel: vi.fn(),
          onRefresh: vi.fn(),
          onSetView: vi.fn(),
          onMoveToTrash: vi.fn(),
          onRestore: vi.fn(),
          onPermanentlyDelete: vi.fn(),
          onResolveConflict: vi.fn(),
          onOpenPlan: vi.fn(),
          onOpenOfficialTemplates: vi.fn(),
          onLogout: vi.fn(),
          onCheckForUpdates: vi.fn(),
        }}
      />
    );

    selectCloudTab(container);
    fireEvent.click(screen.getByText("登录 / 注册"));
    expect(onRequestLogin).toHaveBeenCalledTimes(1);
  });

  it("offers deliberate choices for a revision-conflicted label", () => {
    const onResolveConflict = vi.fn();
    const { container } = render(
      <HomePage
        searchKeyword=""
        recentItems={[]}
        onSearchKeywordChange={vi.fn()}
        onCreateLabel={vi.fn()}
        onOpenLabel={vi.fn()}
        onOpenRecent={vi.fn()}
        onPrintRecent={vi.fn()}
        onDeleteRecent={vi.fn()}
        cloud={{
          state: "authenticated",
          user: { displayName: "甲", plan: "free", labelUsage: { used: 1, limit: 50, canCreate: true } },
          labels: [{ ...cloudLabel, syncStatus: "conflict", lastSyncedAt: null }],
          view: "active", loading: false, error: "", source: "cache", updateStatus: "",
          onRequestLogin: vi.fn(), onOpenLocalFile: vi.fn(), onOpenLabel: vi.fn(), onPrintLabel: vi.fn(), onRefresh: vi.fn(), onSetView: vi.fn(), onMoveToTrash: vi.fn(),
          onRestore: vi.fn(), onPermanentlyDelete: vi.fn(), onResolveConflict, onOpenPlan: vi.fn(), onLogout: vi.fn(), onCheckForUpdates: vi.fn(),
          onOpenOfficialTemplates: vi.fn(),
        }}
      />
    );

    selectCloudTab(container);
    fireEvent.click(screen.getByText("覆盖云端"));
    fireEvent.click(screen.getByText("保留云端"));
    fireEvent.click(screen.getByText("另存副本"));
    expect(onResolveConflict).toHaveBeenNthCalledWith(1, "cloud-1", "overwrite");
    expect(onResolveConflict).toHaveBeenNthCalledWith(2, "cloud-1", "discard-local");
    expect(onResolveConflict).toHaveBeenNthCalledWith(3, "cloud-1", "save-copy");
  });
});
