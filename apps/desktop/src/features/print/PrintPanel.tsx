import { QueueTable } from "./QueueTable";
import type { PrintJob } from "./print.store";

type PrintPanelProps = {
  jobs: PrintJob[];
  onPause: (id: number) => void;
  onResume: (id: number) => void;
  onCancel: (id: number) => void;
};

export function PrintPanel({ jobs, onPause, onResume, onCancel }: PrintPanelProps) {
  const activeJob = jobs[0];

  return (
    <section className="panel" style={{ marginTop: 12 }}>
      <h3>打印队列</h3>
      <QueueTable jobs={jobs} />
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button type="button" onClick={() => activeJob && onPause(activeJob.id)}>暂停</button>
        <button type="button" onClick={() => activeJob && onResume(activeJob.id)}>继续</button>
        <button type="button" onClick={() => activeJob && onCancel(activeJob.id)}>取消</button>
      </div>
    </section>
  );
}