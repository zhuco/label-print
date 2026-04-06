import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LeftPalette } from "../LeftPalette";

describe("LeftPalette preset picker", () => {
  afterEach(() => {
    cleanup();
  });

  it("opens shape picker and emits selected shape id", () => {
    const onAddShape = vi.fn();

    render(
      <LeftPalette
        onAddText={vi.fn()}
        onAddBarcode={vi.fn()}
        onAddImage={vi.fn()}
        onAddQrcode={vi.fn()}
        onAddShape={onAddShape}
        onAddIcon={vi.fn()}
      />
    );

    fireEvent.click(screen.getByTestId("tool-shape"));
    expect(screen.getByText("选择图形")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("preset-card-rectangle"));
    expect(onAddShape).toHaveBeenCalledWith("rectangle");
  });

  it("opens icon picker and emits selected icon id", () => {
    const onAddIcon = vi.fn();

    render(
      <LeftPalette
        onAddText={vi.fn()}
        onAddBarcode={vi.fn()}
        onAddImage={vi.fn()}
        onAddQrcode={vi.fn()}
        onAddShape={vi.fn()}
        onAddIcon={onAddIcon}
      />
    );

    fireEvent.click(screen.getByTestId("tool-icon"));
    expect(screen.getByText("选择图标")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("preset-card-printer"));
    expect(onAddIcon).toHaveBeenCalledWith("printer");
  });

  it("delegates image button click to image importer", () => {
    const onAddImage = vi.fn();

    render(
      <LeftPalette
        onAddText={vi.fn()}
        onAddBarcode={vi.fn()}
        onAddImage={onAddImage}
        onAddQrcode={vi.fn()}
        onAddShape={vi.fn()}
        onAddIcon={vi.fn()}
      />
    );

    fireEvent.click(screen.getByTestId("tool-image"));
    expect(onAddImage).toHaveBeenCalledTimes(1);
  });
});
