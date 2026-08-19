import { toTemplateSnapshot } from "@label/template-schema";
import { memo } from "react";

import type { CachedCloudLabel } from "../cloud";
import type { EditorElement } from "../editor/core/types";
import type { TemplateSnapshot } from "../editor/core/template-snapshot";
import { RecentLabelThumbnail } from "./RecentLabelThumbnail";

type CloudLabelThumbnailProps = {
  label: CachedCloudLabel;
};

const previewSnapshotCache = new Map<string, TemplateSnapshot | null>();
const PREVIEW_SNAPSHOT_CACHE_LIMIT = 100;

function toPreviewSnapshot(label: CachedCloudLabel): TemplateSnapshot | null {
  if (!label.content) return null;
  const cacheKey = `${label.id}:${label.revision}:${label.updatedAt}`;
  if (previewSnapshotCache.has(cacheKey)) {
    return previewSnapshotCache.get(cacheKey) ?? null;
  }
  try {
    const restored = toTemplateSnapshot(label.content, {
      calibration: { offsetX: 0, offsetY: 0, scale: 1 },
      printerId: "",
      copies: 1,
    });
    const snapshot: TemplateSnapshot = {
      title: label.name,
      labelSize: restored.labelSize,
      elements: restored.elements as EditorElement[],
      calibration: restored.calibration ?? { offsetX: 0, offsetY: 0, scale: 1 },
      printerId: restored.printerId ?? "",
      copies: restored.copies ?? 1,
    };
    previewSnapshotCache.set(cacheKey, snapshot);
    if (previewSnapshotCache.size > PREVIEW_SNAPSHOT_CACHE_LIMIT) {
      previewSnapshotCache.delete(previewSnapshotCache.keys().next().value as string);
    }
    return snapshot;
  } catch {
    previewSnapshotCache.set(cacheKey, null);
    return null;
  }
}

export const CloudLabelThumbnail = memo(function CloudLabelThumbnail({ label }: CloudLabelThumbnailProps) {
  const snapshot = toPreviewSnapshot(label);
  if (snapshot) return <RecentLabelThumbnail snapshot={snapshot} />;

  return (
    <div className="home-cloud-thumbnail-placeholder" aria-label="标签缩略图尚未缓存">
      <span />
      <span />
      <span />
    </div>
  );
});
