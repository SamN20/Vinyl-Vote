import "./LegalPages.css";

export default function PrivacyPage() {
  return (
    <div className="legal-v2-page">
      <section className="hero legal-v2-hero">
        <p className="eyebrow">Legal</p>
        <h1>Privacy Policy byNolo</h1>
        <p className="legal-v2-date">Effective date: June 29, 2025</p>
        <p className="legal-v2-intro">
          This policy explains how Vinyl Vote collects, uses, and protects data.
        </p>
      </section>

      <section className="legal-v2-grid">
        <article className="legal-v2-section">
          <h2>1. Information We Collect</h2>
          <ul>
            <li>
              <strong>Account information:</strong> identity details linked to your authentication provider, including
              username/display name and email.
            </li>
            <li>
              <strong>Votes and requests:</strong> weekly ratings, album scores, comments, and album requests.
            </li>
            <li>
              <strong>Session data:</strong> cookies needed to keep you signed in and protect account sessions.
            </li>
            <li>
              <strong>Analytics:</strong> traffic and performance information used for reliability and abuse prevention.
            </li>
          </ul>
        </article>

        <article className="legal-v2-section">
          <h2>2. How We Use Information</h2>
          <ul>
            <li>Manage your account and voting history.</li>
            <li>Display aggregated vote results and rankings.</li>
            <li>Improve functionality, moderation, and service quality.</li>
            <li>Support optional notification preferences through Nolofication.</li>
          </ul>
        </article>

        <article className="legal-v2-section">
          <h2>3. Data Sharing</h2>
          <p>
            We do not sell personal data. Administrators may access data required for moderation and support.
            Metadata may be fetched from third-party services such as Spotify, Apple Music, and YouTube Music.
          </p>
        </article>

        <article className="legal-v2-section">
          <h2>4. Vote Visibility</h2>
          <p>
            Aggregated results are visible to users. Individual vote details are limited to the account holder and
            administrators.
          </p>
        </article>

        <article className="legal-v2-section">
          <h2>5. Data Retention</h2>
          <p>
            Account and voting history are retained to preserve long-term features and statistics unless you request
            deletion. Contact support for verified data-removal requests.
          </p>
        </article>

        <article className="legal-v2-section">
          <h2>6. Cookies</h2>
          <p>Cookies are used for session and login continuity. No third-party ad tracking cookies are used.</p>
        </article>

        <article className="legal-v2-section">
          <h2>7. Security</h2>
          <p>
            We apply reasonable safeguards to protect data and sessions. No internet service can guarantee absolute
            security.
          </p>
        </article>

        <article className="legal-v2-section">
          <h2>8. Contact</h2>
          <p>
            For privacy questions or data requests, contact
            {" "}
            <a className="legal-v2-link" href="mailto:Support.VinylVote@bynolo.ca">
              Support.VinylVote@bynolo.ca
            </a>
            .
          </p>
        </article>

        <article className="legal-v2-section">
          <h2>9. KeyN Authentication</h2>
          <p>
            When using KeyN, we receive only approved identity scope fields and store what is needed for account
            linking and session management. We do not receive your KeyN password.
          </p>
          <p>
            Profile snapshots may be refreshed during login. For provider-side deletion or changes, use KeyN controls;
            for Vinyl Vote local data requests, contact support.
          </p>
        </article>

        <article className="legal-v2-section">
          <h2>10. Vinyl Vote Companion (Browser Extension)</h2>
          <p>
            The extension processes now-playing metadata on supported music sites locally in your browser to help with
            scoring workflows. It does not collect unrelated browsing history.
          </p>
          <p>
            Local extension settings and state are stored in your browser and can be cleared through options or by
            uninstalling the extension.
          </p>
        </article>
      </section>
    </div>
  );
}
