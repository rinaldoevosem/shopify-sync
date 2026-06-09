import {
  AirtableRecord,
  ShopifyProductInput,
  cleanTitle,
  cleanPrice,
  singleLine,
  buildHandle,
  parseMediaUrls,
  mf,
} from "./shared";

// Tolerant column lookup — the Bags table has quirky headers (e.g. "Description "
// with a trailing space). Match on the normalized (lowercased, collapsed) name.
function field(row: AirtableRecord, name: string): string {
  const want = name.toLowerCase().replace(/\s+/g, " ").trim();
  for (const k of Object.keys(row)) {
    if (k.toLowerCase().replace(/\s+/g, " ").trim() === want) return (row[k] ?? "").trim();
  }
  return "";
}

// Airtable checkboxes are flattened to "checked" / "" by flattenRecord.
const isChecked = (v: string) => v.trim().toLowerCase() === "checked";

// Brands arrive ALL-CAPS ("LOUIS VUITTON"); normalize so vendor grouping is stable.
function titleCaseBrand(raw: string): string {
  return raw
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// Eligibility: any bag with a SKU and at least one image (Status is mostly blank
// in Airtable and does not indicate availability, so it is not gated on).
export function shouldSkipBag(row: AirtableRecord): boolean {
  if (!field(row, "SKU")) return true;
  const images = parseMediaUrls(field(row, "IMG")).filter((m) => m.mediaContentType === "IMAGE");
  return images.length === 0;
}

// Material has no dedicated column; it's embedded in "Ebay Req'd Info" as a line
// like "- Exterior Material: Taurillon Clemence leather".
function extractMaterial(row: AirtableRecord): string {
  const m = field(row, "Ebay Req'd Info").match(/Exterior Material:\s*([^\n]+)/i);
  return m ? m[1].trim() : "";
}

function buildBody(row: AirtableRecord): string {
  const lines: string[] = [];
  const push = (text: string) =>
    text
      .split(/\r?\n+/)
      .map((l) => l.trim())
      .filter(Boolean)
      .forEach((l) => lines.push(l));

  push(field(row, "Description"));
  const condition = field(row, "Condition Description") || field(row, "Damage Info");
  if (condition) push(condition);

  const includes: string[] = [];
  if (isChecked(field(row, "Box"))) includes.push("Box");
  if (isChecked(field(row, "Dust Bag"))) includes.push("Dust Bag");
  if (includes.length) lines.push(`Includes: ${includes.join(", ")}`);
  if (isChecked(field(row, "Auth"))) lines.push("Authenticated");

  return lines.map((l) => `<p>${l}</p>`).join("");
}

function buildTags(row: AirtableRecord): string[] {
  const tags = new Set(["All Products", "Designer Bags"]);
  const brand = titleCaseBrand(field(row, "Brand"));
  if (brand) tags.add(brand);
  field(row, "Color")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean)
    .forEach((c) => tags.add(c));
  return [...tags];
}

export function convertBag(row: AirtableRecord): ShopifyProductInput {
  const sku = field(row, "SKU");
  const brand = titleCaseBrand(field(row, "Brand"));

  const rawTitle =
    cleanTitle(field(row, "Ebay Title")) ||
    cleanTitle(field(row, "Description").split(/\r?\n/)[0]) ||
    sku;
  const title = rawTitle.length > 255 ? rawTitle.slice(0, 252).trimEnd() + "..." : rawTitle;
  const handle = buildHandle(sku, title);

  const media = parseMediaUrls(field(row, "IMG"));
  const images = media.filter((m) => m.mediaContentType === "IMAGE");
  const status = images.length > 0 ? "ACTIVE" : "DRAFT";

  const color = field(row, "Color");
  const material = extractMaterial(row);

  // Free-text custom metafields — no choice validation, so no LGD-style errors.
  const metafields = [
    mf("brand", brand),
    mf("color", color),
    mf("material", material),
    mf("condition", singleLine(field(row, "Condition Description"))),
    mf("authenticity", isChecked(field(row, "Auth")) ? "Authenticated" : ""),
    mf("box_included", isChecked(field(row, "Box")) ? "Yes" : ""),
    mf("dust_bag_included", isChecked(field(row, "Dust Bag")) ? "Yes" : ""),
  ].filter((m) => m.value);

  return {
    sku,
    handle,
    title,
    descriptionHtml: buildBody(row),
    vendor: brand || "Stein Diamonds",
    productType: "Bags",
    status,
    tags: buildTags(row),
    variants: [{ price: cleanPrice(field(row, "Serenity Price")), sku, inventoryPolicy: "DENY" }],
    metafields,
    media,
    seoDescription: [brand, color, material, "handbag"].filter(Boolean).join(" ").trim(),
  };
}
