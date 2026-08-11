import asyncio
import hashlib
from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException, UploadFile, status

from app.core.config import get_settings

FILE_TYPES = {
    "image/jpeg": (".jpg", lambda data: data.startswith(b"\xff\xd8\xff")),
    "image/png": (".png", lambda data: data.startswith(b"\x89PNG\r\n\x1a\n")),
    "application/pdf": (".pdf", lambda data: data.startswith(b"%PDF-")),
}


async def store_upload(file: UploadFile) -> tuple[Path, str, str, int, str, str]:
    settings = get_settings()
    mime_type = (file.content_type or "").split(";", 1)[0].lower()
    if mime_type not in FILE_TYPES:
        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "Only JPEG, PNG, and PDF files are allowed")
    content = await file.read(settings.upload_max_bytes + 1)
    if len(content) > settings.upload_max_bytes:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "File exceeds configured maximum size")
    extension, matches_magic = FILE_TYPES[mime_type]
    if not content or not matches_magic(content):
        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "File content does not match its MIME type")

    original_filename = Path(file.filename or "upload").name.replace("\x00", "")[:255] or "upload"
    storage_filename = f"{uuid4().hex}{extension}"
    upload_dir = settings.upload_dir.resolve()
    upload_dir.mkdir(parents=True, exist_ok=True)
    destination = (upload_dir / storage_filename).resolve()
    if destination.parent != upload_dir:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid storage path")
    await asyncio.to_thread(destination.write_bytes, content)
    return (
        destination,
        original_filename,
        storage_filename,
        len(content),
        mime_type,
        hashlib.sha256(content).hexdigest(),
    )


def stored_path(storage_filename: str) -> Path | None:
    upload_dir = get_settings().upload_dir.resolve()
    path = (upload_dir / storage_filename).resolve()
    return path if path.parent == upload_dir and path.is_file() else None
