import {
  type CloudEditorElement,
  type CloudLabelContentV1,
} from './cloud-label';
import { parseCloudLabelContent } from './cloud-migrate';

/** The label geometry required to convert a local editor snapshot. */
export type LabelSize = {
  widthMm: number;
  heightMm: number;
};

/**
 * Small structural subset of the desktop snapshot used by the shared schema.
 * Fields such as title are intentionally optional because a cloud document's
 * name belongs to label metadata rather than to its content JSON.
 */
export type TemplateSnapshot = {
  title?: string;
  labelSize: LabelSize;
  elements: CloudEditorElement[];
  calibration?: Calibration;
  printerId?: string;
  copies?: number;
};

export type Calibration = {
  offsetX: number;
  offsetY: number;
  scale: number;
};

/** Device-local values deliberately excluded from CloudLabelContentV1. */
export type DeviceSettings = Required<
  Pick<TemplateSnapshot, 'calibration' | 'printerId' | 'copies'>
>;

function cloneElements(elements: CloudEditorElement[]): CloudEditorElement[] {
  return structuredClone(elements);
}

/** Drops document metadata and all device-local settings before cloud storage. */
export function toCloudLabelContent(snapshot: TemplateSnapshot): CloudLabelContentV1 {
  return parseCloudLabelContent({
    format: 'label-print-cloud-document',
    version: 1,
    unit: 'mm',
    canvas: {
      widthMm: snapshot.labelSize.widthMm,
      heightMm: snapshot.labelSize.heightMm,
    },
    elements: cloneElements(snapshot.elements),
  });
}

/** Restores content to the editor's minimal snapshot shape with local settings. */
export function toTemplateSnapshot(
  content: CloudLabelContentV1,
  deviceSettings: DeviceSettings,
): TemplateSnapshot {
  const parsed = parseCloudLabelContent(content);
  return {
    labelSize: { ...parsed.canvas },
    elements: cloneElements(parsed.elements),
    calibration: { ...deviceSettings.calibration },
    printerId: deviceSettings.printerId,
    copies: deviceSettings.copies,
  };
}
