import {
  AirtableRecord,
  ShopifyProductInput,
  na,
  singleLine,
  cleanPrice,
  mapMetalColor,
  mapMetalCombined,
  mapStoneShape,
  mapDiamondType,
  buildHandle,
  parseMediaUrls,
  mf,
  listMf,
} from "./shared";

function buildTitle(row: AirtableRecord): string {
  const parts: string[] = [];
  const mc = mapMetalColor(row["Metal Color"]);
  if (mc) parts.push(mc);

  const style = na(row["Style"]);
  const desc = na(row["Description"]);
  const sku = (row["Item No."] ?? "").trim();

  const descTitle = desc ? desc.replace(/\b\w/g, (c) => c.toUpperCase()) : "";

  if (style && style.toUpperCase() !== "FIX") {
    if (descTitle) {
      if (descTitle.toLowerCase().includes(style.toLowerCase())) {
        parts.push(descTitle);
      } else {
        parts.push(`${descTitle} ${style}`);
      }
    } else {
      parts.push(style);
    }
  } else if (style.toUpperCase() === "FIX") {
    parts.push(descTitle || "Necklace");
  } else if (descTitle) {
    parts.push(descTitle);
  }

  const soFar = parts.join(" ").toLowerCase();
  if (sku.startsWith("P-")) {
    if (!soFar.includes("pendant") && !soFar.includes("solitaire")) {
      parts.push("Pendant");
    }
  } else if (
    !soFar.includes("necklace") &&
    !soFar.includes("choker") &&
    !soFar.includes("lariat") &&
    !soFar.includes("chain")
  ) {
    parts.push("Necklace");
  }

  const stoneWeight = na(row["Stone Weight Total"]);
  if (stoneWeight) parts.push(`${stoneWeight} cts.`);

  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function buildBody(row: AirtableRecord): string {
  const lines: string[] = [];
  const metalType = na(row["Metal Type"]);
  const metalColor = na(row["Metal Color"]);
  const tennisStyle = na(row["Tennis Style"]);
  const tennisSetting = na(row["Tennis Setting"]);
  const prong = na(row["Prong setting"]);
  const stoneShape = na(row["Stone Shape"]);
  const stoneQty = na(row["Stone Qty"]);
  const stoneWeight = na(row["Stone Weight Total"]);
  const length = na(row["Length"]);
  const desc = na(row["Description"]);

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

  if (tennisStyle && tennisStyle.toLowerCase() !== "straight") {
    lines.push(`${tennisStyle} Setting`);
  }

  if (tennisSetting) {
    const ts = tennisSetting.toLowerCase();
    if (ts === "bezel") lines.push("Bezel Setting");
    else if (ts === "illusion") lines.push("Illusion Setting");
  }

  if (prong) lines.push(`${prong} setting`);

  if (stoneShape && stoneShape.toLowerCase() !== "n/a") {
    const shapes = stoneShape.split(",").map((s) => s.trim()).filter(Boolean);
    if (stoneQty) {
      const qty = stoneQty.replace(/\.0$/, "");
      const n = parseFloat(stoneQty);
      if (!isNaN(n)) {
        lines.push(`${qty} ${shapes.join(" & ")} Diamond${n > 1 ? "s" : ""}`);
      } else {
        lines.push(`${shapes.join(" & ")} Diamonds`);
      }
    } else {
      lines.push(`${shapes.join(" & ")} Diamonds`);
    }
  }

  if (stoneWeight) lines.push(`${stoneWeight} cts.`);
  if (length) {
    const lengthClean = length.replace(/\.0$/, "");
    lines.push(`${lengthClean} inches`);
  }

  const dUpper = desc.toUpperCase();
  if (desc && (dUpper.includes("GIA") || dUpper.includes("EGL") || dUpper.includes("CENTER") || dUpper.includes("SOLITAIRE"))) {
    lines.push(desc);
  }

  return lines.map((l) => `<p>${l}</p>`).join("");
}

function buildSeoDesc(row: AirtableRecord): string {
  const parts: string[] = [];
  const metalType = na(row["Metal Type"]);
  const metalColor = na(row["Metal Color"]);
  const stoneShape = na(row["Stone Shape"]);
  const stoneQty = na(row["Stone Qty"]);
  const stoneWeight = na(row["Stone Weight Total"]);
  const length = na(row["Length"]);
  const prong = na(row["Prong setting"]);
  const tennisSetting = na(row["Tennis Setting"]);

  const mc = mapMetalColor(metalColor);
  if (mc === "Platinum") {
    parts.push("Platinum");
  } else if (metalType && mc) {
    parts.push(`${metalType.replace(/KT/g, "K")} ${mc}`);
  }

  if (prong) parts.push(prong);
  if (tennisSetting && !["prong", "n/a"].includes(tennisSetting.toLowerCase())) {
    parts.push(`${tennisSetting} Setting`);
  }

  if (stoneShape && stoneShape.toLowerCase() !== "n/a") {
    const shapes = stoneShape.split(",").map((s) => s.trim()).filter(Boolean);
    if (stoneQty) {
      const qty = stoneQty.replace(/\.0$/, "");
      parts.push(`${qty} ${shapes.join(" & ")} Diamonds`);
    } else {
      parts.push(`${shapes.join(" & ")} Diamonds`);
    }
  }

  if (stoneWeight) parts.push(`${stoneWeight} cts.`);
  if (length) {
    const lengthClean = length.replace(/\.0$/, "");
    parts.push(`${lengthClean} inches`);
  }
  return parts.join(" ");
}

function buildTags(row: AirtableRecord): string[] {
  const tags = new Set(["All Products", "Necklaces", "nil"]);

  const style = na(row["Style"]);
  const sku = (row["Item No."] ?? "").trim();

  if (style) {
    const sl = style.toLowerCase();
    if (sl.includes("tennis")) tags.add("Tennis Necklace");
    if (sl.includes("chain")) tags.add("Chains");
    if (sl.includes("pendant") || sku.startsWith("P-")) tags.add("Pendants");
    if (sl.includes("choker")) tags.add("Chokers");
    if (sl.includes("lariat")) tags.add("Lariats");
    if (sl.includes("solitaire")) tags.add("Solitaire");
    if (sl.includes("diamond")) tags.add("Diamond Necklaces");
  }

  const mc = na(row["Metal Color"]);
  if (mc) {
    const mcLower = mc.toLowerCase();
    if (mcLower.includes("white")) tags.add("White Gold");
    if (mcLower.includes("yellow")) tags.add("Yellow Gold");
    if (mcLower.includes("rose")) tags.add("Rose Gold");
    if (mcLower.includes("platinum")) tags.add("Platinum");
    if (mcLower.includes("two-tone")) tags.add("Two-Tone");
  }

  const stoneShape = na(row["Stone Shape"]);
  if (stoneShape && stoneShape.toLowerCase() !== "n/a") {
    stoneShape
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s && s.toLowerCase() !== "n/a")
      .forEach((s) => tags.add(`${s} Diamonds`));
  }

  return [...tags];
}

