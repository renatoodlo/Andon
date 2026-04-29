from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from api.auth import get_usuario_atual
from database.models import get_conn

router = APIRouter(prefix="/paradas", tags=["paradas"])


@router.get("")
def listar_paradas(
    data: Optional[str]   = Query(None, description="Filtro por data YYYY-MM-DD"),
    maquina: Optional[str] = Query(None, description="Filtro por InventoryNumber"),
    status: Optional[str]  = Query(None, description="NAO_JUSTIFICADO | PARCIAL | JUSTIFICADO"),
    usuario=Depends(get_usuario_atual),
):
    sql = "SELECT * FROM paradas WHERE 1=1"
    params = []
    if data:
        sql += " AND DATE(inicio) = ?"
        params.append(data)
    if maquina:
        sql += " AND inventory_number = ?"
        params.append(maquina)
    if status:
        sql += " AND status_just = ?"
        params.append(status)
    sql += " ORDER BY inicio DESC"

    with get_conn() as conn:
        rows = conn.execute(sql, params).fetchall()
    return [dict(r) for r in rows]


@router.get("/{parada_id}")
def detalhe_parada(parada_id: int, usuario=Depends(get_usuario_atual)):
    with get_conn() as conn:
        parada = conn.execute(
            "SELECT * FROM paradas WHERE id = ?", (parada_id,)
        ).fetchone()
        if not parada:
            raise HTTPException(status_code=404, detail="Parada não encontrada")
        justs = conn.execute(
            "SELECT * FROM justificativas WHERE parada_id = ? ORDER BY inicio_just",
            (parada_id,)
        ).fetchall()
    return {**dict(parada), "justificativas": [dict(j) for j in justs]}
