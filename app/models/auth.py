"""Auth-related pydantic DTOs."""
from __future__ import annotations
from pydantic import BaseModel, EmailStr, Field


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    name: str | None = Field(default=None, max_length=128)


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class ConfirmIn(BaseModel):
    """Legacy confirm body: a mailed ``token``, or a 6-digit ``otp``."""
    email: EmailStr | None = None
    token: str | None = Field(default=None, min_length=4, max_length=128)
    otp: str | None = Field(default=None, min_length=6, max_length=6)


class ConfirmOtpIn(BaseModel):
    email: EmailStr
    otp: str = Field(min_length=6, max_length=6)


class ResendOtpIn(BaseModel):
    email: EmailStr


class OtpOut(BaseModel):
    sent: bool = True
    expires_in: int = 900


class UserOut(BaseModel):
    id: str
    email: EmailStr
    name: str | None = None
    email_confirmed: bool
    workspace_id: str | None = None


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class WhoAmIOut(BaseModel):
    id: str
    email: str = ""
    name: str = ""
    is_authenticated: bool
    is_admin: bool
