import sys
import traceback

def test():
    print("Starting script...")
    try:
        from app import create_app
        from app.models import User
        print("Imports successful.")
        
        app = create_app()
        print("App initialized.")
        
        with app.app_context():
            print("Querying admin...")
            admin = User.query.filter_by(is_admin=True).first()
            if not admin:
                print("No admin user found")
            else:
                print(f"Found admin: {admin.username}")
                client = app.test_client()
                with client.session_transaction() as sess:
                    sess['_user_id'] = admin.id
                    sess['_fresh'] = True
                print("Requesting /admin/notifications...")
                response = client.get('/admin/notifications')
                print(f"Status Code: {response.status_code}")
    except Exception:
        traceback.print_exc()
    print("Script finished.")

if __name__ == "__main__":
    test()
