import { kv as _kv } from "@vercel/kv";

// Graceful no-op client for local dev without KV credentials
const isKvAvailable = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

/* eslint-disable @typescript-eslint/no-explicit-any */
const noopKv = {
  get: async () => null,
  set: async () => "OK" as any,
  lpush: async () => 1,
  ltrim: async () => "OK" as any,
  lrange: async () => [] as any[],
};
/* eslint-enable @typescript-eslint/no-explicit-any */

const kv = isKvAvailable ? _kv : (noopKv as unknown as typeof _kv);

export type Category =
  | "rings"
  | "bracelets"
  | "necklaces"
  | "earrings"
  | "bags"
  | "mens-rings"
  | "designer-jewelry";

export const CATEGORIES: { id: Category; label: string }[] = [
  { id: "rings", label: "Rings" },
  { id: "bracelets", label: "Bracelets" },
  { id: "necklaces", label: "Necklaces" },
  { id: "earrings", label: "Earrings" },
  { id: "bags", label: "Designer Bags" },
  { id: "mens-rings", label: "Men's Rings" },
  { id: "designer-jewelry", label: "Designer Jewelry" },
];

export interface CategoryConfig {
  scheduleEnabled: boolean;
  scheduleTime: string; // "HH:MM"
  lastRunAt?: string;   // ISO date string
  airtableUrl?: string; // Airtable table URL (appXXX/tblXXX[/viwXXX])
}

export interface SyncLogEntry {
  category: Category;
  startedAt: string;
  completedAt: string;
  created: number;
  updated: number;
  skipped: number;
  errors: number;
  errorDetails?: string[];
}

const CONFIG_KEY = (cat: Category) => `config:${cat}`;
const LOG_KEY = (cat: Category) => `log:${cat}`;
const VIDEO_QUEUE_KEY = (cat: Category) => `video-queue:${cat}`;
const MAX_LOG_ENTRIES = 20;

export interface VideoQueueEntry {
  productGid: string;
  sku: string;
  videoUrls: string[];
  filenames: string[];
}

export async function storeVideoQueue(cat: Category, entries: VideoQueueEntry[]): Promise<void> {
  await kv.set(VIDEO_QUEUE_KEY(cat), entries);
}

export async function getVideoQueue(cat: Category): Promise<VideoQueueEntry[]> {
  return (await kv.get<VideoQueueEntry[]>(VIDEO_QUEUE_KEY(cat))) ?? [];
}

export async function getAllVideoQueueCounts(): Promise<Record<Category, number>> {
  const result = {} as Record<Category, number>;
  await Promise.all(
    CATEGORIES.map(async ({ id }) => {
      const queue = await getVideoQueue(id);
      result[id] = queue.reduce((sum, e) => sum + e.videoUrls.length, 0);
    })
  );
  return result;
}

export async function getConfig(cat: Category): Promise<CategoryConfig> {
  const stored = await kv.get<CategoryConfig>(CONFIG_KEY(cat));
  return stored ?? { scheduleEnabled: false, scheduleTime: "09:00" };
}

export async function saveConfig(cat: Category, config: CategoryConfig): Promise<void> {
  await kv.set(CONFIG_KEY(cat), config);
}

export async function getAllConfigs(): Promise<Record<Category, CategoryConfig>> {
  const result = {} as Record<Category, CategoryConfig>;
  await Promise.all(
    CATEGORIES.map(async ({ id }) => {
      result[id] = await getConfig(id);
    })
  );
  return result;
}

export async function saveAllConfigs(configs: Partial<Record<Category, Partial<CategoryConfig>>>): Promise<void> {
  await Promise.all(
    Object.entries(configs).map(async ([cat, partial]) => {
      const current = await getConfig(cat as Category);
      await saveConfig(cat as Category, { ...current, ...partial });
    })
  );
}

export async function appendLog(cat: Category, entry: SyncLogEntry): Promise<void> {
  await kv.lpush(LOG_KEY(cat), JSON.stringify(entry));
  await kv.ltrim(LOG_KEY(cat), 0, MAX_LOG_ENTRIES - 1);
}

export async function getLogs(cat: Category): Promise<SyncLogEntry[]> {
  const raw = await kv.lrange<string>(LOG_KEY(cat), 0, MAX_LOG_ENTRIES - 1);
  return raw.map((r) => (typeof r === "string" ? JSON.parse(r) : r));
}

export async function getAllLogs(): Promise<SyncLogEntry[]> {
  const all = await Promise.all(CATEGORIES.map(({ id }) => getLogs(id)));
  return all
    .flat()
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
    .slice(0, MAX_LOG_ENTRIES);
}
