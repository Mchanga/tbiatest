import { useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { ArrowUpRight, LogOut, Menu, Moon, Sun, X } from "lucide-react";
import { useAuth } from "../features/auth/AuthProvider";
import { getTheme, toggleTheme } from "../lib/theme";
import tbiaLogo from "../assets/tbia-logo.jpeg";

export function SiteLayout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [theme, setTheme] = useState(getTheme());
  const logout = async () => {
    try {
      await signOut();
    } finally {
      navigate("/");
    }
  };
  const nav = (
    <>
      <NavLink to="/" end>
        Home
      </NavLink>
      <NavLink to="/awards">Awards</NavLink>
      <NavLink to="/winners">Winners</NavLink>
      <NavLink to="/nominees">Nominees</NavLink>
      <NavLink to="/businesses">Businesses</NavLink>
      <NavLink to="/vote">Vote</NavLink>
      <NavLink to="/events">Events</NavLink>
    </>
  );
  return (
    <div className="site-shell">
      <header className="site-header wrap">
        <Link to="/" className="brand">
          <img className="brand-logo" src={tbiaLogo} alt="" />
          <span>
            <b>TBIA</b>
            <small>TANZANIA BUSINESS & INVESTMENT AWARDS</small>
          </span>
        </Link>
        <nav className="desktop-nav">{nav}</nav>
        <div className="header-actions">
          <button
            className="icon-button"
            aria-label="Toggle color theme"
            onClick={() => setTheme(toggleTheme())}
          >
            {theme === "light" ? <Moon size={17} /> : <Sun size={17} />}
          </button>
          {user ? (
            <>
              <Link
                className="button button-secondary header-account"
                to="/app"
              >
                My account <ArrowUpRight size={15} />
              </Link>
              <button className="login-link" onClick={() => void logout()}>
                <LogOut size={15} /> Sign out
              </button>
            </>
          ) : (
            <>
              <Link className="login-link" to="/login">
                Log in
              </Link>
              <Link
                className="button button-primary header-account"
                to="/register"
              >
                Join the community <ArrowUpRight size={15} />
              </Link>
            </>
          )}
          <button
            className="icon-button mobile-toggle"
            aria-label="Open navigation"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? <X /> : <Menu />}
          </button>
        </div>
      </header>
      {mobileOpen && (
        <nav className="mobile-nav" onClick={() => setMobileOpen(false)}>
          {nav}
          {user ? (
            <>
              <Link to="/app">My account</Link>
              <button onClick={() => void logout()}>Sign out</button>
            </>
          ) : (
            <>
              <Link to="/login">Log in</Link>
              <Link to="/register">Create account</Link>
            </>
          )}
        </nav>
      )}
      <main>
        <Outlet />
      </main>
      <footer className="site-footer">
        <div className="wrap footer-grid">
          <div>
            <Link to="/" className="brand">
              <img
                className="brand-logo brand-logo-compact"
                src={tbiaLogo}
                alt=""
              />
              <span>
                <b>TBIA</b>
                <small>TANZANIA BUSINESS & INVESTMENT AWARDS</small>
              </span>
            </Link>
            <p>
              Recognising the people and businesses shaping Tanzania’s next
              chapter.
            </p>
          </div>
          <div>
            <b>Explore</b>
            <Link to="/awards">Awards & categories</Link>
            <Link to="/winners">Award winners</Link>
            <Link to="/nominees">Nominees</Link>
            <Link to="/businesses">Businesses</Link>
            <Link to="/events">Events</Link>
          </div>
          <div>
            <b>Participate</b>
            <Link to="/nominations">Nominate a business</Link>
            <Link to="/vote">Vote for a nominee</Link>
            <Link to="/sponsorship">Become a partner</Link>
          </div>
          <div className="footer-bottom">
            © {new Date().getFullYear()} Tanzania Business & Investment
            Awards.{" "}
          </div>
        </div>
      </footer>
    </div>
  );
}
