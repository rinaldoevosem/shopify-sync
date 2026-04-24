import { NextRequest, NextResponse } from "next/server";
import { getCsvData, appendLog, getConfig, saveConfig, storeVideoQueue, VideoQueueEntry, Category, CATEGORIES } from "@/lib/kv";
import { fetchSkuMap, upsertProduct, SkuEntry } from "@/lib/shopify";
import { shouldSkip, AirtableRecord } from "@/lib/converters/shared";
import { convertRing } from "@/lib/converters/rings";
import { convertBracelet } from "@/lib/converters/bracelets";
import { convertEarring } from "@/lib/converters/earrings";
import { convertNecklace } from "@/lib/converters/necklaces";

export const maxDuration = 300;

type Converter = (row: AirtableRecord) => ReturnType<typeof convertRing>;

// Converter registry — extend as more category converters are ported
function getConverter(cat: Category): Converter | null {
  switch (cat) {
    case "rings":
      return convertRing;
    case "bracelets":
      return convertBracelet;
    case "earrings":
      return convertEarring;
    case "necklaces":
      return convertNecklace;
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
  const videoQueue: VideoQueueEntry[] = [];

  // Build full SKU map across all products — catches duplicates regardless of product type
  const skuMap = dry ? new Map<string, SkuEntry>() : await fetchSkuMap();

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

      // Queue videos for separate processing — Shopify requires staged uploads for video
      const videoMedia = product.media.filter((m) => m.mediaContentType === "VIDEO");
      if (videoMedia.length > 0 && result.productId && result.productId !== "dry-run") {
        videoQueue.push({
          productGid: result.productId,
          sku: product.sku,
          videoUrls: videoMedia.map((m) => m.originalSource),
          filenames: videoMedia.map((m) => m.filename),
        });
      }
    } catch (err) {
      errors++;
      const sku = row["Item No."] ?? "unknown";
      errorDetails.push(`SKU ${sku}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const completedAt = new Date().toISOString();
  const logEntry = { category: cat, startedAt, completedAt, created, updated, skipped, errors, errorDetails };

  if (!dry) {
    await appendLog(cat, logEntry);
    const config = await getConfig(cat);
    await saveConfig(cat, { ...config, lastRunAt: completedAt });
    if (videoQueue.length > 0) {
      await storeVideoQueue(cat, videoQueue);
    }
  }

  return NextResponse.json({ ...logEntry, videosQueued: videoQueue.length });
}
