import { NextRequest, NextResponse } from "next/server";
import { getVideoQueue, storeVideoQueue, Category, CATEGORIES } from "@/lib/kv";
import { uploadVideoToProduct, productHasVideo } from "@/lib/shopify";

export const maxDuration = 300;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ category: string }> }
) {
  const { category } = await params;
  const cat = category as Category;

  if (!CATEGORIES.find((c) => c.id === cat)) {
    return NextResponse.json({ error: "Unknown category" }, { status: 400 });
  }

  const queue = await getVideoQueue(cat);
  const count = queue.reduce((sum, e) => sum + e.videoUrls.length, 0);
  return NextResponse.json({ category: cat, products: queue.length, videos: count });
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ category: string }> }
) {
  const { category } = await params;
  const cat = category as Category;

  if (!CATEGORIES.find((c) => c.id === cat)) {
    return NextResponse.json({ error: "Unknown category" }, { status: 400 });
  }

  const queue = await getVideoQueue(cat);
  if (queue.length === 0) {
    return NextResponse.json({ processed: 0, remaining: 0, errors: [] });
  }

  let processed = 0;
  let skipped = 0;
  const errors: string[] = [];
  // Stay under the 300s function cap. Videos are large (often 40MB+) and each
  // is downloaded then re-uploaded, so a full category queue can exceed the
  // limit. Work until the budget is spent, then return what's left.
  const deadline = Date.now() + 240_000;

  // Mutable remainder; checkpointed to KV after each product so a timeout or
  // crash leaves the queue at exactly the un-processed entries — re-running
  // continues where it left off and never re-uploads a finished product.
  const remaining = [...queue];
  while (remaining.length > 0 && Date.now() < deadline) {
    const entry = remaining[0];

    // Idempotency guard: if the product already has a video (from a prior
    // partial run or re-sync), skip it rather than appending a duplicate.
    let alreadyHasVideo = false;
    try {
      alreadyHasVideo = await productHasVideo(entry.productGid);
    } catch { /* on check failure, fall through and attempt the upload */ }
    if (alreadyHasVideo) {
      skipped++;
      remaining.shift();
      await storeVideoQueue(cat, remaining);
      continue;
    }

    for (let i = 0; i < entry.videoUrls.length; i++) {
      const videoUrl = entry.videoUrls[i];
      const filename = entry.filenames[i] ?? `video_${i}.mov`;
      let uploadErrors: string[];
      try {
        uploadErrors = await uploadVideoToProduct(entry.productGid, videoUrl, filename);
      } catch (e) {
        // A thrown error (GraphQL/network) must not abort the whole batch and
        // skip the checkpoint — record it and move on.
        uploadErrors = [e instanceof Error ? e.message : String(e)];
      }
      if (uploadErrors.length > 0) {
        errors.push(`SKU ${entry.sku} (${filename}): ${uploadErrors.join("; ")}`);
      } else {
        processed++;
      }
    }
    remaining.shift();
    await storeVideoQueue(cat, remaining);
  }

  return NextResponse.json({ processed, skipped, remaining: remaining.length, errors });
}
