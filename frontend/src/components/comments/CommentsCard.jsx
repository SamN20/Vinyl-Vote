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
  const [replyTo, setReplyTo] = useState(null);
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

  const commentById = new Map(comments.map((comment) => [comment.id, comment]));
  const childrenByParent = new Map();

  for (const comment of comments) {
    const key = comment.parent_id ?? 0;
    if (!childrenByParent.has(key)) {
      childrenByParent.set(key, []);
    }
    childrenByParent.get(key).push(comment);
  }

  async function onSubmit(event) {
    event.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }
    await submitComment(trimmed, replyTo?.id ?? null);
    setText("");
    setReplyTo(null);
  }

  function onReply(comment) {
    setReplyTo(comment);
  }

  function cancelReply() {
    setReplyTo(null);
  }

  function renderThread(parentId = 0, depth = 0) {
    const children = childrenByParent.get(parentId) || [];
    return children.map((comment) => {
      const isMine = Number(currentUserId) === Number(comment.user_id);
      const isReply = depth > 0;
      const parent = comment.parent_id ? commentById.get(comment.parent_id) : null;

      return (
        <div key={comment.id} className={`comment-thread depth-${Math.min(depth, 3)}`}>
          <article className={`comment-item ${isReply ? "reply" : ""}`}>
            <div className="comment-meta">
              <strong>{comment.user}</strong>
              <span>{formatTimestamp(comment.timestamp)}</span>
            </div>

            {parent ? (
              <p className="comment-replying-to">Replying to {parent.user}</p>
            ) : null}

            <p>{comment.text}</p>
            <div className="comment-actions">
              <button className="btn btn-secondary" type="button" onClick={() => onReply(comment)}>
                Reply
              </button>
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
          {renderThread(comment.id, depth + 1)}
        </div>
      );
    });
  }

  return (
    <section className="card comments-card">
      <header className="comments-header">
        <h2>Comments</h2>
      </header>

      <form className="comment-form" onSubmit={onSubmit}>
        {replyTo ? (
          <div className="reply-banner">
            <span>
              Replying to <strong>{replyTo.user}</strong>
            </span>
            <button className="btn btn-secondary" type="button" onClick={cancelReply}>Cancel</button>
          </div>
        ) : null}

        <textarea
          className="comment-input"
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows="3"
          placeholder={replyTo ? `Reply to ${replyTo.user}...` : "Leave a comment about this album..."}
        />
        <button className="btn btn-primary" type="submit" disabled={submitState === "saving"}>
          {submitState === "saving" ? "Posting..." : replyTo ? "Post Reply" : "Post Comment"}
        </button>
      </form>

      {state === "loading" ? <p>Loading comments...</p> : null}
      {error ? <p className="error-text">{error}</p> : null}

      <div className="comment-list">
        {renderThread()}
      </div>

      {state === "ready" && comments.length === 0 ? (
        <p className="empty-text">No comments yet. Start the conversation.</p>
      ) : null}
    </section>
  );
}
