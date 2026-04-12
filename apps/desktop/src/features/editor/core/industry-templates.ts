import {
  createBarcodeElement,
  createIconElement,
  createQrcodeElement,
  createShapeElement,
  createTextElement,
} from "./model";
import type { EditorElement, LabelSize, TextStyle } from "./types";
import { getIconPreset, getShapePreset, toIconPresetBindingValue, toShapePresetBindingValue } from "./visual-presets";

type IndustryTemplateElementType = "text" | "barcode" | "qrcode" | "shape" | "icon";

type BuilderContext = {
  labelSize: LabelSize;
  nextElementId: (type: IndustryTemplateElementType) => string;
};

type RectRatio = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type RectMm = {
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
};

type TextSpec = {
  value: string;
  rect: RectRatio;
  name?: string;
  style?: Partial<TextStyle>;
  maxFontSizeMm?: number;
};

type BarcodeSpec = {
  value: string;
  rect: RectRatio;
  name?: string;
};

type QrcodeSpec = {
  value: string;
  rect: RectRatio;
  name?: string;
};

type ShapeSpec = {
  presetId: string;
  rect: RectRatio;
  name?: string;
  color?: string;
};

type IconSpec = {
  presetId: string;
  rect: RectRatio;
  name?: string;
  color?: string;
};

export type IndustryTemplate = {
  id: string;
  label: string;
  category: string;
  description: string;
  iconPresetId: string;
};

const MIN_ELEMENT_SIZE_MM = 2.5;

const FOOD_DDL_REFERENCE_LABEL_SIZE: LabelSize = {
  widthMm: 60,
  heightMm: 40,
};

// 来自 docs/text.ddl，保留“左侧食品信息 + 右侧营养成分表”双栏结构。
// 需要微调时，优先改这组常量中的文本与坐标（单位 mm，基准标签 60x40）。
const FOOD_DDL_TEMPLATE_SPEC = {
  leftInfo: {
    rect: { xMm: 2.03285, yMm: 1.62938, widthMm: 25.95269, heightMm: 36.51253 } satisfies RectMm,
    fontSizeMm: 4.5,
    fontFamily: "宋体",
    value: [
      "品名:芝麻花生牛皮糖",
      "产品类型:淀粉型凝胶糖果",
      "加工方式:冷加工",
      "配料:白砂糖、麦芽糖浆、食用玉米淀粉、花生仁、芝麻、桔丁、饮用水、食品添加剂(柠檬酸、食用香精)",
      "净含量:480g",
      "产品标准代号:SB/T 10021",
      "食品生产许可证号:SC11343010500060",
      "保质期:180天",
      "储存方法:请存放于阴凉干燥处,避免日晒、高温或潮湿。",
      "食用方法:开袋即食(开封后尽快食用)",
      "温馨提示:如万一在保质期内出现质量问题,可与以下电话联系我们!",
      "产地:湖南 长沙",
      "生产商:长沙溢华斋食品有限公司",
      "地址:长沙市开福区中青路1318号佳海工业园B14幢501房",
      "服务电话:19173609006",
      "生产日期:见内包装",
    ].join("\n"),
  },
  nutritionTitle: {
    rect: { xMm: 39.83535, yMm: 3.18552, widthMm: 6.82427, heightMm: 1.58762 } satisfies RectMm,
    fontSizeMm: 4,
    fontFamily: "微软雅黑",
    value: "营养成分表",
  },
  nutritionTableFrame: {
    rect: { xMm: 31.96133, yMm: 5.75771, widthMm: 23.41219, heightMm: 9.97387 } satisfies RectMm,
    presetId: "rectangle",
    color: "#1f2934",
  },
  nutritionBody: {
    rect: { xMm: 32.32878, yMm: 5.60023, widthMm: 23.14973, heightMm: 9.52511 } satisfies RectMm,
    fontSizeMm: 4,
    fontFamily: "微软雅黑",
    value: [
      "项目                       每100g                NRV%",
      "能量                1615千焦(kJ)           19%",
      "蛋白质                 3.5克(g)                   6%",
      "脂肪                     0克(g)                        0%",
      "碳水化合物      91.5克(g)              31%",
      "钠                       11毫克(mg)              1%",
    ].join("\n"),
  },
} as const;

