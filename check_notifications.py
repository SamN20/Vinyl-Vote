from app import create_app, db
from app.models import Notification

app = create_app()
with app.app_context():
    notifications = Notification.query.all()
    print(f"{'ID':<5} | {'Type':<15} | {'Active':<8} | {'Start Time':<20} | {'End Time':<20} | {'Flag'}")
    print("-" * 85)
    for n in notifications:
        flag = ""
        if n.start_time is None or n.end_time is None:
            flag = "MISSING TIME"
        print(f"{n.id:<5} | {str(n.type):<15} | {str(n.is_active):<8} | {str(n.start_time):<20} | {str(n.end_time):<20} | {flag}")
