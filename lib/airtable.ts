import { AirtableRecord } from "./converters/shared";

interface AirtableAttachment {
  id: string;
  url: string;
  filename: string;
  type?: string;
  size?: number;
}

export interface AirtableRaw {
  id: string;
  createdTime: string;
  fields: Record<string, unknown>;
}

interface AirtableListResponse {
  records: AirtableRaw[];
  offset?: string;
}

export interface ParsedAirtableUrl {
  baseId: string;
  tableId: string;
  viewId?: string;
}

export function parseAirtableUrl(url: string): ParsedAirtableUrl {
  const trimmed = url.trim();
  const match = trimmed.match(/^https?:\/\/airtable\.com\/(app\w+)\/(tbl\w+)(?:\/(viw\w+))?/);
  if (!match) {
    throw new Error(`Invalid Airtable URL: expected https://airtable.com/appXXX/tblXXX[/viwXXX], got "${trimmed}"`);
  }
  const [, baseId, tableId, viewId] = match;
  return { baseId, tableId, viewId };
}

async function atFetch(url: string): Promise<AirtableListResponse> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${process.env.AIRTABLE_PAT}` },
    });
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 30_000));
      continue;
    }
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Airtable ${res.status}: ${body.slice(0, 200)}`);
    }
    return res.json();
  }
  throw new Error("Airtable: rate-limited after 3 attempts");
}

export async function fetchAirtableRecords(
  baseId: string,
  tableId: string,
  viewId?: string,
): Promise<AirtableRaw[]> {
  if (!process.env.AIRTABLE_PAT) {
    throw new Error("AIRTABLE_PAT env var not set");
  }
  const params = new URLSearchParams({ pageSize: "100" });
  if (viewId) params.set("view", viewId);
  let offset: string | undefined;
  const all: AirtableRaw[] = [];
  do {
    if (offset) params.set("offset", offset);
    else params.delete("offset");
    const url = `https://api.airtable.com/v0/${baseId}/${tableId}?${params}`;
    const data = await atFetch(url);
    all.push(...data.records);
    offset = data.offset;
  } while (offset);
  return all;
}

function isAttachmentArray(arr: unknown[]): arr is AirtableAttachment[] {
  return (
    arr.length > 0 &&
    typeof arr[0] === "object" &&
    arr[0] !== null &&
    "url" in arr[0] &&
    "filename" in arr[0]
  );
}

function stringifyValue(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "checked" : "";
  if (Array.isArray(v)) {
    if (v.length === 0) return "";
    if (isAttachmentArray(v)) {
      return v.map((a) => `${a.filename} (${a.url})`).join(", ");
    }
    return v.map((x) => (typeof x === "string" ? x : stringifyValue(x))).join(", ");
  }
  if (typeof v === "object") {
    const obj = v as Record<string, unknown>;
    if (typeof obj.name === "string") return obj.name;
    if (typeof obj.text === "string") return obj.text;
    return JSON.stringify(v);
  }
  return String(v);
}

export function flattenRecord(raw: AirtableRaw): AirtableRecord {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw.fields)) {
    out[key] = stringifyValue(value);
  }
  return out;
}
