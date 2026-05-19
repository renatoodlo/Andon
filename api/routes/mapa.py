from fastapi import APIRouter, Depends
from api.auth import get_usuario_atual
from database.models import get_conn

router = APIRouter(prefix="/mapa", tags=["mapa"])


@router.get("/status")
def status_maquinas(usuario=Depends(get_usuario_atual)):
    with get_conn() as conn:
        ativas = conn.execute(
            """SELECT p.inventory_number, p.id, p.inicio,
                      CAST((julianday('now','localtime') - julianday(p.inicio)) * 1440 AS INTEGER) AS duracao_min,
                      p.status_just, p.status_atend, p.atendimento_inicio,
                      u.nome AS atendente_nome
               FROM paradas p
               LEFT JOIN usuarios u ON p.atendente_id = u.id
               WHERE p.fim IS NULL"""
        ).fetchall()

    maquinas = {}
    for r in ativas:
        inv = r["inventory_number"]
        maquinas[inv] = {
            "status":             "parada",
            "parada_id":          r["id"],
            "duracao_min":        r["duracao_min"],
            "just":               r["status_just"],
            "status_atend":       r["status_atend"] or "AGUARDANDO",
            "atendente_nome":     r["atendente_nome"],
            "atendimento_inicio": r["atendimento_inicio"],
        }

    return {"maquinas": maquinas}
