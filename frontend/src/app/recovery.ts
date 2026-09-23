import type {PixelDocument} from "../editor/document";
import {decodeProject, encodeProject} from "../editor/serialization";
import {isRecord, parseBridgeJSON} from "./bridgeResponses";

const recoveryFormat = "pixtorio-recovery-v2" as const;

export interface RecoveryTabInput {
  id: string;
  filePath?: string;
  document: PixelDocument;
  isDirty: boolean;
}

export interface RecoveryDocument {
  tabId: string;
  filePath?: string;
  document: PixelDocument;
}

export interface RecoverySnapshot {
  activeTabId?: string;
  documents: RecoveryDocument[];
}

export function encodeRecoveryPayload(tabs: readonly RecoveryTabInput[], activeTabId: string): string | null {
  const dirtyTabs = tabs.filter((tab) => tab.isDirty);
  if (dirtyTabs.length === 0) return null;
  const active = dirtyTabs.find((tab) => tab.id === activeTabId) ?? dirtyTabs[0];
  return JSON.stringify({
    format: recoveryFormat,
    activeTabId: active.id,
    documents: dirtyTabs.map((tab) => ({
      tabId: tab.id,
      ...(tab.filePath !== undefined ? {filePath: tab.filePath} : {}),
      document: encodeProject(tab.document),
    })),
  });
}

export function decodeRecoveryPayload(payload: string): RecoverySnapshot {
  const parsed = parseBridgeJSON(payload, "Recovery JSON is invalid");
  if (!isRecord(parsed) || parsed.format !== recoveryFormat) {
    throw new Error("Recovery JSON is invalid");
  }
  if (!Array.isArray(parsed.documents) || parsed.documents.length === 0) {
    throw new Error("Recovery documents are missing");
  }
  const documents = parsed.documents.map((entry) => {
    if (!isRecord(entry) || typeof entry.tabId !== "string" || typeof entry.document !== "string") {
      throw new Error("Recovery document entry is invalid");
    }
    if (entry.filePath !== undefined
      && (typeof entry.filePath !== "string"
        || !entry.filePath.trim()
        || entry.filePath.trim() !== entry.filePath
        || !entry.filePath.toLowerCase().endsWith(".pixio"))) {
      throw new Error("Recovery document entry is invalid");
    }
    return {
      tabId: entry.tabId,
      ...(entry.filePath !== undefined ? {filePath: entry.filePath} : {}),
      document: decodeProject(entry.document),
    };
  });
  return {
    activeTabId: typeof parsed.activeTabId === "string" ? parsed.activeTabId : undefined,
    documents,
  };
}
