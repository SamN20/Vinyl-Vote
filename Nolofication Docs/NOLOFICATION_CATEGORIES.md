# Vinyl Vote - Nolofication Categories

## Notification Categories for Vinyl Vote

These categories should be created in Nolofication admin panel before going live.

### 1. Vote Reminders (`vote_reminders`)
**Purpose:** Reminders for users who haven't voted on the current album yet

**Default Schedule:**
- Frequency: `daily`
- Time: `18:00` (6 PM - after work)
- Users can customize their preferred reminder time

**Actual Delivery:**
- Sent only on **Thursday, Saturday, and Sunday**
- Even though category is "daily", the scheduler only triggers on these days
- This provides gentle nudges without being too frequent

**Use Cases:**
- Thursday: Mid-week reminder to vote on current album
- Saturday: Weekend reminder for those who haven't voted yet
- Sunday: Final reminder before voting period ends
- Cancels automatically once user votes

**Example:**
```json
{
  "key": "vote_reminders",
  "name": "Vote Reminders",
  "description": "Daily reminders to vote on the current album of the week",
  "defaults": {
    "frequency": "daily",
    "time_of_day": "18:00",
    "weekly_day": null
  }
}
```

### 2. Album Updates (`album_updates`)
**Purpose:** Notifications about new albums, album switches, and voting period changes

**Default Schedule:**
- Frequency: `instant`
- Important updates should be delivered immediately

**Use Cases:**
- New album of the week announced
- Album rotation notifications
- Voting period updates

**Example:**
```json
{
  "key": "album_updates",
  "name": "Album Updates",
  "description": "Get notified when a new album of the week is available",
  "defaults": {
    "frequency": "instant"
  }
}
```

### 3. Account & Security (`security`)
**Purpose:** Critical account-related notifications

**Default Schedule:**
- Frequency: `instant`
- Security notifications should never be delayed

**Use Cases:**
- Password reset requests
- Email address changes
- Account security alerts

**Example:**
```json
{
  "key": "security",
  "name": "Security Alerts",
  "description": "Important account and security notifications",
  "defaults": {
    "frequency": "instant"
  }
}
```

### 4. Admin Messages (`admin_messages`)
**Purpose:** Custom messages sent by administrators

**Default Schedule:**
- Frequency: `instant`
- Admin communications are typically time-sensitive

**Use Cases:**
- Custom email blasts from admin panel
- Site announcements
- Important community updates

**Example:**
```json
{
  "key": "admin_messages",
  "name": "Admin Messages",
  "description": "Messages and announcements from Vinyl Vote administrators",
  "defaults": {
    "frequency": "instant"
  }
}
```

### 5. Weekly Digest (`weekly_digest`)
**Purpose:** Weekly summary of voting activity and results

**Default Schedule:**
- Frequency: `weekly`
- Day: `0` (Monday)
- Time: `09:00` (9 AM)

**Use Cases:**
- Weekly voting results summary
- Album highlights
- Community stats

**Example:**
```json
{
  "key": "weekly_digest",
  "name": "Weekly Digest",
  "description": "Your weekly summary of Vinyl Vote activity and results",
  "defaults": {
    "frequency": "weekly",
    "time_of_day": "09:00",
    "weekly_day": 0
  }
}
```

## Creating Categories in Nolofication

### Prerequisites
1. Vinyl Vote must be registered as a site in Nolofication
2. Site ID: `vinylvote`
3. API key obtained from Nolofication admin


## Verification

List all categories for Vinyl Vote:
```bash
curl https://nolofication.bynolo.ca/api/sites/vinylvote/categories
```

Expected response will show all 5 categories with their default settings.
