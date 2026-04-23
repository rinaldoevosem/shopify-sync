import { NextRequest, NextResponse } from "next/server";
import { getCsvData, appendLog, getConfig, saveConfig, Category, CATEGORIES } from "@/lib/kv";
import { fetchSkuMap, upsertProduct, SkuEntry } from "@/lib/shopify";
import { shouldSkip, AirtableRecord } from "@/lib/converters/shared";
import { convertRing } from "@/lib/converters/rings";

type Converter = (row: AirtableRecord) => ReturnType<typeof convertRing>;

// Converter registry — extend as more category converters are ported
function getConverter(cat: Category): Converter | null {
  switch (cat) {
    case "rings":
      return convertRing;
    default:
      return null;
  }
}

// Map category id to Shopify product type string
const PRODUCT_TYPE: Record<Category, string> = {
  rings: "Rings",
  bracelets: "Bracelets",
  necklaces: "Necklaces",
  earrings: "Earrings",
  bags: "Bags",
  "mens-rings": "Mens Rings",
  "designer-jewelry": "Designer Jewelry",
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ category: string }> }
) {
  const { category } = await params;
  const cat = category as Category;

  if (!CATEGORIES.find((c) => c.id === cat)) {
    return NextResponse.json({ error: "Unknown category" }, { status: 400 });
  }

  const dry = req.nextUrl.searchParams.get("dry") === "true";

  const converter = getConverter(cat);
  if (!converter) {
    return NextResponse.json({ error: `Converter for '${cat}' not yet implemented` }, { status: 501 });
  }

  const csvData = await getCsvData(cat);
  if (!csvData) {
    return NextResponse.json({ error: "No CSV data uploaded for this category" }, { status: 404 });
  }

  const { records } = csvData;
  const eligible = records.filter((row) => !shouldSkip(row));

  const startedAt = new Date().toISOString();
  let created = 0;
  let updated = 0;
  let skipped = records.length - eligible.length;
  let errors = 0;
  const errorDetails: string[] = [];

  // Build SKU map from Shopify (skip in dry run to avoid slow startup)
  const skuMap = dry ? new Map<string, SkuEntry>() : await fetchSkuMap(PRODUCT_TYPE[cat]);

  for (const row of eligible) {
    try {
      const product = converter(row);
      if (!product.sku) {
        skipped++;
        continue;
      }

      const existingEntry = skuMap.get(product.sku);
      const result = await upsertProduct(product, existingEntry, dry);

      if (result.errors.length > 0) {
        errors++;
        errorDetails.push(`SKU ${product.sku}: ${result.errors.join("; ")}`);
      } else if (result.action === "created") {
        created++;
      } else {
        updated++;
      }
    } catch (err) {
      errors++;
      const sku = row["Item No."] ?? "unknown";
      errorDetails.push(`SKU ${sku}: ${err instanceof Error ? err.message : String(err)}`);
    }

    if (!dry) await sleep(300);
  }

  const completedAt = new Date().toISOString();
  const logEntry = { category: cat, startedAt, completedAt, created, updated, skipped, errors, errorDetails };

  if (!dry) {
    await appendLog(cat, logEntry);
    const config = await getConfig(cat);
    await saveConfig(cat, { ...config, lastRunAt: completedAt });
  }

  return NextResponse.json(logEntry);
}
