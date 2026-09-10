from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session as DbSession

from app.core.db import get_db
from app.core.security import decode_token
from app.models import User

oauth2 = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

Db = Annotated[DbSession, Depends(get_db)]


def get_current_user(db: Db, token: Annotated[str, Depends(oauth2)]) -> User:
    try:
        payload = decode_token(token)
    except jwt.PyJWTError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session invalide ou expirée") from exc
    user = db.get(User, int(payload["sub"]))
    if not user or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Utilisateur inconnu")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_role(*roles: str):
    def _dep(user: CurrentUser) -> User:
        if user.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Droits insuffisants")
        return user

    return _dep


ManagerUser = Annotated[User, Depends(require_role("admin", "manager"))]
