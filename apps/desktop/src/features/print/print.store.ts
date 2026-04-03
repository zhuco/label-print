import { create } from "zustand";

export type PrintJobStatus = "queued" | "running" | "paused" | "cancelled" | "failed" | "success";

export type PrintJob = {
  id: number;
  status: PrintJobStatus;
  totalItems: number;
};

type PrintState = {
  jobs: PrintJob[];
  addJob: (job: PrintJob) => void;
  updateJobStatus: (id: number, status: PrintJobStatus) => void;
  setJobs: (jobs: PrintJob[]) => void;
};

export const usePrintStore = create<PrintState>((set) => ({
  jobs: [],
  addJob: (job) =>
    set((state) => ({
      jobs: [job, ...state.jobs],
    })),
  updateJobStatus: (id, status) =>
    set((state) => ({
      jobs: state.jobs.map((job) => (job.id === id ? { ...job, status } : job)),
    })),
  setJobs: (jobs) => set({ jobs }),
}));
