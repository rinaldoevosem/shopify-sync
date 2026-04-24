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

  if (style && style.toLowerCase() !== "fix") {
    if (desc) {
      const descTitle = desc.replace(/\b\w/g, (c) => c.toUpperCase());
      if (descTitle.toLowerCase().includes(style.toLowerCase())) {
        parts.push(descTitle);
      } else {
        parts.push(`${descTitle} ${style}`);
      }
    } else {
      parts.push(style);
    }
  } else if (desc) {
    parts.push(desc.replace(/\b\w/g, (c) => c.toUpperCase()));
  }

  const soFar = parts.join(" ").toLowerCase();
  if (!soFar.includes("bracelet") && !soFar.includes("bangle") && !soFar.includes("cuff")) {
    parts.push("Bracelet");
  }

  const stoneWeight = na(row["Stone Total Weight"]);
  if (stoneWeight) parts.push(`${stoneWeight} cts.`);

  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function buildBody(row: AirtableRecord): string {
  const lines: string[] = [];
  const metalType = na(row["Metal Type"]);
  const metalColor = na(row["Metal Color"]);
  const tennisStyle = na(row["Tennis Style"]);
  const tennisSetting = na(row["Tennis Setting"]);
  const prong = na(row["Prong Setting"]);
  const stoneShape = na(row["Stone Shape"]);
  const stoneQty = na(row["Stone Qty"]);
  const stoneWeight = na(row["Stone Total Weight"]);
  const length = na(row["Length"]);
  const desc = na(row["Description"]);

  const mc = mapMetalColor(metalColor);
  if (mc === "Platinum") {
    lines.push("Platinum");
  } else if (metalType && mc) {
    lines.push(`${metalType.replace(/KT/g, "K")} ${mc}`);
  } else if (mc) {
    lines.push(mc);
  }

  if (tennisStyle && tennisStyle.toLowerCase() !== "straight") {
    lines.push(`${tennisStyle} Setting`);
  }
  if (tennisSetting && tennisSetting.toLowerCase() !== "prong") {
    lines.push(`${tennisSetting} Setting`);
  }
  if (prong) lines.push(`${prong} setting`);

  if (stoneShape) {
    const shapes = stoneShape.split(",").map((s) => s.trim());
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
  const stoneWeight = na(row["Stone Total Weight"]);
  const length = na(row["Length"]);
  const prong = na(row["Prong Setting"]);
  const tennisSetting = na(row["Tennis Setting"]);

  const mc = mapMetalColor(metalColor);
  if (mc === "Platinum") {
    parts.push("Platinum");
  } else if (metalType && mc) {
    parts.push(`${metalType.replace(/KT/g, "K")} ${mc}`);
  }

  if (prong) parts.push(prong);
  if (tennisSetting && tennisSetting.toLowerCase() !== "prong") {
    parts.push(`${tennisSetting} Setting`);
  }
  if (stoneShape) {
    const shapes = stoneShape.split(",").map((s) => s.trim());
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
  const tags = new Set(["All Products", "Bracelets", "nil"]);

  const style = na(row["Style"]);
  if (style) {
    const sl = style.toLowerCase();
    if (sl.includes("tennis")) tags.add("Tennis Bracelet");
    if (sl.includes("bangle") || sl.includes("cuff")) tags.add("Bangles and Cuffs");
    if (sl.includes("chain") || sl.includes("link")) tags.add("Chain and Links");
    if (sl.includes("diamond")) tags.add("Diamond Bracelets");
    if (sl.includes("pendant")) tags.add("Pendants");
    if (sl.includes("statement")) tags.add("Statement");
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

export function convertBracelet(row: AirtableRecord): ShopifyProductInput {
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

  const metafields = [
    mf("metal", mapMetalCombined(row["Metal Type"], row["Metal Color"])),
    listMf("metal_color", [mapMetalColor(row["Metal Color"])].filter(Boolean)),
    listMf("metal_type", na(row["Metal Type"]) ? [na(row["Metal Type"])] : []),
    mf("diamond_shape", mapStoneShape(row["Stone Shape"])),
    mf("diamond_type", mapDiamondType(row["Stone Type"])),
    listMf("stone_type", na(row["Stone Type"]) ? na(row["Stone Type"])!.split(",").map((s) => s.trim()).filter(Boolean) : []),
    mf("stone_qty", singleLine(row["Stone Qty"])),
    mf("stone_total_weight", na(row["Stone Total Weight"])),
    mf("details", na(row["Description"])),
    mf("metal_weight", na(row["Metal Weight"])),
    mf("bracelet_style", na(row["Style"])),
    mf("length", na(row["Length"])),
  ].filter((m) => m.value && m.value !== "[]");

  return {
    sku,
    handle,
    title,
    descriptionHtml: buildBody(row),
    vendor: "Stein Diamonds",
    productType: "Bracelets",
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
  };
}