export function convertNecklace(row: AirtableRecord): ShopifyProductInput {
  const sku = row["Item No."]?.trim() ?? "";
  const title = na(row["Shopify Title"]) || buildTitle(row) || sku;
  const handle = buildHandle(sku, title);

  const allMedia = parseMediaUrls(row["Image"]);
  const ecommMedia = parseMediaUrls(row["Ecomm Photos"]);
  const seenUrls = new Set(allMedia.map((m) => m.originalSource));
  for (const m of ecommMedia) {
    if (!seenUrls.has(m.originalSource)) {
      allMedia.push(m);
      seenUrls.add(m.originalSource);
    }
  }
  const images = allMedia.filter((m) => m.mediaContentType === "IMAGE");
  const status = images.length > 0 ? "ACTIVE" : "DRAFT";

  // Mirrors archive/fill_missing_metafields.py build_necklace_fields — keys + types
  // match the Shopify Necklaces metafield definitions in the Stein Diamonds store.
  // Note: CSV column is "Prong setting" with lowercase s, unlike Bracelets.
  const metafields = [
    mf("metal", mapMetalCombined(row["Metal Type"], row["Metal Color"])),
    mf("diamond_shape", mapStoneShape(row["Stone Shape"])),
    mf("diamond_type", mapDiamondType(row["Stone Type"])),
    listMf("stone_type", na(row["Stone Type"]) ? na(row["Stone Type"])!.split(",").map((s) => s.trim()).filter(Boolean) : []),
    listMf("metal_type", na(row["Metal Type"]) ? [na(row["Metal Type"])] : []),
    listMf("metal_color", [mapMetalColor(row["Metal Color"])].filter(Boolean)),
    mf("tennis_style", na(row["Tennis Style"])),
    mf("tennis_setting", na(row["Tennis Setting"])),
    mf("prong_setting", na(row["Prong setting"])),
    mf("stone_qty", singleLine(row["Stone Qty"])),
    mf("stone_total_weight", na(row["Stone Weight Total"])),
    mf("length", na(row["Length"])),
    mf("details", na(row["Description"])),
    mf("metal_weight", na(row["Metal Weight"])),
  ].filter((m) => m.value && m.value !== "[]");

  return {
    sku,
    handle,
    title,
    descriptionHtml: buildBody(row),
    vendor: "Stein Diamonds",
    productType: "Necklaces",
    status,
    tags: buildTags(row),
    variants: [
      {
        price: cleanPrice(row["Sale Price"]),
        sku,
        inventoryPolicy: "DENY",
      },
    ],
    metafields,
    media: allMedia,
    seoDescription: buildSeoDesc(row),
    templateSuffix: "jewelry-product-template",
  };
}
