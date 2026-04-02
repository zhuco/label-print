import { useMemo, useState } from "react";
import { buildPreview, parseCsv } from "@label/data-import";

import { FieldMappingTable } from "./FieldMappingTable";
import { useDataImportStore } from "./data-import.store";

type DataImportDrawerProps = {
  requiredFields: string[];
};

export function DataImportDrawer({ requiredFields }: DataImportDrawerProps) {
  const [csvText, setCsvText] = useState("sku,price\nA001,19.9");
  const { columns, missingColumns, setPreview } = useDataImportStore();

  const preview = useMemo(() => {
    const rows = parseCsv(csvText);
    return buildPreview(rows, requiredFields);
  }, [csvText, requiredFields]);

  return (
    <section className="panel" style={{ marginTop: 12 }}>
      <h3>导入数据</h3>
      <textarea
        aria-label="CSV 输入"
        value={csvText}
        onChange={(event) => setCsvText(event.target.value)}
        rows={6}
        style={{ width: "100%" }}
      />
      <div style={{ marginTop: 8 }}>
        <button
          type="button"
          onClick={() => setPreview(preview.columns, preview.missingColumns)}
        >
          生成预览
        </button>
      </div>
      <FieldMappingTable columns={columns} missingColumns={missingColumns} />
    </section>
  );
}