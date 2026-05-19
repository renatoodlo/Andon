from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from api.auth import get_usuario_atual
from api.teams import notificar_atendimento
from database.models import get_conn
from maquinas_config import nome_maquina

router = APIRouter(prefix="/paradas", tags=["paradas"])


def _enriquecer_parada(d: dict, conn) -> dict:
    d["nome_maquina"] = nome_maquina(d["inventory_number"], conn)
    if d.get("atendente_id"):
        row = conn.execute(
            "SELECT nome FROM usuarios WHERE id = ?", (d["atendente_id"],)
        ).fetchone()
        d["atendente_nome"] = row["nome"] if row else None
    else:
        d["atendente_nome"] = None
    return d


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
            _enriquecer_parada(d, conn)
            just = conn.execute(
                "SELECT categoria, responsavel, descricao FROM justificativas WHERE parada_id = ? ORDER BY criado_em LIMIT 1",
                (d["id"],)
            ).fetchone()
            d["justificativas"] = [dict(just)] if just else []
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
        _enriquecer_parada(d, conn)
    return {**d, "justificativas": [dict(j) for j in justs]}


@router.post("/{parada_id}/atender")
def assumir_atendimento(parada_id: int, usuario=Depends(get_usuario_atual)):
    with get_conn() as conn:
        parada = conn.execute(
            "SELECT * FROM paradas WHERE id = ?", (parada_id,)
        ).fetchone()
        if not parada:
            raise HTTPException(status_code=404, detail="Parada não encontrada")
        if parada["fim"] is not None:
            raise HTTPException(status_code=400, detail="Parada já encerrada")
        if parada["status_atend"] == "EM_ATENDIMENTO":
            raise HTTPException(status_code=400, detail="Parada já está sendo atendida")

        agora = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        conn.execute(
            """UPDATE paradas
               SET status_atend='EM_ATENDIMENTO', atendente_id=?, atendimento_inicio=?
               WHERE id=?""",
            (usuario["id"], agora, parada_id),
        )
        conn.commit()

        nome_maq = nome_maquina(parada["inventory_number"], conn)

    notificar_atendimento(parada["inventory_number"], usuario["nome"], nome_maq)
    return {"ok": True, "atendente": usuario["nome"]}
