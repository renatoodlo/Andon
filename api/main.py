import os
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from dotenv import load_dotenv

from database.models import init_db, get_conn
from api.auth import verificar_senha, criar_token
from api.routes import paradas, maquinas, usuarios, justificativas

load_dotenv()
init_db()

app = FastAPI(title="Andon API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(paradas.router)
app.include_router(maquinas.router)
app.include_router(usuarios.router)
app.include_router(justificativas.router)

app.mount("/static", StaticFiles(directory="web/static"), name="static")


@app.post("/login")
def login(form: OAuth2PasswordRequestForm = Depends()):
    with get_conn() as conn:
        row = conn.execute(
            "SELECT id, senha_hash, perfil FROM usuarios WHERE login = ? AND ativo = 1",
            (form.username,)
        ).fetchone()
    if not row or not verificar_senha(form.password, row["senha_hash"]):
        raise HTTPException(status_code=401, detail="Login ou senha inválidos")
    token = criar_token({"sub": row["id"], "perfil": row["perfil"]})
    return {"access_token": token, "token_type": "bearer", "perfil": row["perfil"]}


@app.get("/")
def index():
    return FileResponse("web/index.html")
