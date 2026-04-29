import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "andon.db")

SCHEMA = """
CREATE TABLE IF NOT EXISTS usuarios (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    nome        TEXT    NOT NULL,
    login       TEXT    NOT NULL UNIQUE,
    senha_hash  TEXT    NOT NULL,
    perfil      TEXT    NOT NULL CHECK(perfil IN ('operador', 'tecnico', 'supervisor')),
    ativo       INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS paradas (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    inventory_number TEXT    NOT NULL,
    inicio           TEXT    NOT NULL,
    fim              TEXT,
    duracao_min      INTEGER,
    status_just      TEXT    NOT NULL DEFAULT 'NAO_JUSTIFICADO'
                     CHECK(status_just IN ('NAO_JUSTIFICADO', 'JUSTIFICADO')),
    teams_msg_id     TEXT
);

CREATE TABLE IF NOT EXISTS justificativas (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    parada_id     INTEGER NOT NULL REFERENCES paradas(id),
    inicio_just   TEXT    NOT NULL,
    fim_just      TEXT    NOT NULL,
    categoria     TEXT    NOT NULL,
    descricao     TEXT,
    responsavel   TEXT    NOT NULL,
    criado_por    INTEGER NOT NULL REFERENCES usuarios(id),
    criado_em     TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS maquinas (
    inventory_number TEXT PRIMARY KEY,
    nome             TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS configuracoes (
    chave TEXT PRIMARY KEY,
    valor TEXT NOT NULL
);
"""


def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    conn = get_conn()
    conn.executescript(SCHEMA)
    conn.commit()

    # Cria supervisor padrão se o banco estiver vazio
    cur = conn.execute("SELECT COUNT(*) FROM usuarios")
    if cur.fetchone()[0] == 0:
        from passlib.hash import bcrypt
        senha_hash = bcrypt.hash("admin123")
        conn.execute(
            "INSERT INTO usuarios (nome, login, senha_hash, perfil) VALUES (?, ?, ?, ?)",
            ("Administrador", "admin", senha_hash, "supervisor")
        )
        conn.commit()
        print("✅ Usuário padrão criado — login: admin | senha: admin123")

    # Semeia tabela maquinas a partir de maquinas_config.py se vazia
    cur = conn.execute("SELECT COUNT(*) FROM maquinas")
    if cur.fetchone()[0] == 0:
        from maquinas_config import MAQUINAS
        conn.executemany(
            "INSERT OR IGNORE INTO maquinas (inventory_number, nome) VALUES (?, ?)",
            MAQUINAS.items()
        )
        conn.commit()
        print(f"✅ {len(MAQUINAS)} máquinas importadas de maquinas_config.py")

    # Valores padrão de configuração
    defaults = [("urgente_minutos", "30")]
    conn.executemany(
        "INSERT OR IGNORE INTO configuracoes (chave, valor) VALUES (?, ?)", defaults
    )
    conn.commit()

    conn.close()
    print(f"✅ Banco inicializado: {os.path.abspath(DB_PATH)}")


if __name__ == "__main__":
    init_db()