export const INDUSTRY_TEMPLATES: IndustryTemplate[] = [
  {
    id: "food-label",
    label: "食品标签",
    category: "食品饮料",
    description: "常见食品标签，含品名、生产信息与追溯码。",
    iconPresetId: "apple",
  },
  {
    id: "apparel-tag",
    label: "服装吊牌",
    category: "服装鞋帽",
    description: "常见服装吊牌，含款号、尺码、价格与条码。",
    iconPresetId: "t-shirt",
  },
  {
    id: "logistics-waybill",
    label: "物流运单",
    category: "物流仓储",
    description: "物流分拣常用布局，含收发信息、条码与二维码。",
    iconPresetId: "truck",
  },
  {
    id: "food-info-nutrition-ddl",
    label: "食品信息+营养成分",
    category: "食品饮料",
    description: "来自 text.ddl 的双栏模板：左侧食品信息，右侧营养成分表。",
    iconPresetId: "clipboard",
  },
  {
    id: "retail-price",
    label: "零售价签",
    category: "零售门店",
    description: "门店货架价签，突出商品名与价格。",
    iconPresetId: "shopping-bag",
  },
  {
    id: "medical-tag",
    label: "医药标签",
    category: "医药健康",
    description: "药品与耗材标识，含批号、效期与追溯信息。",
    iconPresetId: "pills",
  },
  {
    id: "asset-tag",
    label: "资产标识",
    category: "通用资产",
    description: "设备资产管理标签，含资产编号与位置。",
    iconPresetId: "monitor",
  },
];

const industryTemplateMap = new Map(INDUSTRY_TEMPLATES.map((item) => [item.id, item]));

