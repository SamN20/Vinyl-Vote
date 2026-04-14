import "./LeaderboardPagination.css";

export default function LeaderboardPagination({ pagination, onPageChange }) {
  if (!pagination) {
    return null;
  }

  const { page, pages, total } = pagination;
  if (!pages || pages <= 1) {
    return <p className="pagination-caption">Showing {total || 0} entries</p>;
  }

  return (
    <nav className="leaderboard-pagination" aria-label="Leaderboard pagination">
      <button
        type="button"
        className="btn btn-secondary"
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
      >
        Previous
      </button>

      <p className="pagination-caption">
        Page {page} of {pages} <span className="pagination-total">({total} total)</span>
      </p>

      <button
        type="button"
        className="btn btn-secondary"
        onClick={() => onPageChange(page + 1)}
        disabled={page >= pages}
      >
        Next
      </button>
    </nav>
  );
}
