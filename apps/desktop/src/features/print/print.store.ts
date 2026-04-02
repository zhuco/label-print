import { create } from "zustand";

export type PrintJob = {
  id: number;
  status: string;
  totalItems: number;
};

type PrintState = {
  jobs: PrintJob[];
  setJobs: (jobs: PrintJob[]) => void;
};

export const usePrintStore = create<PrintState>((set) => ({
  jobs: [],
  setJobs: (jobs) => set({ jobs }),
}));