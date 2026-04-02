import { create } from "zustand";

export type EditorElement = {
  id: string;
  type: "text" | "barcode" | "qrcode";
  label: string;
};

type EditorState = {
  elements: EditorElement[];
  addElement: (element: EditorElement) => void;
};

export const useEditorStore = create<EditorState>((set) => ({
  elements: [],
  addElement: (element) =>
    set((state) => ({
      elements: [...state.elements, element],
    })),
}));