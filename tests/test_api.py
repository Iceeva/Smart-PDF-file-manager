"""Tests de l'API FileFlow. Chaque page de test a une largeur unique : on peut
ainsi verifier l'ordre exact des pages dans les PDF produits."""
import io
import zipfile

import pytest
from fastapi.testclient import TestClient
from pypdf import PdfReader, PdfWriter

from api.index import app

client = TestClient(app)


def make_pdf(widths):
    writer = PdfWriter()
    for width in widths:
        writer.add_blank_page(width=width, height=200)
    buffer = io.BytesIO()
    writer.write(buffer)
    return buffer.getvalue()


def widths_of(data):
    return [int(float(page.mediabox.width)) for page in PdfReader(io.BytesIO(data)).pages]


def pdf_file(name, widths):
    return (name, make_pdf(widths), "application/pdf")


def test_health():
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_info():
    response = client.post("/api/info", files={"file": pdf_file("a.pdf", [100, 101, 102])})
    assert response.json()["pages"] == 3


def test_merge_keeps_order():
    files = [
        ("files", pdf_file("a.pdf", [100, 101])),
        ("files", pdf_file("b.pdf", [200])),
        ("files", pdf_file("c.pdf", [300, 301])),
    ]
    response = client.post("/api/merge", files=files)
    assert response.status_code == 200
    assert response.headers["x-pages"] == "5"
    assert widths_of(response.content) == [100, 101, 200, 300, 301]


def test_merge_needs_two_files():
    response = client.post("/api/merge", files=[("files", pdf_file("a.pdf", [100]))])
    assert response.status_code == 422


def test_extract_ranges():
    files = {"file": pdf_file("doc.pdf", [100, 101, 102, 103, 104, 105])}
    response = client.post("/api/extract", files=files, data={"pages": "1-2,5,6-"})
    assert response.status_code == 200
    assert widths_of(response.content) == [100, 101, 104, 105]
    assert "doc-extrait.pdf" in response.headers["content-disposition"]


@pytest.mark.parametrize("spec", ["0", "9", "3-1", "abc", "-", ""])
def test_extract_rejects_bad_ranges(spec):
    files = {"file": pdf_file("doc.pdf", [100, 101, 102])}
    response = client.post("/api/extract", files=files, data={"pages": spec})
    assert response.status_code == 422


def test_reorder():
    files = {"file": pdf_file("doc.pdf", [100, 101, 102, 103])}
    response = client.post("/api/reorder", files=files, data={"order": "4,2,1,3"})
    assert response.status_code == 200
    assert widths_of(response.content) == [103, 101, 100, 102]


def test_reorder_requires_every_page_once():
    files = {"file": pdf_file("doc.pdf", [100, 101, 102])}
    assert client.post("/api/reorder", files=files, data={"order": "1,2"}).status_code == 422
    assert client.post("/api/reorder", files=files, data={"order": "1,1,2"}).status_code == 422


def test_split_by_ranges():
    files = {"file": pdf_file("doc.pdf", [100, 101, 102, 103, 104])}
    response = client.post("/api/split", files=files, data={"ranges": "1-2,3-3,4-5"})
    assert response.status_code == 200
    assert response.headers["x-parts"] == "3"
    archive = zipfile.ZipFile(io.BytesIO(response.content))
    names = sorted(archive.namelist())
    assert names == [
        "doc-partie-01-p1-2.pdf",
        "doc-partie-02-p3.pdf",
        "doc-partie-03-p4-5.pdf",
    ]
    assert widths_of(archive.read(names[2])) == [103, 104]


def test_split_every_n_pages():
    files = {"file": pdf_file("doc.pdf", [100, 101, 102, 103, 104])}
    response = client.post("/api/split", files=files, data={"every": "2"})
    assert response.headers["x-parts"] == "3"


def test_not_a_pdf():
    files = {"file": ("faux.pdf", b"ceci n'est pas un pdf", "application/pdf")}
    response = client.post("/api/info", files=files)
    assert response.status_code == 422


def test_too_large(monkeypatch):
    monkeypatch.setattr("api.index.MAX_UPLOAD_BYTES", 100)
    response = client.post("/api/info", files={"file": pdf_file("a.pdf", [100])})
    assert response.status_code == 413
