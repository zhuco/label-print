import { useMemo, useState } from "react";
import { buildPreview, parseCsv } from "@label/data-import";

import { FieldMappingTable } from "./FieldMappingTable";
import { useDataImportStore } from "./data-import.store";

type DataImportDrawerProps = {
  requiredFields: string[];
};

export function DataImportDrawer({ requiredFields }: DataImportDrawerProps) {
  const [csvText, setCsvText] = useState("sku,price,code\nA001,19.9,6252277");
  const { columns, rows, missingColumns, setPreview } = useDataImportStore();

  const preview = useMemo(() => {
    const parsed = parseCsv(csvText);
    return buildPreview(parsed, requiredFields);
  }, [csvText, requiredFields]);

  return (
    <section className="block-card import-card">
      <h3>导入数据</h3>
      <p className="muted">支持 CSV 文本，导入后可在属性面板绑定字段。</p>
      <textarea
        aria-label="CSV 输入"
        value={csvText}
        onChange={(event) => setCsvText(event.target.value)}
        rows={6}
        className="mono-input"
      />
      <div className="inline-actions">
        <button
          type="button"
          onClick={() =>
            setPreview({
              columns: preview.columns,
              rows: preview.rows,
              missingColumns: preview.missingColumns,
            })
          }
        >
          生成预览
        </button>
        <span className="muted">预览行数: {rows.length}</span>
      </div>

      <FieldMappingTable columns={columns} missingColumns={missingColumns} />
    </section>
  );
}
