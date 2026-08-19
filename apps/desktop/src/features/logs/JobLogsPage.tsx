import { useMemo, useState } from "react";

export type JobLogRecord = {
  id: number;
  status: string;
  templateName: string;
};

type JobLogsPageProps = {
  records: JobLogRecord[];
};

export function JobLogsPage({ records }: JobLogsPageProps) {
  const [statusFilter, setStatusFilter] = useState("all");

  const filtered = useMemo(
    () =>
      statusFilter === "all"
        ? records
        : records.filter((record) => record.status === statusFilter),
    [records, statusFilter]
  );

  return (
    <section className="panel">
      <h2>任务日志</h2>
      <label htmlFor="status-filter">状态筛选</label>
      <select
        id="status-filter"
        aria-label="状态筛选"
        value={statusFilter}
        onChange={(event) => setStatusFilter(event.target.value)}
      >
        <option value="all">全部</option>
        <option value="success">成功</option>
        <option value="failed">失败</option>
      </select>

      <table className="table" style={{ marginTop: 8 }}>
        <thead>
          <tr>
            <th>ID</th>
            <th>模板</th>
            <th>状态</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((record) => (
            <tr key={record.id}>
              <td>{record.id}</td>
              <td>{record.templateName}</td>
              <td>{record.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
