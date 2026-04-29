from fastapi import APIRouter, Depends
from api.auth import get_usuario_atual
from database.models import get_conn

router = APIRouter(prefix="/maquinas", tags=["maquinas"])


@router.get("")
def listar_maquinas(usuario=Depends(get_usuario_atual)):
    with get_conn() as conn:
        rows = conn.execute(
            """SELECT inventory_number,
                      MAX(inicio) AS ultima_parada,
                      COUNT(*)    AS total_paradas,
                      SUM(CASE WHEN status_just = 'NAO_JUSTIFICADO' THEN 1 ELSE 0 END) AS pendentes
               FROM paradas
               GROUP BY inventory_number
               ORDER BY inventory_number"""
        ).fetchall()
    return [dict(r) for r in rows]
