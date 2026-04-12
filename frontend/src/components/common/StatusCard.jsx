export default function StatusCard({ title, message, variant = "status" }) {
  return (
    <section className={`card status-card ${variant === "error" ? "error-card" : ""}`}>
      {title ? <h2>{title}</h2> : null}
      <p>{message}</p>
    </section>
  );
}
