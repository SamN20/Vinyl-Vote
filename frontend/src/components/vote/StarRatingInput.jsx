export default function StarRatingInput({ value, onChange, disabled = false, className = "", ariaHidden = false }) {
  const numeric = Number(value || 0);
  const normalized = Number.isNaN(numeric) ? 0 : numeric;
  const base = Math.max(0, Math.min(5, Math.floor(normalized)));
  const hasHalf = Math.abs(normalized - base - 0.5) < 0.01;

  function setScore(next) {
    const clamped = Math.max(0, Math.min(5, next));
    onChange(clamped.toFixed(1).replace(/\.0$/, ""));
  }

  return (
    <div
      className={`lazy-stars ${disabled ? "disabled" : ""} ${className}`.trim()}
      aria-hidden={ariaHidden ? "true" : undefined}
    >
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          className={`star-btn ${star <= base ? "active" : ""}`}
          disabled={disabled}
          onClick={() => {
            if (disabled) {
              return;
            }
            if (star === base && !hasHalf) {
              setScore(0);
            } else {
              setScore(star + (hasHalf ? 0.5 : 0));
            }
          }}
          aria-label={`Rate ${star} ${star === 1 ? "star" : "stars"}`}
        >
          ★
        </button>
      ))}
      <button
        type="button"
        className={`half-btn ${hasHalf ? "active" : ""}`}
        disabled={disabled || base >= 5}
        onClick={() => setScore(base + (hasHalf ? 0 : 0.5))}
        aria-label="Toggle half-star increment"
      >
        1/2
      </button>
    </div>
  );
}
