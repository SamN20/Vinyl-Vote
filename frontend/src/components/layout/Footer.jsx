import { Link } from "react-router-dom";
import "./Footer.css";

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="site-footer-v2" aria-label="Site footer">
      <p className="site-footer-v2-copy">
        &copy; {currentYear} Vinyl Vote - <span className="footer-gradient-text">byNolo</span> &middot;
        <Link to="/terms">Terms &amp; Conditions</Link> |
        <Link to="/privacy">Privacy Policy</Link> |
        <Link to="/extension">Browser Extension</Link>
      </p>
    </footer>
  );
}
