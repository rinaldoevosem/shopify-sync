"use client";

import { useState, useCallback } from "react";
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
  Spinner,
  Checkbox,
} from "@shopify/polaris";
import { Category, CATEGORIES, CategoryConfig, SyncLogEntry } from "@/lib/kv";

interface CsvMeta {
  fileName?: string;
}

interface Props {
  initialConfigs: Record<Category, CategoryConfig>;
  initialLogs: SyncLogEntry[];
  csvMeta: Record<string, CsvMeta>;
  videoQueueCounts: Record<Category, number>;
}

interface SyncState {
  running: boolean;
  error?: string;
}

export function Dashboard({ initialConfigs, initialLogs, csvMeta: initialCsvMeta, videoQueueCounts: initialVideoQueueCounts }: Props) {
  const [configs, setConfigs] = useState(initialConfigs);
  const [logs, setLogs] = useState(initialLogs);
  const [csvMeta, setCsvMeta] = useState(initialCsvMeta);
  const [syncStates, setSyncStates] = useState<Record<string, SyncState>>({});
  const [uploadStates, setUploadStates] = useState<Record<string, { uploading: boolean; info?: string }>>({});
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
      if (!res.ok) throw new Error("Save failed");
      setToast({ content: "Settings saved" });
    } catch {
      setToast({ content: "Failed to save settings", error: true });
    } finally {
      setSaving(false);
    }
  };

  const handleFileUpload = async (cat: Category, file: File) => {
    setUploadStates((prev) => ({ ...prev, [cat]: { uploading: true } }));
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch(`/api/upload/${cat}`, { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Upload failed");
      setCsvMeta((prev) => ({ ...prev, [cat]: { fileName: json.fileName } }));
      const diagMsg = json.diagnostic
        ? ` · columns=${JSON.stringify(json.diagnostic.columns)} newWebsiteKey=${JSON.stringify(json.diagnostic.newWebsiteKey)} newWebsiteValue=${JSON.stringify(json.diagnostic.newWebsiteValue)}`
        : "";
      setUploadStates((prev) => ({
        ...prev,
        [cat]: { uploading: false, info: `${json.fileName} · ${json.eligible} of ${json.total} rows eligible${diagMsg}` },
      }));
    } catch (err) {
      setUploadStates((prev) => ({ ...prev, [cat]: { uploading: false } }));
      setToast({ content: `Upload failed: ${err instanceof Error ? err.message : "error"}`, error: true });
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
      next.has(i) ? next.delete(i) : next.add(i);
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
                  const uploadState = uploadStates[cat];
                  const meta = csvMeta[cat];

                  const videoCount = videoQueueCounts[cat] ?? 0;
                  const videoUploadState = videoUploadStates[cat];

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
                          {/* File upload */}
                          <div style={{ flex: 1 }}>
                            <InlineStack gap="200" blockAlign="center">
                              <label
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "8px",
                                  padding: "6px 12px",
                                  border: "1px solid #c9cccf",
                                  borderRadius: "6px",
                                  cursor: "pointer",
                                  fontSize: "13px",
                                  background: "#fff",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {uploadState?.uploading ? (
                                  <Spinner size="small" />
                                ) : (
                                  "↑ Upload CSV"
                                )}
                                <input
                                  type="file"
                                  accept=".csv"
                                  style={{ display: "none" }}
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) handleFileUpload(cat, file);
                                    e.target.value = "";
                                  }}
                                />
                              </label>
                              {(uploadState?.info || meta?.fileName) && (
                                <Text variant="bodySm" as="span" tone="subdued">
                                  {uploadState?.info ?? meta?.fileName}
                                </Text>
                              )}
                            </InlineStack>
                          </div>

                          {/* Upload Videos — only shown when videos are queued */}
                          {videoCount > 0 && (
                            <Button
                              onClick={() => handleUploadVideos(cat)}
                              loading={videoUploadState?.running}
                            >
                              Upload Videos
                            </Button>
                          )}

                          {/* Run Now */}
                          <Button
                            variant="primary"
                            onClick={() => handleSync(cat)}
                            loading={syncState?.running}
                            disabled={!meta?.fileName && !uploadState?.info}
                          >
                            Run Now
                          </Button>

                          {/* Schedule toggle */}
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
                    Save Schedule Settings
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* Sync Log */}
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
