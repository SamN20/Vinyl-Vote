from better_profanity import profanity

def check_comment(text):
    """
    Returns True if the comment is clean, False if it contains profanity.
    """
    profanity.load_censor_words()
    return not profanity.contains_profanity(text)
