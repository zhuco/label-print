import { create } from "zustand";

type DataImportState = {
  columns: string[];
  missingColumns: string[];
  setPreview: (columns: string[], missingColumns: string[]) => void;
};

export const useDataImportStore = create<DataImportState>((set) => ({
  columns: [],
  missingColumns: [],
  setPreview: (columns, missingColumns) => set({ columns, missingColumns }),
}));