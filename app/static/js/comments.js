document.addEventListener('DOMContentLoaded', function() {
    const commentsSection = document.getElementById('comments-section');
    if (!commentsSection) return;

    const albumId = commentsSection.dataset.albumId;
    const currentUserId = commentsSection.dataset.currentUserId ? parseInt(commentsSection.dataset.currentUserId) : null;
    const commentsList = document.getElementById('comments-list');
    const commentForm = document.getElementById('comment-form');
    const commentInput = document.getElementById('comment-input');
    const commentSubmit = document.getElementById('comment-submit');

    function fetchComments() {
        fetch(`/api/comments/${albumId}`)
            .then(response => response.json())
            .then(comments => {
                commentsList.innerHTML = '';
                if (comments.length === 0) {
                    commentsList.innerHTML = '<p class="no-comments">No comments yet. Be the first!</p>';
                    return;
                }
                
                // Build tree
                const commentMap = {};
                const roots = [];
                
                comments.forEach(c => {
                    c.children = [];
                    commentMap[c.id] = c;
                });
                
                comments.forEach(c => {
                    if (c.parent_id) {
                        if (commentMap[c.parent_id]) {
                            commentMap[c.parent_id].children.push(c);
                        }
                    } else {
                        roots.push(c);
                    }
                });
                
                // Render tree
                roots.forEach(root => {
                    commentsList.appendChild(createCommentElement(root));
                });
            });
    }

    function createCommentElement(comment) {
        const div = document.createElement('div');
        div.className = 'comment-card';
        div.id = `comment-${comment.id}`;
        
        const isOwner = currentUserId && comment.user_id === currentUserId;
        
        let actions = '';
        if (currentUserId) {
            actions += `<button class="action-btn reply-btn" data-id="${comment.id}">Reply</button>`;
        }
        if (isOwner) {
            actions += `<button class="action-btn delete-btn" data-id="${comment.id}">Delete</button>`;
        }
        if (!isOwner && !comment.is_flagged) {
            actions += `<button class="action-btn flag-btn" data-id="${comment.id}">Flag</button>`;
        } else if (comment.is_flagged) {
            actions += `<span class="text-muted small">Flagged</span>`;
        }

        div.innerHTML = `
            <div class="comment-header">
                <strong>${comment.user}</strong>
                <span class="comment-date">${new Date(comment.timestamp).toLocaleString()}</span>
            </div>
            <div class="comment-body">${escapeHtml(comment.text)}</div>
            <div class="comment-footer">
                ${actions}
            </div>
            <div class="reply-form-container" id="reply-form-${comment.id}"></div>
            <div class="replies-container"></div>
        `;
        
        const repliesContainer = div.querySelector('.replies-container');
        if (comment.children && comment.children.length > 0) {
            comment.children.forEach(child => {
                repliesContainer.appendChild(createCommentElement(child));
            });
        }
        
        // Event listeners
        const replyBtn = div.querySelector('.reply-btn');
        if (replyBtn) {
            replyBtn.addEventListener('click', () => toggleReplyForm(comment.id));
        }
        
        const deleteBtn = div.querySelector('.delete-btn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => deleteComment(comment.id));
        }
        
        const flagBtn = div.querySelector('.flag-btn');
        if (flagBtn) {
            flagBtn.addEventListener('click', () => flagComment(comment.id, flagBtn));
        }

        return div;
    }

    function toggleReplyForm(commentId) {
        const container = document.getElementById(`reply-form-${commentId}`);
        if (container.innerHTML) {
            container.innerHTML = '';
            return;
        }
        
        container.innerHTML = `
            <form class="reply-form mt-2" onsubmit="postReply(event, ${commentId})">
                <textarea class="comment-input small" rows="2" placeholder="Write a reply..." required></textarea>
                <div class="mt-1">
                    <button type="submit" class="button small">Reply</button>
                    <button type="button" class="button small secondary" onclick="document.getElementById('reply-form-${commentId}').innerHTML=''">Cancel</button>
                </div>
            </form>
        `;
        container.querySelector('textarea').focus();
    }
    
    window.postReply = function(e, parentId) {
        e.preventDefault();
        const form = e.target;
        const text = form.querySelector('textarea').value.trim();
        const btn = form.querySelector('button[type="submit"]');
        
        if (!text) return;
        btn.disabled = true;
        
        submitComment(text, parentId, () => {
            fetchComments(); // Refresh to show new reply
        }, () => {
            btn.disabled = false;
        });
    };

    function postComment(e) {
        e.preventDefault();
        const text = commentInput.value.trim();
        if (!text) return;

        commentSubmit.disabled = true;
        
        submitComment(text, null, () => {
            commentInput.value = '';
            commentSubmit.disabled = false;
            fetchComments();
        }, () => {
            commentSubmit.disabled = false;
        });
    }
    
    function submitComment(text, parentId, onSuccess, onError) {
        fetch(`/api/comments/${albumId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ text: text, parent_id: parentId })
        })
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                alert(data.error);
                if (onError) onError();
            } else if (data.hidden) {
                alert(data.message);
                if (onSuccess) onSuccess();
            } else {
                if (onSuccess) onSuccess();
            }
        })
        .catch(err => {
            console.error(err);
            if (onError) onError();
        });
    }
    
    function deleteComment(id) {
        if (!confirm('Are you sure you want to delete this comment?')) return;
        
        fetch(`/api/comments/${id}`, { method: 'DELETE' })
            .then(response => {
                if (response.ok) {
                    fetchComments();
                } else {
                    alert('Failed to delete comment');
                }
            });
    }
    
    function flagComment(id, btn) {
        if (!confirm('Are you sure you want to flag this comment?')) return;
        
        fetch(`/api/comments/${id}/flag`, { method: 'POST' })
            .then(response => {
                if (response.ok) {
                    btn.replaceWith(document.createTextNode('Flagged'));
                }
            });
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    if (commentForm) {
        commentForm.addEventListener('submit', postComment);
    }

    fetchComments();
});
