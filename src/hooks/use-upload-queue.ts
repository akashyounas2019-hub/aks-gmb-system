import { useSyncExternalStore } from "react";
import {
  subscribe,
  getItemsSnapshot,
  getSettingsSnapshot,
  type QueueItem,
  type UploadSettings,
} from "@/lib/upload-queue-store";

export function useUploadQueueItems(): QueueItem[] {
  return useSyncExternalStore(subscribe, getItemsSnapshot, getItemsSnapshot);
}

export function useUploadSettings(): UploadSettings {
  return useSyncExternalStore(subscribe, getSettingsSnapshot, getSettingsSnapshot);
}
