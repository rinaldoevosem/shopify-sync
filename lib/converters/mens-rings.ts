import {
  AirtableRecord,
  ShopifyProductInput,
  na,
  cleanTitle,
  singleLine,
  cleanPrice,
  mapMetalColor,
  mapMetalCombined,
  mapDiamondType,
  buildHandle,
  parseMediaUrls,
  mf,
  listMf,
} from "./shared";

// Airtable stores stone shapes as abbreviations on the Men's Ring table
const SHAPE_MAP: Record<string, string> = {
  RD: "Round",
  BG: "Baguette",
  EM: "Emerald",
  PR: "Princess",
  OV: "Oval",
  MQ: "Marquise",
  PE: "Pear",
  CU: "Cushion",
  HE: "Heart",
  RA: "Radiant",
  AS: "Asscher",
};

const STONE_TYPE_CHOICES: Record<string, string> = {
  diamond: "Natural Diamond",
  diamonds: "Natural Diamond",
  "natural diamond": "Natural Diamond",
  "natural diamonds": "Natural Diamond",
  "lab grown diamond": "Lab Grown Diamond",
  "lab grown diamonds": "Lab Grown Diamond",
  "lab-grown diamond": "Lab Grown Diamond",
  "lab-grown diamonds": "Lab Grown Diamond",
  "black diamond": "Natural Diamond",
  "black diamonds": "Natural Diamond",
  "yellow diamond": "Natural Diamond",
  "yellow diamonds": "Natural Diamond",
  gemstone: "Gemstone",
  gemstones: "Gemstone",
};

function normalizeStoneTypes(raw: string | undefined): string[] {
  const v = na(raw);
  if (!v) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of v.split(",").map((s) => s.trim())) {
    const norm = STONE_TYPE_CHOICES[part.toLowerCase()];
    if (norm && !seen.has(norm)) {
      seen.add(norm);
      out.push(norm);
    }
  }
  return out;
}

function normalizeMetalType(raw: string | undefined): string {
  const v = na(raw);
  if (!v) return "";
  const upper = v.toUpperCase().replace(/\s+/g, "");
  if (upper === "14K" || upper === "14KT") return "14KT";
  if (upper === "18K" || upper === "18KT") return "18KT";
  return "";
}

// Read either "Stone Type" / "Stone Shape" or the double-space variants used in
// the Men's Ring Airtable.
function pick(row: AirtableRecord, ...keys: string[]): string {
  for (const k of keys) {
    const v = (row[k] ?? "").trim();
    if (v) return v;
  }
  return "";
}

function mapShapeFull(abbr: string | undefined): string[] {
  const v = na(abbr);
  if (!v) return [];
  return v
    .split(/[/,]/)
    .map((p) => p.trim().toUpperCase())
    .map((p) => SHAPE_MAP[p] ?? "")
    .filter(Boolean);
}

