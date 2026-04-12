import VoteCard from "../components/vote/VoteCard";

export default function RetroVotePage({ retro }) {
  return (
    <>
      <section className="hero">
        <p className="eyebrow">Vinyl Vote V2</p>
        <h1>Retro Vote</h1>
        <p className="subtitle">
          This album's official window has passed. Your vote is recorded as retroactive and still counts.
        </p>
      </section>

      <VoteCard
        albumPayload={retro.albumPayload}
        albumScore={retro.albumScore}
        albumState={retro.albumState}
        error={retro.error}
        feedback={retro.feedback}
        hasSavedVotes={retro.hasSavedVotes}
        hasUnsavedChanges={retro.hasUnsavedChanges}
        loadAlbum={() => {}}
        progressPercent={retro.progressPercent}
        ratedTracks={retro.ratedTracks}
        remainingTracks={retro.remainingTracks}
        saveVotes={retro.saveVotes}
        setAlbumScore={retro.setAlbumScore}
        setSongScore={retro.setSongScore}
        songScores={retro.songScores}
        songs={retro.songs}
        statusLabel={retro.statusLabel}
        submitState={retro.submitState}
        title="Retro Album"
        submitLabel="Save Retro Votes"
        showRefreshButton={false}
        showPostVoteActions={false}
      />
    </>
  );
}
