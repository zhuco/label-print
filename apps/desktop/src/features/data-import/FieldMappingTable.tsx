type FieldMappingTableProps = {
  columns: string[];
  missingColumns: string[];
};

export function FieldMappingTable({ columns, missingColumns }: FieldMappingTableProps) {
  return (
    <section>
      <h3>字段映射</h3>
      {missingColumns.length > 0 ? (
        <p className="warning">缺失字段: {missingColumns.join(", ")}</p>
      ) : (
        <p className="muted">字段完整，可开始提交打印任务。</p>
      )}
      <p className="muted">检测到列: {columns.join(", ") || "(空)"}</p>
    </section>
  );
}