function buildTitle(row: AirtableRecord): string {
  const desc = na(row["Description"]);
  const stoneWeight = na(row["Stone Weight Total"]);
  const shapes = mapShapeFull(pick(row, "Stone  Shape", "Stone Shape"));

  const parts: string[] = ["Men's"];
  if (desc) parts.push(desc.replace(/\b\w/g, (c) => c.toUpperCase()));

  if (shapes.length) {
    const shapeStr = shapes.join(" & ");
    if (!parts.join(" ").toLowerCase().includes(shapeStr.toLowerCase())) {
      parts.push(shapeStr);
    }
  }

  const soFar = parts.join(" ").toLowerCase();
  if (!soFar.includes("ring") && !soFar.includes("band")) parts.push("Ring");

  if (stoneWeight) parts.push(`${stoneWeight} cts.`);

  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function buildBody(row: AirtableRecord): string {
  const lines: string[] = [];
  const metalType = na(row["Metal Type"]);
  const metalColor = na(row["Metal Color"]);
  const metalWeight = na(row["Metal Weight"]);
  const stoneType = pick(row, "Stone  Type", "Stone Type");
  const stoneQty = na(row["Stone Qty"]);
  const stoneWeight = na(row["Stone Weight Total"]);
  const size = na(row["Size"]);
  const shapes = mapShapeFull(pick(row, "Stone  Shape", "Stone Shape"));

  const mc = mapMetalColor(metalColor);
  if (mc === "Platinum") {
    lines.push("Platinum");
  } else if (metalType && mc) {
    lines.push(`${metalType.replace(/KT/g, "K")} ${mc}`);
  } else if (mc) {
    lines.push(mc);
  } else if (metalType) {
    lines.push(metalType);
  }

  if (stoneType && stoneType.toLowerCase().includes("diamond")) {
    if (shapes.length) {
      if (stoneQty) {
        lines.push(`${stoneQty.replace(/\.0$/, "")} ${shapes.join(" & ")} Diamonds`);
      } else {
        lines.push(`${shapes.join(" & ")} Diamonds`);
      }
    }
    if (stoneType.toLowerCase().includes("black")) lines.push("Black Diamonds");
    if (stoneType.toLowerCase().includes("yellow")) lines.push("Yellow Diamonds");
  }

  if (stoneWeight) lines.push(`${stoneWeight} cts.`);
  if (metalWeight) lines.push(`Metal Weight: ${metalWeight}g`);
  if (size) lines.push(`Size ${size}`);

  return lines.map((l) => `<p>${l}</p>`).join("");
}

function buildSeoDesc(row: AirtableRecord): string {
  const parts: string[] = [];
  const mc = mapMetalColor(row["Metal Color"]);
  const mt = na(row["Metal Type"]);
  if (mc === "Platinum") parts.push("Platinum");
  else if (mt && mc) parts.push(`${mt.replace(/KT/g, "K")} ${mc}`);
  const shapes = mapShapeFull(pick(row, "Stone  Shape", "Stone Shape"));
  if (shapes.length) parts.push(`${shapes.join(" & ")} Diamonds`);
  const sw = na(row["Stone Weight Total"]);
  if (sw) parts.push(`${sw} cts.`);
  return parts.join(" ");
}

function buildTags(row: AirtableRecord): string[] {
  const tags = new Set(["All Products", "Rings", "Men's Rings", "nil"]);
  const shapes = mapShapeFull(pick(row, "Stone  Shape", "Stone Shape"));
  for (const s of shapes) tags.add(`${s} Diamonds`);
  const mc = na(row["Metal Color"]);
  if (mc) {
    const ml = mc.toLowerCase();
    if (ml.includes("white")) tags.add("White Gold");
    if (ml.includes("yellow")) tags.add("Yellow Gold");
    if (ml.includes("rose")) tags.add("Rose Gold");
    if (ml.includes("platinum")) tags.add("Platinum");
    if (ml.includes("two-tone")) tags.add("Two-Tone");
  }
  return [...tags];
}

// Men's Ring Airtable doesn't have a "New Website" gate — only filter on Archived.
export function shouldSkipMensRing(row: AirtableRecord): boolean {
  return (row["Archived"] ?? "").trim().toLowerCase() === "checked";
}

export function convertMensRing(row: AirtableRecord): ShopifyProductInput {
  const sku = (row["Tag No."] ?? "").trim();
  const rawTitle = cleanTitle(row["Shopify Title"]) || buildTitle(row) || sku;
  const title = rawTitle.length > 255 ? rawTitle.slice(0, 252).trimEnd() + "..." : rawTitle;
  const handle = buildHandle(sku, title);

  const allMedia = parseMediaUrls(row["Image"]);
  const images = allMedia.filter((m) => m.mediaContentType === "IMAGE");
  const status = images.length > 0 ? "ACTIVE" : "DRAFT";

  const stoneTypeRaw = pick(row, "Stone  Type", "Stone Type");
  const stoneShapeRaw = pick(row, "Stone  Shape", "Stone Shape");
  const firstShape = mapShapeFull(stoneShapeRaw)[0] ?? "";

  const metafields = [
    mf("metal", mapMetalCombined(row["Metal Type"], row["Metal Color"])),
    listMf("metal_color", [mapMetalColor(row["Metal Color"])].filter(Boolean)),
    listMf("metal_type", [normalizeMetalType(row["Metal Type"])].filter(Boolean)),
    mf("diamond_shape", firstShape),
    mf("diamond_type", mapDiamondType(stoneTypeRaw)),
    listMf("stone_type", normalizeStoneTypes(stoneTypeRaw)),
    mf("stone_qty", singleLine(row["Stone Qty"])),
    mf("stone_total_weight", na(row["Stone Weight Total"])),
    mf("metal_weight", na(row["Metal Weight"])),
    mf("ring_size", na(row["Size"])),
    mf("details", na(row["Description"])),
  ].filter((m) => m.value && m.value !== "[]");

  return {
    sku,
    handle,
    title,
    descriptionHtml: buildBody(row),
    vendor: "Stein Diamonds",
    productType: "Mens Rings",
    status,
    tags: buildTags(row),
    variants: [{ price: cleanPrice(row["Sale Price"]), sku, inventoryPolicy: "DENY" }],
    metafields,
    media: allMedia,
    seoDescription: buildSeoDesc(row),
    templateSuffix: "jewelry-product-page",
  };
}
