from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from api.auth import get_usuario_atual
from api.teams import notificar_suporte
from database.models import get_conn
from maquinas_config import nome_maquina

router = APIRouter(prefix="/equipe", tags=["equipe"])


class SuporteRequest(BaseModel):
    usuario_destino_id: int
    parada_id: Optional[int] = None


@router.get("/status")
def status_equipe(usuario=Depends(get_usuario_atual)):
    perfil = usuario["perfil"]
    agora = datetime.now()

    with get_conn() as conn:
        membros = conn.execute(
            "SELECT id, nome, perfil FROM usuarios WHERE perfil = ? AND ativo = 1 ORDER BY nome",
            (perfil,),
        ).fetchall()

        result = []
        for m in membros:
            parada_ativa = conn.execute(
                """SELECT p.id, p.inventory_number, p.atendimento_inicio
                   FROM paradas p
                   WHERE p.atendente_id = ? AND p.fim IS NULL AND p.status_atend = 'EM_ATENDIMENTO'
                   ORDER BY p.atendimento_inicio DESC
                   LIMIT 1""",
                (m["id"],),
            ).fetchone()

            entry = {
                "id":     m["id"],
                "nome":   m["nome"],
                "perfil": m["perfil"],
            }

            if parada_ativa:
                nome_maq = nome_maquina(parada_ativa["inventory_number"], conn)
                atend_inicio = parada_ativa["atendimento_inicio"]
                atend_min = None
                if atend_inicio:
                    try:
                        dt = datetime.strptime(atend_inicio, "%Y-%m-%d %H:%M:%S")
                        atend_min = int((agora - dt).total_seconds() / 60)
                    except ValueError:
                        pass
                entry.update({
                    "status":             "em_atendimento",
                    "parada_id":          parada_ativa["id"],
                    "maquina":            nome_maq,
                    "inventory_number":   parada_ativa["inventory_number"],
                    "atendimento_inicio": atend_inicio,
                    "atendimento_min":    atend_min,
                })
            else:
                entry.update({
                    "status":             "livre",
                    "parada_id":          None,
                    "maquina":            None,
                    "inventory_number":   None,
                    "atendimento_inicio": None,
                    "atendimento_min":    None,
                })

            result.append(entry)

    return result


@router.post("/suporte")
def pedir_suporte(body: SuporteRequest, usuario=Depends(get_usuario_atual)):
    with get_conn() as conn:
        destino = conn.execute(
            "SELECT id, nome FROM usuarios WHERE id = ? AND ativo = 1",
            (body.usuario_destino_id,),
        ).fetchone()
        if not destino:
            raise HTTPException(status_code=404, detail="Usuário não encontrado")

        nome_maq = "—"
        linha = "—"
        if body.parada_id:
            parada = conn.execute(
                "SELECT inventory_number FROM paradas WHERE id = ?",
                (body.parada_id,),
            ).fetchone()
            if parada:
                inv = parada["inventory_number"]
                nome_maq = nome_maquina(inv, conn)
                # Deriva a linha do nome da máquina (ex: "RA06 CM09" → "CM09")
                partes = nome_maq.split()
                linha = partes[-1] if partes else inv

    notificar_suporte(usuario["nome"], destino["nome"], nome_maq, linha)
    return {"ok": True}
