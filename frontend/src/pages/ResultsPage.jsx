import CommentsCard from "../components/comments/CommentsCard";
import StatusCard from "../components/common/StatusCard";
import AdditionalInsights from "../components/results/AdditionalInsights";
import ResultsCard from "../components/results/ResultsCard";
import { useResultsFlow } from "../hooks/useResultsFlow";

export default function ResultsPage({ routeAlbumId }) {
  const { error, loadResults, resultsPayload, resultsState } = useResultsFlow(routeAlbumId);

  return (
    <>
      <section className="hero">
        <p className="eyebrow">Vinyl Vote V2</p>
        <h1>Weekly Results</h1>
        <p className="subtitle">
          Track-level voting outcomes for the most recent completed album. This mirrors the V1 data layout while
          using versioned V2 APIs.
        </p>
      </section>

      {resultsState === "loading" ? <StatusCard message="Loading latest results..." /> : null}

      {resultsState === "error" ? (
        <StatusCard
          title="Could not load results"
          message={error || "The results endpoint is currently unavailable."}
          variant="error"
        />
      ) : null}

      {resultsState === "empty" ? (
        <section className="card">
          <h2>No published results yet</h2>
          <p className="empty-text">Complete one full voting cycle first, then this page will show the previous album.</p>
          <div className="button-row">
            <button type="button" className="btn btn-secondary" onClick={loadResults}>Retry</button>
          </div>
        </section>
      ) : null}

      {resultsState === "ready" ? (
        <>
          <ResultsCard payload={resultsPayload} />
          <AdditionalInsights payload={resultsPayload} />
          <CommentsCard albumId={resultsPayload?.album?.id} />
        </>
      ) : null}
    </>
  );
}
