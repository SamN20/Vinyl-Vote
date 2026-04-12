import { useState } from "react";
import { useAlbumComments } from "../../hooks/useAlbumComments";
import "./CommentsCard.css";

function formatTimestamp(value) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

export default function CommentsCard({ albumId, currentUserId }) {
  const [text, setText] = useState("");
  const {
    comments,
    error,
    flagComment,
    removeComment,
    state,
    submitComment,
    submitState,
  } = useAlbumComments(albumId);

  if (!albumId) {
    return null;
  }

  async function onSubmit(event) {
    event.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }
    await submitComment(trimmed);
    setText("");
  }

  return (
    <section className="card comments-card">
      <header className="comments-header">
        <h2>Comments</h2>
      </header>

      <form className="comment-form" onSubmit={onSubmit}>
        <textarea
          className="comment-input"
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows="3"
          placeholder="Leave a comment about this album..."
        />
        <button className="btn btn-primary" type="submit" disabled={submitState === "saving"}>
          {submitState === "saving" ? "Posting..." : "Post Comment"}
        </button>
      </form>

      {state === "loading" ? <p>Loading comments...</p> : null}
      {error ? <p className="error-text">{error}</p> : null}

      <div className="comment-list">
        {comments.map((comment) => {
          const isMine = Number(currentUserId) === Number(comment.user_id);
          return (
            <article key={comment.id} className="comment-item">
              <div className="comment-meta">
                <strong>{comment.user}</strong>
                <span>{formatTimestamp(comment.timestamp)}</span>
              </div>
              <p>{comment.text}</p>
              <div className="comment-actions">
                {isMine ? (
                  <button className="btn btn-secondary" type="button" onClick={() => removeComment(comment.id)}>
                    Delete
                  </button>
                ) : (
                  <button className="btn btn-secondary" type="button" onClick={() => flagComment(comment.id)}>
                    Flag
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {state === "ready" && comments.length === 0 ? (
        <p className="empty-text">No comments yet. Start the conversation.</p>
      ) : null}
    </section>
  );
}
