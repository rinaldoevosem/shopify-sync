import {
  AirtableRecord,
  ShopifyProductInput,
  na,
  cleanPrice,
  mapMetalColor,
  mapMetalCombined,
  mapStoneShape,
  mapDiamondType,
  buildHandle,
  parseImageUrls,
  mf,
  listMf,
} from "./shared";

function buildTitle(row: AirtableRecord): string {
  const parts: string[] = [];
  const mc = mapMetalColor(row["Metal Color"]);
  if (mc) parts.push(mc);

  const desc = na(row["Description"]);
  if (desc) parts.push(desc.replace(/\b\w/g, (c) => c.toUpperCase()));

  const category = na(row["Category"]);
  const catLower = category.toLowerCase();
  const titleSoFar = parts.join(" ").toLowerCase();

  if (category) {
    if (!titleSoFar.includes(catLower)) {
      if (catLower.includes("engagement")) parts.push("Engagement Ring");
      else if (catLower.includes("eternity")) parts.push("Eternity Ring");
      else if (catLower.includes("men")) parts.push("Men's Band");
      else if (catLower.includes("women")) parts.push("Women's Band");
      else if (catLower.includes("cocktail")) parts.push("Cocktail Ring");
      else if (catLower.includes("fashion")) parts.push("Fashion Ring");
    }
  } else {
    const style = na(row["Style"]);
    const t = parts.join(" ").toLowerCase();
    if (style.toLowerCase().includes("engagement") && !t.includes("engagement"))
      parts.push("Engagement Ring");
    else if (style.toLowerCase().includes("band") && !t.includes("band"))
      parts.push("Band");
    else if (!t.includes("ring") && !t.includes("band"))
      parts.push("Ring");
  }

  const finalCheck = parts.join(" ").toLowerCase();
  if (!finalCheck.includes("ring") && !finalCheck.includes("band")) parts.push("Ring");

  const stoneWeight = na(row["Stone Weight Total"]);
  if (stoneWeight) parts.push(`${stoneWeight} cts.`);

  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function buildBody(row: AirtableRecord): string {
  const lines: string[] = [];
  const metalType = na(row["Metal Type"]);
  const metalColor = na(row["Metal Color"]);
  const stoneShape = na(row["Stone Shape"]);
  const stoneQty = na(row["Stone Qty"]);
  const stoneWeight = na(row["Stone Weight Total"]);
  const centerWeight = na(row["Center Stone Weight"]);
  const size = na(row["Size"]);
  const desc = na(row["Description"]);

  const mc = mapMetalColor(metalColor);
  if (mc === "Platinum") {
    lines.push("Platinum");
  } else if (metalType && mc) {
    lines.push(`${metalType.replace(/KT/g, "K")} ${mc}`);
  } else if (mc) {
    lines.push(mc);
  }

  if (stoneShape) {
    const shapes = stoneShape.split(",").map((s) => s.trim());
    if (stoneQty) {
      const qty = stoneQty.replace(/\.0$/, "");
      const n = parseFloat(stoneQty);
      lines.push(`${qty} ${shapes.join(" & ")} Diamond${n > 1 ? "s" : ""}`);
    } else {
      lines.push(`${shapes.join(" & ")} Diamonds`);
    }
  }

  if (centerWeight) lines.push(`Center Stone: ${centerWeight} cts.`);
  if (stoneWeight) lines.push(`${stoneWeight} cts. total`);
  if (size) lines.push(`Size ${size}`);

  const dUpper = desc.toUpperCase();
  if (desc && (dUpper.includes("GIA") || dUpper.includes("EGL") || dUpper.includes("CENTER"))) {
    lines.push(desc);
  }

  return lines.map((l) => `<p>${l}</p>`).join("");
}

function buildTags(row: AirtableRecord): string[] {
  const tags = new Set(["All Products", "Rings", "nil"]);

  const style = na(row["Style"]);
  if (style) style.split(",").map((s) => s.trim()).filter((s) => s && s.toLowerCase() !== "fix").forEach((s) => tags.add(s));

  const category = na(row["Category"]);
  if (category) tags.add(category);

  const engStyle = na(row["Engagement Rings Style"]);
  if (engStyle) engStyle.split(",").map((s) => s.trim()).filter(Boolean).forEach((s) => tags.add(s));

  const bandsStyle = na(row["Bands Style"]);
  if (bandsStyle) bandsStyle.split(",").map((s) => s.trim()).filter(Boolean).forEach((s) => tags.add(s));

  const mc = na(row["Metal Color"]);
  if (mc) {
    if (mc.toLowerCase().includes("white")) tags.add("White Gold");
    if (mc.toLowerCase().includes("yellow")) tags.add("Yellow Gold");
    if (mc.toLowerCase().includes("rose")) tags.add("Rose Gold");
    if (mc.toLowerCase().includes("platinum")) tags.add("Platinum");
    if (mc.toLowerCase().includes("two-tone")) tags.add("Two-Tone");
  }

  const stoneShape = na(row["Stone Shape"]);
  if (stoneShape && stoneShape.toLowerCase() !== "n/a") {
    stoneShape.split(",").map((s) => s.trim()).filter((s) => s && !["n/a", "fix"].includes(s.toLowerCase())).forEach((s) => tags.add(`${s} Diamonds`));
  }

  return [...tags];
}

export function convertRing(row: AirtableRecord): ShopifyProductInput {
  const sku = row["Item No."]?.trim() ?? "";
  const title = buildTitle(row);
  const handle = buildHandle(sku, title);

  const imageUrls = parseImageUrls(row["Image"]);

  const metafields = [
    mf("metal", mapMetalCombined(row["Metal Type"], row["Metal Color"])),
    listMf("metal_color", [mapMetalColor(row["Metal Color"])].filter(Boolean)),
    listMf("metal_type", na(row["Metal Type"]) ? [na(row["Metal Type"])] : []),
    mf("diamond_shape", mapStoneShape(row["Stone Shape"])),
    mf("diamond_type", mapDiamondType(row["Stone Type"])),
    listMf("stone_type", na(row["Stone Type"]) ? [na(row["Stone Type"])] : []),
    mf("stone_qty", na(row["Stone Qty"])),
    mf("stone_total_weight", na(row["Stone Weight Total"])),
    mf("center_stone_weight", na(row["Center Stone Weight"])),
    mf("details", na(row["Description"])),
    mf("metal_weight", na(row["Metal Weight"])),
    mf("ring_category", na(row["Category"])),
    mf("bands_style", na(row["Bands Style"])),
    mf("engagement_rings_style", na(row["Engagement Rings Style"])),
  ].filter((m) => m.value && m.value !== "[]");

  return {
    sku,
    handle,
    title,
    descriptionHtml: buildBody(row),
    vendor: "Stein Diamonds",
    productType: "Rings",
    status: "ACTIVE",
    tags: buildTags(row),
    variants: [
      {
        price: cleanPrice(row["Sale Price"]),
        sku,
        inventoryPolicy: "DENY",
      },
    ],
    metafields,
    media: imageUrls.map((url) => ({ originalSource: url, mediaContentType: "IMAGE" as const })),
    seoDescription: buildSeoDesc(row),
  };
}

function buildSeoDesc(row: AirtableRecord): string {
  const parts: string[] = [];
  const mc = mapMetalColor(row["Metal Color"]);
  const mt = na(row["Metal Type"]);
  if (mc === "Platinum") parts.push("Platinum");
  else if (mt && mc) parts.push(`${mt.replace(/KT/g, "K")} ${mc}`);
  const ss = na(row["Stone Shape"]);
  if (ss) parts.push(`${ss.split(",").map((s) => s.trim()).join(" & ")} Diamonds`);
  const sw = na(row["Stone Weight Total"]);
  if (sw) parts.push(`${sw} cts.`);
  return parts.join(" ");
}
