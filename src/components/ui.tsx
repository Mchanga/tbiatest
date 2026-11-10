import type { ButtonHTMLAttributes, ReactNode } from "react";
import { LoaderCircle } from "lucide-react";

export function Button({
  children,
  variant = "primary",
  loading = false,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  loading?: boolean;
}) {
  return (
    <button
      className={`button button-${variant} ${className}`}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading && <LoaderCircle size={16} className="spin" />}
      {children}
    </button>
  );
}
export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={`card ${className}`}>{children}</section>;
}
export function Field({
  label,
  error,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input {...props} />
      {error && <small className="field-error">{error}</small>}
    </label>
  );
}
export function SelectField({
  label,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select {...props}>{children}</select>
    </label>
  );
}
export function Status({ children }: { children: ReactNode }) {
  return <span className="status">{children}</span>;
}
export function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty-state">
      <span className="empty-mark">✳</span>
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  );
}
export function PageTitle({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
}
export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="error-banner" role="alert">
      {message}
    </div>
  );
}
