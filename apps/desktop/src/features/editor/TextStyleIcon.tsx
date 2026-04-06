type TextStyleIconKind =
  | "align-left"
  | "align-center"
  | "align-right"
  | "bold"
  | "italic"
  | "underline"
  | "strike-through";

type TextStyleIconProps = {
  kind: TextStyleIconKind;
  className?: string;
};

export function TextStyleIcon({ kind, className }: TextStyleIconProps) {
  if (kind === "align-left") {
    return (
      <svg className={className} viewBox="0 0 20 20" aria-hidden="true">
        <path d="M4 3.5v13" />
        <path d="M7 5h9.2" />
        <path d="M7 9h7.1" />
        <path d="M7 13h9.2" />
        <path d="M7 17h6.1" />
      </svg>
    );
  }

  if (kind === "align-center") {
    return (
      <svg className={className} viewBox="0 0 20 20" aria-hidden="true">
        <path d="M10 3.5v13" />
        <path d="M4.5 5h11" />
        <path d="M6.2 9h7.6" />
        <path d="M4.5 13h11" />
        <path d="M6.8 17h6.4" />
      </svg>
    );
  }

  if (kind === "align-right") {
    return (
      <svg className={className} viewBox="0 0 20 20" aria-hidden="true">
        <path d="M16 3.5v13" />
        <path d="M3.8 5H13" />
        <path d="M5.8 9H13" />
        <path d="M3.8 13H13" />
        <path d="M6.8 17H13" />
      </svg>
    );
  }

  if (kind === "bold") {
    return (
      <svg className={className} viewBox="0 0 20 20" aria-hidden="true">
        <path d="M6 3.5v13" />
        <path d="M6 3.5h4.4a2.5 2.5 0 1 1 0 5H6" />
        <path d="M6 8.5h5a2.8 2.8 0 1 1 0 5.6H6" />
      </svg>
    );
  }

  if (kind === "italic") {
    return (
      <svg className={className} viewBox="0 0 20 20" aria-hidden="true">
        <path d="M12.8 3.5H7.9" />
        <path d="M12.1 3.5 7.9 16.5" />
        <path d="M12.2 16.5H7.3" />
      </svg>
    );
  }

  if (kind === "underline") {
    return (
      <svg className={className} viewBox="0 0 20 20" aria-hidden="true">
        <path d="M5.5 3.5v6a4.5 4.5 0 0 0 9 0v-6" />
        <path d="M4 16.5h12" />
      </svg>
    );
  }

  return (
    <svg className={className} viewBox="0 0 20 20" aria-hidden="true">
      <path d="M14.4 4.8c-1-.8-2.2-1.3-3.7-1.3-2.2 0-3.7 1-3.7 2.7 0 1.9 1.6 2.3 3.9 2.7 2 .3 3.3.8 3.3 2.3 0 1.6-1.4 2.7-3.8 2.7-1.9 0-3.5-.6-4.6-1.7" />
      <path d="M4 10h12" />
    </svg>
  );
}
