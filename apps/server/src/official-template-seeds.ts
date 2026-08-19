import type { CloudStore } from "./cloud-store.js";
import type { CloudLabelContentV1, OfficialTemplate } from "./types.js";

const textStyle = {
  fontFamily: "Microsoft YaHei", fontSize: 3.2, fontWeight: 400, italic: false, underline: false,
  align: "left" as const, color: "#111827", letterSpacing: 0, lineHeight: 1.2,
};

function text(id: string, name: string, value: string, xMm: number, yMm: number, widthMm: number, heightMm: number, emphasis = false) {
  return {
    id, type: "text" as const, name, xMm, yMm, widthMm, heightMm, rotation: 0,
    binding: { mode: "fixed" as const, fixedValue: value },
    textStyle: { ...textStyle, fontWeight: emphasis ? 700 : 400, fontSize: emphasis ? 4.5 : 3.2 },
  };
}

function barcode(id: string, value: string) {
  return {
    id, type: "barcode" as const, name: "条码", xMm: 3, yMm: 27, widthMm: 54, heightMm: 10, rotation: 0,
    binding: { mode: "fixed" as const, fixedValue: value }, textStyle: { ...textStyle, align: "center" as const, fontSize: 2.8 },
    barcode: { symbology: "CODE128", moduleWidth: 0.3, textPosition: "bottom" as const, textGap: 1, quietZone: 1, checksumEnabled: true, minHeight: 6, direction: "normal" as const },
  };
}

function content(title: string, fields: string[], code: string): CloudLabelContentV1 {
  return {
    format: "label-print-cloud-document", version: 1, unit: "mm", canvas: { widthMm: 60, heightMm: 40 },
    elements: [
      text("title", "标题", title, 3, 3, 54, 5, true),
      ...fields.map((field, index) => text(`field-${index + 1}`, `字段 ${index + 1}`, field, 3, 10 + index * 4, 54, 3.5)),
      barcode("barcode", code),
    ],
  };
}

const createdAt = "2026-08-05T00:00:00.000Z";

export const BUILT_IN_OFFICIAL_TEMPLATES: OfficialTemplate[] = [
  { id: "a3e5c310-7ca6-48a0-949a-000000000001", code: "food-label", name: "食品标签", description: "含品名、日期与追溯条码的食品标签。", category: "食品饮料", requiredPlan: "free", schemaVersion: 1, content: content("食品标签", ["品名：鲜牛乳吐司", "生产日期：2026-08-05", "保质期：7 天", "储存：冷藏保存"], "6901234567892"), previewUrl: null, enabled: true, sortOrder: 10, createdAt, updatedAt: createdAt },
  { id: "a3e5c310-7ca6-48a0-949a-000000000002", code: "apparel-tag", name: "服装吊牌", description: "包含款号、尺码、颜色和商品条码。", category: "服装鞋帽", requiredPlan: "free", schemaVersion: 1, content: content("服装吊牌", ["款号：ST-2026", "尺码：L", "颜色：黑色", "价格：¥199.00"], "8801234567001"), previewUrl: null, enabled: true, sortOrder: 20, createdAt, updatedAt: createdAt },
  { id: "a3e5c310-7ca6-48a0-949a-000000000003", code: "logistics-waybill", name: "物流运单", description: "适合仓储、分拣和寄件信息标识。", category: "物流仓储", requiredPlan: "free", schemaVersion: 1, content: content("物流运单", ["收件：上海仓 A-12", "发件：苏州分拨中心", "单号：LP20260805001", "备注：易碎品"], "LP20260805001"), previewUrl: null, enabled: true, sortOrder: 30, createdAt, updatedAt: createdAt },
  { id: "a3e5c310-7ca6-48a0-949a-000000000004", code: "retail-price", name: "零售价签", description: "突出商品名称、规格和零售价。", category: "零售门店", requiredPlan: "free", schemaVersion: 1, content: content("零售价签", ["商品：精品咖啡豆", "规格：250g", "零售价：¥68.00", "会员价：¥59.00"], "RT20260805001"), previewUrl: null, enabled: true, sortOrder: 40, createdAt, updatedAt: createdAt },
  { id: "a3e5c310-7ca6-48a0-949a-000000000005", code: "food-info-nutrition", name: "食品信息与营养成分", description: "食品信息和营养标识的专业布局。", category: "食品饮料", requiredPlan: "pro", schemaVersion: 1, content: content("食品信息与营养成分", ["品名：芝麻花生牛皮糖", "净含量：480g", "能量：1615kJ / 100g", "蛋白质：3.5g / 100g"], "FOOD20260805001"), previewUrl: null, enabled: true, sortOrder: 50, createdAt, updatedAt: createdAt },
  { id: "a3e5c310-7ca6-48a0-949a-000000000006", code: "medical-tag", name: "医药标签", description: "用于药品、耗材的批号、效期与追溯标识。", category: "医药健康", requiredPlan: "pro", schemaVersion: 1, content: content("医药标签", ["品名：无菌敷料", "批号：MED-20260805", "有效期：2028-08", "储存：阴凉干燥处"], "MED20260805001"), previewUrl: null, enabled: true, sortOrder: 60, createdAt, updatedAt: createdAt },
  { id: "a3e5c310-7ca6-48a0-949a-000000000007", code: "asset-tag", name: "资产标识", description: "设备资产编号、位置与追溯信息。", category: "通用资产", requiredPlan: "pro", schemaVersion: 1, content: content("资产标识", ["资产编号：AST-2026-0038", "位置：三楼机房 C2", "负责人：运维组", "状态：在用"], "AST20260038"), previewUrl: null, enabled: true, sortOrder: 70, createdAt, updatedAt: createdAt },
];

/** Seeds only an empty catalog, so production edits are never overwritten on restart. */
export async function seedBuiltInOfficialTemplates(store: CloudStore): Promise<void> {
  if ((await store.listOfficialTemplates()).length > 0) return;
  for (const template of BUILT_IN_OFFICIAL_TEMPLATES) await store.addOfficialTemplate(template);
}
