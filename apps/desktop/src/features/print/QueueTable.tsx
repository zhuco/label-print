import type { PrintJob } from "./print.store";

type QueueTableProps = {
  jobs: PrintJob[];
};

const STATUS_LABEL: Record<PrintJob["status"], string> = {
  queued: "排队中",
  running: "打印中",
  paused: "已暂停",
  cancelled: "已取消",
  failed: "失败",
  success: "完成",
};

export function QueueTable({ jobs }: QueueTableProps) {
  return (
    <table className="table" aria-label="打印队列表">
      <thead>
        <tr>
          <th>ID</th>
          <th>状态</th>
          <th>条数</th>
        </tr>
      </thead>
      <tbody>
        {jobs.map((job) => (
          <tr key={job.id}>
            <td>{job.id}</td>
            <td>{STATUS_LABEL[job.status]}</td>
            <td>{job.totalItems}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
