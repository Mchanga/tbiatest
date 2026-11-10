import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

export function NotFoundPage() {
  return (
    <div className="not-found">
      <span className="eyebrow">404 · PAGE NOT FOUND</span>
      <h1>
        Not all who wander
        <br />
        <em>are lost.</em>
      </h1>
      <p>This page hasn’t found its place yet.</p>
      <Link to="/" className="button button-primary">
        <ArrowLeft size={15} /> Back to home
      </Link>
    </div>
  );
}
