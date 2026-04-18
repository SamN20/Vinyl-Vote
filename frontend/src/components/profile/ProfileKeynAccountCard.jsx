function getDisplayName(user, keynProfile) {
  if (keynProfile?.display_name) {
    return keynProfile.display_name;
  }
  if (keynProfile?.username) {
    return keynProfile.username;
  }
  return user?.username || "Vinyl Vote User";
}

function formatLastSync(isoString) {
  if (!isoString) {
    return "N/A";
  }
  const parsed = new Date(isoString);
  if (Number.isNaN(parsed.getTime())) {
    return "N/A";
  }
  return parsed.toLocaleString();
}

function AccountLinkTile({ href, title, subtitle }) {
  return (
    <a className="profile-action-tile" href={href} target="_blank" rel="noopener noreferrer">
      <strong>{title}</strong>
      <span>{subtitle}</span>
    </a>
  );
}

export default function ProfileKeynAccountCard({ user, keynProfile, keynLinks }) {
  const displayName = getDisplayName(user, keynProfile);

  return (
    <section className="profile-section card profile-keyn-card">
      <h2>Account Settings</h2>
      <p className="profile-section-subtitle">Your account is managed via KeyN. Profile updates are synced from KeyN.</p>

      <div className="profile-keyn-header">
        <div className="profile-keyn-avatar" aria-hidden="true">
          {displayName.slice(0, 1).toUpperCase()}
        </div>
        <div>
          <p className="profile-keyn-title">Managed via KeyN</p>
          <h3>{displayName}</h3>
          <p className="profile-keyn-meta">
            {user?.keyn_id ? `KeyN ID: ${user.keyn_id}` : "KeyN linked"}
            {keynProfile?.is_verified ? " • Verified" : ""}
          </p>
        </div>
      </div>

      <dl className="profile-keyn-grid">
        <div>
          <dt>Display Name</dt>
          <dd>{keynProfile?.display_name || "—"}</dd>
        </div>
        <div>
          <dt>Username</dt>
          <dd>{keynProfile?.username || "—"}</dd>
        </div>
        <div>
          <dt>Email</dt>
          <dd>{keynProfile?.email || user?.email || "—"}</dd>
        </div>
        <div>
          <dt>Last Sync</dt>
          <dd>{formatLastSync(user?.last_login)}</dd>
        </div>
      </dl>

      <div className="profile-actions-grid">
        <AccountLinkTile href={keynLinks?.profile} title="Profile" subtitle="View your KeyN profile" />
        <AccountLinkTile href={keynLinks?.edit_profile} title="Edit Profile" subtitle="Update details and bio" />
        <AccountLinkTile href={keynLinks?.change_password} title="Password" subtitle="Change your password" />
        <AccountLinkTile href={keynLinks?.notifications} title="Notifications" subtitle="Manage notification preferences" />
      </div>
    </section>
  );
}