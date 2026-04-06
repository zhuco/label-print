import { createDefaultBinding } from "./binding";
import type {
  BarcodeConfig,
  BarcodeElement,
  ContentBinding,
  IconElement,
  ImageElement,
  PrintDirection,
  QrcodeElement,
  ShapeElement,
  TextElement,
  TextStyle,
} from "./types";

const DEFAULT_TEXT_STYLE: TextStyle = {
  fontFamily: "Microsoft YaHei",
  fontSize: 6,
  fontWeight: 400,
  italic: false,
  underline: false,
  strikeThrough: false,
  align: "left",
  color: "#101828",
  letterSpacing: 0,
  lineHeight: 1.2,
  wrapMode: "auto",
};

const DEFAULT_BARCODE_CONFIG: BarcodeConfig = {
  symbology: "CODE128",
  moduleWidth: 0.33,
  textPosition: "bottom",
  textGap: 0.6,
  quietZone: 1,
  checksumEnabled: true,
  minHeight: 8,
  direction: "normal",
};

type BaseInit = {
  id: string;
  name?: string;
  xMm?: number;
  yMm?: number;
  widthMm?: number;
  heightMm?: number;
  rotation?: number;
  binding?: ContentBinding;
  textStyle?: Partial<TextStyle>;
};

type BarcodeElementInit = BaseInit & {
  barcode?: Partial<BarcodeConfig>;
};

function createBase(init: BaseInit) {
  return {
    id: init.id,
    xMm: init.xMm ?? 5,
    yMm: init.yMm ?? 5,
    widthMm: init.widthMm ?? 20,
    heightMm: init.heightMm ?? 8,
    rotation: init.rotation ?? 0,
    binding: init.binding ?? createDefaultBinding(),
    textStyle: {
      ...DEFAULT_TEXT_STYLE,
      ...init.textStyle,
    },
  };
}

export function createTextElement(init: BaseInit): TextElement {
  const base = createBase({
    ...init,
    widthMm: init.widthMm ?? 20,
    heightMm: init.heightMm ?? 6,
  });
  return {
    ...base,
    type: "text",
    name: init.name ?? "文本",
  };
}

export function createBarcodeElement(init: BarcodeElementInit): BarcodeElement {
  const base = createBase({
    ...init,
    yMm: init.yMm ?? 12,
    widthMm: init.widthMm ?? 28,
    heightMm: init.heightMm ?? 12,
    binding:
      init.binding ??
      ({
        mode: "fixed",
        fixedValue: "123456789",
      } satisfies ContentBinding),
    textStyle: {
      ...DEFAULT_TEXT_STYLE,
      align: "center",
      ...init.textStyle,
    },
  });

  return {
    ...base,
    type: "barcode",
    name: init.name ?? "条码",
    barcode: {
      ...DEFAULT_BARCODE_CONFIG,
      ...init.barcode,
      direction: (init.barcode?.direction as PrintDirection | undefined) ?? DEFAULT_BARCODE_CONFIG.direction,
    },
  };
}

export function createImageElement(init: BaseInit): ImageElement {
  const base = createBase({
    ...init,
    widthMm: init.widthMm ?? 24,
    heightMm: init.heightMm ?? 16,
    binding:
      init.binding ??
      ({
        mode: "fixed",
        fixedValue: "图片",
      } satisfies ContentBinding),
  });
  return {
    ...base,
    type: "image",
    name: init.name ?? "图片",
  };
}

export function createQrcodeElement(init: BaseInit): QrcodeElement {
  const base = createBase({
    ...init,
    widthMm: init.widthMm ?? 16,
    heightMm: init.heightMm ?? 16,
    binding:
      init.binding ??
      ({
        mode: "fixed",
        fixedValue: "https://label.local",
      } satisfies ContentBinding),
    textStyle: {
      ...DEFAULT_TEXT_STYLE,
      align: "center",
      ...init.textStyle,
    },
  });
  return {
    ...base,
    type: "qrcode",
    name: init.name ?? "二维码",
  };
}

export function createShapeElement(init: BaseInit): ShapeElement {
  const base = createBase({
    ...init,
    widthMm: init.widthMm ?? 22,
    heightMm: init.heightMm ?? 12,
    binding:
      init.binding ??
      ({
        mode: "fixed",
        fixedValue: "矩形",
      } satisfies ContentBinding),
    textStyle: {
      ...DEFAULT_TEXT_STYLE,
      align: "center",
      color: "#2a6fa8",
      ...init.textStyle,
    },
  });
  return {
    ...base,
    type: "shape",
    name: init.name ?? "图形",
  };
}

export function createIconElement(init: BaseInit): IconElement {
  const base = createBase({
    ...init,
    widthMm: init.widthMm ?? 12,
    heightMm: init.heightMm ?? 12,
    binding:
      init.binding ??
      ({
        mode: "fixed",
        fixedValue: "@",
      } satisfies ContentBinding),
    textStyle: {
      ...DEFAULT_TEXT_STYLE,
      align: "center",
      fontWeight: 700,
      ...init.textStyle,
    },
  });
  return {
    ...base,
    type: "icon",
    name: init.name ?? "图标",
  };
}
