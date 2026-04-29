import os
from datetime import datetime, timedelta
from jose import JWTError, jwt
from passlib.hash import bcrypt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from database.models import get_conn

SECRET_KEY = os.getenv("SECRET_KEY", "troca_essa_chave")
ALGORITHM  = "HS256"
TOKEN_EXP_HORAS = 8

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/login")


def verificar_senha(senha: str, hash_: str) -> bool:
    return bcrypt.verify(senha, hash_)


def criar_token(dados: dict) -> str:
    payload = dados.copy()
    payload["exp"] = datetime.utcnow() + timedelta(hours=TOKEN_EXP_HORAS)
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def get_usuario_atual(token: str = Depends(oauth2_scheme)):
    erro = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Token inválido ou expirado",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        usuario_id: int = payload.get("sub")
        if usuario_id is None:
            raise erro
    except JWTError:
        raise erro

    with get_conn() as conn:
        row = conn.execute(
            "SELECT id, nome, login, perfil FROM usuarios WHERE id = ? AND ativo = 1",
            (usuario_id,)
        ).fetchone()

    if row is None:
        raise erro
    return dict(row)


def require_perfil(*perfis):
    def dep(usuario=Depends(get_usuario_atual)):
        if usuario["perfil"] not in perfis:
            raise HTTPException(status_code=403, detail="Permissão insuficiente")
        return usuario
    return dep
