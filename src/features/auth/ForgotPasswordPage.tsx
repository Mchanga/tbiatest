import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  Button,
  Card,
  ErrorBanner,
  Field,
  PageTitle,
} from "../../components/ui";
import { api } from "../../lib/api";

export function ForgotPasswordPage() {
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setSending(true);
    setMessage("");
    setError("");
    try {
      const response = await api.post("/auth/forgot-password", {
        email: form.get("email"),
      });
      setMessage(
        response.data?.message ||
          "If the email belongs to an account, password reset instructions will be sent.",
      );
      formElement.reset();
    } catch (requestError) {
      setError(
        (requestError as { response?: { data?: { message?: string } } })
          .response?.data?.message ||
          "The request could not be sent. Please try again.",
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="wrap inner-page">
      <PageTitle
        eyebrow="ACCOUNT HELP"
        title="Reset your password"
        description="Enter the email address linked to your account."
      />
      <Card className="nomination-form-card">
        {message && (
          <div className="success-banner" role="status">
            {message}
          </div>
        )}
        {error && <ErrorBanner message={error} />}
        <form className="form-stack" onSubmit={submit}>
          <Field
            label="Email address"
            name="email"
            type="email"
            required
            autoComplete="email"
          />
          <Button type="submit" loading={sending}>
            Send reset email
          </Button>
          <Link className="text-link" to="/login">
            Back to sign in
          </Link>
        </form>
      </Card>
    </div>
  );
}
