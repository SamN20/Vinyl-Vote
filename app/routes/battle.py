from flask import Blueprint, render_template, request, flash, redirect, url_for, jsonify
from flask_login import current_user
from ..models import db, Song, Album, BattleVote
from sqlalchemy.sql import func
import random
from datetime import datetime, timezone

bp = Blueprint('battle', __name__)

@bp.route('/battle')
def index():
    """Show two random songs for a face-off."""
    # Get the current album's queue order
    current_album = Album.query.filter_by(is_current=True).first()
    max_queue_order = current_album.queue_order if current_album else 0

    # Get two random songs from released albums (up to and including current album)
    # optimized for SQLite: order by random()
    songs = Song.query.join(Album).filter(
        Album.queue_order > 0,
        Album.queue_order <= max_queue_order,
        Song.ignored == False
    ).order_by(func.random()).limit(2).all()

    if len(songs) < 2:
        flash("Not enough songs to battle!", "error")
        return redirect(url_for('user.index'))

    return render_template('battle.html', song1=songs[0], song2=songs[1])

@bp.route('/battle/vote', methods=['POST'])
def vote():
    """Handle the vote, update Elo, and return new stats."""
    winner_id = request.form.get('winner_id', type=int)
    loser_id = request.form.get('loser_id', type=int)

    if not winner_id or not loser_id:
        return jsonify({'error': 'Missing IDs'}), 400

    winner = Song.query.get(winner_id)
    loser = Song.query.get(loser_id)

    if not winner or not loser:
        return jsonify({'error': 'Song not found'}), 404

    # Record the vote
    user_id = current_user.id if current_user.is_authenticated else None
    battle_vote = BattleVote(
        user_id=user_id,
        winner_id=winner_id,
        loser_id=loser_id,
        timestamp=datetime.now(timezone.utc)
    )
    db.session.add(battle_vote)

    # Calculate Elo change
    # K-factor 32
    K = 32
    
    # Expected scores
    # Ea = 1 / (1 + 10 ^ ((Rb - Ra) / 400))
    # Rw = Winner rating, Rl = Loser rating
    Rw = winner.elo_rating
    Rl = loser.elo_rating
    
    Ew = 1 / (1 + 10 ** ((Rl - Rw) / 400))
    El = 1 / (1 + 10 ** ((Rw - Rl) / 400))
    
    # Update
    winner.elo_rating = Rw + K * (1 - Ew)
    loser.elo_rating = Rl + K * (0 - El)
    
    winner.match_count += 1
    loser.match_count += 1
    
    db.session.commit()
    
    return jsonify({
        'winner': {
            'id': winner.id,
            'new_rating': round(winner.elo_rating, 1),
            'gain': round(winner.elo_rating - Rw, 1)
        },
        'loser': {
            'id': loser.id,
            'new_rating': round(loser.elo_rating, 1),
            'loss': round(loser.elo_rating - Rl, 1) # negative
        }
    })

@bp.route('/leaderboard/battle')
def leaderboard():
    """Show top songs by Elo rating."""
    page = request.args.get('page', 1, type=int)
    per_page = 50
    
    # Get the current album's queue order
    current_album = Album.query.filter_by(is_current=True).first()
    max_queue_order = current_album.queue_order if current_album else 0
    
    pagination = Song.query.join(Album).filter(
        Song.match_count > 0,
        Album.queue_order > 0,
        Album.queue_order <= max_queue_order
    ).order_by(Song.elo_rating.desc()).paginate(page=page, per_page=per_page, error_out=False)
    
    user_votes = {}
    if current_user.is_authenticated:
        # Get set of song_ids that user picked as winner
        votes = BattleVote.query.filter_by(user_id=current_user.id).all()
        for v in votes:
            user_votes[v.winner_id] = user_votes.get(v.winner_id, 0) + 1

    return render_template('leaderboard_battle.html', pagination=pagination, user_votes=user_votes)
