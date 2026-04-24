import "./Footer.css";

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="site-footer-v2" aria-label="Site footer">
      <p className="site-footer-v2-copy">
        &copy; {currentYear} Vinyl Vote - <span className="footer-gradient-text">byNolo</span> &middot;
        <a href="/terms">Terms &amp; Conditions</a> |
        <a href="/privacy">Privacy Policy</a> |
        <a href="/extension">Browser Extension</a>
      </p>
    </footer>
  );
}
