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
        KeyN remains the default flow, but dev and legacy routes remain available during V2
        migration.
      </p>
      <div className="button-row">
        <a className="btn btn-primary" href={loginHref}>Continue with KeyN</a>
        <a className="btn btn-secondary" href={legacyLoginHref}>Legacy Login</a>
        {showDevLogin && (
          <a className="btn btn-secondary" href={devLoginHref(devLoginUsername)}>
            Dev Login (No KeyN)
          </a>
        )}
      </div>
    </section>
  );
}
