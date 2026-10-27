"""FileFlow : API de traitement de PDF (FastAPI + pypdf).

Cette API est sans etat : chaque requete recoit ses fichiers, produit un
resultat et ne garde rien sur le serveur. Elle est prete pour Vercel
(fonction Python) et pour un lancement local avec uvicorn.
"""
from __future__ import annotations

import io
import os
import re
import zipfile
from typing import List, Optional

from fastapi import APIRouter, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from pypdf import PdfReader, PdfWriter

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

# Vercel limite le corps d'une requete a 4,5 Mo : on reste en dessous par defaut.
MAX_UPLOAD_MB = float(os.getenv("MAX_UPLOAD_MB", "4"))
MAX_UPLOAD_BYTES = int(MAX_UPLOAD_MB * 1024 * 1024)
MAX_FILES = int(os.getenv("MAX_FILES", "20"))
MAX_OUTPUT_PAGES = int(os.getenv("MAX_OUTPUT_PAGES", "5000"))
MAX_PARTS = int(os.getenv("MAX_PARTS", "200"))

app = FastAPI(
    title="FileFlow API",
    version="1.0.0",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in os.getenv("ALLOWED_ORIGINS", "*").split(",")],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
    expose_headers=["X-Pages", "X-Parts", "Content-Disposition"],
)

router = APIRouter(prefix="/api")


# ---------------------------------------------------------------------------
# Utilitaires
# ---------------------------------------------------------------------------

def fail(status: int, message: str) -> HTTPException:
    return HTTPException(status_code=status, detail=message)


async def read_upload(upload: UploadFile) -> bytes:
    """Lit un fichier envoye en refusant ce qui depasse la limite."""
    data = await upload.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise fail(413, f"Fichier trop volumineux (limite : {MAX_UPLOAD_MB:g} Mo).")
    return data


def open_pdf(data: bytes, name: str) -> PdfReader:
    """Ouvre un PDF et traduit les erreurs de pypdf en messages clairs."""
    if b"%PDF" not in data[:1024]:
        raise fail(422, f"« {name} » n'est pas un fichier PDF valide.")
    try:
        reader = PdfReader(io.BytesIO(data))
        if reader.is_encrypted and not reader.decrypt(""):
            raise fail(422, f"« {name} » est protégé par un mot de passe.")
        if len(reader.pages) == 0:
            raise fail(422, f"« {name} » ne contient aucune page.")
    except HTTPException:
        raise
    except Exception as exc:  # pypdf peut lever des erreurs tres variees
        raise fail(422, f"« {name} » est illisible ou corrompu.") from exc
    return reader


def safe_stem(filename: Optional[str], default: str = "document") -> str:
    """Nom de base ASCII, sans extension, utilisable dans un nom de fichier."""
    stem = re.sub(r"\.pdf$", "", (filename or default).strip(), flags=re.IGNORECASE)
    stem = re.sub(r"[^A-Za-z0-9._-]+", "-", stem).strip("-.")
    return stem[:60] or default


_TOKEN = re.compile(r"^(\d*)\s*(-)?\s*(\d*)$")


def parse_range(token: str, total: int) -> range:
    """Convertit « 3 », « 2-5 », « 4- » ou « -3 » en plage d'indices (base 0)."""
    cleaned = token.strip()
    match = _TOKEN.match(cleaned)
    if not match or not (match.group(1) or match.group(3)):
        raise fail(422, f"Plage invalide : « {cleaned} ».")
    first, dash, last = match.groups()
    if not dash:
        start = end = int(first)
    else:
        start = int(first) if first else 1
        end = int(last) if last else total
    if start < 1 or end > total or start > end:
        raise fail(422, f"Plage hors limites : « {cleaned} » (le document compte {total} pages).")
    return range(start - 1, end)


def parse_pages(spec: str, total: int) -> List[int]:
    """Convertit « 1-3,5,7- » en liste d'indices, dans l'ordre demande."""
    tokens = [t for t in re.split(r"[,;]", spec or "") if t.strip()]
    if not tokens:
        raise fail(422, "Indiquez au moins une page.")
    pages: List[int] = []
    for token in tokens:
        pages.extend(parse_range(token, total))
        if len(pages) > MAX_OUTPUT_PAGES:
            raise fail(422, "Trop de pages demandées.")
    return pages


def build_pdf(reader: PdfReader, indices: List[int]) -> bytes:
    writer = PdfWriter()
    for index in indices:
        writer.add_page(reader.pages[index])
    buffer = io.BytesIO()
    writer.write(buffer)
    return buffer.getvalue()


def pdf_response(data: bytes, filename: str, pages: int) -> Response:
    return Response(
        content=data,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "X-Pages": str(pages),
        },
    )


# ---------------------------------------------------------------------------
# Routes : sante et informations
# ---------------------------------------------------------------------------

