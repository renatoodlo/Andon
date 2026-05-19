import pyodbc
import time
import os
from datetime import datetime
from dotenv import load_dotenv
from database.models import init_db, get_conn
from api.teams import (
    notificar_parada, notificar_retorno,
    notificar_escalamento_supervisor, notificar_escalamento_gerente,
)
from maquinas_config import nome_maquina

load_dotenv()
init_db()

SQL_SERVER         = os.getenv("SQL_SERVER", "10.220.10.24")
SQL_DATABASE       = os.getenv("SQL_DATABASE")
SQL_USER           = os.getenv("SQL_USER")
SQL_PASSWORD       = os.getenv("SQL_PASSWORD")
INTERVALO_SEGUNDOS = int(os.getenv("INTERVALO_SEGUNDOS", 30))

estado_maquinas = {}


def conectar():
    conn_str = (
        f"DRIVER={{ODBC Driver 17 for SQL Server}};"
        f"SERVER={SQL_SERVER};"
        f"DATABASE={SQL_DATABASE};"
        f"UID={SQL_USER};"
        f"PWD={SQL_PASSWORD};"
    )
    return pyodbc.connect(conn_str)


def buscar_estados_atuais(conn):
    query = """
        SELECT t.InventoryNumber, t.State, t.Timestamp
        FROM dbo.tblOperatingState t
        INNER JOIN (
            SELECT InventoryNumber, MAX(ID) as MaxID
            FROM dbo.tblOperatingState
            GROUP BY InventoryNumber
        ) sub ON t.InventoryNumber = sub.InventoryNumber AND t.ID = sub.MaxID
    """
    cursor = conn.cursor()
    cursor.execute(query)
    return cursor.fetchall()


def _registrar_parada(inventory_number, inicio):
    try:
        inicio_str = inicio.strftime("%Y-%m-%d %H:%M:%S") if isinstance(inicio, datetime) else str(inicio)
        with get_conn() as conn:
            conn.execute(
                "INSERT INTO paradas (inventory_number, inicio) VALUES (?, ?)",
                (inventory_number, inicio_str)
            )
            conn.commit()
    except Exception as e:
        print(f"  ⚠️  Erro ao registrar parada no banco: {e}")


def _fechar_parada(inventory_number, fim, duracao_min, teams_msg_id):
    try:
        fim_str = fim.strftime("%Y-%m-%d %H:%M:%S") if isinstance(fim, datetime) else str(fim)
        with get_conn() as conn:
            conn.execute(
                """UPDATE paradas SET fim = ?, duracao_min = ?, teams_msg_id = ?
                   WHERE id = (
                       SELECT id FROM paradas
                       WHERE inventory_number = ? AND fim IS NULL
                       ORDER BY id DESC LIMIT 1
                   )""",
                (fim_str, duracao_min, teams_msg_id, inventory_number)
            )
            conn.commit()
    except Exception as e:
        print(f"  ⚠️  Erro ao fechar parada no banco: {e}")


def _get_config(chave, default=""):
    try:
        with get_conn() as conn:
            row = conn.execute(
                "SELECT valor FROM configuracoes WHERE chave = ?", (chave,)
            ).fetchone()
            return row["valor"] if row else default
    except Exception:
        return default


def _verificar_escalamentos():
    try:
        sup_min = int(_get_config("escala_supervisor_min", "15"))
        ger_min = int(_get_config("escala_gerente_min", "30"))
        gerentes_nomes = _get_config("gerentes_nomes", "")

        with get_conn() as conn:
            paradas = conn.execute(
                """SELECT id, inventory_number, inicio,
                          CAST((julianday('now','localtime') - julianday(inicio)) * 1440 AS INTEGER) AS duracao_min,
                          escala_sup_enviado, escala_ger_enviado
                   FROM paradas
                   WHERE fim IS NULL AND status_atend = 'AGUARDANDO'"""
            ).fetchall()

            for p in paradas:
                duracao = int(p["duracao_min"] or 0)
                nome_maq = nome_maquina(p["inventory_number"])

                if duracao >= sup_min and not p["escala_sup_enviado"]:
                    notificar_escalamento_supervisor(p["inventory_number"], duracao, nome_maq)
                    conn.execute(
                        "UPDATE paradas SET escala_sup_enviado=1 WHERE id=?", (p["id"],)
                    )
                    conn.commit()
                    print(f"  ⚠️  Escalonamento supervisor enviado — {p['inventory_number']} ({duracao} min)")

                if duracao >= ger_min and not p["escala_ger_enviado"]:
                    notificar_escalamento_gerente(p["inventory_number"], duracao, nome_maq, gerentes_nomes)
                    conn.execute(
                        "UPDATE paradas SET escala_ger_enviado=1 WHERE id=?", (p["id"],)
                    )
                    conn.commit()
                    print(f"  🚨 Escalonamento gerência enviado — {p['inventory_number']} ({duracao} min)")

    except Exception as e:
        print(f"  ⚠️  Erro no verificar_escalamentos: {e}")


def processar_mudancas(estados_atuais):
    global estado_maquinas

    for row in estados_atuais:
        inv    = str(row.InventoryNumber)
        estado = row.State
        ts     = row.Timestamp

        anterior = estado_maquinas.get(inv)

        if anterior is None:
            estado_maquinas[inv] = {'state': estado, 'desde': ts}
            continue

        estado_anterior = anterior['state']
        desde = anterior['desde']

        if estado != estado_anterior:
            print(f"\n🔄 Mudança detectada — Máquina {inv}: {estado_anterior} → {estado} | {datetime.now().strftime('%H:%M:%S')}")

            if estado == 9:
                notificar_parada(inv)
                _registrar_parada(inv, ts)

            elif estado in (1, 2) and estado_anterior == 9:
                duracao = None
                if isinstance(desde, datetime):
                    duracao = int((datetime.now() - desde).total_seconds() / 60)

                msg_id = notificar_retorno(inv, duracao)
                _fechar_parada(inv, ts, duracao, msg_id)

            estado_maquinas[inv] = {'state': estado, 'desde': ts}


def main():
    print("=" * 55)
    print("  ANDON MONITOR — MEP")
    print(f"  Servidor : {SQL_SERVER}")
    print(f"  Banco    : {SQL_DATABASE}")
    print(f"  Intervalo: {INTERVALO_SEGUNDOS}s")
    print("=" * 55)

    try:
        conn = conectar()
        print("✅ Conectado ao SQL Server com sucesso!\n")
    except Exception as e:
        print(f"❌ Erro ao conectar no SQL: {e}")
        return

    print("📋 Carregando estado inicial das máquinas...")
    estados = buscar_estados_atuais(conn)
    for row in estados:
        estado_maquinas[str(row.InventoryNumber)] = {
            'state': row.State,
            'desde': row.Timestamp
        }
    print(f"   {len(estado_maquinas)} máquinas monitoradas.\n")
    print("🔍 Monitorando mudanças...\n")

    while True:
        try:
            estados = buscar_estados_atuais(conn)
            processar_mudancas(estados)
            _verificar_escalamentos()
        except pyodbc.Error as e:
            print(f"⚠️  Erro SQL, tentando reconectar... ({e})")
            try:
                conn = conectar()
                print("✅ Reconectado!")
            except Exception:
                print("❌ Falha na reconexão. Tentando novamente em 60s...")
                time.sleep(60)
                continue
        except Exception as e:
            print(f"⚠️  Erro inesperado: {e}")

        time.sleep(INTERVALO_SEGUNDOS)


if __name__ == "__main__":
    main()
