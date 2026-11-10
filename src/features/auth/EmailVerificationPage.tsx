import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button, Card, ErrorBanner, PageTitle } from "../../components/ui";
import { api } from "../../lib/api";

export function EmailVerificationPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [verifying, setVerifying] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const isValidToken = /^[a-f0-9]{64}$/i.test(token);

  const verifyEmail = async () => {
    setVerifying(true);
    setError("");
    try {
      const response = await api.post("/auth/verify-email", { token });
      setMessage(response.data?.message || "Your email has been verified.");
    } catch (requestError) {
      setError(
        (requestError as { response?: { data?: { message?: string } } })
          .response?.data?.message ||
          "This verification link could not be used. Request a new email and try again.",
      );
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="wrap inner-page">
      <PageTitle
        eyebrow="ACCOUNT VERIFICATION"
        title="Verify your email"
        description="Confirm your email address to activate your TBIA account."
      />
      <Card className="nomination-form-card">
        {message ? (
          <div className="success-banner" role="status">
            {message}
          </div>
        ) : error ? (
          <ErrorBanner message={error} />
        ) : !isValidToken ? (
          <ErrorBanner message="This verification link is not valid. Request a new email from the sign-in page." />
        ) : (
          <div className="form-stack">
            <p>Select the button below to confirm your email address.</p>
            <Button loading={verifying} onClick={() => void verifyEmail()}>
              Confirm email
            </Button>
          </div>
        )}
        <Link className="text-link" to="/login">
          Return to sign in
        </Link>
      </Card>
    </div>
  );
}
