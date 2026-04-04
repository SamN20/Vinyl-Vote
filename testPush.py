from app import create_app, db
from app.models import User
from app.utils import send_push

app = create_app()

with app.app_context():
    users = User.query.filter(User.push_subscription.isnot(None)).all()
    if not users:
        print("⚠️ No users with push subscriptions found.")
    else:
        for user in users:
            print(f"🔔 Sending push to {user.username}")
            send_push(
                user.push_subscription,
                title="🔔 Test Notification",
                body="This is a test push from your voting site!",
                url="/vote"
            )
        print("✅ Test push notifications sent.")
