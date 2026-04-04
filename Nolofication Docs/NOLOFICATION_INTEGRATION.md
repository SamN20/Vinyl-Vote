# Nolofication Integration - Vinyl Vote

This document explains how Vinyl Vote has been integrated with the Nolofication centralized notification system.

## Overview

Vinyl Vote now uses **Nolofication** for all user notifications instead of direct email sending. This provides:

- **Unified preferences** - Users manage all notification settings in one place
- **Multi-channel delivery** - Email, web push, Discord, webhooks
- **Smart scheduling** - Daily/weekly batching based on user preferences
- **Category-based control** - Users can customize which types of notifications they receive
- **Better deliverability** - Centralized email infrastructure

## What Changed

### Before
- Direct SMTP email sending via Flask-Mail
- No user control over notification preferences
- All-or-nothing notification delivery

### After
- Notifications sent via Nolofication API
- Users control notification preferences per category
- Flexible scheduling (instant, daily, weekly)
- HTML email support with rich formatting
- Legacy email fallback for non-KeyN users

## Notification Categories

Vinyl Vote uses 5 notification categories:

### 1. **vote_reminders** (Daily)
- Reminders for users who haven't voted yet
- Sent on Thursday, Saturday, and Sunday only
- Default: 6 PM local time
- Automatically cancelled when user votes

### 2. **album_updates** (Instant)
- New album of the week announcements
- Album rotation notifications
- Voting period changes

### 3. **security** (Instant)
- Password reset requests
- Email address changes
- Account security alerts

### 4. **admin_messages** (Instant)
- Custom messages from administrators
- Site announcements
- Community updates

### 5. **weekly_digest** (Weekly)
- Weekly voting results summary
- Album highlights
- Community statistics
- Default: Monday 9 AM

See `NOLOFICATION_CATEGORIES.md` for detailed category definitions.

## Setup Instructions

### 1. Register Site in Nolofication

First, register Vinyl Vote as a site in Nolofication:

```bash
# On Nolofication server
cd /path/to/nolofication/backend
source venv/bin/activate
python3 scripts/admin.py create vinylvote "Vinyl Vote" "Weekly album rating community"
```

Get your API key:
```bash
python3 scripts/admin.py show vinylvote
```

### 2. Create Notification Categories

Use the commands in `NOLOFICATION_CATEGORIES.md` to create all 5 categories.

### 3. Configure Environment Variables

Add these to your `.env` file:

```bash
# Nolofication Settings
NOLOFICATION_URL=https://nolofication.bynolo.ca
NOLOFICATION_SITE_ID=vinylvote
NOLOFICATION_API_KEY=your-api-key-here
```

See `.env.example` for complete configuration template.

### 4. Verify Integration

Test notification sending:

```bash
# In your Vinyl Vote directory
source venv/bin/activate
python3
```

```python
from app import create_app
from app.nolofication import nolofication

app = create_app()
with app.app_context():
    # Test notification
    result = nolofication.send_notification(
        user_id='test-keyn-user-id',
        title='Test Notification',
        message='Testing Nolofication integration',
        category='album_updates'
    )
    print(result)
```

## Code Structure

### New Files

- **`app/nolofication.py`** - Nolofication service integration
  - `NoloficationService` class with all API methods
  - `send_notification()` - Single user notifications
  - `send_bulk_notification()` - Multiple user notifications
  - `get_pending_notifications()` - Query scheduled notifications
  - `cancel_pending_notification()` - Cancel pending notifications

### Modified Files

- **`config.py`** - Added Nolofication configuration variables
- **`app/email.py`** - Added `send_notification_via_nolofication()` helper
- **`app/scheduler.py`** - Updated to use Nolofication for:
  - Weekly album rollover notifications
  - Daily vote reminders
- **`app/routes/user.py`** - Updated for:
  - Password reset notifications
  - Email change confirmations
- **`app/routes/admin.py`** - Updated admin email broadcast
- **`app/templates/profile.html`** - Added notification preferences link

### Documentation Files

- **`NOLOFICATION_CATEGORIES.md`** - Category definitions and creation commands
- **`NOLOFICATION_INTEGRATION.md`** - This file
- **`.env.example`** - Environment variable template

## Usage Examples

### Send Album Update Notification

```python
from app.nolofication import nolofication

# Send to all KeyN users
users = User.query.filter(User.keyn_id.isnot(None)).all()
keyn_ids = [u.keyn_id for u in users]

nolofication.send_bulk_notification(
    user_ids=keyn_ids,
    title="🎶 New Album of the Week!",
    message=f"{album.title} by {album.artist} is now live!",
    html_message="<h2>New Album!</h2><p>Check out this week's album...</p>",
    notification_type='success',
    category='album_updates'
)
```

### Send Daily Vote Reminder

