import {useLayoutEffect, useRef} from "react";

export type MenuKeyboardNavigationRef = {
  readonly current: HTMLElement | null;
};

export type MenuOpenFocus = "first" | "last";

export type UseMenuKeyboardNavigationOptions = {
  open: boolean;
  menuRef: MenuKeyboardNavigationRef;
  triggerRef: MenuKeyboardNavigationRef;
  onClose: () => void;
  onOpen?: (focus: MenuOpenFocus) => void;
  submenu?: boolean;
};

const MENU_ITEM_SELECTOR = '[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]';
const MENU_SELECTOR = '[role="menu"]';

function isComposing(event: KeyboardEvent) {
  return event.isComposing || event.key === "Process";
}

function hasNavigationModifier(event: KeyboardEvent) {
  return event.ctrlKey || event.metaKey || event.altKey || event.shiftKey;
}

function isTabModifier(event: KeyboardEvent) {
  return event.ctrlKey || event.metaKey || event.altKey;
}

function triggerButton(trigger: HTMLElement | null) {
  if (!trigger) return null;
  if (trigger.tagName === "BUTTON") return trigger as HTMLButtonElement;
  return trigger.querySelector<HTMLButtonElement>("button");
}

function focusTrigger(trigger: HTMLElement | null) {
  triggerButton(trigger)?.focus({preventScroll: true});
}

function isUnavailableMenuItem(item: HTMLElement) {
  return item.hasAttribute("disabled")
    || item.getAttribute("aria-disabled") === "true"
    || item.matches(":disabled")
    || item.hasAttribute("hidden")
    || item.getAttribute("aria-hidden") === "true"
    || Boolean(item.closest("[inert]"));
}

function menuItems(menu: HTMLElement) {
  return Array.from(menu.querySelectorAll<HTMLElement>(MENU_ITEM_SELECTOR))
    .filter((item) => item.closest(MENU_SELECTOR) === menu)
    .filter((item) => !isUnavailableMenuItem(item));
}

function eventBelongsToMenu(menu: HTMLElement, target: EventTarget | null) {
  if (typeof Element === "undefined" || !(target instanceof Element)) return false;
  return menu.contains(target) && target.closest(MENU_SELECTOR) === menu;
}

function focusItem(item: HTMLElement | undefined) {
  item?.focus({preventScroll: true});
  if (item && document.activeElement === item) item.scrollIntoView({block: "nearest", inline: "nearest"});
}

function focusMenuItem(menu: HTMLElement | null, position: MenuOpenFocus) {
  if (!menu) return;
  const items = menuItems(menu);
  const item = position === "first" ? items[0] : items[items.length - 1];
  focusItem(item);
}

function focusAdjacentMenuItem(menu: HTMLElement, key: KeyboardEvent["key"]) {
  const items = menuItems(menu);
  if (items.length === 0) return;

  const activeElement = typeof document !== "undefined" ? document.activeElement : null;
  const currentIndex = activeElement instanceof Element
    ? items.indexOf(activeElement.closest<HTMLElement>(MENU_ITEM_SELECTOR) ?? activeElement as HTMLElement)
    : -1;
  const nextIndex = key === "Home"
    ? 0
    : key === "End"
      ? items.length - 1
      : currentIndex < 0
        ? key === "ArrowUp" ? items.length - 1 : 0
        : (currentIndex + (key === "ArrowUp" ? -1 : 1) + items.length) % items.length;
  focusItem(items[nextIndex]);
}

/**
 * Adds keyboard behavior to a menu and its trigger without changing pointer behavior.
 * The trigger ref may point at the button itself or a container holding one button.
 */
export function useMenuKeyboardNavigation({
  open,
  menuRef,
  triggerRef,
  onClose,
  onOpen,
  submenu = false,
}: UseMenuKeyboardNavigationOptions) {
  const pendingOpenFocusRef = useRef<MenuOpenFocus | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      pendingOpenFocusRef.current = null;
      return;
    }

    const pendingFocus = pendingOpenFocusRef.current;
    if (!pendingFocus || !menuRef.current) return;
    const items = menuItems(menuRef.current);
    const item = pendingFocus === "first" ? items[0] : items[items.length - 1];
    if (!item) return;
    focusItem(item);
    if (document.activeElement === item) pendingOpenFocusRef.current = null;
  });

  useLayoutEffect(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const handleTriggerKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isComposing(event)) return;
      if (event.target !== triggerButton(trigger)) return;

      if (event.key === "Tab") {
        if (!open || isTabModifier(event)) return;
        event.stopPropagation();
        onClose();
        return;
      }

      if (hasNavigationModifier(event)) return;

      if (event.key === "Escape") {
        if (!open) return;
        event.preventDefault();
        event.stopPropagation();
        onClose();
        focusTrigger(trigger);
        return;
      }

      if (!open && (event.key === "Enter" || event.key === " ")) {
        pendingOpenFocusRef.current = "first";
        return;
      }
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && !(submenu && event.key === "ArrowRight")) return;

      const button = triggerButton(trigger);
      if (!button || button.disabled) return;

      event.preventDefault();
      event.stopPropagation();
      const focus = event.key === "ArrowUp" ? "last" : "first";
      if (open) {
        focusMenuItem(menuRef.current, focus);
        return;
      }

      pendingOpenFocusRef.current = focus;
      if (onOpen) onOpen(focus);
      else button.click();
    };

    trigger.addEventListener("keydown", handleTriggerKeyDown);
    return () => trigger.removeEventListener("keydown", handleTriggerKeyDown);
  }, [menuRef, onClose, onOpen, open, submenu, triggerRef]);

  useLayoutEffect(() => {
    if (!open) return;
    const menu = menuRef.current;
    if (!menu) return;

    const handleMenuKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isComposing(event) || !eventBelongsToMenu(menu, event.target)) return;

      if (event.key === "Tab") {
        if (isTabModifier(event)) return;
        event.stopPropagation();
        focusTrigger(triggerRef.current);
        onClose();
        return;
      }

      if (hasNavigationModifier(event)) return;

      if (event.key === "Escape" || (submenu && event.key === "ArrowLeft")) {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        focusTrigger(triggerRef.current);
        return;
      }

      if (event.key !== "ArrowUp" && event.key !== "ArrowDown" && event.key !== "Home" && event.key !== "End") return;
      event.preventDefault();
      event.stopPropagation();
      focusAdjacentMenuItem(menu, event.key);
    };

    menu.addEventListener("keydown", handleMenuKeyDown);
    return () => menu.removeEventListener("keydown", handleMenuKeyDown);
  }, [menuRef, onClose, open, submenu, triggerRef]);
}
