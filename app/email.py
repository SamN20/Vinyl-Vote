from flask_mail import Message
from flask import current_app
from app import mail
from typing import List, Optional


def send_email(subject, sender_email, sender_name, recipients, text_body, html_body):
    """
    Legacy email sending function.
    
    This function is maintained for backward compatibility but will eventually
    be phased out in favor of Nolofication for all notification needs.
    
    Note: For new features, use nolofication.send_notification() instead.
    """
    print(f"Sending email to {recipients} with subject '{subject}'")
    sender = (sender_name, sender_email)
    msg = Message(subject, sender=sender, recipients=[sender_email], bcc=recipients)
    msg.body = text_body
    msg.html = html_body
    mail.send(msg)


def send_notification_via_nolofication(
    user_keyn_ids: List[str],
    title: str,
    message: str,
    html_message: Optional[str] = None,
    notification_type: str = 'info',
    category: Optional[str] = None,
    metadata: Optional[dict] = None
):
    """
    Send notification(s) via Nolofication service.
    
    Args:
        user_keyn_ids: List of KeyN user IDs (or single ID as list)
        title: Notification title
        message: Plain text message (fallback)
        html_message: Optional HTML version
        notification_type: 'info', 'success', 'warning', or 'error'
        category: Category key (e.g., 'vote_reminders', 'album_updates')
        metadata: Optional additional data
    
    Returns:
        Result dict from Nolofication API
    """
    from app.nolofication import nolofication
    
    if not user_keyn_ids:
        current_app.logger.warning("No user IDs provided for notification")
        return {'success': False, 'error': 'No recipients'}
    
    # Send to multiple users or single user
    if len(user_keyn_ids) == 1:
        return nolofication.send_notification(
            user_id=user_keyn_ids[0],
            title=title,
            message=message,
            html_message=html_message,
            notification_type=notification_type,
            category=category,
            metadata=metadata
        )
    else:
        return nolofication.send_bulk_notification(
            user_ids=user_keyn_ids,
            title=title,
            message=message,
            html_message=html_message,
            notification_type=notification_type,
            category=category,
            metadata=metadata
        )
