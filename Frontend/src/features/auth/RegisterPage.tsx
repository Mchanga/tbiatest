import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useState } from "react";
import { z } from "zod";
import { ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button, ErrorBanner, Field, SelectField } from "../../components/ui";
import { useAuth } from "./AuthProvider";
import { AuthFrame } from "./AuthFrame";

const registerSchema = z
  .object({
    full_name: z.string().trim().min(2, "Enter your full name"),
    email: z.string().trim().email("Enter a valid email"),
    phone: z.string().optional(),
    account_type: z.enum([
      "business",
      "entrepreneur",
      "investor",
      "startup",
      "individual",
      "institution",
    ]),
    password: z.string().min(8, "Use at least 8 characters").max(64),
    password_confirmation: z.string(),
    accept_terms: z
      .boolean()
      .refine((value) => value, "Please accept the terms"),
  })
  .refine((value) => value.password === value.password_confirmation, {
    path: ["password_confirmation"],
    message: "Passwords do not match",
  });
type RegisterValues = z.infer<typeof registerSchema>;

export function RegisterPage() {
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { account_type: "individual", accept_terms: false },
  });
  const submit = handleSubmit(async (values) => {
    setError("");
    try {
      const result = await signUp(values);
      navigate("/login", {
        state: {
          registered: true,
          email: values.email,
          verificationEmailSent: result.verificationEmailSent,
        },
      });
    } catch (e) {
      setError(
        (e as { response?: { data?: { message?: string } } }).response?.data
          ?.message || "Unable to create your account. Please try again.",
      );
    }
  });
  return (
    <AuthFrame
      mode="register"
      title="Make your mark."
      subtitle="Create your account and be part of what comes next."
    >
      <form className="form-stack register-form" onSubmit={submit}>
        {error && <ErrorBanner message={error} />}
        <Field
          label="Full name"
          placeholder="Your full name"
          autoComplete="name"
          {...register("full_name")}
          error={errors.full_name?.message}
        />
        <Field
          label="Email address"
          type="email"
          placeholder="you@company.com"
          autoComplete="email"
          {...register("email")}
          error={errors.email?.message}
        />
        <Field
          label="Phone number (optional)"
          type="tel"
          placeholder="+255"
          autoComplete="tel"
          {...register("phone")}
        />
        <SelectField label="I am joining as" {...register("account_type")}>
          <option value="individual">Individual</option>
          <option value="business">Business</option>
          <option value="entrepreneur">Entrepreneur</option>
          <option value="investor">Investor</option>
          <option value="startup">Startup</option>
          <option value="institution">Institution</option>
        </SelectField>
        <div className="form-two">
          <Field
            label="Password"
            type="password"
            autoComplete="new-password"
            placeholder="At least 8 characters"
            {...register("password")}
            error={errors.password?.message}
          />
          <Field
            label="Confirm password"
            type="password"
            autoComplete="new-password"
            placeholder="Repeat password"
            {...register("password_confirmation")}
            error={errors.password_confirmation?.message}
          />
        </div>
        <label className="check-label terms-check">
          <input type="checkbox" {...register("accept_terms")} /> I agree to the{" "}
          <a href="#terms">Terms of use</a> and{" "}
          <a href="#privacy">Privacy policy</a>
        </label>
        {errors.accept_terms && (
          <small className="field-error">{errors.accept_terms.message}</small>
        )}
        <Button type="submit" loading={isSubmitting} className="button-full">
          Create my account <ArrowRight size={16} />
        </Button>
      </form>
    </AuthFrame>
  );
}
