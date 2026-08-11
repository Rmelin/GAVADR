import asyncio
import smtplib
from datetime import datetime, timezone
from email.message import EmailMessage

from app.core.config import Settings
from app.models import Incident, Notification


def _send_smtp(settings: Settings, message: EmailMessage) -> None:
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as smtp:
        if settings.smtp_starttls:
            smtp.starttls()
        if settings.smtp_username:
            smtp.login(settings.smtp_username, settings.smtp_password or "")
        smtp.send_message(message)


async def notify_board(incident: Incident, settings: Settings) -> Notification:
    recipients = settings.board_notification_emails
    subject = f"[{incident.priority.upper()}] {incident.number}: {incident.title}"
    notification = Notification(
        incident_id=incident.id,
        recipients=recipients,
        status="skipped",
        subject=subject,
        updated_by=incident.created_by_id,
    )
    if not settings.smtp_host or not settings.smtp_from or not recipients:
        notification.error_message = "SMTP or recipients not configured"
        return notification

    message = EmailMessage()
    message["From"] = settings.smtp_from
    message["To"] = ", ".join(recipients)
    message["Subject"] = subject
    message.set_content(
        f"Type: {incident.type}\nPriority: {incident.priority}\n"
        f"Registered: {incident.registered_at.isoformat()}\n"
        f"Created by: {incident.created_by.display_name}\n"
        f"Hændelse: {settings.frontend_url.rstrip('/')}/haendelser/{incident.id}\n"
    )
    try:
        await asyncio.to_thread(_send_smtp, settings, message)
        notification.status = "sent"
        notification.sent_at = datetime.now(timezone.utc)
    except Exception as exc:  # SMTP errors must not roll back incident creation.
        notification.status = "failed"
        notification.error_message = str(exc)[:1000]
    return notification
