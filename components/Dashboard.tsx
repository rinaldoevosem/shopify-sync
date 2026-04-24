"use client";

import { useState } from "react";
import {
  Page,
  Layout,
  Card,
  Button,
  TextField,
  InlineStack,
  BlockStack,
  Text,
  Badge,
  Divider,
  Toast,
  Frame,
  Checkbox,
} from "@shopify/polaris";
import { Category, CATEGORIES, CategoryConfig, SyncLogEntry } from "@/lib/kv";

interface Props {
  initialConfigs: Record<Category, CategoryConfig>;
  initialLogs: SyncLogEntry[];
  videoQueueCounts: Record<Category, number>;
}

interface SyncState {
  running: boolean;
  error?: string;
}

export function Dashboard({ initialConfigs, initialLogs, videoQueueCounts: initialVideoQueueCounts }: Props) {
  const [configs, setConfigs] = useState(initialConfigs);
  const [logs, setLogs] = useState(initialLogs);
  const [syncStates, setSyncStates] = useState<Record<string, SyncState>>({});
  const [videoQueueCounts, setVideoQueueCounts] = useState<Record<Category, number>>(initialVideoQueueCounts);
  const [videoUploadStates, setVideoUploadStates] = useState<Record<string, { running: boolean }>>({});
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ content: string; error?: boolean } | null>(null);
  const [expandedErrors, setExpandedErrors] = useState<Set<number>>(new Set());

  const updateConfig = (cat: Category, partial: Partial<CategoryConfig>) => {
    setConfigs((prev) => ({ ...prev, [cat]: { ...prev[cat], ...partial } }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(configs),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Save failed");
      setToast({ content: "Settings saved" });
    } catch (err) {
      setToast({ content: `Failed to save: ${err instanceof Error ? err.message : "error"}`, error: true });
    } finally {
      setSaving(false);
    }
  };

  const handleSync = async (cat: Category) => {
    setSyncStates((prev) => ({ ...prev, [cat]: { running: true } }));
    try {
      const res = await fetch(`/api/sync/${cat}`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Sync failed");
      setLogs((prev) => [json, ...prev].slice(0, 20));
      if (json.videosQueued > 0) {
        setVideoQueueCounts((prev) => ({ ...prev, [cat]: (prev[cat] ?? 0) + json.videosQueued }));
      }
      setToast({
        content: `${CATEGORIES.find((c) => c.id === cat)?.label}: ${json.created} created, ${json.updated} updated, ${json.errors} errors${json.videosQueued > 0 ? ` · ${json.videosQueued} videos queued` : ""}`,
        error: json.errors > 0,
      });
    } catch (err) {
      setToast({ content: `Sync failed: ${err instanceof Error ? err.message : "error"}`, error: true });
    } finally {
      setSyncStates((prev) => ({ ...prev, [cat]: { running: false } }));
    }
  };

  const handleUploadVideos = async (cat: Category) => {
    setVideoUploadStates((prev) => ({ ...prev, [cat]: { running: true } }));
    try {
      const res = await fetch(`/api/videos/${cat}`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Video upload failed");
      setVideoQueueCounts((prev) => ({ ...prev, [cat]: 0 }));
      setToast({
        content: `${CATEGORIES.find((c) => c.id === cat)?.label}: ${json.processed} video${json.processed !== 1 ? "s" : ""} uploaded${json.errors.length > 0 ? ` · ${json.errors.length} errors` : ""}`,
        error: json.errors.length > 0,
      });
    } catch (err) {
      setToast({ content: `Video upload failed: ${err instanceof Error ? err.message : "error"}`, error: true });
    } finally {
      setVideoUploadStates((prev) => ({ ...prev, [cat]: { running: false } }));
    }
  };

  const toggleError = (i: number) => {
    setExpandedErrors((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} hr ago`;
    return d.toLocaleDateString();
  };

  return (
    <Frame>
      <Page title="Stein Diamonds — Inventory Sync">
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                {CATEGORIES.map(({ id: cat, label }) => {
                  const config = configs[cat];
                  const syncState = syncStates[cat];
                  const videoCount = videoQueueCounts[cat] ?? 0;
                  const videoUploadState = videoUploadStates[cat];
                  const hasUrl = !!config.airtableUrl?.trim();

                  return (
                    <div key={cat}>
                      <BlockStack gap="200">
                        <InlineStack align="space-between" blockAlign="center" wrap={false}>
                          <InlineStack gap="200" blockAlign="center">
                            <Text variant="headingSm" as="h3" fontWeight="semibold">
                              {label}
                            </Text>
                            {videoCount > 0 && (
                              <Badge tone="attention">{`${videoCount} video${videoCount !== 1 ? "s" : ""} queued`}</Badge>
                            )}
                          </InlineStack>
                        </InlineStack>

                        <InlineStack gap="300" blockAlign="end" wrap={false}>
                          <div style={{ flex: 1 }}>
                            <TextField
                              label=""
                              labelHidden
                              placeholder="https://airtable.com/appXXX/tblXXX/viwXXX"
                              value={config.airtableUrl ?? ""}
                              onChange={(val) => updateConfig(cat, { airtableUrl: val })}
                              autoComplete="off"
                            />
                          </div>

                          {videoCount > 0 && (
                            <Button
                              onClick={() => handleUploadVideos(cat)}
                              loading={videoUploadState?.running}
                            >
                              Upload Videos
                            </Button>
                          )}

                          <Button
                            variant="primary"
                            onClick={() => handleSync(cat)}
                            loading={syncState?.running}
                            disabled={!hasUrl}
                          >
                            Run Now
                          </Button>

                          <InlineStack gap="200" blockAlign="center">
                            <Checkbox
                              label="Schedule"
                              checked={config.scheduleEnabled}
                              onChange={(checked) => updateConfig(cat, { scheduleEnabled: checked })}
                            />
                            {config.scheduleEnabled && (
                              <div style={{ width: "90px" }}>
                                <TextField
                                  label=""
                                  labelHidden
                                  type="time"
                                  value={config.scheduleTime}
                                  onChange={(val) => updateConfig(cat, { scheduleTime: val })}
                                  autoComplete="off"
                                />
                              </div>
                            )}
                          </InlineStack>
                        </InlineStack>
                      </BlockStack>
                      <div style={{ marginTop: "12px" }}>
                        <Divider />
                      </div>
                    </div>
                  );
                })}

                <InlineStack align="end">
                  <Button variant="primary" onClick={handleSave} loading={saving}>
                    Save Settings
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text variant="headingMd" as="h2">
                  Sync Log
                </Text>
                {logs.length === 0 && (
                  <Text variant="bodySm" as="p" tone="subdued">
                    No syncs yet.
                  </Text>
                )}
                {logs.map((log, i) => {
                  const catLabel = CATEGORIES.find((c) => c.id === log.category)?.label ?? log.category;
                  const hasErrors = log.errors > 0;
                  const expanded = expandedErrors.has(i);

                  return (
                    <BlockStack key={i} gap="100">
                      <InlineStack gap="200" blockAlign="center" wrap={false}>
                        <Badge tone={hasErrors ? "warning" : "success"}>
                          {hasErrors ? `${log.errors} error${log.errors > 1 ? "s" : ""}` : "OK"}
                        </Badge>
                        <Text variant="bodySm" as="span" fontWeight="semibold">
                          {catLabel}
                        </Text>
                        <Text variant="bodySm" as="span" tone="subdued">
                          {formatTime(log.completedAt)} · {log.created} created · {log.updated} updated · {log.skipped} skipped
                        </Text>
                        {hasErrors && (
                          <Button
                            variant="plain"
                            size="slim"
                            onClick={() => toggleError(i)}
                          >
                            {expanded ? "Hide" : "Details"}
                          </Button>
                        )}
                      </InlineStack>
                      {hasErrors && expanded && log.errorDetails && (
                        <div style={{ paddingLeft: "24px" }}>
                          {log.errorDetails.map((e, j) => (
                            <Text key={j} variant="bodySm" as="p" tone="critical">
                              {e}
                            </Text>
                          ))}
                        </div>
                      )}
                    </BlockStack>
                  );
                })}
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        {toast && (
          <Toast
            content={toast.content}
            error={toast.error}
            onDismiss={() => setToast(null)}
          />
        )}
      </Page>
    </Frame>
  );
}
