import { NextRequest, NextResponse } from "next/server";
import { appendLog, getConfig, saveConfig, storeVideoQueue, VideoQueueEntry, Category, CATEGORIES } from "@/lib/kv";
import { fetchSkuMap, fetchOnlineStorePublicationId, upsertProduct, SkuEntry } from "@/lib/shopify";
import { shouldSkip, AirtableRecord } from "@/lib/converters/shared";
import { parseAirtableUrl, fetchAirtableRecords, flattenRecord } from "@/lib/airtable";
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

  const config = await getConfig(cat);
  const airtableUrl = config.airtableUrl?.trim();
  if (!airtableUrl) {
    return NextResponse.json(
      { error: "Airtable URL not configured for this category" },
      { status: 400 },
    );
  }

  let records: AirtableRecord[];
  try {
    const { baseId, tableId, viewId } = parseAirtableUrl(airtableUrl);
    const raw = await fetchAirtableRecords(baseId, tableId, viewId);
    records = raw.map(flattenRecord);
  } catch (err) {
    return NextResponse.json(
      { error: `Airtable fetch failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 },
    );
  }

  const eligible = records.filter((row) => !shouldSkip(row));

  const startedAt = new Date().toISOString();
  let created = 0;
  let updated = 0;
  let skipped = records.length - eligible.length;
  let errors = 0;
  const errorDetails: string[] = [];
  const videoQueue: VideoQueueEntry[] = [];

  // Build full SKU map across all products — catches duplicates regardless of product type.
  // Fetch the Online Store publication id in parallel so every upsert can publish to the channel.
  const [skuMap, onlineStorePublicationId] = dry
    ? [new Map<string, SkuEntry>(), null as string | null]
    : await Promise.all([fetchSkuMap(), fetchOnlineStorePublicationId()]);

  for (const row of eligible) {
    try {
      const product = converter(row);
      if (!product.sku) {
        skipped++;
        continue;
      }

      const existingEntry = skuMap.get(product.sku);
      const result = await upsertProduct(product, existingEntry, dry, onlineStorePublicationId);

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
    await saveConfig(cat, { ...config, lastRunAt: completedAt });
    if (videoQueue.length > 0) {
      await storeVideoQueue(cat, videoQueue);
    }
  }

  return NextResponse.json({ ...logEntry, videosQueued: videoQueue.length });
}
