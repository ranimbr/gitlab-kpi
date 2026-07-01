"""
core/email_service.py

Service d'envoi d'emails pour la réinitialisation de mot de passe.
Utilise SMTP avec Gmail App Password.
"""
import logging
import smtplib
from email.mime.text import MIMEText
from typing import Optional

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class EmailService:
    """Service d'envoi d'emails via SMTP"""

    def __init__(self):
        self.smtp_host = settings.SMTP_HOST
        self.smtp_port = settings.SMTP_PORT
        self.smtp_username = settings.SMTP_USERNAME
        self.smtp_password = settings.SMTP_PASSWORD
        self.smtp_from = settings.SMTP_FROM or self.smtp_username
        self.smtp_use_tls = settings.SMTP_USE_TLS
        
        logger.info(f"[EMAIL SERVICE] SMTP configured: host={self.smtp_host}, port={self.smtp_port}, user={self.smtp_username}, from={self.smtp_from}")

    def send_password_reset_email(
        self,
        to_email: str,
        reset_link: str,
        to_name: Optional[str] = None,
        expiry_minutes: int = 30
    ) -> bool:
        """
        Envoie un email de réinitialisation de mot de passe via SMTP.

        Args:
            to_email: Email du destinataire
            to_name: Nom du destinataire (optionnel)
            reset_link: Lien de réinitialisation avec token
            expiry_minutes: Durée de validité du token en minutes

        Returns:
            True si l'email a été envoyé avec succès, False sinon
        """
        logger.debug(f"[SMTP START] Sending password reset email to {to_email}")

        if not self.smtp_host or not self.smtp_port or not self.smtp_username or not self.smtp_password:
            logger.error("SMTP configuration incomplete. Cannot send email.")
            return False

        # HTML Content
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <title>Réinitialisation de votre mot de passe</title>
        </head>
        <body>
            <p>Bonjour {to_name if to_name else ''},</p>
            <p>Vous avez demandé à réinitialiser le mot de passe de votre compte TELNET Dashboard.</p>
            <p>Veuillez cliquer sur le lien ci-dessous pour réinitialiser votre mot de passe :</p>
            <p><a href="{reset_link}">Réinitialiser mon mot de passe</a></p>
            <p>Ce lien expirera dans {expiry_minutes} minutes.</p>
            <p>Si vous n'avez pas demandé cette réinitialisation, veuillez ignorer cet e-mail.</p>
            <p>Cordialement,</p>
            <p>L'équipe TELNET Dashboard</p>
        </body>
        </html>
        """

        # Plain Text Content
        text_content = f"""
        Bonjour {to_name if to_name else ''},

        Vous avez demandé à réinitialiser le mot de passe de votre compte TELNET Dashboard.

        Veuillez cliquer sur le lien ci-dessous pour réinitialiser votre mot de passe :
        {reset_link}

        Ce lien expirera dans {expiry_minutes} minutes.

        Si vous n'avez pas demandé cette réinitialisation, veuillez ignorer cet e-mail.

        Cordialement,
        L'équipe TELNET Dashboard
        """

        try:
            message = MIMEText()
            message["From"] = self.smtp_from
            message["To"] = to_email
            message["Subject"] = "Réinitialisation de votre mot de passe - TELNET Dashboard"
            message.attach(MIMEText(text_content, "plain"))
            message.attach(MIMEText(html_content, "html"))

            logger.debug(f"[SMTP MESSAGE] Message created, from={self.smtp_from}, to={to_email}")

            with smtplib.SMTP(self.smtp_host, self.smtp_port) as server:
                if self.smtp_use_tls:
                    server.starttls()
                server.login(self.smtp_username, self.smtp_password)
                server.send_message(message)

            logger.info(f"Password reset email sent successfully to {to_email} via SMTP")
            return True
        except Exception as e:
            logger.error(f"Failed to send password reset email to {to_email} via SMTP: {e}", exc_info=True)
            return False

    def send_password_changed_notification(
        self,
        to_email: str,
        to_name: Optional[str] = None
    ) -> bool:
        """Not implemented - unused in current flow"""
        logger.warning("send_password_changed_notification not implemented")
        return False

    def send_contact_email(
        self,
        name: str,
        email: str,
        subject: str,
        message: str
    ) -> bool:
        """Not implemented - unused in current flow"""
        logger.warning("send_contact_email not implemented")
        return False


# Instance singleton pour réutilisation
_email_service: Optional[EmailService] = None


def get_email_service() -> EmailService:
    """Retourne l'instance singleton du service email"""
    global _email_service
    if _email_service is None:
        _email_service = EmailService()
    return _email_service
