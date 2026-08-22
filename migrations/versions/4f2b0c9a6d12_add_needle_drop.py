"""add needle drop

Revision ID: 4f2b0c9a6d12
Revises: cbe89c3cbb01
Create Date: 2026-08-21 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = '4f2b0c9a6d12'
down_revision = 'cbe89c3cbb01'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('songs', schema=None) as batch_op:
        batch_op.add_column(sa.Column('spotify_track_id', sa.String(length=128), nullable=True))
        batch_op.add_column(sa.Column('isrc', sa.String(length=32), nullable=True))
        batch_op.create_index(batch_op.f('ix_songs_spotify_track_id'), ['spotify_track_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_songs_isrc'), ['isrc'], unique=False)

    op.create_table(
        'song_audio_matches',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('song_id', sa.Integer(), nullable=False),
        sa.Column('provider', sa.String(length=32), nullable=False),
        sa.Column('provider_track_id', sa.String(length=128), nullable=True),
        sa.Column('match_status', sa.String(length=32), nullable=False),
        sa.Column('match_confidence', sa.Float(), nullable=True),
        sa.Column('preview_available', sa.Boolean(), nullable=False),
        sa.Column('isrc', sa.String(length=32), nullable=True),
        sa.Column('matched_title', sa.String(length=256), nullable=True),
        sa.Column('matched_artist', sa.String(length=256), nullable=True),
        sa.Column('matched_album', sa.String(length=256), nullable=True),
        sa.Column('matched_duration', sa.Integer(), nullable=True),
        sa.Column('reviewed', sa.Boolean(), nullable=False),
        sa.Column('override', sa.Boolean(), nullable=False),
        sa.Column('disabled', sa.Boolean(), nullable=False),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['song_id'], ['songs.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('song_id', 'provider', name='uq_song_audio_match_song_provider'),
    )
    op.create_index('ix_song_audio_matches_provider_track', 'song_audio_matches', ['provider', 'provider_track_id'], unique=False)
    op.create_index('ix_song_audio_matches_status', 'song_audio_matches', ['provider', 'match_status', 'preview_available'], unique=False)

    op.create_table(
        'needle_drop_daily_challenges',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('local_date', sa.String(length=10), nullable=False),
        sa.Column('song_id', sa.Integer(), nullable=False),
        sa.Column('provider', sa.String(length=32), nullable=False),
        sa.Column('provider_track_id', sa.String(length=128), nullable=False),
        sa.Column('clip_offset_seconds', sa.Float(), nullable=False),
        sa.Column('selection_seed', sa.String(length=128), nullable=False),
        sa.Column('published_at', sa.DateTime(), nullable=False),
        sa.Column('expires_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['song_id'], ['songs.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('local_date'),
    )
    op.create_index(op.f('ix_needle_drop_daily_challenges_local_date'), 'needle_drop_daily_challenges', ['local_date'], unique=False)

    op.create_table(
        'needle_drop_sessions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('mode', sa.String(length=16), nullable=False),
        sa.Column('daily_challenge_id', sa.Integer(), nullable=True),
        sa.Column('song_id', sa.Integer(), nullable=False),
        sa.Column('filter_key', sa.String(length=64), nullable=True),
        sa.Column('status', sa.String(length=16), nullable=False),
        sa.Column('attempts_used', sa.Integer(), nullable=False),
        sa.Column('started_at', sa.DateTime(), nullable=False),
        sa.Column('completed_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['daily_challenge_id'], ['needle_drop_daily_challenges.id'], ),
        sa.ForeignKeyConstraint(['song_id'], ['songs.id'], ),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'daily_challenge_id', name='uq_needle_drop_daily_user_session'),
    )
    op.create_index('ix_needle_drop_sessions_user_mode', 'needle_drop_sessions', ['user_id', 'mode', 'status'], unique=False)

    op.create_table(
        'needle_drop_attempts',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('session_id', sa.Integer(), nullable=False),
        sa.Column('attempt_number', sa.Integer(), nullable=False),
        sa.Column('guess_type', sa.String(length=16), nullable=False),
        sa.Column('guessed_song_id', sa.Integer(), nullable=True),
        sa.Column('guessed_artist', sa.String(length=256), nullable=True),
        sa.Column('result', sa.String(length=32), nullable=False),
        sa.Column('clip_length', sa.Float(), nullable=False),
        sa.Column('timestamp', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['guessed_song_id'], ['songs.id'], ),
        sa.ForeignKeyConstraint(['session_id'], ['needle_drop_sessions.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('session_id', 'attempt_number', name='uq_needle_drop_attempt_number'),
    )

    op.create_table(
        'needle_drop_recognition_stats',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('song_id', sa.Integer(), nullable=False),
        sa.Column('exact_correct_count', sa.Integer(), nullable=False),
        sa.Column('artist_recognition_count', sa.Integer(), nullable=False),
        sa.Column('failure_count', sa.Integer(), nullable=False),
        sa.Column('best_attempt', sa.Integer(), nullable=True),
        sa.Column('last_exact_at', sa.DateTime(), nullable=True),
        sa.Column('last_artist_at', sa.DateTime(), nullable=True),
        sa.Column('last_failed_at', sa.DateTime(), nullable=True),
        sa.Column('cooldown_until', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['song_id'], ['songs.id'], ),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'song_id', name='uq_needle_drop_user_song_stat'),
    )
    op.create_index('ix_needle_drop_recognition_lookup', 'needle_drop_recognition_stats', ['user_id', 'song_id', 'cooldown_until'], unique=False)


def downgrade():
    op.drop_index('ix_needle_drop_recognition_lookup', table_name='needle_drop_recognition_stats')
    op.drop_table('needle_drop_recognition_stats')
    op.drop_table('needle_drop_attempts')
    op.drop_index('ix_needle_drop_sessions_user_mode', table_name='needle_drop_sessions')
    op.drop_table('needle_drop_sessions')
    op.drop_index(op.f('ix_needle_drop_daily_challenges_local_date'), table_name='needle_drop_daily_challenges')
    op.drop_table('needle_drop_daily_challenges')
    op.drop_index('ix_song_audio_matches_status', table_name='song_audio_matches')
    op.drop_index('ix_song_audio_matches_provider_track', table_name='song_audio_matches')
    op.drop_table('song_audio_matches')

    with op.batch_alter_table('songs', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_songs_isrc'))
        batch_op.drop_index(batch_op.f('ix_songs_spotify_track_id'))
        batch_op.drop_column('isrc')
        batch_op.drop_column('spotify_track_id')
