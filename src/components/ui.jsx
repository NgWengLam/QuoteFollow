import React, { useRef, useEffect } from "react";
import { X, FileText } from "lucide-react";
export const LABEL = {
  pending: "Pending",
  accepted: "Accepted",
  rejected: "Rejected",
  no_reply: "No reply",
};
export const initials = (name) =>
  (name || "")
    .split(" ")
    .slice(0, 2)
    .map((x) => x[0])
    .join("");
export const Badge = ({ status }) => (
  <span className={"badge " + status}>
    <i />
    {LABEL[status] || status.replaceAll("_", " ")}
  </span>
);
export const Button = ({ children, kind = "primary", ...props }) => (
  <button className={"btn " + kind} {...props}>
    {children}
  </button>
);
export function Modal({ title, onClose, children, wide = false, error }) {
  const ref = useRef();
  useEffect(() => {
    ref.current.showModal();
    return () => ref.current?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={wide ? "modal wide" : "modal"}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <header>
        <div>
          <span className="eyebrow">YOUR WORKSPACE</span>
          <h2>{title}</h2>
        </div>
        <button
          className="icon-btn"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </header>
      {error && (
        <p className="dialog-error" role="alert">
          {error}
        </p>
      )}
      {children}
    </dialog>
  );
}
export function Empty({ title, text, action }) {
  return (
    <div className="empty">
      <FileText size={30} />
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}
