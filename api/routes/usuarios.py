from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from passlib.hash import bcrypt
from api.auth import get_usuario_atual, require_perfil
from database.models import get_conn, VALID_PERFIS

router = APIRouter(prefix="/usuarios", tags=["usuarios"])


class UsuarioCreate(BaseModel):
    nome: str
    login: str
    senha: str
    perfil: str
    email: Optional[str] = None


class UsuarioUpdate(BaseModel):
    nome: Optional[str] = None
    senha: Optional[str] = None
    perfil: Optional[str] = None
    ativo: Optional[int] = None
    email: Optional[str] = None


@router.get("")
def listar_usuarios(usuario=Depends(require_perfil("supervisor"))):
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT id, nome, login, perfil, ativo, email FROM usuarios ORDER BY nome"
        ).fetchall()
    return [dict(r) for r in rows]


@router.post("")
def criar_usuario(body: UsuarioCreate, usuario=Depends(require_perfil("supervisor"))):
    if body.perfil not in VALID_PERFIS:
        raise HTTPException(status_code=400, detail="Perfil inválido")
    senha_hash = bcrypt.hash(body.senha)
    try:
        with get_conn() as conn:
            conn.execute(
                "INSERT INTO usuarios (nome, login, senha_hash, perfil, email) VALUES (?, ?, ?, ?, ?)",
                (body.nome, body.login, senha_hash, body.perfil, body.email)
            )
            conn.commit()
    except Exception:
        raise HTTPException(status_code=400, detail="Login já existe")
    return {"ok": True}


@router.put("/{usuario_id}")
def atualizar_usuario(
    usuario_id: int,
    body: UsuarioUpdate,
    usuario=Depends(require_perfil("supervisor")),
):
    with get_conn() as conn:
        if body.nome is not None:
            conn.execute("UPDATE usuarios SET nome = ? WHERE id = ?", (body.nome, usuario_id))
        if body.senha is not None:
            conn.execute("UPDATE usuarios SET senha_hash = ? WHERE id = ?", (bcrypt.hash(body.senha), usuario_id))
        if body.perfil is not None:
            conn.execute("UPDATE usuarios SET perfil = ? WHERE id = ?", (body.perfil, usuario_id))
        if body.ativo is not None:
            conn.execute("UPDATE usuarios SET ativo = ? WHERE id = ?", (body.ativo, usuario_id))
        if body.email is not None:
            conn.execute("UPDATE usuarios SET email = ? WHERE id = ?", (body.email, usuario_id))
        conn.commit()
    return {"ok": True}


@router.delete("/{usuario_id}")
def desativar_usuario(usuario_id: int, usuario=Depends(require_perfil("supervisor"))):
    with get_conn() as conn:
        conn.execute("UPDATE usuarios SET ativo = 0 WHERE id = ?", (usuario_id,))
        conn.commit()
    return {"ok": True}
