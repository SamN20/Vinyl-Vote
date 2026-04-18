import { useEffect, useMemo, useState } from "react";
import { getProfileData } from "../api";
import StatusCard from "../components/common/StatusCard";
import ProfileAlbumHistory from "../components/profile/ProfileAlbumHistory";
import ProfileKeynAccountCard from "../components/profile/ProfileKeynAccountCard";
import ProfileSkeleton from "../components/profile/ProfileSkeleton";
import ProfileStatsGrid from "../components/profile/ProfileStatsGrid";
import ProfileVotesChart from "../components/profile/ProfileVotesChart";
import "./ProfilePage.css";

function ProfileHeader({ user }) {
  return (
    <section className="hero profile-hero">
      <div className="profile-hero-avatar" aria-hidden="true">
        {(user?.username || "U").slice(0, 1).toUpperCase()}
      </div>
      <div className="profile-hero-copy">
        <p className="eyebrow">Vinyl Vote Profile</p>
        <h1>{user?.username || "Your Profile"}</h1>
        <p className="subtitle">{user?.email || "Email unavailable"}</p>
      </div>
    </section>
  );
}

export default function ProfilePage() {
  const [state, setState] = useState("loading");
  const [error, setError] = useState("");
  const [payload, setPayload] = useState(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let active = true;
    setState("loading");
    setError("");

    getProfileData()
      .then((data) => {
        if (!active) {
          return;
        }
        setPayload(data);
        setState("success");
      })
      .catch((err) => {
        if (!active) {
          return;
        }
        setError(err.message || "Unable to load profile.");
        setState("error");
      });

    return () => {
      active = false;
    };
  }, []);

  const filteredAlbumVotes = useMemo(() => {
    const allVotes = payload?.album_votes || [];
    const normalized = search.trim().toLowerCase();
    if (!normalized) {
      return allVotes;
    }
    return allVotes.filter((item) => {
      const title = item.album?.title?.toLowerCase() || "";
      const artist = item.album?.artist?.toLowerCase() || "";
      return title.includes(normalized) || artist.includes(normalized);
    });
  }, [payload?.album_votes, search]);

  if (state === "loading") {
    return <ProfileSkeleton />;
  }

  if (state === "error") {
    return (
      <StatusCard
        title="Could not load profile"
        message={error || "Try refreshing the page in a moment."}
        variant="error"
      />
    );
  }

  return (
    <>
      <ProfileHeader user={payload?.user} />

      <ProfileStatsGrid
        stats={payload?.profile_stats}
        streaks={payload?.profile_streaks}
        extras={payload?.profile_extras}
        battleStats={payload?.battle_stats}
      />

      <section className="profile-two-column">
        <ProfileVotesChart series={payload?.votes_timeseries} />

        <section className="profile-section card profile-top-pick-card">
          <h2>Top Face-Off Pick</h2>
          {/* <p className="profile-section-subtitle">Your most selected winner in Face-Off battles.</p> */}
          {payload?.battle_stats?.top_pick ? (
            <div className="profile-top-pick">
              <div className="profile-top-pick-media-wrap">
                {payload.battle_stats.top_pick.song.album?.cover_url ? (
                  <img
                    src={payload.battle_stats.top_pick.song.album.cover_url}
                    alt={`${payload.battle_stats.top_pick.song.title} cover`}
                    className="profile-top-pick-cover"
                    width="220"
                    height="220"
                    loading="lazy"
                  />
                ) : (
                  <div className="profile-top-pick-cover profile-top-pick-cover-fallback">No Cover</div>
                )}
                <p className="profile-top-pick-chip">Most picked winner</p>
              </div>

              <div className="profile-top-pick-meta">
                <p className="profile-top-pick-title">{payload.battle_stats.top_pick.song.title}</p>
                <p className="profile-top-pick-artist">{payload.battle_stats.top_pick.song.album?.artist || "Unknown artist"}</p>
                <p className="profile-top-pick-album">Album: {payload.battle_stats.top_pick.song.album?.title || "Unknown album"}</p>
                {/* <p className="profile-top-pick-wins">{payload.battle_stats.top_pick.wins} wins</p> */}
              </div>

              
            </div>
          ) : (
            <p className="empty-text">No battles yet.</p>
          )}
        </section>
      </section>

      <ProfileKeynAccountCard
        user={payload?.user}
        keynProfile={payload?.keyn_profile}
        keynLinks={payload?.keyn_links}
      />

      <ProfileAlbumHistory
        albumVotes={filteredAlbumVotes}
        search={search}
        onSearchChange={setSearch}
      />
    </>
  );
}