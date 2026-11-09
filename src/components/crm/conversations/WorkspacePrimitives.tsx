"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { channelNames, type Contact, type Conversation } from "./model";
import { Camera, MessageCircle, MessageSquare, X } from "lucide-react";
export function ChannelIcon({
  channel,
  size = 12,
}: {
  channel: Conversation["channel"];
  size?: number;
}) {
  const Icon =
    channel === "instagram"
      ? Camera
      : channel === "messenger"
        ? MessageCircle
        : MessageSquare;
  return (
    <span
      className={`fh-channel fh-channel-${channel}`}
      role="img"
      aria-label={channelNames[channel]}
    >
      <Icon size={size} strokeWidth={2} />
    </span>
  );
}
export function Avatar({
  contact,
  small = false,
}: {
  contact: Contact;
  small?: boolean;
}) {
  const hue = Number(contact.id.replace(/\D/g, "")) % 5;
  return (
    <span
      className={`fh-avatar fh-avatar-${hue} ${small ? "fh-avatar-small" : ""}`}
      aria-hidden="true"
    >
      {contact.initials}
    </span>
  );
}
export function IconButton({
  label,
  children,
  onClick,
  active = false,
  className = "",
}: {
  label: string;
  children: ReactNode;
  onClick: () => void;
  active?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={`fh-icon-button ${active ? "is-active" : ""} ${className}`}
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
export function Modal({
  title,
  subtitle,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el && !el.open) el.showModal();
    return () => {
      el?.close();
    };
  }, []);
  return (
    <dialog
      className={`fh-dialog ${wide ? "fh-dialog-wide" : ""}`}
      ref={ref}
      aria-labelledby="fh-dialog-title"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="fh-dialog-inner">
        <header>
          <div>
            <h2 id="fh-dialog-title">{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <IconButton label="關閉視窗" onClick={onClose}>
            <X size={19} />
          </IconButton>
        </header>
        {children}
      </div>
    </dialog>
  );
}

// Native navigation adapter keeps the workspace independent of its host router.
export function WorkspaceLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <a href={href} className={className}>
      {children}
    </a>
  );
}
