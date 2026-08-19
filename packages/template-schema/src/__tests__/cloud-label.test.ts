import { describe, expect, it } from 'vitest';
import {
  CloudLabelMigrationError,
  parseCloudLabelContent,
  toCloudLabelContent,
  toTemplateSnapshot,
  type CloudEditorElement,
  type DeviceSettings,
  type TemplateSnapshot,
} from '../index';

// Kept structural rather than imported from apps/desktop: the shared package
// must remain usable by both the desktop app and a server process.
type ExistingDesktopEditorElement = {
  id: string;
  type: 'text' | 'barcode' | 'image' | 'qrcode' | 'shape' | 'icon';
  name: string;
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
  rotation: number;
  groupId?: string;
  presetInstanceId?: string;
  sourcePresetId?: string;
  binding: {
    mode: 'fixed' | 'column' | 'expression';
    fixedValue?: string;
    column?: string;
    expression?: string;
  };
  textStyle: {
    fontFamily: string;
    fontSize: number;
    fontWeight: number;
    italic: boolean;
    underline: boolean;
    align: 'left' | 'center' | 'right';
    color: string;
    letterSpacing: number;
    lineHeight: number;
    strokeDashArray?: number[] | string;
  };
};

const existingDesktopElements: ExistingDesktopEditorElement[] = [];
// Compile-time contract: the current desktop element shape can be supplied to
// the shared snapshot converter without importing desktop implementation code.
const desktopCompatibleSnapshot: TemplateSnapshot = {
  labelSize: { widthMm: 40, heightMm: 30 },
  elements: existingDesktopElements,
};
void desktopCompatibleSnapshot;

const imageElement: CloudEditorElement = {
  id: 'image-1',
  type: 'image',
  name: '商品图片',
  xMm: 38,
  yMm: 3,
  widthMm: 18,
  heightMm: 18,
  rotation: 0,
  groupId: 'group-1',
  presetInstanceId: 'preset-instance-1',
  sourcePresetId: 'preset-1',
  binding: {
    mode: 'fixed',
    fixedValue: 'asset://550e8400-e29b-41d4-a716-446655440000',
  },
  textStyle: {
    fontFamily: '微软雅黑',
    fontSize: 4,
    fontWeight: 400,
    italic: false,
    underline: false,
    align: 'left',
    color: '#000000',
    letterSpacing: 0,
    lineHeight: 1.2,
  },
};

function buildContent(overrides: Record<string, unknown> = {}) {
  return {
    format: 'label-print-cloud-document',
    version: 1,
    unit: 'mm',
    canvas: { widthMm: 60, heightMm: 40 },
    elements: [imageElement],
    ...overrides,
  };
}

describe('cloud label schema', () => {
  it('parses a versioned cloud document with asset references', () => {
    const result = parseCloudLabelContent(buildContent());

    expect(result).toMatchObject({
      format: 'label-print-cloud-document',
      version: 1,
      canvas: { widthMm: 60, heightMm: 40 },
    });
    expect(result.elements[0]?.binding).toMatchObject({
      fixedValue: 'asset://550e8400-e29b-41d4-a716-446655440000',
    });
    expect(result.elements[0]).toMatchObject({
      groupId: 'group-1',
      presetInstanceId: 'preset-instance-1',
      sourcePresetId: 'preset-1',
    });
  });

  it('rejects device state in cloud content', () => {
    expect(() => parseCloudLabelContent(buildContent({ printerId: 'Zebra-01' }))).toThrow();
  });

  it('requires barcode configuration for barcode elements', () => {
    const barcodeWithoutConfig = { ...imageElement, type: 'barcode' };
    expect(() => parseCloudLabelContent(buildContent({ elements: [barcodeWithoutConfig] }))).toThrow();
  });

  it('fails distinctly for a different format or a newer document version', () => {
    expect(() => parseCloudLabelContent(buildContent({ format: 'other-document' }))).toThrowError(
      expect.objectContaining<Partial<CloudLabelMigrationError>>({
        code: 'INVALID_DOCUMENT_FORMAT',
      }),
    );
    expect(() => parseCloudLabelContent(buildContent({ version: 2 }))).toThrowError(
      expect.objectContaining<Partial<CloudLabelMigrationError>>({
        code: 'UNSUPPORTED_DOCUMENT_VERSION',
      }),
    );
  });
});

describe('cloud/snapshot conversion', () => {
  const deviceSettings: DeviceSettings = {
    calibration: { offsetX: 0.4, offsetY: -0.2, scale: 1.05 },
    printerId: 'Zebra-01',
    copies: 3,
  };

  const snapshot: TemplateSnapshot = {
    title: '食品标签',
    labelSize: { widthMm: 60, heightMm: 40 },
    elements: [imageElement],
    ...deviceSettings,
  };

  it('never uploads names or printer-specific fields', () => {
    const cloud = toCloudLabelContent(snapshot);

    expect(cloud).toEqual(buildContent());
    expect(cloud).not.toHaveProperty('title');
    expect(cloud).not.toHaveProperty('calibration');
    expect(cloud).not.toHaveProperty('printerId');
    expect(cloud).not.toHaveProperty('copies');
  });

  it('restores local settings and does not share mutable element objects', () => {
    const cloud = toCloudLabelContent(snapshot);
    const restored = toTemplateSnapshot(cloud, deviceSettings);

    expect(restored).toMatchObject({
      labelSize: snapshot.labelSize,
      elements: snapshot.elements,
      ...deviceSettings,
    });
    expect(restored.elements).not.toBe(cloud.elements);
    expect(restored.elements[0]).not.toBe(cloud.elements[0]);
  });
});
