import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { TemplateSnapshot } from "../../editor/core/template-snapshot";
import { HomePage } from "../HomePage";
import type { RecentTemplateItem } from "../recent-store";

const snapshot: TemplateSnapshot = {
  title: "测试标签",
  labelSize: { widthMm: 40, heightMm: 30 },
  elements: [],
  calibration: { offsetX: 0, offsetY: 0, scale: 1 },
  printerId: "",
  copies: 1,
};

const recentItems: RecentTemplateItem[] = [
  {
    id: "local-recent",
    fileName: "本地订单标签",
    source: "local",
    filePath: "D:/labels/order.lpt",
    saved: true,
    openedAt: 2,
    snapshot,
  },
  {
    id: "cloud-recent",
    fileName: "云端商品标签",
    source: "cloud",
    cloudLabelId: "cloud-label-1",
    saved: true,
    openedAt: 1,
    snapshot,
  },
];

describe("HomePage recent label sources", () => {
  it("mixes local and cloud records with explicit source icons", () => {
    const { container } = render(
      <HomePage
        searchKeyword=""
        recentItems={recentItems}
        onSearchKeywordChange={vi.fn()}
        onCreateLabel={vi.fn()}
        onOpenLabel={vi.fn()}
        onOpenRecent={vi.fn()}
        onPrintRecent={vi.fn()}
        onDeleteRecent={vi.fn()}
      />
    );

    expect(screen.getByRole("img", { name: "本地标签" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "云端标签" })).toBeInTheDocument();

    const cloudCard = screen.getByText("云端商品标签").closest("article");
    expect(cloudCard).not.toBeNull();
    fireEvent.click(cloudCard!.querySelector<HTMLButtonElement>(".home-label-action.danger")!);
    expect(screen.getByText("只会移除最近记录，不会删除云端标签。")).toBeInTheDocument();
    expect(container.querySelectorAll(".home-label-item")).toHaveLength(2);
  });
});
