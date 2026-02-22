import firebase_admin
from firebase_admin import credentials, auth as firebase_auth
from fastapi import HTTPException, Header
from core.config import settings

if not firebase_admin._apps:
    cred = credentials.Certificate(settings.firebase_service_account_path)
    firebase_admin.initialize_app(cred)

async def get_current_user(authorization: str = Header(...)):
    token = authorization.replace("Bearer ", "")
    try:
        return firebase_auth.verify_id_token(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")