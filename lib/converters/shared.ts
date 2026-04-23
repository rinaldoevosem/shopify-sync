export interface AirtableRecord {
  [key: string]: string;
}

export interface MetafieldInput {
  namespace: string;
  key: string;
  value: string;
  type: string;
}

export interface MediaInput {
  originalSource: string;
  mediaContentType: "IMAGE";
}

export interface ShopifyProductInput {
  sku: string;
  handle: string;
  title: string;
  descriptionHtml: string;
  vendor: string;
  productType: string;
  status: "ACTIVE" | "DRAFT" | "ARCHIVED";
  tags: string[];
  variants: { price: string; sku: string; inventoryPolicy: string }[];
  metafields: MetafieldInput[];
  media: MediaInput[];
  seoDescription: string;
}

const VALID_METAL_COLORS = ["White Gold", "Yellow Gold", "Rose Gold", "Two-Tone", "Platinum"];
const VALID_SHAPES = ["Round", "Oval", "Emerald", "Marquise", "Pear", "Princess", "Cushion", "Baguette", "Heart", "Radiant", "Asscher"];

export function na(val: string | undefined): string {
  if (!val) return "";
  const v = val.trim();
  if (v.toLowerCase() === "n/a" || v.toLowerCase() === "fix") return "";
  return v;
}

export function shouldSkip(row: AirtableRecord): boolean {
  return row["New website"]?.trim() !== "checked" || row["Archived"]?.trim() === "checked";
}

export function cleanPrice(val: string | undefined): string {
  if (!val) return "0.00";
  return val.replace(/\$/g, "").replace(/,/g, "").trim();
}

export function mapMetalColor(mcRaw: string | undefined): string {
  const mc = na(mcRaw);
  if (!mc) return "";
  const parts = mc.split(",").map((p) => p.trim());
  for (const part of parts) {
    for (const v of VALID_METAL_COLORS) {
      if (v.toLowerCase() === part.toLowerCase()) return v;
    }
  }
  for (const v of VALID_METAL_COLORS) {
    if (mc.toLowerCase().includes(v.toLowerCase())) return v;
  }
  return "";
}

export function mapMetalCombined(mtRaw: string | undefined, mcRaw: string | undefined): string {
  const mt = na(mtRaw);
  const mc = mapMetalColor(mcRaw);
  if (!mc) return "";
  if (mc === "Platinum") return "Platinum";
  if (!mt) return "";
  const karat = mt.replace(/KT/g, "k").replace(/(?<![0-9])K(?!T)/g, "k");
  return `${karat} ${mc}`;
}

export function mapStoneShape(stoneShape: string | undefined): string {
  const ss = na(stoneShape);
  if (!ss) return "";
  const shapes = ss.split(",").map((s) => s.trim());
  for (const shape of shapes) {
    for (const v of VALID_SHAPES) {
      if (shape.toLowerCase() === v.toLowerCase()) return v;
    }
  }
  return "";
}

export function mapDiamondType(stoneType: string | undefined): string {
  const st = na(stoneType);
  if (!st) return "";
  if (st.toLowerCase().includes("natural")) return "Natural";
  if (st.toLowerCase().includes("lab")) return "Lab-Grown";
  return "";
}

export function buildHandle(sku: string, title: string): string {
  const text = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  const skuSlug = sku.toLowerCase().replace(/\s+/g, "-");
  return `${text}-${skuSlug}`;
}

export function parseImageUrls(cell: string | undefined): string[] {
  if (!cell) return [];
  const urls: string[] = [];
  const matches = [...cell.matchAll(/\S+?\.\w+\s+\((https?:\/\/[^)]+)\)/g)];
  for (const m of matches) {
    const fullMatch = m[0];
    const ext = fullMatch.split(".")[0].split("").reverse().join("").split(".")[0].split("").reverse().join("").toLowerCase();
    const realExt = fullMatch.split("(")[0].trim().split(".").pop()?.toLowerCase() ?? "";
    if (["jpg", "jpeg", "png", "gif", "webp"].includes(realExt)) {
      urls.push(m[1]);
    }
  }
  return urls;
}

export function mf(key: string, value: string, type = "single_line_text_field"): MetafieldInput {
  return { namespace: "custom", key, value, type };
}

export function listMf(key: string, values: string[]): MetafieldInput {
  const filtered = values.filter(Boolean);
  if (filtered.length === 0) return { namespace: "custom", key, value: "[]", type: "list.single_line_text_field" };
  return { namespace: "custom", key, value: JSON.stringify(filtered), type: "list.single_line_text_field" };
}
