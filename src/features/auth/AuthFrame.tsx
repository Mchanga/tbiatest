import type { ReactNode } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import loginIllustration from "../../assets/login-illustration.jpg";
import registerIllustration from "../../assets/register-illustration.jpg";

export function AuthFrame({
  title,
  subtitle,
  children,
  mode = "login",
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  mode?: "login" | "register";
}) {
  return (
    <main className="auth-page">
      <Link className="auth-back" to="/">
        <ArrowLeft size={15} /> Back to TBIA
      </Link>
      <div className="auth-frame">
        <section className="auth-promo">
          <img
            className="auth-promo-image"
            src={mode === "login" ? loginIllustration : registerIllustration}
            alt={
              mode === "login"
                ? "Person working on a laptop"
                : "Person using an online service at a desktop computer"
            }
          />
        </section>
        <section className="auth-form-side">
          <div className="auth-form-heading">
            <span className="eyebrow">
              {mode === "login" ? "WELCOME BACK" : "START YOUR JOURNEY"}
            </span>
            <h1>{title}</h1>
            <p>{subtitle}</p>
          </div>
          {children}
          <div className="auth-switch">
            {mode === "login" ? (
              <>
                New to TBIA?{" "}
                <Link to="/register">
                  Create an account <ArrowRight size={14} />
                </Link>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <Link to="/login">
                  Log in <ArrowRight size={14} />
                </Link>
              </>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