@router.get("/health")
async def health() -> JSONResponse:
    return JSONResponse(
        {"status": "ok", "maxUploadMb": MAX_UPLOAD_MB, "maxFiles": MAX_FILES}
    )


@router.post("/info")
async def info(file: UploadFile = File(...)) -> JSONResponse:
    """Nombre de pages et taille d'un PDF."""
    data = await read_upload(file)
    reader = open_pdf(data, file.filename or "document.pdf")
    return JSONResponse({"pages": len(reader.pages), "size": len(data)})


# ---------------------------------------------------------------------------
# Routes : fusion et extraction
# ---------------------------------------------------------------------------

@router.post("/merge")
async def merge(files: List[UploadFile] = File(...)) -> Response:
    """Fusionne plusieurs PDF, dans l'ordre d'envoi."""
    if len(files) < 2:
        raise fail(422, "Ajoutez au moins deux PDF à fusionner.")
    if len(files) > MAX_FILES:
        raise fail(422, f"Trop de fichiers (maximum : {MAX_FILES}).")

    writer = PdfWriter()
    total_bytes = 0
    total_pages = 0
    for upload in files:
        data = await read_upload(upload)
        total_bytes += len(data)
        if total_bytes > MAX_UPLOAD_BYTES:
            raise fail(413, f"Fichiers trop volumineux (limite totale : {MAX_UPLOAD_MB:g} Mo).")
        reader = open_pdf(data, upload.filename or "document.pdf")
        writer.append(reader)
        total_pages += len(reader.pages)

    buffer = io.BytesIO()
    writer.write(buffer)
    return pdf_response(buffer.getvalue(), "fileflow-fusion.pdf", total_pages)


@router.post("/extract")
async def extract(file: UploadFile = File(...), pages: str = Form(...)) -> Response:
    """Cree un nouveau PDF avec les pages demandees (ex : « 1-3,5,8- »)."""
    data = await read_upload(file)
    reader = open_pdf(data, file.filename or "document.pdf")
    indices = parse_pages(pages, len(reader.pages))
    name = f"{safe_stem(file.filename)}-extrait.pdf"
    return pdf_response(build_pdf(reader, indices), name, len(indices))


# ---------------------------------------------------------------------------
# Routes : reorganisation et decoupe
# ---------------------------------------------------------------------------

@router.post("/reorder")
async def reorder(file: UploadFile = File(...), order: str = Form(...)) -> Response:
    """Reecrit le PDF dans le nouvel ordre (ex : « 3,1,2,4- »).

    Toutes les pages doivent apparaitre une fois : aucune page n'est perdue
    ou dupliquee par erreur.
    """
    data = await read_upload(file)
    reader = open_pdf(data, file.filename or "document.pdf")
    total = len(reader.pages)
    indices = parse_pages(order, total)
    if len(indices) != total or len(set(indices)) != total:
        raise fail(422, f"Le nouvel ordre doit contenir chacune des {total} pages une seule fois.")
    name = f"{safe_stem(file.filename)}-reordonne.pdf"
    return pdf_response(build_pdf(reader, indices), name, total)


@router.post("/split")
async def split(
    file: UploadFile = File(...),
    ranges: Optional[str] = Form(None),
    every: Optional[int] = Form(None),
) -> Response:
    """Decoupe un PDF en plusieurs fichiers livres dans une archive ZIP.

    - `ranges` : une plage par fichier, ex « 1-3,4-4,5- » donne 3 fichiers.
    - `every`  : un fichier toutes les N pages.
    """
    data = await read_upload(file)
    reader = open_pdf(data, file.filename or "document.pdf")
    total = len(reader.pages)

    parts: List[range] = []
    if ranges and ranges.strip():
        tokens = [t for t in re.split(r"[,;]", ranges) if t.strip()]
        parts = [parse_range(token, total) for token in tokens]
    elif every is not None:
        if every < 1:
            raise fail(422, "Le nombre de pages par fichier doit être au moins 1.")
        parts = [range(i, min(i + every, total)) for i in range(0, total, every)]
    else:
        raise fail(422, "Indiquez des plages ou un nombre de pages par fichier.")

    if not parts:
        raise fail(422, "Aucune partie à créer.")
    if len(parts) > MAX_PARTS:
        raise fail(422, f"Trop de fichiers demandés (maximum : {MAX_PARTS}).")

    stem = safe_stem(file.filename)
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        for number, part in enumerate(parts, start=1):
            first, last = part.start + 1, part.stop
            label = f"p{first}" if first == last else f"p{first}-{last}"
            archive.writestr(
                f"{stem}-partie-{number:02d}-{label}.pdf",
                build_pdf(reader, list(part)),
            )

    return Response(
        content=buffer.getvalue(),
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{stem}-decoupe.zip"',
            "X-Parts": str(len(parts)),
            "X-Pages": str(total),
        },
    )


app.include_router(router)
