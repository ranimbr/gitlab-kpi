from app.database.session import get_auth_session
from app.models.profile import Profile
from app.models.app_user import AppUser

db = get_auth_session()
super_admin_profile = db.query(Profile).filter(Profile.name == 'Super Admin').first()
admin_user = db.query(AppUser).filter(AppUser.email == 'admin@test.com').first()

if admin_user and super_admin_profile:
    admin_user.profile_id = super_admin_profile.id
    db.commit()
    print(f'Assigned profile {super_admin_profile.name} (id={super_admin_profile.id}) to user {admin_user.email}')
else:
    print(f'Error: admin_user={admin_user}, super_admin_profile={super_admin_profile}')