export function getIndustryTemplate(id: string): IndustryTemplate | null {
  return industryTemplateMap.get(id) ?? null;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function toRect(labelSize: LabelSize, rect: RectRatio) {
  const rawWidth = Math.max(labelSize.widthMm * rect.width, MIN_ELEMENT_SIZE_MM);
  const rawHeight = Math.max(labelSize.heightMm * rect.height, MIN_ELEMENT_SIZE_MM);
  const widthMm = round1(clamp(rawWidth, MIN_ELEMENT_SIZE_MM, labelSize.widthMm));
  const heightMm = round1(clamp(rawHeight, MIN_ELEMENT_SIZE_MM, labelSize.heightMm));
  const maxX = Math.max(0, labelSize.widthMm - widthMm);
  const maxY = Math.max(0, labelSize.heightMm - heightMm);
  return {
    xMm: round1(clamp(labelSize.widthMm * rect.x, 0, maxX)),
    yMm: round1(clamp(labelSize.heightMm * rect.y, 0, maxY)),
    widthMm,
    heightMm,
  };
}

function toRatioRectByReference(rect: RectMm, reference: LabelSize): RectRatio {
  return {
    x: rect.xMm / reference.widthMm,
    y: rect.yMm / reference.heightMm,
    width: rect.widthMm / reference.widthMm,
    height: rect.heightMm / reference.heightMm,
  };
}

function scaleFontByReference(labelSize: LabelSize, reference: LabelSize, referenceFontSizeMm: number): number {
  const scale = Math.min(labelSize.widthMm / reference.widthMm, labelSize.heightMm / reference.heightMm);
  return round1(clamp(referenceFontSizeMm * scale, 2, 14));
}

function calcTemplateFontSize(labelSize: LabelSize, heightMm: number, maxFontSizeMm?: number): number {
  const shortEdge = Math.min(labelSize.widthMm, labelSize.heightMm);
  const byEdge = shortEdge * 0.18;
  const byHeight = heightMm * 0.62;
  const upper = maxFontSizeMm ?? 10;
  return round1(clamp(Math.min(byEdge, byHeight), 2.4, upper));
}

function buildTextElement(context: BuilderContext, spec: TextSpec): EditorElement {
  const rect = toRect(context.labelSize, spec.rect);
  return createTextElement({
    id: context.nextElementId("text"),
    name: spec.name,
    ...rect,
    binding: {
      mode: "fixed",
      fixedValue: spec.value,
    },
    textStyle: {
      fontSize: calcTemplateFontSize(context.labelSize, rect.heightMm, spec.maxFontSizeMm),
      ...spec.style,
    },
  });
}

function buildBarcodeElement(context: BuilderContext, spec: BarcodeSpec): EditorElement {
  const rect = toRect(context.labelSize, spec.rect);
  return createBarcodeElement({
    id: context.nextElementId("barcode"),
    name: spec.name,
    ...rect,
    binding: {
      mode: "fixed",
      fixedValue: spec.value,
    },
    textStyle: {
      fontSize: calcTemplateFontSize(context.labelSize, rect.heightMm, 4.6),
      align: "center",
    },
    barcode: {
      minHeight: Math.max(4, round1(rect.heightMm * 0.62)),
      textPosition: "bottom",
    },
  });
}

function buildQrcodeElement(context: BuilderContext, spec: QrcodeSpec): EditorElement {
  const rect = toRect(context.labelSize, spec.rect);
  return createQrcodeElement({
    id: context.nextElementId("qrcode"),
    name: spec.name,
    ...rect,
    binding: {
      mode: "fixed",
      fixedValue: spec.value,
    },
  });
}

function buildShapeElement(context: BuilderContext, spec: ShapeSpec): EditorElement {
  const rect = toRect(context.labelSize, spec.rect);
  const preset = getShapePreset(spec.presetId);
  return createShapeElement({
    id: context.nextElementId("shape"),
    name: spec.name ?? preset?.label,
    ...rect,
    binding: preset
      ? {
          mode: "fixed",
          fixedValue: toShapePresetBindingValue(spec.presetId),
        }
      : undefined,
    textStyle: spec.color
      ? {
          color: spec.color,
        }
      : undefined,
  });
}

function buildIconElement(context: BuilderContext, spec: IconSpec): EditorElement {
  const rect = toRect(context.labelSize, spec.rect);
  const preset = getIconPreset(spec.presetId);
  return createIconElement({
    id: context.nextElementId("icon"),
    name: spec.name ?? preset?.label,
    ...rect,
    binding: preset
      ? {
          mode: "fixed",
          fixedValue: toIconPresetBindingValue(spec.presetId),
        }
      : undefined,
    textStyle: spec.color
      ? {
          color: spec.color,
        }
      : undefined,
  });
}

function buildFoodLabel(context: BuilderContext): EditorElement[] {
  return [
    buildIconElement(context, {
      presetId: "apple",
      rect: { x: 0.04, y: 0.06, width: 0.12, height: 0.16 },
      color: "#246d3f",
    }),
    buildTextElement(context, {
      value: "食品标签",
      rect: { x: 0.18, y: 0.06, width: 0.46, height: 0.12 },
      style: {
        fontWeight: 700,
      },
      maxFontSizeMm: 6.2,
    }),
    buildTextElement(context, {
      value: "生产: 2026-04-07",
      rect: { x: 0.66, y: 0.08, width: 0.30, height: 0.1 },
      style: {
        align: "right",
      },
      maxFontSizeMm: 3.8,
    }),
    buildTextElement(context, {
      value: "品名: 鲜牛乳吐司",
      rect: { x: 0.04, y: 0.24, width: 0.70, height: 0.12 },
      maxFontSizeMm: 5.1,
    }),
    buildQrcodeElement(context, {
      value: "https://label.example/food/SKU-1001",
      rect: { x: 0.76, y: 0.22, width: 0.20, height: 0.30 },
      name: "食品追溯码",
    }),
    buildBarcodeElement(context, {
      value: "6901234567892",
      rect: { x: 0.04, y: 0.58, width: 0.92, height: 0.30 },
      name: "食品条码",
    }),
  ];
}

function buildApparelTag(context: BuilderContext): EditorElement[] {
  return [
    buildIconElement(context, {
      presetId: "t-shirt",
      rect: { x: 0.05, y: 0.06, width: 0.13, height: 0.18 },
      color: "#2c4f91",
    }),
    buildTextElement(context, {
      value: "服装吊牌",
      rect: { x: 0.22, y: 0.07, width: 0.48, height: 0.11 },
      style: {
        fontWeight: 700,
      },
      maxFontSizeMm: 5.8,
    }),
    buildTextElement(context, {
      value: "款号: ST-2026",
      rect: { x: 0.05, y: 0.24, width: 0.58, height: 0.11 },
      maxFontSizeMm: 4.6,
    }),
    buildTextElement(context, {
      value: "尺码: L    颜色: 黑",
      rect: { x: 0.05, y: 0.36, width: 0.58, height: 0.11 },
      maxFontSizeMm: 4.6,
    }),
    buildTextElement(context, {
      value: "¥199.00",
      rect: { x: 0.68, y: 0.22, width: 0.27, height: 0.21 },
      style: {
        align: "right",
        fontWeight: 700,
        color: "#8a1f11",
      },
      maxFontSizeMm: 6.8,
    }),
    buildBarcodeElement(context, {
      value: "8801234567001",
      rect: { x: 0.05, y: 0.56, width: 0.90, height: 0.30 },
      name: "服装商品码",
    }),
  ];
}

function buildLogisticsWaybill(context: BuilderContext): EditorElement[] {
  return [
    buildIconElement(context, {
      presetId: "package",
      rect: { x: 0.04, y: 0.05, width: 0.11, height: 0.14 },
      color: "#355f86",
    }),
    buildTextElement(context, {
      value: "物流运单",
      rect: { x: 0.17, y: 0.06, width: 0.44, height: 0.10 },
      style: {
        fontWeight: 700,
      },
      maxFontSizeMm: 5.6,
    }),
    buildTextElement(context, {
      value: "收件: 上海仓 A-12",
      rect: { x: 0.04, y: 0.22, width: 0.60, height: 0.10 },
      maxFontSizeMm: 4.2,
    }),
    buildTextElement(context, {
      value: "发件: 苏州分拨中心",
      rect: { x: 0.04, y: 0.33, width: 0.60, height: 0.10 },
      maxFontSizeMm: 4.2,
    }),
    buildQrcodeElement(context, {
      value: "https://label.example/logistics/LP20260407001",
      rect: { x: 0.70, y: 0.22, width: 0.26, height: 0.44 },
      name: "物流二维码",
    }),
    buildBarcodeElement(context, {
      value: "LP20260407001",
      rect: { x: 0.04, y: 0.70, width: 0.62, height: 0.22 },
      name: "物流单号条码",
    }),
    buildIconElement(context, {
      presetId: "truck",
      rect: { x: 0.70, y: 0.70, width: 0.26, height: 0.20 },
      color: "#2f5f96",
    }),
  ];
}

function buildFoodInfoNutritionFromDdl(context: BuilderContext): EditorElement[] {
  const leftInfoRect = toRatioRectByReference(FOOD_DDL_TEMPLATE_SPEC.leftInfo.rect, FOOD_DDL_REFERENCE_LABEL_SIZE);
  const nutritionTitleRect = toRatioRectByReference(
    FOOD_DDL_TEMPLATE_SPEC.nutritionTitle.rect,
    FOOD_DDL_REFERENCE_LABEL_SIZE
  );
  const nutritionFrameRect = toRatioRectByReference(
    FOOD_DDL_TEMPLATE_SPEC.nutritionTableFrame.rect,
    FOOD_DDL_REFERENCE_LABEL_SIZE
  );
  const nutritionBodyRect = toRatioRectByReference(
    FOOD_DDL_TEMPLATE_SPEC.nutritionBody.rect,
    FOOD_DDL_REFERENCE_LABEL_SIZE
  );

  return [
    buildTextElement(context, {
      name: "食品信息",
      value: FOOD_DDL_TEMPLATE_SPEC.leftInfo.value,
      rect: leftInfoRect,
      style: {
        fontFamily: FOOD_DDL_TEMPLATE_SPEC.leftInfo.fontFamily,
        fontSize: scaleFontByReference(
          context.labelSize,
          FOOD_DDL_REFERENCE_LABEL_SIZE,
          FOOD_DDL_TEMPLATE_SPEC.leftInfo.fontSizeMm
        ),
        lineHeight: 1.22,
        wrapMode: "auto",
      },
    }),
    buildShapeElement(context, {
      name: "营养成分表边框",
      presetId: FOOD_DDL_TEMPLATE_SPEC.nutritionTableFrame.presetId,
      rect: nutritionFrameRect,
      color: FOOD_DDL_TEMPLATE_SPEC.nutritionTableFrame.color,
    }),
    buildTextElement(context, {
      name: "营养成分表标题",
      value: FOOD_DDL_TEMPLATE_SPEC.nutritionTitle.value,
      rect: nutritionTitleRect,
      style: {
        fontFamily: FOOD_DDL_TEMPLATE_SPEC.nutritionTitle.fontFamily,
        fontWeight: 700,
        fontSize: scaleFontByReference(
          context.labelSize,
          FOOD_DDL_REFERENCE_LABEL_SIZE,
          FOOD_DDL_TEMPLATE_SPEC.nutritionTitle.fontSizeMm
        ),
        align: "center",
      },
    }),
    buildTextElement(context, {
      name: "营养成分表",
      value: FOOD_DDL_TEMPLATE_SPEC.nutritionBody.value,
      rect: nutritionBodyRect,
      style: {
        fontFamily: FOOD_DDL_TEMPLATE_SPEC.nutritionBody.fontFamily,
        fontSize: scaleFontByReference(
          context.labelSize,
          FOOD_DDL_REFERENCE_LABEL_SIZE,
          FOOD_DDL_TEMPLATE_SPEC.nutritionBody.fontSizeMm
        ),
        lineHeight: 1.18,
        wrapMode: "auto",
      },
    }),
  ];
}

function buildRetailPrice(context: BuilderContext): EditorElement[] {
  return [
    buildShapeElement(context, {
      presetId: "tag",
      rect: { x: 0.03, y: 0.06, width: 0.94, height: 0.86 },
      color: "#2a6fa8",
    }),
    buildIconElement(context, {
      presetId: "shopping-bag",
      rect: { x: 0.06, y: 0.12, width: 0.10, height: 0.13 },
      color: "#3d5f7d",
    }),
    buildTextElement(context, {
      value: "零售价签",
      rect: { x: 0.18, y: 0.12, width: 0.44, height: 0.10 },
      style: {
        fontWeight: 700,
      },
      maxFontSizeMm: 5.2,
    }),
    buildTextElement(context, {
      value: "精选燕麦脆片 500g",
      rect: { x: 0.06, y: 0.30, width: 0.62, height: 0.11 },
      maxFontSizeMm: 4.3,
    }),
    buildTextElement(context, {
      value: "¥39.90",
      rect: { x: 0.06, y: 0.42, width: 0.62, height: 0.24 },
      style: {
        fontWeight: 700,
        color: "#90251a",
      },
      maxFontSizeMm: 8.2,
    }),
    buildQrcodeElement(context, {
      value: "https://label.example/retail/sku-39-90",
      rect: { x: 0.72, y: 0.30, width: 0.22, height: 0.34 },
      name: "商品二维码",
    }),
    buildBarcodeElement(context, {
      value: "6971023456780",
      rect: { x: 0.06, y: 0.70, width: 0.88, height: 0.18 },
      name: "商品条码",
    }),
  ];
}

function buildMedicalTag(context: BuilderContext): EditorElement[] {
  return [
    buildIconElement(context, {
      presetId: "pills",
      rect: { x: 0.05, y: 0.07, width: 0.11, height: 0.14 },
      color: "#2d6d7c",
    }),
    buildTextElement(context, {
      value: "医药标签",
      rect: { x: 0.18, y: 0.07, width: 0.36, height: 0.1 },
      style: {
        fontWeight: 700,
      },
      maxFontSizeMm: 5.3,
    }),
    buildTextElement(context, {
      value: "批号: A2407",
      rect: { x: 0.05, y: 0.24, width: 0.52, height: 0.10 },
      maxFontSizeMm: 4.2,
    }),
    buildTextElement(context, {
      value: "效期: 2028-12",
      rect: { x: 0.05, y: 0.35, width: 0.52, height: 0.10 },
      maxFontSizeMm: 4.2,
    }),
    buildIconElement(context, {
      presetId: "first-aid",
      rect: { x: 0.72, y: 0.20, width: 0.22, height: 0.20 },
      color: "#b63a32",
    }),
    buildQrcodeElement(context, {
      value: "https://label.example/medical/A2407",
      rect: { x: 0.72, y: 0.43, width: 0.22, height: 0.28 },
      name: "药品追溯码",
    }),
    buildBarcodeElement(context, {
      value: "A2407-202812",
      rect: { x: 0.05, y: 0.64, width: 0.89, height: 0.23 },
      name: "医药批号条码",
    }),
  ];
}

function buildAssetTag(context: BuilderContext): EditorElement[] {
  return [
    buildIconElement(context, {
      presetId: "monitor",
      rect: { x: 0.05, y: 0.07, width: 0.11, height: 0.14 },
      color: "#355f86",
    }),
    buildTextElement(context, {
      value: "资产标识",
      rect: { x: 0.18, y: 0.07, width: 0.38, height: 0.1 },
      style: {
        fontWeight: 700,
      },
      maxFontSizeMm: 5.3,
    }),
    buildTextElement(context, {
      value: "编号: AST-2026-0038",
      rect: { x: 0.05, y: 0.26, width: 0.62, height: 0.11 },
      maxFontSizeMm: 4.4,
    }),
    buildTextElement(context, {
      value: "位置: 三楼机房 C2",
      rect: { x: 0.05, y: 0.38, width: 0.62, height: 0.11 },
      maxFontSizeMm: 4.4,
    }),
    buildQrcodeElement(context, {
      value: "https://label.example/assets/AST-2026-0038",
      rect: { x: 0.72, y: 0.24, width: 0.22, height: 0.30 },
      name: "资产二维码",
    }),
    buildBarcodeElement(context, {
      value: "AST20260038",
      rect: { x: 0.05, y: 0.64, width: 0.89, height: 0.24 },
      name: "资产条码",
    }),
  ];
}

const industryTemplateBuilders: Record<string, (context: BuilderContext) => EditorElement[]> = {
  "food-label": buildFoodLabel,
  "food-info-nutrition-ddl": buildFoodInfoNutritionFromDdl,
  "apparel-tag": buildApparelTag,
  "logistics-waybill": buildLogisticsWaybill,
  "retail-price": buildRetailPrice,
  "medical-tag": buildMedicalTag,
  "asset-tag": buildAssetTag,
};

export function buildIndustryTemplateElements(
  templateId: string,
  labelSize: LabelSize,
  nextElementId: BuilderContext["nextElementId"]
): EditorElement[] {
  const builder = industryTemplateBuilders[templateId];
  if (!builder) {
    return [];
  }
  return builder({
    labelSize,
    nextElementId,
  });
}
