from fastapi import APIRouter, Depends
from api.auth import get_usuario_atual
from database.models import get_conn

router = APIRouter(prefix="/mapa", tags=["mapa"])


@router.get("/status")
def status_maquinas(usuario=Depends(get_usuario_atual)):
    with get_conn() as conn:
        ativas = conn.execute(
            """SELECT inventory_number, id, inicio,
                      CAST((julianday('now','localtime') - julianday(inicio)) * 1440 AS INTEGER) AS duracao_min,
                      status_just
               FROM paradas WHERE fim IS NULL"""
        ).fetchall()

        pendentes = conn.execute(
            """SELECT inventory_number, COUNT(*) as cnt
               FROM paradas
               WHERE fim IS NOT NULL AND status_just = 'NAO_JUSTIFICADO'
               AND fim > datetime('now', '-24 hours', 'localtime')
               GROUP BY inventory_number"""
        ).fetchall()

    pendentes_map = {r["inventory_number"]: r["cnt"] for r in pendentes}

    maquinas = {}
    for r in ativas:
        inv = r["inventory_number"]
        maquinas[inv] = {
            "status": "parada",
            "parada_id": r["id"],
            "duracao_min": r["duracao_min"],
            "just": r["status_just"],
        }

    return {"maquinas": maquinas}
