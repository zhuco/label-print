import { describe, expect, it } from "vitest";

import {
  parseDdlTemplate,
  parseDdlTemplateSnapshot,
  unpackTemplateBundle,
  packTemplateBundle,
} from "../template-file";
import type { TemplateSnapshot } from "../template-snapshot";

const PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFAgH/qWf1tQAAAABJRU5ErkJggg==";

const DDL_SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<DLabel source="pc" version="3.2.8">
  <paper w="40" h="30">
    <labelobjects>
      <drawobj itemtype="5" l="2" t="1.5" w="30" h="8" rotate="0" fontsize="10" stretch="28" fontbold="true" fontitalic="false" fontunderline="false" fontfamily="Microsoft YaHei">
        <textlist>
          <text value="Product Name" />
        </textlist>
      </drawobj>
      <drawobj itemtype="7" barcodetype="CODE_128" l="2" t="12" w="28" h="10" rotate="0" density="0.33" quietzone="10" checkcode="1">
        <textlist>
          <text value="6252277" />
        </textlist>
      </drawobj>
      <drawobj itemtype="99" l="0" t="0" w="1" h="1" />
    </labelobjects>
  </paper>
</DLabel>`;

const DDL_LARGE_FONT_SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<DLabel source="pc" version="3.2.8">
  <paper w="40" h="30">
    <labelobjects>
      <drawobj itemtype="5" l="2.6" t="1.7" w="35.8" h="11.1" rotate="0" fontsize="24" fontbold="true" fontfamily="Microsoft YaHei">
        <textlist>
          <text value="Large Import Text" characterlength="15" />
        </textlist>
      </drawobj>
    </labelobjects>
  </paper>
</DLabel>`;

const DDL_NEWLINE_SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<DLabel source="pc" version="3.2.8">
  <paper w="40" h="30">
    <labelobjects>
      <drawobj itemtype="5" l="2" t="2" w="30" h="12" rotate="0" fontsize="12" fontfamily="Microsoft YaHei">
        <textlist>
          <text value="Line A\\nLine B" />
          <text value="Line C&amp;#10;Line D" />
          <text value="Line E&lt;br/&gt;Line F" />
        </textlist>
      </drawobj>
    </labelobjects>
  </paper>
</DLabel>`;

const DDL_UNKNOWN_BARCODE_SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<DLabel source="pc" version="3.2.8">
  <paper w="40" h="30">
    <labelobjects>
      <drawobj itemtype="7" barcodetype="UNKNOWN_BARCODE" l="2" t="12" w="28" h="10" rotate="0">
        <textlist>
          <text value="12345" />
        </textlist>
      </drawobj>
    </labelobjects>
  </paper>
</DLabel>`;

function buildSnapshot(): TemplateSnapshot {
  return {
    title: "Asset Demo",
    labelSize: {
      widthMm: 40,
      heightMm: 30,
    },
    calibration: {
      offsetX: 0,
      offsetY: 0,
      scale: 1,
    },
    printerId: "Zebra-01",
    copies: 1,
    elements: [
      {
        id: "img-1",
        type: "image",
        name: "Image 1",
        xMm: 1,
        yMm: 1,
        widthMm: 10,
        heightMm: 10,
        rotation: 0,
        binding: {
          mode: "fixed",
          fixedValue: PNG_DATA_URL,
        },
        textStyle: {
          fontFamily: "Microsoft YaHei",
          fontSize: 6,
          fontWeight: 400,
          italic: false,
          underline: false,
          align: "left",
          color: "#101828",
          letterSpacing: 0,
          lineHeight: 1.2,
        },
      },
      {
        id: "icon-1",
        type: "icon",
        name: "Icon 1",
        xMm: 12,
        yMm: 1,
        widthMm: 8,
        heightMm: 8,
        rotation: 0,
        binding: {
          mode: "fixed",
          fixedValue: "@",
        },
        textStyle: {
          fontFamily: "Microsoft YaHei",
          fontSize: 6,
          fontWeight: 700,
          italic: false,
          underline: false,
          align: "center",
          color: "#101828",
          letterSpacing: 0,
          lineHeight: 1.2,
        },
      },
    ],
  };
}

