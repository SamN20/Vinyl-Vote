import "./LegalPages.css";

export default function TermsPage() {
  return (
    <div className="legal-v2-page">
      <section className="hero legal-v2-hero">
        <p className="eyebrow">Legal</p>
        <h1>Terms of Use byNolo</h1>
        <p className="legal-v2-date">Effective date: June 29, 2025</p>
        <p className="legal-v2-intro">
          Welcome to Vinyl Vote, a project byNolo. By accessing or using the platform, you agree to these terms.
          If you do not agree with any part, do not use the platform.
        </p>
      </section>

      <section className="legal-v2-grid">
        <article className="legal-v2-section">
          <h2>1. Eligibility and Access</h2>
          <p>
            The platform is currently accessible to users with a private link, though technically open to the public.
            We reserve the right to restrict or revoke access at our discretion.
          </p>
        </article>

        <article className="legal-v2-section">
          <h2>2. Account Responsibilities</h2>
          <p>
            You must provide accurate account information. Email addresses may be used for account recovery and
            notifications. You are responsible for maintaining credential confidentiality and account activity.
          </p>
        </article>

        <article className="legal-v2-section">
          <h2>3. Voting and Moderation</h2>
          <p>
            Users may rate weekly albums. Aggregated results are shared publicly, while individual vote details are
            visible only to the user and administrators.
          </p>
          <ul>
            <li>We may ban or suspend any user or email.</li>
            <li>We may ignore or exclude votes for any given week.</li>
          </ul>
        </article>

        <article className="legal-v2-section">
          <h2>4. User Content and Requests</h2>
          <p>
            You may submit profile details, votes, and album requests. You may not post harmful, abusive, or
            disruptive content.
          </p>
        </article>

        <article className="legal-v2-section">
          <h2>5. Content Ownership</h2>
          <p>
            Album artwork and metadata are provided by third-party services such as Spotify and Apple Music and remain
            property of their respective owners. The Vinyl Vote product, UI, and original assets are maintained under
            byNolo.
          </p>
        </article>

        <article className="legal-v2-section">
          <h2>6. Termination</h2>
          <p>
            We may terminate or restrict access at any time due to misconduct, technical concerns, or violations of
            these terms.
          </p>
        </article>

        <article className="legal-v2-section">
          <h2>7. Disclaimer</h2>
          <p>
            The platform is provided as-is without warranties of any kind. We do not guarantee uptime, availability,
            or absolute accuracy of ratings and results.
          </p>
        </article>

        <article className="legal-v2-section">
          <h2>8. Changes</h2>
          <p>
            We may update these terms from time to time. Continued use of the platform implies acceptance of updated
            terms. Material updates will include a revised effective date.
          </p>
        </article>

        <article className="legal-v2-section">
          <h2>9. Branding</h2>
          <p>
            Vinyl Vote is the weekly album rating experience; byNolo is the parent project identity. References to
            we, us, or our refer to the maintainers operating under the byNolo umbrella.
          </p>
        </article>

        <article className="legal-v2-section">
          <h2>10. KeyN Authentication</h2>
          <p>
            Sign-in with KeyN is subject to KeyN policies shown during authentication. We receive limited identity
            fields based on approved scopes, such as id, username/display name, and email, and do not receive your
            KeyN password.
          </p>
          <p>
            On first KeyN login, we attempt account linking by email, then username. If no match exists, a new
            account is created and linked to your KeyN identity.
          </p>
          <p>
            Access may be suspended for terms violations or provider restrictions. You may request unlinking through
            account support, though this may limit platform access.
          </p>
        </article>

        <article className="legal-v2-section">
          <h2>11. Vinyl Vote Companion (Browser Extension)</h2>
          <p>
            The extension adds rating controls on supported music sites (YouTube Music, Spotify, Apple Music) and can
            unlock optional Retro rating after successful weekly vote completion.
          </p>
          <p>
            It is limited to supported sites and vinylvote.bynolo.ca for metadata and rating workflows. You may not
            use it for scraping, abuse, automation outside intended behavior, or eligibility bypass.
          </p>
          <p>
            We may disable or limit extension functionality for misuse or terms violations.
          </p>
        </article>
      </section>
    </div>
  );
}
