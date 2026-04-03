export type ElementType = "text" | "barcode" | "image" | "qrcode" | "shape" | "icon";

export const BARCODE_SYMBOLOGIES = [
  "CODE128",
  "CODE39",
  "CODE93",
  "EAN13",
  "EAN8",
  "UPC",
  "UPCE",
  "ITF14",
  "ITF",
  "MSI",
  "MSI10",
  "MSI11",
  "MSI1010",
  "MSI1110",
  "codabar",
  "pharmacode",
] as const;

export type BarcodeSymbology = (typeof BARCODE_SYMBOLOGIES)[number];

export type BindingMode = "fixed" | "column" | "expression";

export type ContentBinding = {
  mode: BindingMode;
  fixedValue?: string;
  column?: string;
  expression?: string;
};

export type LabelSize = {
  widthMm: number;
  heightMm: number;
};

export type ElementRect = {
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
};

export type TextStyle = {
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  italic: boolean;
  underline: boolean;
  align: "left" | "center" | "right";
  color: string;
  letterSpacing: number;
  lineHeight: number;
  widthScale?: number;
  wrapMode?: "auto" | "singleLine";
};

export type BarcodeConfig = {
  symbology: BarcodeSymbology;
  moduleWidth: number;
  textPosition: "none" | "top" | "bottom";
  textGap: number;
  quietZone: number;
  checksumEnabled: boolean;
  minHeight: number;
  direction: PrintDirection;
};

export type PrintDirection = "normal" | "rotate90" | "rotate180" | "rotate270";

export type BaseElement = ElementRect & {
  id: string;
  type: ElementType;
  name: string;
  rotation: number;
};

export type BindableElement = BaseElement & {
  binding: ContentBinding;
  textStyle: TextStyle;
};

export type TextElement = BindableElement & {
  type: "text";
};

export type BarcodeElement = BindableElement & {
  type: "barcode";
  barcode: BarcodeConfig;
};

export type ImageElement = BindableElement & {
  type: "image";
};

export type QrcodeElement = BindableElement & {
  type: "qrcode";
};

export type ShapeElement = BindableElement & {
  type: "shape";
};

export type IconElement = BindableElement & {
  type: "icon";
};

export type EditorElement =
  | TextElement
  | BarcodeElement
  | ImageElement
  | QrcodeElement
  | ShapeElement
  | IconElement;

export type SnapGuide = {
  axis: "x" | "y";
  value: number;
};

export type SnapResult = {
  xMm: number;
  yMm: number;
  guides: SnapGuide[];
};

export type AlignMode = "left" | "center" | "right" | "top" | "middle" | "bottom";
