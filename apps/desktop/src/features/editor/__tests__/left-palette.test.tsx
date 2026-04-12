import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LeftPalette } from "../LeftPalette";

function buildProps(overrides?: Partial<Parameters<typeof LeftPalette>[0]>) {
  return {
    onAddText: vi.fn(),
    onAddBarcode: vi.fn(),
    onAddImage: vi.fn(),
    onRecognizeImage: vi.fn(),
    onAddQrcode: vi.fn(),
    onAddShape: vi.fn(),
    onAddIcon: vi.fn(),
    onApplyIndustryTemplate: vi.fn(),
    onApplyCustomPreset: vi.fn(),
    customPresets: [],
    ...overrides,
  };
}

describe("LeftPalette preset picker", () => {
  afterEach(() => {
    cleanup();
  });

  it("opens shape picker and emits selected shape id", () => {
    const onAddShape = vi.fn();

    render(<LeftPalette {...buildProps({ onAddShape })} />);

    fireEvent.click(screen.getByTestId("tool-shape"));
    expect(screen.getByText("选择图形")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("preset-card-rectangle"));
    expect(onAddShape).toHaveBeenCalledWith("rectangle");
  });

  it("opens icon picker and emits selected icon id", () => {
    const onAddIcon = vi.fn();

    render(<LeftPalette {...buildProps({ onAddIcon })} />);

    fireEvent.click(screen.getByTestId("tool-icon"));
    expect(screen.getByText("选择图标")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("preset-card-printer"));
    expect(onAddIcon).toHaveBeenCalledWith("printer");
  });

  it("delegates image button click to image importer", () => {
    const onAddImage = vi.fn();

    render(<LeftPalette {...buildProps({ onAddImage })} />);

    fireEvent.click(screen.getByTestId("tool-image"));
    expect(onAddImage).toHaveBeenCalledTimes(1);
  });

  it("delegates image recognition button click to recognizer", () => {
    const onRecognizeImage = vi.fn();

    render(<LeftPalette {...buildProps({ onRecognizeImage })} />);

    fireEvent.click(screen.getByTestId("tool-image-recognition"));
    expect(onRecognizeImage).toHaveBeenCalledTimes(1);
  });

  it("opens industry template picker and emits selected template id", () => {
    const onApplyIndustryTemplate = vi.fn();

    render(<LeftPalette {...buildProps({ onApplyIndustryTemplate })} />);

    fireEvent.click(screen.getByTestId("tool-industry-template"));
    expect(screen.getByText("选择行业模板")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("industry-template-food-label"));
    expect(onApplyIndustryTemplate).toHaveBeenCalledWith("food-label");
  });

  it("opens custom preset picker and emits selected custom id", () => {
    const onApplyCustomPreset = vi.fn();

    render(
      <LeftPalette
        {...buildProps({
          onApplyCustomPreset,
          customPresets: [
            {
              id: "custom-1",
              name: "收货码组合",
              category: "物流",
              elementCount: 2,
              createdAt: Date.now(),
            },
          ],
        })}
      />
    );

    fireEvent.click(screen.getByTestId("tool-custom-template"));
    expect(screen.getByText("选择自定义图形")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("custom-template-custom-1"));
    expect(onApplyCustomPreset).toHaveBeenCalledWith("custom-1");
  });
});

