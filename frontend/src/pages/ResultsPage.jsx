import CommentsCard from "../components/comments/CommentsCard";
import Seo, { buildCanonicalUrl } from "../components/common/Seo";
import StatusCard from "../components/common/StatusCard";
import AdditionalInsights from "../components/results/AdditionalInsights";
import ResultsCard from "../components/results/ResultsCard";
import { useResultsFlow } from "../hooks/useResultsFlow";

export default function ResultsPage({ routeAlbumId }) {
  const { error, loadResults, resultsPayload, resultsState } = useResultsFlow(routeAlbumId);
  const currentUserId = resultsPayload?.currentUserId ?? null;
  const album = resultsPayload?.album;
  const summary = resultsPayload?.summary;
  const resultsPath = routeAlbumId ? `/results/${routeAlbumId}` : "/results";
  const title = album ? `${album.title} by ${album.artist} Results` : "Weekly Album Results";
  const scoreText = summary?.avg_song_score ? ` The average song score is ${summary.avg_song_score}/5.` : "";
  const description = album
    ? `See Vinyl Vote community ratings for ${album.title} by ${album.artist}, including track scores, album score, and voter totals.${scoreText}`
    : "Explore Vinyl Vote's latest completed weekly album results, including track scores, album score, and community voting totals.";
  const schema = album
    ? {
        "@context": "https://schema.org",
        "@type": "MusicAlbum",
        name: album.title,
        byArtist: {
          "@type": "MusicGroup",
          name: album.artist,
        },
        image: album.cover_url || undefined,
        url: buildCanonicalUrl(resultsPath),
        aggregateRating: summary?.avg_album_score
          ? {
              "@type": "AggregateRating",
              ratingValue: summary.avg_album_score,
              bestRating: 5,
              worstRating: 1,
              ratingCount: summary.voter_count || undefined,
            }
          : undefined,
      }
    : null;

  return (
    <>
      <Seo
        title={title}
        description={description}
        path={resultsPath}
        image={album?.cover_url}
        schema={schema}
        schemaId="results-seo-schema"
      />

      <section className="hero">
        <p className="eyebrow">Vinyl Vote</p>
        <h1>Weekly Results</h1>
        <p className="subtitle">
          Track-level voting outcomes for the most recent completed album.
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
          <CommentsCard albumId={resultsPayload?.album?.id} currentUserId={currentUserId} />
        </>
      ) : null}
    </>
  );
}
