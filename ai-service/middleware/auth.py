"""
AI Service Authentication & Authorization Middleware
Validates JWT tokens from the backend and enforces RBAC for AI endpoints.
"""
from fastapi import HTTPException, Security, Request, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from typing import Optional, List
import os
import structlog

log = structlog.get_logger()

JWT_SECRET = os.getenv("JWT_SECRET", "CHANGE_THIS_SECRET_IN_PRODUCTION_32_CHARS_MIN")
JWT_ALGORITHM = "HS256"
AI_SERVICE_SECRET = os.getenv("AI_SERVICE_SECRET", "internal-service-secret-key")

security = HTTPBearer()

ROLE_PERMISSIONS = {
    "SUPER_ADMIN": ["*"],
    "INTERNAL_ADMIN": ["CHAT_USE", "COURSE_READ", "KB_READ", "DOCUMENT_READ"],
    "INTERNAL_STAFF": ["CHAT_USE", "COURSE_READ", "KB_READ", "DOCUMENT_READ"],
    "TENANT_ADMIN": [
        "CHAT_USE", "COURSE_READ", "COURSE_WRITE",
        "KB_READ", "KB_WRITE", "AI_SETTINGS_UPDATE",
        "DOCUMENT_READ", "DOCUMENT_WRITE",
        "VIDEO_READ", "VIDEO_WRITE",
    ],
    "FACULTY": [
        "CHAT_USE", "COURSE_READ", "COURSE_WRITE",
        "KB_READ", "KB_WRITE", "DOCUMENT_READ", "DOCUMENT_WRITE",
        "VIDEO_READ", "VIDEO_WRITE",
    ],
    "STUDENT": ["CHAT_USE", "COURSE_READ", "KB_READ", "DOCUMENT_READ"],
}


class AuthenticatedUser:
    def __init__(self, payload: dict):
        user_id = payload.get("sub", payload.get("userId", payload.get("id")))
        if user_id is None:
            raise HTTPException(status_code=401, detail="Token missing user identifier")
        self.id: int = int(user_id)

        self.email: str = str(payload.get("email", "unknown@local"))
        self.role: str = str(payload.get("role", payload.get("userRole", "STUDENT")))

        tenant_raw = payload.get("tenantId", payload.get("tenant_id"))
        self.tenant_id: Optional[int] = int(tenant_raw) if tenant_raw is not None else None

        perms = payload.get("permissions", [])
        self.permissions: List[str] = perms if isinstance(perms, list) else []
        self.is_impersonating: bool = bool(payload.get("isImpersonating", payload.get("is_impersonating", False)))

    def has_permission(self, perm: str) -> bool:
        role_perms = ROLE_PERMISSIONS.get(self.role, [])
        return "*" in role_perms or perm in role_perms or perm in self.permissions

    def is_global_role(self) -> bool:
        return self.role in ("SUPER_ADMIN", "INTERNAL_ADMIN", "INTERNAL_STAFF")


def verify_jwt(token: str) -> dict:
    try:
        payload = jwt.decode(
            token,
            JWT_SECRET,
            algorithms=[JWT_ALGORITHM],
            options={"require": ["exp"]},
        )
        if payload.get("sub") is None and payload.get("userId") is None and payload.get("id") is None:
            raise HTTPException(status_code=401, detail="Token missing subject/userId")
        return payload
    except JWTError as e:
        log.warning("jwt_validation_failed", error=str(e))
        raise HTTPException(status_code=401, detail="Invalid or expired token")


async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Security(security),
) -> AuthenticatedUser:
    """
    Primary auth dependency. Validates JWT and returns the authenticated user.
    Also accepts internal service-to-service calls via X-Internal-Secret header.
    """
    # Allow internal service calls from the backend
    internal_secret = request.headers.get("X-Internal-Secret")
    if internal_secret:
        if internal_secret != AI_SERVICE_SECRET:
            raise HTTPException(status_code=401, detail="Invalid internal secret")
        # Build a pseudo-user for service-to-service calls
        tenant_id = request.headers.get("X-Tenant-Id")
        return AuthenticatedUser({
            "sub": 0,
            "email": "service@internal",
            "role": "SUPER_ADMIN",
            "tenantId": int(tenant_id) if tenant_id else None,
            "permissions": ["*"],
        })

    payload = verify_jwt(credentials.credentials)
    user = AuthenticatedUser(payload)

    # Log access
    log.info(
        "api_access",
        user_id=user.id,
        role=user.role,
        tenant_id=user.tenant_id,
        path=str(request.url.path),
        method=request.method,
    )

    return user


def require_permission(*permissions: str):
    """
    Dependency factory: enforces that the authenticated user has ALL listed permissions.
    Usage:
        @router.get("/endpoint", dependencies=[Depends(require_permission("CHAT_USE"))])
    """
    async def checker(user: AuthenticatedUser = Depends(get_current_user)):
        for perm in permissions:
            if not user.has_permission(perm):
                log.warning(
                    "permission_denied",
                    user_id=user.id,
                    role=user.role,
                    required_permission=perm,
                )
                raise HTTPException(
                    status_code=403,
                    detail=f"Insufficient permissions: {perm} required",
                )
        return user
    return checker


def require_role(*roles: str):
    """
    Dependency factory: enforces that the authenticated user has one of the listed roles.
    """
    async def checker(user: AuthenticatedUser = Depends(get_current_user)):
        if user.role not in roles:
            log.warning(
                "role_denied",
                user_id=user.id,
                actual_role=user.role,
                required_roles=roles,
            )
            raise HTTPException(
                status_code=403,
                detail=f"Role required: one of {roles}",
            )
        return user
    return checker


def tenant_scoped(user: AuthenticatedUser, tenant_id: int) -> bool:
    """
    Verify that the user can access data for the given tenant_id.
    Global roles (SUPER_ADMIN, INTERNAL_*) can access any tenant.
    Tenant-scoped roles can only access their own tenant.
    """
    if user.is_global_role():
        return True
    return user.tenant_id == tenant_id
