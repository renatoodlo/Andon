from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from api.auth import get_usuario_atual
from database.models import get_conn
from maquinas_config import nome_maquina

router = APIRouter(prefix="/paradas", tags=["paradas"])


@router.get("")
def listar_paradas(
    data_inicio: Optional[str] = Query(None, description="Data início YYYY-MM-DD"),
    data_fim: Optional[str]    = Query(None, description="Data fim YYYY-MM-DD"),
    maquina: Optional[str]     = Query(None, description="Filtro por InventoryNumber"),
    status: Optional[str]      = Query(None, description="NAO_JUSTIFICADO | JUSTIFICADO"),
    usuario=Depends(get_usuario_atual),
):
    sql = "SELECT * FROM paradas WHERE 1=1"
    params = []
    if data_inicio:
        sql += " AND DATE(inicio) >= ?"
        params.append(data_inicio)
    if data_fim:
        sql += " AND DATE(inicio) <= ?"
        params.append(data_fim)
    if maquina:
        sql += " AND inventory_number = ?"
        params.append(maquina)
    if status:
        sql += " AND status_just = ?"
        params.append(status)
    sql += " ORDER BY inicio DESC"

    with get_conn() as conn:
        rows = conn.execute(sql, params).fetchall()

    result = []
    for r in rows:
        d = dict(r)
        d["nome_maquina"] = nome_maquina(d["inventory_number"])
        result.append(d)
    return result


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
    d = dict(parada)
    d["nome_maquina"] = nome_maquina(d["inventory_number"])
    return {**d, "justificativas": [dict(j) for j in justs]}
