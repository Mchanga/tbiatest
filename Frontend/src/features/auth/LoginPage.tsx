import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useState } from "react";
import { z } from "zod";
import { ArrowRight, Eye, EyeOff } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { Button, ErrorBanner, Field } from "../../components/ui";
import { useAuth } from "./AuthProvider";
import { AuthFrame } from "./AuthFrame";

const loginSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Enter your password"),
});
type LoginValues = z.infer<typeof loginSchema>;

export function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const registration = location.state as {
    registered?: boolean;
    email?: string;
    verificationEmailSent?: boolean;
  } | null;
  const [error, setError] = useState("");
  const [show, setShow] = useState(false);
  const [showResend, setShowResend] = useState(false);
  const [resendMessage, setResendMessage] = useState("");
  const [resendError, setResendError] = useState("");
  const [resending, setResending] = useState(false);
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: registration?.email ?? "" },
  });
  const resendVerification = async () => {
    const checkedEmail = z.string().email().safeParse(watch("email"));
    if (!checkedEmail.success) {
      setResendError("Enter a valid email address first.");
      return;
    }
    setResending(true);
    setResendError("");
    setResendMessage("");
    try {
      const response = await api.post("/auth/resend-verification", {
        email: checkedEmail.data,
      });
      setResendMessage(
        response.data?.message ||
          "If the account can be verified, a new email will be sent.",
      );
    } catch (requestError) {
      setResendError(
        (requestError as { response?: { data?: { message?: string } } })
          .response?.data?.message ||
          "The verification email could not be sent. Please try again.",
      );
    } finally {
      setResending(false);
    }
  };
  const submit = handleSubmit(async (values) => {
    setError("");
    try {
      await signIn(values.email, values.password);
      navigate("/app");
    } catch (e) {
      setError(
        (e as { response?: { data?: { message?: string } } }).response?.data
          ?.message || "Unable to log in. Check your details and try again.",
      );
    }
  });
  return (
    <AuthFrame
      title="Welcome back."
      subtitle="Log in to your TBIA account to continue."
    >
      <form className="form-stack" onSubmit={submit}>
        {registration?.registered && (
          <div className="success-banner" role="status">
            {registration.verificationEmailSent
              ? "Account created. Check your email and confirm the link before signing in."
              : "Account created, but the verification email was not sent. Use the option below to request another email."}
          </div>
        )}
        {error && <ErrorBanner message={error} />}
        {resendError && <ErrorBanner message={resendError} />}
        {resendMessage && (
          <div className="success-banner" role="status">
            {resendMessage}
          </div>
        )}
        <Field
          label="Email address"
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
          {...register("email")}
          error={errors.email?.message}
        />
        <label className="field">
          <span>Password</span>
          <div className="password-input">
            <input
              type={show ? "text" : "password"}
              autoComplete="current-password"
              placeholder="Enter your password"
              {...register("password")}
            />
            <button
              type="button"
              aria-label="Show password"
              onClick={() => setShow(!show)}
            >
              {show ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>
          {errors.password && (
            <small className="field-error">{errors.password.message}</small>
          )}
        </label>
        <div className="form-inline">
          <label className="check-label">
            <input type="checkbox" /> Keep me signed in
          </label>
          <Link to="/forgot-password">Forgot password?</Link>
        </div>
        {!showResend &&
          !registration?.registered &&
          !error.toLowerCase().includes("verify") && (
            <button
              type="button"
              className="text-link"
              onClick={() => setShowResend(true)}
            >
              Need a verification email?
            </button>
          )}
        {(showResend ||
          registration?.registered ||
          error.toLowerCase().includes("verify")) && (
          <Button
            type="button"
            variant="secondary"
            loading={resending}
            onClick={() => void resendVerification()}
          >
            Resend verification email
          </Button>
        )}
        <Button type="submit" loading={isSubmitting} className="button-full">
          Log in to your account <ArrowRight size={16} />
        </Button>
        <div className="secure-note">
          <span className="secure-dot" /> Protected with secure session cookies
        </div>
      </form>
    </AuthFrame>
  );
}