describe("template bundle", () => {
  it("packs and unpacks image assets in a single .lpt file", () => {
    const snapshot = buildSnapshot();
    const packed = packTemplateBundle(snapshot);

    expect(packed.length).toBeGreaterThan(32);

    const unpacked = unpackTemplateBundle(packed);
    expect(unpacked.title).toBe(snapshot.title);

    const image = unpacked.elements.find((element) => element.id === "img-1");
    expect(image?.type).toBe("image");
    if (image && image.binding.mode === "fixed") {
      expect(image.binding.fixedValue).toMatch(/^data:image\/png;base64,/);
    }

    const icon = unpacked.elements.find((element) => element.id === "icon-1");
    expect(icon?.type).toBe("icon");
    if (icon && icon.binding.mode === "fixed") {
      expect(icon.binding.fixedValue).toBe("@");
    }
  });

  it("throws when bundle is missing required files", () => {
    const invalid = new Uint8Array([1, 2, 3, 4]);
    expect(() => unpackTemplateBundle(invalid)).toThrow();
  });

  it("parses .ddl xml into snapshot with text and barcode elements", () => {
    const snapshot = parseDdlTemplateSnapshot(DDL_SAMPLE, "Imported DDL");

    expect(snapshot).not.toBeNull();
    expect(snapshot?.title).toBe("Imported DDL");
    expect(snapshot?.labelSize).toEqual({
      widthMm: 40,
      heightMm: 30,
    });
    expect(snapshot?.elements).toHaveLength(2);

    const text = snapshot?.elements.find((item) => item.type === "text");
    expect(text?.xMm).toBe(2);
    expect(text?.yMm).toBe(1.5);
    if (text?.type === "text" && text.binding.mode === "fixed") {
      expect(text.binding.fixedValue).toBe("Product Name");
      expect(text.textStyle.widthScale).toBeCloseTo(0.28, 2);
      expect(text.textStyle.wrapMode).toBe("singleLine");
    }

    const barcode = snapshot?.elements.find((item) => item.type === "barcode");
    expect(barcode?.type).toBe("barcode");
    if (barcode?.type === "barcode") {
      expect(barcode.binding.mode).toBe("fixed");
      if (barcode.binding.mode === "fixed") {
        expect(barcode.binding.fixedValue).toBe("6252277");
      }
      expect(barcode.barcode.symbology).toBe("CODE128");
      expect(barcode.barcode.moduleWidth).toBe(0.33);
      expect(barcode.barcode.quietZone).toBe(1);
      expect(barcode.barcode.checksumEnabled).toBe(true);
    }
  });

  it("reports imported and ignored counts for .ddl elements", () => {
    const result = parseDdlTemplate(DDL_SAMPLE, "Imported DDL");

    expect(result).not.toBeNull();
    expect(result?.importedCount).toBe(2);
    expect(result?.ignoredCount).toBe(1);
    expect(result?.totalCount).toBe(3);
    expect(result?.ignoredTypes).toEqual([
      {
        type: "itemtype=99",
        count: 1,
      },
    ]);
    expect(result?.snapshot.elements).toHaveLength(2);
  });

  it("normalizes imported .ddl text font size into editor mm units", () => {
    const snapshot = parseDdlTemplateSnapshot(DDL_LARGE_FONT_SAMPLE, "Large Font");
    const text = snapshot?.elements.find((item) => item.type === "text");

    expect(text?.type).toBe("text");
    if (text?.type === "text") {
      expect(text.textStyle.fontSize).toBeCloseTo(2.98, 2);
      expect(text.textStyle.fontSize).toBeLessThan(4);
      expect(text.textStyle.fontSize).toBeLessThanOrEqual(text.heightMm / 1.2);
    }
  });

  it("normalizes ddl newline markers into multiline text", () => {
    const snapshot = parseDdlTemplateSnapshot(DDL_NEWLINE_SAMPLE, "Newline DDL");
    const text = snapshot?.elements.find((item) => item.type === "text");

    expect(text?.type).toBe("text");
    if (text?.type === "text" && text.binding.mode === "fixed") {
      expect(text.binding.fixedValue).toBe("Line A\nLine B\nLine C\nLine D\nLine E\nLine F");
    }
  });

  it("falls back to CODE128A when ddl barcode type is unknown", () => {
    const snapshot = parseDdlTemplateSnapshot(DDL_UNKNOWN_BARCODE_SAMPLE, "Unknown Barcode DDL");
    const barcode = snapshot?.elements.find((item) => item.type === "barcode");

    expect(barcode?.type).toBe("barcode");
    if (barcode?.type === "barcode") {
      expect(barcode.barcode.symbology).toBe("CODE128A");
    }
  });

  it("returns null for invalid .ddl payload", () => {
    expect(parseDdlTemplateSnapshot("{bad xml}", "Bad")).toBeNull();
    expect(parseDdlTemplate("{bad xml}", "Bad")).toBeNull();
  });
});
