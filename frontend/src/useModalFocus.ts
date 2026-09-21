import {useLayoutEffect, useRef, type RefObject} from "react";

function isInCollapsedDetails(element: HTMLElement, dialog: HTMLElement) {
  for (let parent = element.parentElement; parent && parent !== dialog; parent = parent.parentElement) {
    if (parent instanceof HTMLDetailsElement && !parent.open
      && !parent.querySelector(":scope > summary")?.contains(element)) return true;
  }
  return false;
}

function focusableElements(dialog: HTMLElement) {
  return Array.from(dialog.querySelectorAll<HTMLElement>(
    'button, input, select, textarea, a[href], summary, [tabindex], [contenteditable="true"]',
  )).filter((element) => element.tabIndex >= 0
    && !element.matches(":disabled")
    && !element.closest("[inert]")
    && !isInCollapsedDetails(element, dialog)
    && element.getClientRects().length > 0
    && getComputedStyle(element).visibility !== "hidden");
}

/** Keep modal keyboard interaction separate from the editor behind it. */
export function useModalFocus(rootRef: RefObject<HTMLElement | null>, modalKey: string | null) {
  const lastOutsideFocus = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const rememberFocus = (event: FocusEvent) => {
      if (event.target instanceof HTMLElement && !event.target.closest('[aria-modal="true"], [role="menu"]')) {
        lastOutsideFocus.current = event.target;
      }
    };
    document.addEventListener("focusin", rememberFocus, true);
    return () => document.removeEventListener("focusin", rememberFocus, true);
  }, []);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!modalKey || !root) return;
    const dialogs = root.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]');
    const dialog = dialogs[dialogs.length - 1];
    if (!dialog) return;
    const previous = document.activeElement instanceof HTMLElement && document.activeElement !== document.body
      && !dialog.contains(document.activeElement)
      ? document.activeElement
      : lastOutsideFocus.current;
    const previousTabIndex = dialog.getAttribute("tabindex");
    dialog.tabIndex = -1;
    const background = Array.from(root.children)
      .filter((element): element is HTMLElement => element instanceof HTMLElement && !element.contains(dialog))
      .map((element) => ({element, inert: element.inert}));
    background.forEach(({element}) => { element.inert = true; });

    const focusFirst = () => (focusableElements(dialog)[0] ?? dialog).focus({preventScroll: true});
    if (!dialog.contains(document.activeElement)) focusFirst();
    const containFocus = (event: FocusEvent) => {
      if (event.target instanceof Node && !dialog.contains(event.target)) focusFirst();
    };
    const trapTab = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
      const elements = focusableElements(dialog);
      const first = elements[0] ?? dialog;
      const last = elements[elements.length - 1] ?? dialog;
      if (!dialog.contains(document.activeElement) || document.activeElement === dialog
        || (!event.shiftKey && document.activeElement === last)
        || (event.shiftKey && document.activeElement === first)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus({preventScroll: true});
      }
    };
    document.addEventListener("focusin", containFocus, true);
    document.addEventListener("keydown", trapTab, true);
    return () => {
      document.removeEventListener("focusin", containFocus, true);
      document.removeEventListener("keydown", trapTab, true);
      background.forEach(({element, inert}) => { element.inert = inert; });
      if (previousTabIndex === null) dialog.removeAttribute("tabindex");
      else dialog.setAttribute("tabindex", previousTabIndex);
      if (previous?.isConnected && !previous.closest("[inert]")) previous.focus({preventScroll: true});
    };
  }, [modalKey, rootRef]);
}
