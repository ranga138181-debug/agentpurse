const LIMITS = {
  title: 120,
  description: 500,
  merchant: 80,
  category: 40,
  rationale: 280,
};

const INVISIBLE =
  /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g;

export function sanitise(
  text: string | null,
  field: keyof typeof LIMITS,
): string | null {
  if (text === null) return null;
  let clean = text
    .normalize("NFKC")
    .replace(INVISIBLE, "")
    .replace(/<[^>]*>/g, "")
    .replace(/[<>]/g, "");
  if (field === "rationale") {
    clean = clean.replace(/(?:https?:\/\/|www\.)\S*/gi, "");
  }
  clean = clean.replace(/\s+/g, " ").trim().slice(0, LIMITS[field]);
  return clean === "" ? null : clean;
}
