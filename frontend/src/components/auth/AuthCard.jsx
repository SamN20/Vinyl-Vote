import { devLoginHref } from "../../api";

export default function AuthCard({
  devLoginUsername,
  legacyLoginHref,
  loginHref,
  showDevLogin,
}) {
  return (
    <section className="card auth-card">
      <h2>Sign in to vote</h2>
      <p>
        Continue with KeyN, or use your Vinyl Vote password if your account was created before KeyN.
      </p>
      <div className="button-row">
        <a className="btn btn-primary" href={loginHref}>Continue with KeyN</a>
        <a className="btn btn-secondary" href={legacyLoginHref}>Password Login</a>
        {showDevLogin && (
          <a className="btn btn-secondary" href={devLoginHref(devLoginUsername)}>
            Local Test Login
          </a>
        )}
      </div>
    </section>
  );
}
