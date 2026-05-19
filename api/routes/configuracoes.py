from typing import Dict, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from passlib.hash import bcrypt
from api.auth import get_usuario_atual, require_perfil
from database.models import get_conn

router = APIRouter(tags=["configuracoes"])

DEFAULTS_CONFIG = {
    "urgente_minutos":       "30",
    "escala_supervisor_min": "15",
    "escala_gerente_min":    "30",
    "gerentes_nomes":        "",
}


# ── Perfil do usuário logado ──────────────────────────────────────────────────

class PerfilUpdate(BaseModel):
    nome: Optional[str] = None
    senha_atual: Optional[str] = None
    senha_nova: Optional[str] = None


@router.get("/me")
def get_perfil(usuario=Depends(get_usuario_atual)):
    return {"id": usuario["id"], "nome": usuario["nome"], "login": usuario["login"], "perfil": usuario["perfil"]}


@router.put("/me")
def atualizar_perfil(body: PerfilUpdate, usuario=Depends(get_usuario_atual)):
    with get_conn() as conn:
        if body.nome and body.nome.strip():
            conn.execute("UPDATE usuarios SET nome = ? WHERE id = ?", (body.nome.strip(), usuario["id"]))

        if body.senha_nova:
            if not body.senha_atual:
                raise HTTPException(status_code=400, detail="Informe a senha atual")
            row = conn.execute("SELECT senha_hash FROM usuarios WHERE id = ?", (usuario["id"],)).fetchone()
            if not bcrypt.verify(body.senha_atual, row["senha_hash"]):
                raise HTTPException(status_code=400, detail="Senha atual incorreta")
            if len(body.senha_nova) < 4:
                raise HTTPException(status_code=400, detail="Nova senha deve ter pelo menos 4 caracteres")
            conn.execute("UPDATE usuarios SET senha_hash = ? WHERE id = ?", (bcrypt.hash(body.senha_nova), usuario["id"]))

        conn.commit()
    return {"ok": True}


# ── Máquinas ──────────────────────────────────────────────────────────────────

class MaquinaUpdate(BaseModel):
    nome: str


@router.get("/maquinas")
def listar_maquinas(usuario=Depends(require_perfil("supervisor"))):
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT inventory_number, nome FROM maquinas ORDER BY inventory_number"
        ).fetchall()
    return [dict(r) for r in rows]


@router.put("/maquinas/{inv}")
def atualizar_maquina(inv: str, body: MaquinaUpdate, usuario=Depends(require_perfil("supervisor"))):
    if not body.nome.strip():
        raise HTTPException(status_code=400, detail="Nome não pode ser vazio")
    with get_conn() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO maquinas (inventory_number, nome) VALUES (?, ?)",
            (inv, body.nome.strip())
        )
        conn.commit()
    return {"ok": True}


@router.post("/maquinas")
def criar_maquina(body: dict, usuario=Depends(require_perfil("supervisor"))):
    inv = str(body.get("inventory_number", "")).strip()
    nome = str(body.get("nome", "")).strip()
    if not inv or not nome:
        raise HTTPException(status_code=400, detail="inventory_number e nome são obrigatórios")
    with get_conn() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO maquinas (inventory_number, nome) VALUES (?, ?)", (inv, nome)
        )
        conn.commit()
    return {"ok": True}


@router.delete("/maquinas/{inv}")
def remover_maquina(inv: str, usuario=Depends(require_perfil("supervisor"))):
    with get_conn() as conn:
        conn.execute("DELETE FROM maquinas WHERE inventory_number = ?", (inv,))
        conn.commit()
    return {"ok": True}


# ── Configurações gerais ──────────────────────────────────────────────────────

@router.get("/configuracoes")
def get_config(usuario=Depends(require_perfil("supervisor"))):
    with get_conn() as conn:
        rows = conn.execute("SELECT chave, valor FROM configuracoes").fetchall()
    result = dict(DEFAULTS_CONFIG)
    result.update({r["chave"]: r["valor"] for r in rows})
    return result


@router.put("/configuracoes")
def set_config(body: Dict[str, str], usuario=Depends(require_perfil("supervisor"))):
    allowed = set(DEFAULTS_CONFIG.keys())
    with get_conn() as conn:
        for k, v in body.items():
            if k not in allowed:
                continue
            conn.execute(
                "INSERT OR REPLACE INTO configuracoes (chave, valor) VALUES (?, ?)", (k, str(v))
            )
        conn.commit()
    return {"ok": True}
