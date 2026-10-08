import {ChevronRight} from "lucide-react";
import type {MouseEventHandler, ReactNode} from "react";

interface CollapsiblePanelSectionProps {
  id: string;
  title: ReactNode;
  collapsed: boolean;
  onToggle: () => void;
  children: ReactNode;
  className?: string;
  headerActions?: ReactNode;
  onHeaderContextMenu?: MouseEventHandler<HTMLDivElement>;
}

export function CollapsiblePanelSection({
  id,
  title,
  collapsed,
  onToggle,
  children,
  className = "",
  headerActions,
  onHeaderContextMenu,
}: CollapsiblePanelSectionProps) {
  const bodyID = `panel-section-${id}`;

  return <section className={`panel-section collapsible-panel-section${collapsed ? " is-collapsed" : ""}${className ? ` ${className}` : ""}`}>
    <div className="collapsible-panel-heading" onContextMenu={onHeaderContextMenu}>
      <button
        type="button"
        className="collapsible-panel-toggle"
        aria-expanded={!collapsed}
        aria-controls={bodyID}
        onClick={onToggle}
      >
        <ChevronRight className="collapsible-panel-chevron" size={14} aria-hidden="true" />
        <span>{title}</span>
      </button>
      {headerActions && <div className="collapsible-panel-actions">{headerActions}</div>}
    </div>
    <div id={bodyID} className="collapsible-panel-body" hidden={collapsed}>{children}</div>
  </section>;
}
