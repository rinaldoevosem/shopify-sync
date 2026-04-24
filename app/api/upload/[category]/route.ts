import { NextRequest, NextResponse } from "next/server";
import Papa from "papaparse";
import { storeCsvData, Category, CATEGORIES } from "@/lib/kv";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ category: string }> }
) {
  const { category } = await params;
  const cat = category as Category;

  if (!CATEGORIES.find((c) => c.id === cat)) {
    return NextResponse.json({ error: "Unknown category" }, { status: 400 });
  }

  const form = await req.formData();
  const file = form.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const text = await file.text();
  const { data, errors } = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
  });

  if (errors.length > 0 && data.length === 0) {
    return NextResponse.json({ error: "CSV parse failed", details: errors }, { status: 422 });
  }

  // Count how many rows will be processed vs skipped
  const total = data.length;
  const eligible = data.filter(
    (row) => row["New website"]?.trim() === "checked"
  ).length;

  await storeCsvData(cat, data, file.name);

  return NextResponse.json({
    ok: true,
    fileName: file.name,
    total,
    eligible,
  });
}
