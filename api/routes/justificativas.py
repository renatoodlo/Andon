from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from api.auth import get_usuario_atual
from api.teams import notificar_justificativa
from database.models import get_conn
from maquinas_config import nome_maquina

router = APIRouter(prefix="/justificativas", tags=["justificativas"])


class JustificativaCreate(BaseModel):
    parada_id: int
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
        if not parada["fim"]:
            raise HTTPException(status_code=400, detail="Parada ainda em andamento")

        conn.execute(
            """INSERT INTO justificativas
               (parada_id, inicio_just, fim_just, categoria, descricao, responsavel, criado_por)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (body.parada_id, parada["inicio"], parada["fim"],
             body.categoria, body.descricao, body.responsavel, usuario["id"])
        )
        conn.execute(
            "UPDATE paradas SET status_just = 'JUSTIFICADO' WHERE id = ?",
            (body.parada_id,)
        )
        conn.commit()

    notificar_justificativa(
        inventory_number=parada["inventory_number"],
        duracao_min=parada["duracao_min"],
        categoria=body.categoria,
        responsavel=body.responsavel,
    )

    return {"ok": True, "status_parada": "JUSTIFICADO"}
