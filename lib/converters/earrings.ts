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

const JEWELRY_STYLE_CHOICES: Record<string, string> = {
  studs: "Studs",
  stud: "Studs",
  hoops: "Hoops",
  hoop: "Hoops",
  dangles: "Dangles",
  dangle: "Dangles",
  huggies: "Huggies",
  huggie: "Huggies",
  climbers: "Climbers",
  climber: "Climbers",
  vintage: "Vintage",
  "fancy yellow": "Fancy Yellow",
  "emerald cut": "Emerald Cut",
  graduated: "Graduated",
  fashion: "Fashion",
  "color stones": "Color Stones",
};

function mapJewelryStyle(styleRaw: string | undefined): string {
  const v = na(styleRaw).toLowerCase();
  if (!v) return "";
  return JEWELRY_STYLE_CHOICES[v] ?? "";
}

// "4.0" → "4", "2.5" → "2.5", "HALO" → "HALO"
function cleanNumber(val: string | undefined): string {
  const v = na(val);
  if (!v) return "";
  const n = parseFloat(v);
  if (isNaN(n)) return v;
  return Number.isInteger(n) ? String(Math.trunc(n)) : String(n);
}

function buildTitle(row: AirtableRecord): string {
  const parts: string[] = [];

  const mc = mapMetalColor(row["Metal Color"]);
  if (mc) parts.push(mc);

  const desc = na(row["Description"]);
  if (desc) parts.push(desc.replace(/\b\w/g, (c) => c.toUpperCase()));

  const style = na(row["Style"]);
  if (style) {
    const soFar = parts.join(" ").toLowerCase();
    if (!soFar.includes(style.toLowerCase())) parts.push(style);
  }

  const soFar = parts.join(" ").toLowerCase();
  if (
    !soFar.includes("earring") &&
    !soFar.includes("huggi") &&
    !soFar.includes("stud") &&
    !soFar.includes("hoop")
  ) {
    parts.push("Earrings");
  }

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
  const backing = na(row["Backing"]);
  const prongs = na(row["No. of Prongs"]);
  const desc = na(row["Description"]);

  const mc = mapMetalColor(metalColor);
  if (mc === "Platinum") {
    lines.push("Platinum");
  } else if (metalType && mc) {
    lines.push(`${metalType.replace(/KT/g, "K")} ${mc}`);
  } else if (mc) {
    lines.push(mc);
  }

  if (prongs) {
    const p = prongs.replace(/\.0$/, "");
    if (p.toUpperCase() === "HALO") {
      lines.push("Halo Setting");
    } else {
      lines.push(`${p}-prong setting`);
    }
  }

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
  if (backing) lines.push(`${backing} Back`);

  const dUpper = desc.toUpperCase();
  if (desc && (dUpper.includes("GIA") || dUpper.includes("EGL") || dUpper.includes("CENTER"))) {
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

  const mc = mapMetalColor(metalColor);
  if (mc === "Platinum") {
    parts.push("Platinum");
  } else if (metalType && mc) {
    parts.push(`${metalType.replace(/KT/g, "K")} ${mc}`);
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
  return parts.join(" ");
}

function buildTags(row: AirtableRecord): string[] {
  const tags = new Set(["All Products", "Earrings", "nil"]);

  const style = na(row["Style"]);
  if (style) tags.add(style);

  const mc = na(row["Metal Color"]);
  if (mc) {
    const mcLower = mc.toLowerCase();
    if (mcLower.includes("white")) tags.add("White Gold");
    if (mcLower.includes("yellow")) tags.add("Yellow Gold");
    if (mcLower.includes("rose")) tags.add("Rose Gold");
    if (mcLower.includes("platinum")) tags.add("Platinum");
  }

  const stoneShape = na(row["Stone Shape"]);
  if (stoneShape && stoneShape.toLowerCase() !== "n/a") {
    stoneShape
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s && !["n/a", "fix"].includes(s.toLowerCase()))
      .forEach((s) => tags.add(`${s} Diamonds`));
  }

  return [...tags];
}

export function convertEarring(row: AirtableRecord): ShopifyProductInput {
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

  // Mirrors archive/fill_missing_metafields.py build_earring_fields — keys + types
  // match the Shopify Earrings metafield definitions in the Stein Diamonds store.
  const metafields = [
    mf("metal", mapMetalCombined(row["Metal Type"], row["Metal Color"])),
    mf("diamond_shape", mapStoneShape(row["Stone Shape"])),
    mf("diamond_type", mapDiamondType(row["Stone Type"])),
    listMf("stone_type", na(row["Stone Type"]) ? na(row["Stone Type"])!.split(",").map((s) => s.trim()).filter(Boolean) : []),
    mf("jewelry_style", mapJewelryStyle(row["Style"])),
    listMf("metal_type", na(row["Metal Type"]) ? [na(row["Metal Type"])] : []),
    listMf("metal_color", [mapMetalColor(row["Metal Color"])].filter(Boolean)),
    mf("stone_qty", singleLine(row["Stone Qty"])),
    mf("stone_total_weight", na(row["Stone Weight Total"])),
    mf("no_of_prongs", cleanNumber(row["No. of Prongs"])),
    mf("backing", na(row["Backing"])),
    mf("details", na(row["Description"])),
    mf("metal_weight", na(row["Metal Weight"])),
  ].filter((m) => m.value && m.value !== "[]");

  return {
    sku,
    handle,
    title,
    descriptionHtml: buildBody(row),
    vendor: "Stein Diamonds",
    productType: "Earrings",
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