```python
from app.nolofication import nolofication

# Get users who haven't voted
unvoted_users = get_users_without_votes()
keyn_ids = [u.keyn_id for u in unvoted_users]

nolofication.send_bulk_notification(
    user_ids=keyn_ids,
    title="🕒 Vote Reminder",
    message=f"Don't forget to rate {album.title}!",
    category='vote_reminders',  # Will be delivered per user's schedule
    metadata={'album_id': album.id}
)
```

### Cancel Pending Reminder

```python
from app.nolofication import nolofication

# When user votes, cancel their pending reminder
pending = nolofication.get_pending_notifications(
    user_id=user.keyn_id,
    category='vote_reminders'
)

for notif in pending.get('pending_notifications', []):
    nolofication.cancel_pending_notification(notif['id'])
```

### Send Security Alert

```python
from app.nolofication import nolofication

# Password reset request
nolofication.send_notification(
    user_id=user.keyn_id,
    title='Password Reset Request',
    message=f'Click here to reset your password: {reset_url}',
    html_message=render_template('emails/password_reset.html', url=reset_url),
    notification_type='warning',
    category='security'  # Always instant delivery
)
```

## Migration Strategy

The integration uses a **hybrid approach** during the KeyN migration period:

1. **KeyN users** - Receive notifications via Nolofication
2. **Legacy users** - Receive direct emails (old system)

This ensures no users are left without notifications during the transition.

### Code Pattern

```python
# Typical notification code
if user.keyn_id:
    # Use Nolofication for KeyN users
    nolofication.send_notification(
        user_id=user.keyn_id,
        title=title,
        message=message,
        html_message=html,
        category=category
    )
else:
    # Fallback to legacy email
    send_email(
        subject=title,
        recipients=[user.email],
        text_body=message,
        html_body=html
    )
```

## User Experience

### For KeyN Users

1. Users see a "Notifications" link in their profile Quick Links section
2. Clicking opens the Nolofication preferences page
3. Users can:
   - Enable/disable notification categories
   - Set delivery schedules (instant, daily, weekly)
   - Choose notification channels (email, push, Discord)
   - Configure quiet hours and digest timing

### Notification Preferences URL

```
https://nolofication.bynolo.ca/sites/vinylvote/preferences
```

Users are automatically authenticated via KeyN OAuth when accessing this page.

## Monitoring & Troubleshooting

### Check Notification Status

```python
from app.nolofication import nolofication

# List pending notifications for a user
pending = nolofication.get_pending_notifications(
    user_id='keyn-user-id',
    category='vote_reminders'
)
print(pending)
```

### Common Issues

**Notifications not sending:**
- Verify `NOLOFICATION_API_KEY` is set correctly
- Check Nolofication API is accessible
- Ensure user has `keyn_id` populated
- Check application logs for errors

**Users not receiving notifications:**
- Verify user has set preferences in Nolofication
- Check user's email is verified in KeyN
- Ensure categories are created in Nolofication
- Check user hasn't disabled the category

**HTML emails not rendering:**
- Ensure `html_message` parameter is passed
- Validate HTML structure
- Always provide plain text `message` as fallback

### Logs

Application logs include Nolofication activity:

```
INFO: Notification sent: 🎶 New Album of the Week! -> user keyn123 (status: scheduled)
INFO: Sent vote reminders to 42 user(s) via Nolofication
INFO: Sent admin email to 67 users via Nolofication
```

## API Reference

See `app/nolofication.py` for complete API documentation.

### Key Methods

- `send_notification(user_id, title, message, ...)` - Send to one user
- `send_bulk_notification(user_ids, title, message, ...)` - Send to multiple users
- `get_pending_notifications(user_id, category, ...)` - Query scheduled notifications
- `cancel_pending_notification(notification_id)` - Cancel a pending notification

### Parameters

- `user_id` / `user_ids` - KeyN user ID(s)
- `title` - Notification title
- `message` - Plain text message (required)
- `html_message` - HTML version (optional)
- `notification_type` - `'info'`, `'success'`, `'warning'`, `'error'`
- `category` - Category key (e.g., `'vote_reminders'`)
- `metadata` - Additional data dict (optional)

## Next Steps

1. **Create categories** - Run commands from `NOLOFICATION_CATEGORIES.md`
2. **Set API key** - Add to `.env` file
3. **Test notifications** - Send test notifications to verify integration
4. **Monitor usage** - Check logs and Nolofication dashboard
5. **Phase out legacy** - Once all users migrate to KeyN, remove legacy email code

## Support

- **Nolofication Docs**: `https://nolofication.bynolo.ca/docs`
- **Integration Guide**: `NOLOFICATION_INTEGRATION_GUIDE.md`
- **Categories**: `NOLOFICATION_CATEGORIES.md`
