import os
import requests
from datetime import datetime
from typing import Optional
from dotenv import load_dotenv

load_dotenv()

TEAMS_WEBHOOK       = os.getenv("TEAMS_WEBHOOK", "")
TEAMS_TENANT_ID     = os.getenv("TEAMS_TENANT_ID", "")
TEAMS_CLIENT_ID     = os.getenv("TEAMS_CLIENT_ID", "")
TEAMS_CLIENT_SECRET = os.getenv("TEAMS_CLIENT_SECRET", "")
TEAMS_TEAM_ID       = os.getenv("TEAMS_TEAM_ID", "")
TEAMS_CHANNEL_ID    = os.getenv("TEAMS_CHANNEL_ID", "")


def _get_graph_token() -> str:
    url = f"https://login.microsoftonline.com/{TEAMS_TENANT_ID}/oauth2/v2.0/token"
    data = {
        "grant_type": "client_credentials",
        "client_id": TEAMS_CLIENT_ID,
        "client_secret": TEAMS_CLIENT_SECRET,
        "scope": "https://graph.microsoft.com/.default",
    }
    r = requests.post(url, data=data, timeout=10)
    r.raise_for_status()
    return r.json()["access_token"]


def _enviar_webhook(mensagem: str, cor: str = "FF0000") -> None:
    if not TEAMS_WEBHOOK:
        print("  ⚠️  TEAMS_WEBHOOK não configurado")
        return
    payload = {
        "@type": "MessageCard",
        "@context": "http://schema.org/extensions",
        "themeColor": cor,
        "summary": mensagem,
        "sections": [{
            "activityTitle": mensagem,
            "activitySubtitle": f"🕐 {datetime.now().strftime('%d/%m/%Y %H:%M:%S')}",
            "markdown": True,
        }],
    }
    try:
        r = requests.post(TEAMS_WEBHOOK, json=payload, timeout=10)
        if r.status_code == 200:
            print(f"  ✅ Teams notificado: {mensagem}")
        else:
            print(f"  ⚠️  Erro Teams {r.status_code}: {r.text}")
    except Exception as e:
        print(f"  ❌ Falha ao notificar Teams: {e}")


def notificar_parada(inventory_number: str) -> None:
    msg = (
        f"🔴 MÁQUINA PARADA | InventoryNumber: {inventory_number} | "
        f"{datetime.now().strftime('%d/%m %H:%M')}"
    )
    _enviar_webhook(msg, cor="FF0000")


def notificar_retorno(inventory_number: str, duracao_min: Optional[int]) -> Optional[str]:
    if duracao_min is not None:
        msg = (
            f"⏳ MÁQUINA RETORNOU | InventoryNumber: {inventory_number} | "
            f"Parada por ~{duracao_min} min | Aguardando justificativa"
        )
    else:
        msg = f"⏳ MÁQUINA RETORNOU | InventoryNumber: {inventory_number} | Aguardando justificativa"

    _enviar_webhook(msg, cor="FFA500")
    # Webhook não retorna msg_id — Graph API necessária para edição futura
    return None


def notificar_justificativa(
    inventory_number: str,
    duracao_min: Optional[int],
    categoria: str,
    responsavel: str,
) -> None:
    duracao = f"~{duracao_min} min" if duracao_min is not None else "—"
    msg = (
        f"✅ JUSTIFICADO | InventoryNumber: {inventory_number} | "
        f"{duracao} | {categoria} | {responsavel}"
    )
    _enviar_webhook(msg, cor="00AA00")


def notificar_atendimento(inventory_number: str, nome_tecnico: str, nome_maquina: str) -> None:
    msg = (
        f"🟡 EM ATENDIMENTO | {nome_maquina} ({inventory_number}) | "
        f"{nome_tecnico} assumiu o chamado | {datetime.now().strftime('%d/%m %H:%M')}"
    )
    _enviar_webhook(msg, cor="F5A524")


def notificar_escalamento_supervisor(inventory_number: str, duracao_min: int, nome_maquina: str) -> None:
    msg = (
        f"⚠️ ESCALONAMENTO SUPERVISORES | {nome_maquina} ({inventory_number}) | "
        f"Parada há {duracao_min} min sem nenhum técnico atender"
    )
    _enviar_webhook(msg, cor="FF8C00")


def notificar_escalamento_gerente(
    inventory_number: str, duracao_min: int, nome_maquina: str, gerentes_nomes: str
) -> None:
    gerentes = f" | Gerentes: {gerentes_nomes}" if gerentes_nomes else ""
    msg = (
        f"🚨 ESCALONAMENTO GERÊNCIA | {nome_maquina} ({inventory_number}) | "
        f"Parada há {duracao_min} min sem atendimento{gerentes}"
    )
    _enviar_webhook(msg, cor="FF0000")


SENNA_LINK = "https://open-webui.azurewebsites.net/"


def notificar_suporte(
    nome_solicitante: str, nome_destino: str, nome_maquina: str, linha: str
) -> None:
    msg = (
        f"🆘 PEDIDO DE SUPORTE | {nome_destino}, {nome_solicitante} está solicitando "
        f"seu suporte em {nome_maquina} ({linha}) | "
        f"🔗 SENNA: {SENNA_LINK}"
    )
    _enviar_webhook(msg, cor="42E4D9")


def atualizar_mensagem_justificada(
    msg_id: str,
    inventory_number: str,
    duracao_min: Optional[int],
    categoria: str,
    responsavel: str,
) -> None:
    if not all([TEAMS_TENANT_ID, TEAMS_CLIENT_ID, TEAMS_CLIENT_SECRET, TEAMS_TEAM_ID, TEAMS_CHANNEL_ID]):
        print("  ⚠️  Graph API não configurada — mensagem Teams não atualizada")
        return

    try:
        token = _get_graph_token()
        url = (
            f"https://graph.microsoft.com/v1.0/teams/{TEAMS_TEAM_ID}"
            f"/channels/{TEAMS_CHANNEL_ID}/messages/{msg_id}"
        )
        corpo = (
            f"✅ {inventory_number} | {duracao_min} min | "
            f"{responsavel} | {categoria}"
        )
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }
        r = requests.patch(url, json={"body": {"content": corpo}}, headers=headers, timeout=10)
        if r.status_code in (200, 204):
            print(f"  ✅ Mensagem Teams atualizada: {msg_id}")
        else:
            print(f"  ⚠️  Erro ao atualizar mensagem: {r.status_code} {r.text}")
    except Exception as e:
        print(f"  ❌ Falha ao atualizar mensagem Teams: {e}")
