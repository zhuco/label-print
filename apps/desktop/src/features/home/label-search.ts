import { pinyin } from "pinyin-pro";

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase("zh-CN");
}

/** Matches a label name by its original text, full pinyin, or pinyin initials. */
export function matchesLabelSearch(name: string, query: string): boolean {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) {
    return true;
  }

  const normalizedName = normalize(name);
  if (normalizedName.includes(normalizedQuery)) {
    return true;
  }

  const syllables = pinyin(name, { toneType: "none", type: "array" })
    .map((syllable) => normalize(syllable));
  const fullPinyin = syllables.join("");
  const spacedPinyin = syllables.join(" ");
  const initials = syllables.map((syllable) => syllable.charAt(0)).join("");

  return (
    fullPinyin.includes(normalizedQuery) ||
    spacedPinyin.includes(normalizedQuery) ||
    initials.includes(normalizedQuery)
  );
}
