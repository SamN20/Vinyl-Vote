from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user
from ..models import Comment, Album, db
from ..moderation import check_comment
from datetime import datetime, timezone

bp = Blueprint('comments', __name__, url_prefix='/api/comments')

@bp.route('/<int:album_id>', methods=['GET'])
def get_comments(album_id):
    comments = Comment.query.filter_by(album_id=album_id, is_hidden=False).order_by(Comment.timestamp.asc()).all()
    return jsonify([{
        'id': c.id,
        'user': c.user.username,
        'user_id': c.user_id,
        'text': c.text,
        'timestamp': c.timestamp.isoformat(),
        'is_flagged': c.is_flagged,
        'parent_id': c.parent_id
    } for c in comments])

@bp.route('/<int:album_id>', methods=['POST'])
@login_required
def post_comment(album_id):
    data = request.get_json()
    text = data.get('text', '').strip()
    parent_id = data.get('parent_id')
    
    if not text:
        return jsonify({'error': 'Comment cannot be empty'}), 400
        
    is_clean = check_comment(text)
    
    comment = Comment(
        user_id=current_user.id,
        album_id=album_id,
        text=text,
        is_hidden=not is_clean,
        timestamp=datetime.now(timezone.utc),
        parent_id=parent_id
    )
    
    db.session.add(comment)
    db.session.commit()
    
    if not is_clean:
        return jsonify({'message': 'Comment submitted for review (potential profanity detected).', 'hidden': True}), 200
        
    return jsonify({
        'id': comment.id,
        'user': current_user.username,
        'user_id': current_user.id,
        'text': comment.text,
        'timestamp': comment.timestamp.isoformat(),
        'hidden': False,
        'parent_id': comment.parent_id
    }), 201

@bp.route('/<int:comment_id>', methods=['DELETE'])
@login_required
def delete_comment(comment_id):
    comment = Comment.query.get_or_404(comment_id)
    if comment.user_id != current_user.id and not current_user.is_admin:
        return jsonify({'error': 'Unauthorized'}), 403
    
    if comment.replies:
        comment.text = "[deleted]"
        # Ensure it stays visible if it was hidden for some reason, though usually hidden ones shouldn't have replies visible?
        # If it was hidden by mod, maybe we shouldn't unhide it?
        # But if user deletes it, they are acknowledging it's gone.
        # Let's just set text.
    else:
        db.session.delete(comment)
        
    db.session.commit()
    return jsonify({'message': 'Comment deleted'}), 200

@bp.route('/<int:comment_id>/flag', methods=['POST'])
@login_required
def flag_comment(comment_id):
    comment = Comment.query.get_or_404(comment_id)
    comment.is_flagged = True
    db.session.commit()
    return jsonify({'message': 'Comment flagged for review.'}), 200
