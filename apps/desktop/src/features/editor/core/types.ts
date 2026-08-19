export type ElementType = "text" | "barcode" | "image" | "qrcode" | "shape" | "icon";

export const BARCODE_SYMBOLOGIES = [
  "CODE128",
  "CODE128A",
  "CODE128B",
  "CODE128C",
  "CODE39",
  "CODE93",
  "EAN2",
  "EAN5",
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

export type BindingMode = "fixed" | "column" | "expression" | "datetime";

export type DateTimeSource = "fixed" | "printTime";

export type ContentBinding = {
  mode: BindingMode;
  fixedValue?: string;
  column?: string;
  expression?: string;
  /** Source used only when mode is datetime. */
  dateTimeSource?: DateTimeSource;
  /** Display pattern, for example YYYY-MM-DD or YYYY-MM-DD HH:mm:ss. */
  dateTimeFormat?: string;
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
  strikeThrough?: boolean;
  align: "left" | "center" | "right";
  color: string;
  strokeWidth?: number;
  strokeColor?: string;
  fillColor?: string;
  strokeOpacity?: number;
  fillOpacity?: number;
  strokeLineCap?: "butt" | "round" | "square";
  strokeLineJoin?: "miter" | "round" | "bevel";
  strokeDashArray?: number[] | string;
  strokeDashOffset?: number;
  strokeMiterLimit?: number;
  fillRule?: "nonzero" | "evenodd";
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
  /** Persistent canvas group. Elements with the same id act as one component. */
  groupId?: string;
  /** Identifies one insertion of a reusable custom graphic. */
  presetInstanceId?: string;
  /** The custom-graphic definition from which this element was inserted. */
  sourcePresetId?: string;
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
