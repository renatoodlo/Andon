from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from api.auth import get_usuario_atual
from api.teams import atualizar_mensagem_justificada
from database.models import get_conn

router = APIRouter(prefix="/justificativas", tags=["justificativas"])


class JustificativaCreate(BaseModel):
    parada_id: int
    inicio_just: str
    fim_just: str
    categoria: str
    descricao: str = ""
    responsavel: str


@router.post("")
def criar_justificativa(body: JustificativaCreate, usuario=Depends(get_usuario_atual)):
    with get_conn() as conn:
        parada = conn.execute(
            "SELECT * FROM paradas WHERE id = ?", (body.parada_id,)
        ).fetchone()
        if not parada:
            raise HTTPException(status_code=404, detail="Parada não encontrada")

        conn.execute(
            """INSERT INTO justificativas
               (parada_id, inicio_just, fim_just, categoria, descricao, responsavel, criado_por)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (body.parada_id, body.inicio_just, body.fim_just,
             body.categoria, body.descricao, body.responsavel, usuario["id"])
        )
        conn.commit()

        novo_status = _calcular_status(conn, body.parada_id, parada)
        conn.execute(
            "UPDATE paradas SET status_just = ? WHERE id = ?",
            (novo_status, body.parada_id)
        )
        conn.commit()

    if novo_status == "JUSTIFICADO" and parada["teams_msg_id"]:
        atualizar_mensagem_justificada(
            msg_id=parada["teams_msg_id"],
            inventory_number=parada["inventory_number"],
            duracao_min=parada["duracao_min"],
            categoria=body.categoria,
            responsavel=body.responsavel,
        )

    return {"ok": True, "status_parada": novo_status}


def _calcular_status(conn, parada_id: int, parada) -> str:
    if not parada["fim"]:
        return "NAO_JUSTIFICADO"

    justs = conn.execute(
        "SELECT inicio_just, fim_just FROM justificativas WHERE parada_id = ?",
        (parada_id,)
    ).fetchall()

    if not justs:
        return "NAO_JUSTIFICADO"

    cobre_tudo = any(
        j["inicio_just"] <= parada["inicio"] and j["fim_just"] >= parada["fim"]
        for j in justs
    )
    return "JUSTIFICADO" if cobre_tudo else "PARCIAL"
