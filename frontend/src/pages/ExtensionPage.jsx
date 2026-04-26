import { extensionListingHref } from "../api";
import "./LegalPages.css";

const supportList = [
  "YouTube Music",
  "Spotify",
  "Apple Music",
];

export default function ExtensionPage() {
  return (
    <div className="legal-v2-page">
      <section className="hero legal-v2-hero">
        <p className="eyebrow">Tools</p>
        <h1>Vinyl Vote Browser Extension</h1>
        <p className="legal-v2-intro">
          The companion extension adds rating controls directly on supported music platforms and can unlock retro flows after weekly vote completion.
        </p>
      </section>

      <section className="legal-v2-grid">
        <article className="legal-v2-section">
          <h2>Supported Platforms</h2>
          <ul>
            {supportList.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>

        <article className="legal-v2-section">
          <h2>What It Does</h2>
          <p>
            Reads now-playing metadata on supported sites to help you submit this week&apos;s scores faster. It does not collect unrelated browsing history.
          </p>
        </article>

        <article className="legal-v2-section">
          <h2>Install</h2>
          <p>
            Use the official browser store listing to install the extension and open options for platform-specific behavior.
          </p>
          <div className="legal-v2-actions">
            <a className="btn btn-primary" href={extensionListingHref()} target="_blank" rel="noopener noreferrer">
              Open Extension Listing
            </a>
          </div>
        </article>
      </section>
    </div>
  );
}
