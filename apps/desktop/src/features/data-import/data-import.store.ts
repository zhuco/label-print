import { create } from "zustand";

type DataImportState = {
  columns: string[];
  rows: Record<string, string>[];
  missingColumns: string[];
  setPreview: (input: {
    columns: string[];
    rows: Record<string, string>[];
    missingColumns: string[];
  }) => void;
  reset: () => void;
};

export const useDataImportStore = create<DataImportState>((set) => ({
  columns: [],
  rows: [],
  missingColumns: [],
  setPreview: (input) =>
    set({
      columns: input.columns,
      rows: input.rows,
      missingColumns: input.missingColumns,
    }),
  reset: () =>
    set({
      columns: [],
      rows: [],
      missingColumns: [],
    }),
}));
