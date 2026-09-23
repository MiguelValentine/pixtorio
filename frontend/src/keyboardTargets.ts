export function isActivationKey(key: string) {
  return key === "Enter" || key === " ";
}

export function isEditableTarget(target: EventTarget | null) {
  if (!target) return false;
  if (typeof HTMLInputElement !== "undefined" && target instanceof HTMLInputElement) return true;
  if (typeof HTMLTextAreaElement !== "undefined" && target instanceof HTMLTextAreaElement) return true;
  if (typeof HTMLSelectElement !== "undefined" && target instanceof HTMLSelectElement) return true;
  if (typeof HTMLElement !== "undefined" && target instanceof HTMLElement && target.isContentEditable) return true;

  // Keep this check safe for unit tests running without a DOM implementation.
  const element = target as EventTarget & {nodeName?: unknown; isContentEditable?: unknown};
  if (element.isContentEditable === true) return true;
  return typeof element.nodeName === "string" && /^(INPUT|TEXTAREA|SELECT)$/i.test(element.nodeName);
}
