import { useState } from "react";
import type { FormEvent } from "react";
import {
  Button,
  Card,
  ErrorBanner,
  Field,
  PageTitle,
  Status,
} from "../../../components/ui";
import { api } from "../../../lib/api";
import { useAuth } from "../../auth/AuthProvider";

export function ProfilePage() {
  const { user, refreshMe } = useAuth();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [fullName, setFullName] = useState(user?.full_name || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [region, setRegion] = useState(String(user?.region || ""));
  const [bio, setBio] = useState(String(user?.bio || ""));
  const save = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await api.patch("/users/me", {
        full_name: fullName,
        ...(phone ? { phone } : {}),
        ...(region ? { region } : {}),
        ...(bio ? { bio } : {}),
      });
      await refreshMe();
      setMessage("Your profile has been updated.");
    } catch (err) {
      setError(
        (err as { response?: { data?: { message?: string } } }).response?.data
          ?.message || "Profile could not be updated.",
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <>
      <PageTitle
        eyebrow="YOUR ACCOUNT"
        title="Profile & preferences"
        description="Keep your member information up to date."
      />
      <div className="profile-grid">
        <Card className="profile-summary">
          <span className="profile-avatar">
            {user?.full_name?.slice(0, 1) || "T"}
          </span>
          <h2>{user?.full_name || "TBIA member"}</h2>
          <p>{user?.email}</p>
          <Status>{user?.status || "active"}</Status>
          <div className="profile-meta">
            <span>Account type</span>
            <b>{user?.account_type || "Member"}</b>
          </div>
          <div className="profile-meta">
            <span>Member ID</span>
            <b>{user?.uid || "—"}</b>
          </div>
        </Card>
        <Card>
          <p className="eyebrow">PERSONAL DETAILS</p>
          <h2>Edit your profile</h2>
          {message && <div className="success-banner">{message}</div>}
          {error && <ErrorBanner message={error} />}
          <form className="form-stack" onSubmit={save}>
            <Field
              label="Full name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
            <Field label="Email address" value={user?.email || ""} disabled />
            <Field
              label="Phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <Field
              label="Region"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
            />
            <label className="field">
              <span>About you</span>
              <textarea
                rows={4}
                maxLength={2000}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
              />
            </label>
            <Button type="submit" loading={saving}>
              Save profile
            </Button>
          </form>
        </Card>
      </div>
    </>
  );
}
