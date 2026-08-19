import type { CSSProperties } from "react";
import {
  formatVisualDashArray,
  normalizeVisualDashArray,
  normalizeVisualDashOffset,
  normalizeVisualFillRule,
  normalizeVisualLineCap,
  normalizeVisualLineJoin,
  normalizeVisualMiterLimit,
  normalizeVisualOpacity,
  normalizeVisualStrokeWidth,
} from "./visual-style";

export type VisualPresetKind = "shape" | "icon";

export type VisualPreset = {
  id: string;
  label: string;
  category: string;
  markup: string;
};

type PresetInkBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const SHAPE_PREFIX = "shape:";
const ICON_PREFIX = "icon:";

export const SHAPE_PRESETS: VisualPreset[] = [
  {
    id: "rectangle",
    label: "矩形",
    category: "基础形状",
    markup: '<rect x="4" y="6" width="16" height="12" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  },
  {
    id: "rounded-rectangle",
    label: "圆角矩形",
    category: "基础形状",
    markup: '<rect x="4" y="6" width="16" height="12" rx="3" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  },
  {
    id: "capsule",
    label: "胶囊形",
    category: "基础形状",
    markup: '<rect x="3" y="7" width="18" height="10" rx="5" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  },
  {
    id: "circle",
    label: "圆形",
    category: "基础形状",
    markup: '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  },
  {
    id: "ellipse",
    label: "椭圆形",
    category: "基础形状",
    markup: '<ellipse cx="12" cy="12" rx="9" ry="6.5" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  },
  {
    id: "diamond",
    label: "菱形",
    category: "基础形状",
    markup: '<polygon points="12,4 20,12 12,20 4,12" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  },
  {
    id: "triangle",
    label: "三角形",
    category: "基础形状",
    markup: '<polygon points="12,4 20,19 4,19" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  },
  {
    id: "right-triangle",
    label: "直角三角形",
    category: "基础形状",
    markup: '<polygon points="5,5 19,19 5,19" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  },
  {
    id: "pentagon",
    label: "五边形",
    category: "多边形",
    markup: '<polygon points="12,4 20,10 17,20 7,20 4,10" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  },
  {
    id: "hexagon",
    label: "六边形",
    category: "多边形",
    markup: '<polygon points="7,4 17,4 21,12 17,20 7,20 3,12" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  },
  {
    id: "octagon",
    label: "八边形",
    category: "多边形",
    markup:
      '<polygon points="8,3 16,3 21,8 21,16 16,21 8,21 3,16 3,8" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  },
  {
    id: "parallelogram",
    label: "平行四边形",
    category: "多边形",
    markup: '<polygon points="7,5 21,5 17,19 3,19" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  },
  {
    id: "trapezoid",
    label: "梯形",
    category: "多边形",
    markup: '<polygon points="7,6 17,6 21,18 3,18" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  },
  {
    id: "star",
    label: "五角星",
    category: "复杂图形",
    markup:
      '<path d="M12 3.5l2.7 5.4 6 .9-4.3 4.2 1 6.1L12 17.2 6.6 20l1-6.1-4.3-4.2 6-.9z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  },
  {
    id: "heart",
    label: "爱心",
    category: "复杂图形",
    markup:
      '<path d="M12 20s-7-4.5-7-10a4 4 0 017-2.4A4 4 0 0119 10c0 5.5-7 10-7 10z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  },
  {
    id: "cloud",
    label: "云朵",
    category: "复杂图形",
    markup:
      '<path d="M7 18h10a3 3 0 10-.6-5.9A4.5 4.5 0 007.9 9.8 3.5 3.5 0 007 18z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  },
  {
    id: "ring",
    label: "圆环",
    category: "复杂图形",
    markup:
      '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  },
  {
    id: "cross",
    label: "十字形",
    category: "复杂图形",
    markup:
      '<path d="M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  },
  {
    id: "speech-bubble",
    label: "对话气泡",
    category: "标注气泡",
    markup:
      '<path d="M5 5h14v10H11l-4 4v-4H5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  },
  {
    id: "tag",
    label: "标签",
    category: "标注气泡",
    markup:
      '<path d="M3.5 10.5L10.5 3.5h7l3 3v7l-7 7z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="14.5" cy="7.5" r="1.2" fill="currentColor"/>',
  },
  {
    id: "flag",
    label: "旗帜",
    category: "标注气泡",
    markup:
      '<path d="M6 3v18M7 4h11l-2.8 4 2.8 4H7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  },
  {
    id: "arrow-right-block",
    label: "右箭头",
    category: "箭头指引",
    markup:
      '<path d="M4 8h9V5l7 7-7 7v-3H4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  },
  {
    id: "arrow-left-block",
    label: "左箭头",
    category: "箭头指引",
    markup:
      '<path d="M20 8h-9V5l-7 7 7 7v-3h9z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  },
  {
    id: "arrow-up-block",
    label: "上箭头",
    category: "箭头指引",
    markup:
      '<path d="M8 20v-9H5l7-7 7 7h-3v9z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  },
  {
    id: "arrow-down-block",
    label: "下箭头",
    category: "箭头指引",
    markup:
      '<path d="M8 4v9H5l7 7 7-7h-3V4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  },
  {
    id: "chevron-right",
    label: "右尖括号",
    category: "箭头指引",
    markup: '<polyline points="8,5 16,12 8,19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  },
  {
    id: "chevron-left",
    label: "左尖括号",
    category: "箭头指引",
    markup: '<polyline points="16,5 8,12 16,19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  },
  {
    id: "double-arrow-horizontal",
    label: "水平双箭头",
    category: "箭头指引",
    markup:
      '<path d="M5 12h14M9 8l-4 4 4 4M15 8l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  },
  {
    id: "double-arrow-vertical",
    label: "垂直双箭头",
    category: "箭头指引",
    markup:
      '<path d="M12 5v14M8 9l4-4 4 4M8 15l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  },
  {
    id: "semicircle",
    label: "半圆",
    category: "复杂图形",
    markup: '<path d="M4 16a8 8 0 0116 0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  },
  {
    id: "lightning",
    label: "闪电",
    category: "复杂图形",
    markup:
      '<path d="M13 3L6 13h5l-1 8 8-11h-5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  },
  {
    id: "flow-document",
    label: "流程文档",
    category: "流程图",
    markup:
      '<path d="M5 4h14v12H8l-3 3v-3z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  },
  {
    id: "flow-database",
    label: "流程数据库",
    category: "流程图",
    markup:
      '<ellipse cx="12" cy="6" rx="7" ry="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M5 6v10c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V6" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M5 11c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  },
  {
    id: "flow-delay",
    label: "流程延迟",
    category: "流程图",
    markup:
      '<path d="M5 6h8a6 6 0 010 12H5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  },
  {
    id: "corner-ribbon",
    label: "角标飘带",
    category: "标注气泡",
    markup:
      '<path d="M4 4h16v6H14l-2 2-2-2H4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  },
];

export const ICON_PRESETS: VisualPreset[] = [
  {
    id: "home",
    label: "主页",
    category: "常用",
    markup:
      '<path d="M4 11l8-7 8 7M7 10v10h10V10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  },
  {
    id: "user",
    label: "用户",
    category: "常用",
    markup:
      '<circle cx="12" cy="8" r="3.2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M5 19c1.7-3 4.1-4.5 7-4.5s5.3 1.5 7 4.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  },
  {
    id: "users",
    label: "用户组",
    category: "常用",
    markup:
      '<circle cx="9" cy="9" r="2.6" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="16" cy="10" r="2.2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M4.5 19c1.2-2.3 2.9-3.4 5-3.4 1.2 0 2.2.3 3.1.9M13.5 19c.7-1.5 1.9-2.2 3.3-2.2 1.2 0 2.3.5 3.2 1.7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
  },
  {
    id: "phone",
    label: "电话",
    category: "常用",
    markup:
      '<path d="M8 3h8v18H8zM11 18h2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  },
  {
    id: "mail",
    label: "邮件",
    category: "常用",
    markup:
      '<rect x="4" y="6" width="16" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M5 8l7 5 7-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  },
  {
    id: "calendar",
    label: "日历",
    category: "常用",
    markup:
      '<rect x="4" y="5" width="16" height="15" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8 3v4M16 3v4M4 9h16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  },
  {
    id: "clock",
    label: "时钟",
    category: "常用",
    markup:
      '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 7.5v5l3 2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  },
  {
    id: "map-pin",
    label: "地图定位",
    category: "常用",
    markup:
      '<path d="M12 20s6-5.5 6-10a6 6 0 10-12 0c0 4.5 6 10 6 10z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="12" cy="10" r="2" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  },
  {
    id: "search",
    label: "搜索",
    category: "常用",
    markup:
      '<circle cx="11" cy="11" r="6" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M16 16l4 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  },
  {
    id: "settings",
    label: "设置",
    category: "常用",
    markup:
      '<circle cx="12" cy="12" r="2.8" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 4v2M12 18v2M4 12h2M18 12h2M6.2 6.2l1.4 1.4M16.4 16.4l1.4 1.4M17.8 6.2l-1.4 1.4M7.6 16.4l-1.4 1.4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  },
  {
    id: "bell",
    label: "铃铛",
    category: "常用",
    markup:
      '<path d="M6 16h12l-1.2-1.6V10a4.8 4.8 0 10-9.6 0v4.4zM10 18a2 2 0 004 0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  },
  {
    id: "shield",
    label: "盾牌",
    category: "状态提示",
    markup:
      '<path d="M12 3l7 3v5c0 4.8-3 7.6-7 10-4-2.4-7-5.2-7-10V6z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  },
  {
    id: "lock",
    label: "锁定",
    category: "状态提示",
    markup:
      '<rect x="6" y="11" width="12" height="9" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8.5 11V8a3.5 3.5 0 117 0v3" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  },
  {
    id: "unlock",
    label: "解锁",
    category: "状态提示",
    markup:
      '<rect x="6" y="11" width="12" height="9" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8.5 11V8a3.5 3.5 0 016.8-1.2" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  },
  {
    id: "check-circle",
    label: "确认",
    category: "状态提示",
    markup:
      '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8.2 12.4l2.4 2.5 5.2-5.4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  },
  {
    id: "x-circle",
    label: "关闭",
    category: "状态提示",
    markup:
      '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M9 9l6 6M15 9l-6 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  },
  {
    id: "alert-triangle",
    label: "警告",
    category: "状态提示",
    markup:
      '<path d="M12 4l8 15H4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 9v4.5M12 16.5h.01" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  },
  {
    id: "info-circle",
    label: "信息",
    category: "状态提示",
    markup:
      '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 10.2v5M12 8h.01" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  },
  {
    id: "plus-circle",
    label: "添加",
    category: "状态提示",
    markup:
      '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 8v8M8 12h8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  },
  {
    id: "minus-circle",
    label: "减少",
    category: "状态提示",
    markup:
      '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8 12h8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  },
  {
    id: "play-circle",
    label: "播放",
    category: "状态提示",
    markup:
      '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M10 8.8l5.2 3.2-5.2 3.2z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  },
  {
    id: "pause-circle",
    label: "暂停",
    category: "状态提示",
    markup:
      '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M10 9v6M14 9v6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  },
  {
    id: "stop-circle",
    label: "停止",
    category: "状态提示",
    markup:
      '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="9.2" y="9.2" width="5.6" height="5.6" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  },
  {
    id: "refresh",
    label: "刷新",
    category: "操作交互",
    markup:
      '<path d="M18 8V4l3 3-3 3V6.9A6.2 6.2 0 106 18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  },
  {
    id: "download",
    label: "下载",
    category: "操作交互",
    markup:
      '<path d="M12 4v10M8.5 10.5L12 14l3.5-3.5M5 19h14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  },
  {
    id: "upload",
    label: "上传",
    category: "操作交互",
    markup:
      '<path d="M12 20V10M8.5 13.5L12 10l3.5 3.5M5 5h14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  },
  {
    id: "power",
    label: "电源",
    category: "设备打印",
    markup:
      '<path d="M12 4v8M7 6.5A7 7 0 1017 6.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  },
  {
    id: "wifi",
    label: "无线网络",
    category: "设备打印",
    markup:
      '<path d="M4 9a11 11 0 0116 0M7 12a7 7 0 0110 0M10 15a3 3 0 014 0M12 18h.01" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  },
  {
    id: "battery",
    label: "电池",
    category: "设备打印",
    markup:
      '<rect x="4" y="8" width="15" height="8" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="19.5" y="10" width="1.8" height="4" rx="1" fill="currentColor"/><rect x="6.5" y="10" width="8" height="4" fill="currentColor"/>',
  },
  {
    id: "printer",
    label: "打印机",
    category: "设备打印",
    markup:
      '<path d="M7 8V4h10v4M6 15h12v5H6zM4 9h16v6H4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="17" cy="12" r="1" fill="currentColor"/>',
  },
  {
    id: "barcode",
    label: "条码",
    category: "设备打印",
    markup:
      '<rect x="4" y="5" width="1.3" height="14" fill="currentColor"/><rect x="6.5" y="5" width="2.2" height="14" fill="currentColor"/><rect x="10.5" y="5" width="1" height="14" fill="currentColor"/><rect x="13" y="5" width="2.8" height="14" fill="currentColor"/><rect x="17.2" y="5" width="1.1" height="14" fill="currentColor"/><rect x="19.5" y="5" width="1.5" height="14" fill="currentColor"/>',
  },
  {
    id: "qrcode",
    label: "二维码",
    category: "设备打印",
    markup:
      '<rect x="4" y="4" width="6" height="6" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="14" y="4" width="6" height="6" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="4" y="14" width="6" height="6" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="14" y="14" width="2" height="2" fill="currentColor"/><rect x="18" y="14" width="2" height="2" fill="currentColor"/><rect x="16" y="18" width="4" height="2" fill="currentColor"/>',
  },
  {
    id: "package",
    label: "包裹",
    category: "物流仓储",
    markup:
      '<path d="M4 8l8-4 8 4-8 4zM4 8v8l8 4 8-4V8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  },
  {
    id: "truck",
    label: "货车",
    category: "物流仓储",
    markup:
      '<path d="M4 8h10v7H4zM14 10h3l3 3v2h-6z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="8" cy="17" r="1.7" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="17" cy="17" r="1.7" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  },
  {
    id: "shopping-cart",
    label: "购物车",
    category: "物流仓储",
    markup:
      '<path d="M4 6h2l2 9h9l2-6H8M10 18a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zm8 0a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  },
  {
    id: "tag",
    label: "标签",
    category: "物流仓储",
    markup:
      '<path d="M3.5 10.5L10.5 3.5h7l3 3v7l-7 7z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="14.5" cy="7.5" r="1.2" fill="currentColor"/>',
  },
  {
    id: "star",
    label: "五角星",
    category: "标记符号",
    markup:
      '<path d="M12 3.8l2.5 5.1 5.6.8-4 3.9.9 5.7-5-2.6-5 2.6.9-5.7-4-3.9 5.6-.8z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  },
  {
    id: "heart",
    label: "爱心",
    category: "标记符号",
    markup:
      '<path d="M12 20s-7-4.5-7-10a4 4 0 017-2.4A4 4 0 0119 10c0 5.5-7 10-7 10z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  },
  {
    id: "tool",
    label: "工具",
    category: "标记符号",
    markup:
      '<path d="M14.5 6.5A3.5 3.5 0 1110 10L4.5 15.5a1.4 1.4 0 000 2l2 2a1.4 1.4 0 002 0L14 14a3.5 3.5 0 01.5-7.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  },
  {
    id: "factory",
    label: "工厂",
    category: "标记符号",
    markup:
      '<path d="M4 20V9l5 3V9l5 3V6l6 3v11zM7 20v-3M11 20v-4M15 20v-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  },
  {
    id: "globe",
    label: "全球",
    category: "常用",
    markup:
      '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M4 12h16M12 4a12 12 0 010 16M12 4a12 12 0 000 16" fill="none" stroke="currentColor" stroke-width="1.6"/>',
  },
  {
    id: "link",
    label: "链接",
    category: "常用",
    markup:
      '<path d="M10 14l-2 2a3 3 0 104.2 4.2l2-2M14 10l2-2a3 3 0 10-4.2-4.2l-2 2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M9 15l6-6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  },
  {
    id: "bookmark",
    label: "书签",
    category: "常用",
    markup:
      '<path d="M7 4h10v16l-5-3-5 3z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  },
  {
    id: "clipboard",
    label: "剪贴板",
    category: "常用",
    markup:
      '<rect x="6" y="5" width="12" height="15" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="9" y="3" width="6" height="3" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  },
  {
    id: "question-circle",
    label: "问号",
    category: "状态提示",
    markup:
      '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M9.5 9.2a2.5 2.5 0 114.2 1.8c-.8.7-1.7 1.2-1.7 2.4M12 16.6h.01" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  },
  {
    id: "thumbs-up",
    label: "赞",
    category: "状态提示",
    markup:
      '<path d="M10 10l2-5h2v4h4a2 2 0 012 2l-1 6a2 2 0 01-2 2h-7zM6 10h3v9H6z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  },
  {
    id: "thumbs-down",
    label: "踩",
    category: "状态提示",
    markup:
      '<path d="M10 14l2 5h2v-4h4a2 2 0 002-2l-1-6a2 2 0 00-2-2h-7zM6 5h3v9H6z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  },
  {
    id: "sparkle",
    label: "闪光",
    category: "状态提示",
    markup:
      '<path d="M12 4l1.5 3.6L17 9l-3.5 1.4L12 14l-1.5-3.6L7 9l3.5-1.4zM18 14l.8 1.8 1.8.8-1.8.8-.8 1.8-.8-1.8-1.8-.8 1.8-.8zM5 14l1 2 2 1-2 1-1 2-1-2-2-1 2-1z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>',
  },
  {
    id: "edit-pen",
    label: "编辑",
    category: "操作交互",
    markup:
      '<path d="M5 19h4l9-9-4-4-9 9zM12.5 7.5l4 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M4 19h16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  },
  {
    id: "share",
    label: "分享",
    category: "操作交互",
    markup:
      '<circle cx="6" cy="12" r="2" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="18" cy="6" r="2" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="18" cy="18" r="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8 11l8-4M8 13l8 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  },
  {
    id: "copy",
    label: "复制",
    category: "操作交互",
    markup:
      '<rect x="8" y="7" width="11" height="13" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M5 16V6a2 2 0 012-2h8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  },
  {
    id: "scan",
    label: "扫描",
    category: "操作交互",
    markup:
      '<path d="M7 4H5a1 1 0 00-1 1v2M17 4h2a1 1 0 011 1v2M7 20H5a1 1 0 01-1-1v-2M17 20h2a1 1 0 001-1v-2M6 12h12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  },
  {
    id: "monitor",
    label: "显示器",
    category: "设备打印",
    markup:
      '<rect x="4" y="5" width="16" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M10 19h4M12 16v3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  },
  {
    id: "camera",
    label: "相机",
    category: "设备打印",
    markup:
      '<rect x="4" y="7" width="16" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12.5" r="3" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M9 7l1-2h4l1 2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  },
  {
    id: "hard-drive",
    label: "硬盘",
    category: "设备打印",
    markup:
      '<rect x="4" y="6" width="16" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8 14h8M8 17h.01M12 17h.01M16 17h.01" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  },
  {
    id: "warehouse",
    label: "仓库",
    category: "物流仓储",
    markup:
      '<path d="M4 10l8-5 8 5v9H4zM8 19v-5h8v5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  },
  {
    id: "forklift",
    label: "叉车",
    category: "物流仓储",
    markup:
      '<path d="M4 9h7v5H4zM11 9h3l2 3v2h-5M16 8h2v9M18 17h2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="7" cy="17" r="1.6" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="14.5" cy="17" r="1.6" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  },
  {
    id: "pallet",
    label: "托盘",
    category: "物流仓储",
    markup:
      '<rect x="4" y="6" width="16" height="8" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M6 16h12M7 14v4M12 14v4M17 14v4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  },
  {
    id: "compass",
    label: "指南针",
    category: "标记符号",
    markup:
      '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M9 15l2-6 6-2-2 6z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  },
  {
    id: "target",
    label: "靶心",
    category: "标记符号",
    markup:
      '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="4.5" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/>',
  },
  {
    id: "apple",
    label: "苹果",
    category: "食品饮料",
    markup:
      '<path d="M12 20c3.6 0 6-3 6-7a4.3 4.3 0 00-4.2-4.4c-.9 0-1.8.3-2.5.9-.7-.6-1.6-.9-2.5-.9A4.3 4.3 0 004.6 13c0 4 2.7 7 6.2 7z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 8c.1-2.1 1.7-3.3 3.6-3.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  },
  {
    id: "cup-hot",
    label: "热饮",
    category: "食品饮料",
    markup:
      '<path d="M6 9h10v4a4 4 0 01-4 4H10a4 4 0 01-4-4zM16 10h2a2 2 0 010 4h-2M8 19h8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M9 6c.6-.6.6-1.6 0-2.2M12 6c.6-.6.6-1.6 0-2.2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
  },
  {
    id: "utensils",
    label: "餐具",
    category: "食品饮料",
    markup:
      '<path d="M7 4v8M5 4v4M9 4v4M7 12v8M15 4v8c0 2 4 2 4 0V4M17 12v8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  },
  {
    id: "t-shirt",
    label: "T恤",
    category: "服装鞋帽",
    markup:
      '<path d="M8 5l4 2 4-2 4 3-2 4-2-1v9H8v-9l-2 1-2-4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  },
  {
    id: "hanger",
    label: "衣架",
    category: "服装鞋帽",
    markup:
      '<path d="M12 7a2 2 0 10-2-2M10 5h2c0 2.2-1 3-2.7 4L4 13h16l-5.3-4c-1.7-1-2.7-1.8-2.7-4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  },
  {
    id: "shoe",
    label: "鞋子",
    category: "服装鞋帽",
    markup:
      '<path d="M4 14h5l3-2 2 2h6v4H4zM8 14l.8-2M11 14l.8-2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>',
  },
  {
    id: "shopping-bag",
    label: "购物袋",
    category: "零售门店",
    markup:
      '<path d="M6 8h12l-1 12H7zM9 8V6a3 3 0 016 0v2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  },
  {
    id: "coupon",
    label: "优惠券",
    category: "零售门店",
    markup:
      '<path d="M5 8h14v3a2 2 0 010 4v3H5v-3a2 2 0 010-4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 9v6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  },
  {
    id: "pills",
    label: "药丸",
    category: "医药健康",
    markup:
      '<path d="M7.5 7.5a3.5 3.5 0 015 0l4 4a3.5 3.5 0 01-5 5l-4-4a3.5 3.5 0 010-5z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M9.5 9.5l5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  },
  {
    id: "first-aid",
    label: "急救",
    category: "医药健康",
    markup:
      '<rect x="4" y="7" width="16" height="11" rx="2.2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M10 10.5h4M12 8.5v4M8.5 7V5.5h7V7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  },
  {
    id: "stethoscope",
    label: "听诊器",
    category: "医药健康",
    markup:
      '<path d="M8 4v6a4 4 0 008 0V4M8 7H6M16 7h2M12 14v2a3 3 0 003 3h1" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="18" cy="19" r="2" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  },
];

const shapePresetMap = new Map(SHAPE_PRESETS.map((preset) => [preset.id, preset]));
const iconPresetMap = new Map(ICON_PRESETS.map((preset) => [preset.id, preset]));
const presetInkBoxCache = new Map<string, PresetInkBox>();
// The viewBox follows the actual geometry exactly so the element selection box
// aligns with the visible graphic. SVG strokes are allowed to overflow by a
// pixel instead of reserving a visibly large safety margin.
const PRESET_VIEWBOX_PADDING = 0;

export const DEFAULT_SHAPE_PRESET_ID = SHAPE_PRESETS[0].id;
export const DEFAULT_ICON_PRESET_ID = ICON_PRESETS[0].id;

export function getShapePreset(id: string): VisualPreset | null {
  return shapePresetMap.get(id) ?? null;
}

export function getIconPreset(id: string): VisualPreset | null {
  return iconPresetMap.get(id) ?? null;
}

export function toShapePresetBindingValue(id: string): string {
  return `${SHAPE_PREFIX}${id}`;
}

export function toIconPresetBindingValue(id: string): string {
  return `${ICON_PREFIX}${id}`;
}

export function readShapePresetIdFromBinding(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const preferred = value.startsWith(SHAPE_PREFIX) ? value.slice(SHAPE_PREFIX.length) : value;
  return shapePresetMap.has(preferred) ? preferred : null;
}

export function readIconPresetIdFromBinding(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const preferred = value.startsWith(ICON_PREFIX) ? value.slice(ICON_PREFIX.length) : value;
  return iconPresetMap.has(preferred) ? preferred : null;
}

function parsePoints(points: string): Array<{ x: number; y: number }> {
  return points
    .trim()
    .split(/[\s,]+/)
    .map((item) => Number(item))
    .reduce<Array<{ x: number; y: number }>>((acc, value, index, source) => {
      if (index % 2 === 0 && Number.isFinite(value) && Number.isFinite(source[index + 1])) {
        acc.push({ x: value, y: source[index + 1] });
      }
      return acc;
    }, []);
}

function unionBox(
  current: PresetInkBox | null,
  next: PresetInkBox | null
): PresetInkBox | null {
  if (!next) {
    return current;
  }
  if (!current) {
    return next;
  }
  const x1 = Math.min(current.x, next.x);
  const y1 = Math.min(current.y, next.y);
  const x2 = Math.max(current.x + current.width, next.x + next.width);
  const y2 = Math.max(current.y + current.height, next.y + next.height);
  return {
    x: x1,
    y: y1,
    width: x2 - x1,
    height: y2 - y1,
  };
}

function parseInkBoxFromPrimitiveMarkup(markup: string): PresetInkBox | null {
  const wrapper = `<svg xmlns="http://www.w3.org/2000/svg">${markup}</svg>`;
  const parser = new DOMParser();
  const documentNode = parser.parseFromString(wrapper, "image/svg+xml");
  const elements = documentNode.documentElement.querySelectorAll("*");
  let box: PresetInkBox | null = null;

  elements.forEach((element) => {
    const tag = element.tagName.toLowerCase();
    const attr = (name: string): number | null => {
      const value = element.getAttribute(name);
      if (!value) {
        return null;
      }
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    };

    let candidate: PresetInkBox | null = null;
    if (tag === "rect") {
      const x = attr("x") ?? 0;
      const y = attr("y") ?? 0;
      const width = attr("width");
      const height = attr("height");
      if (width && height) {
        candidate = { x, y, width, height };
      }
    } else if (tag === "circle") {
      const cx = attr("cx");
      const cy = attr("cy");
      const r = attr("r");
      if (cx !== null && cy !== null && r !== null && r > 0) {
        candidate = { x: cx - r, y: cy - r, width: r * 2, height: r * 2 };
      }
    } else if (tag === "ellipse") {
      const cx = attr("cx");
      const cy = attr("cy");
      const rx = attr("rx");
      const ry = attr("ry");
      if (cx !== null && cy !== null && rx !== null && ry !== null && rx > 0 && ry > 0) {
        candidate = { x: cx - rx, y: cy - ry, width: rx * 2, height: ry * 2 };
      }
    } else if (tag === "line") {
      const x1 = attr("x1");
      const y1 = attr("y1");
      const x2 = attr("x2");
      const y2 = attr("y2");
      if (x1 !== null && y1 !== null && x2 !== null && y2 !== null) {
        candidate = {
          x: Math.min(x1, x2),
          y: Math.min(y1, y2),
          width: Math.abs(x2 - x1),
          height: Math.abs(y2 - y1),
        };
      }
    } else if (tag === "polyline" || tag === "polygon") {
      const points = parsePoints(element.getAttribute("points") ?? "");
      if (points.length > 0) {
        const xs = points.map((item) => item.x);
        const ys = points.map((item) => item.y);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);
        candidate = {
          x: minX,
          y: minY,
          width: maxX - minX,
          height: maxY - minY,
        };
      }
    }

    box = unionBox(box, candidate);
  });

  return box;
}

function measureInkBoxFromDom(markup: string): PresetInkBox | null {
  if (typeof document === "undefined" || !document.body) {
    return null;
  }
  const svgNs = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNs, "svg");
  const group = document.createElementNS(svgNs, "g");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "24");
  svg.setAttribute("height", "24");
  svg.style.position = "absolute";
  svg.style.left = "-9999px";
  svg.style.top = "-9999px";
  svg.style.visibility = "hidden";
  group.innerHTML = markup;
  svg.appendChild(group);
  document.body.appendChild(svg);

  try {
    if (typeof (group as unknown as { getBBox?: () => DOMRect }).getBBox !== "function") {
      return null;
    }
    const box = (group as unknown as { getBBox: () => DOMRect }).getBBox();
    if (!Number.isFinite(box.width) || !Number.isFinite(box.height) || box.width <= 0 || box.height <= 0) {
      return null;
    }
    return {
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
    };
  } catch {
    return null;
  } finally {
    svg.remove();
  }
}

export function getVisualPresetInkBox(kind: VisualPresetKind, presetId: string): PresetInkBox | null {
  const cacheKey = `${kind}:${presetId}`;
  const cached = presetInkBoxCache.get(cacheKey);
  if (cached) {
    return cached;
  }
  const preset = kind === "shape" ? getShapePreset(presetId) : getIconPreset(presetId);
  if (!preset) {
    return null;
  }

  const measured = measureInkBoxFromDom(preset.markup) ?? parseInkBoxFromPrimitiveMarkup(preset.markup);
  const fallback: PresetInkBox = { x: 0, y: 0, width: 24, height: 24 };
  const normalized = measured && measured.width > 0 && measured.height > 0 ? measured : fallback;
  presetInkBoxCache.set(cacheKey, normalized);
  return normalized;
}

export function getVisualPresetAspectRatio(kind: VisualPresetKind, presetId: string): number | null {
  const box = getVisualPresetInkBox(kind, presetId);
  if (!box || box.width <= 0 || box.height <= 0) {
    return null;
  }
  return box.width / box.height;
}

export function getVisualPresetViewBox(kind: VisualPresetKind, presetId: string): string {
  const box = getVisualPresetInkBox(kind, presetId);
  if (!box) {
    return "0 0 24 24";
  }

  const left = Math.max(0, box.x - PRESET_VIEWBOX_PADDING);
  const top = Math.max(0, box.y - PRESET_VIEWBOX_PADDING);
  const right = Math.min(24, box.x + box.width + PRESET_VIEWBOX_PADDING);
  const bottom = Math.min(24, box.y + box.height + PRESET_VIEWBOX_PADDING);

  return `${formatViewBoxValue(left)} ${formatViewBoxValue(top)} ${formatViewBoxValue(
    Math.max(0.1, right - left)
  )} ${formatViewBoxValue(Math.max(0.1, bottom - top))}`;
}

function formatViewBoxValue(value: number): string {
  return `${Math.round(value * 1000) / 1000}`;
}

type PresetGlyphProps = {
  kind: VisualPresetKind;
  presetId: string;
  className?: string;
  color?: string;
  strokeColor?: string;
  fillColor?: string;
  strokeWidth?: number;
  strokeOpacity?: number;
  fillOpacity?: number;
  strokeLineCap?: "butt" | "round" | "square";
  strokeLineJoin?: "miter" | "round" | "bevel";
  strokeDashArray?: number[] | string;
  strokeDashOffset?: number;
  strokeMiterLimit?: number;
  fillRule?: "nonzero" | "evenodd";
  title?: string;
};

type PresetGlyphCssVars = CSSProperties & {
  "--preset-stroke-width"?: string;
  "--preset-stroke-color"?: string;
  "--preset-fill-color"?: string;
  "--preset-stroke-opacity"?: string;
  "--preset-fill-opacity"?: string;
  "--preset-stroke-linecap"?: "butt" | "round" | "square";
  "--preset-stroke-linejoin"?: "miter" | "round" | "bevel";
  "--preset-stroke-dasharray"?: string;
  "--preset-stroke-dashoffset"?: string;
  "--preset-stroke-miterlimit"?: string;
  "--preset-fill-rule"?: "nonzero" | "evenodd";
};

export function PresetGlyph({
  kind,
  presetId,
  className,
  color,
  strokeColor,
  fillColor,
  strokeWidth,
  strokeOpacity,
  fillOpacity,
  strokeLineCap,
  strokeLineJoin,
  strokeDashArray,
  strokeDashOffset,
  strokeMiterLimit,
  fillRule,
  title,
}: PresetGlyphProps) {
  const preset = kind === "shape" ? getShapePreset(presetId) : getIconPreset(presetId);
  if (!preset) {
    return null;
  }

  const viewBox = getVisualPresetViewBox(kind, presetId);

  const normalizedStrokeColor = (strokeColor || color || "").trim();
  const normalizedFillColor = (fillColor || normalizedStrokeColor).trim();
  const normalizedDashArray = normalizeVisualDashArray(strokeDashArray);
  const style: PresetGlyphCssVars = {
    "--preset-stroke-width": `${normalizeVisualStrokeWidth(strokeWidth)}`,
    "--preset-stroke-opacity": `${normalizeVisualOpacity(strokeOpacity)}`,
    "--preset-fill-opacity": `${normalizeVisualOpacity(fillOpacity)}`,
    "--preset-stroke-linecap": normalizeVisualLineCap(strokeLineCap),
    "--preset-stroke-linejoin": normalizeVisualLineJoin(strokeLineJoin),
    "--preset-stroke-dasharray": normalizedDashArray.length > 0 ? formatVisualDashArray(normalizedDashArray) : "none",
    "--preset-stroke-dashoffset": `${normalizeVisualDashOffset(strokeDashOffset)}`,
    "--preset-stroke-miterlimit": `${normalizeVisualMiterLimit(strokeMiterLimit)}`,
    "--preset-fill-rule": normalizeVisualFillRule(fillRule),
  };
  if (normalizedStrokeColor) {
    style["--preset-stroke-color"] = normalizedStrokeColor;
  }
  if (normalizedFillColor) {
    style["--preset-fill-color"] = normalizedFillColor;
  }
  if (color && !strokeColor && !fillColor) {
    style.color = color;
  }
  return (
    <svg
      viewBox={viewBox}
      preserveAspectRatio="none"
      className={className}
      style={style}
      role={title ? "img" : "presentation"}
      aria-label={title}
      dangerouslySetInnerHTML={{ __html: preset.markup }}
    />
  );
}
