import type { PrintJob } from "./print.store";

type QueueTableProps = {
  jobs: PrintJob[];
};

export function QueueTable({ jobs }: QueueTableProps) {
  return (
    <table className="table" aria-label="打印队列表">
      <thead>
        <tr>
          <th>ID</th>
          <th>状态</th>
          <th>数量</th>
        </tr>
      </thead>
      <tbody>
        {jobs.map((job) => (
          <tr key={job.id}>
            <td>{job.id}</td>
            <td>{job.status}</td>
            <td>{job.totalItems}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}