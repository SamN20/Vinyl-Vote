from config import Config


def test_vote_end_time_is_isoformat():
    value = Config.get_vote_end_time()
    assert "T" in value
    assert ":" in value
