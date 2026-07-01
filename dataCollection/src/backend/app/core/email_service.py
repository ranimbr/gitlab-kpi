"""
core/email_service.py

Service d'envoi d'emails pour la réinitialisation de mot de passe.
Supporte Resend API (prioritaire) et SMTP (fallback).
"""
import logging
import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional
import requests

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class EmailService:
    """Service d'envoi d'emails via Resend API (prioritaire) ou SMTP (fallback)"""

    def __init__(self):
        # Resend configuration
        self.resend_api_key = os.getenv('RESEND_API_KEY')
        self.resend_from = os.getenv('RESEND_FROM') or 'noreply@telnet.com'
        
        # SMTP configuration (fallback)
        self.smtp_host = settings.SMTP_HOST
        self.smtp_port = settings.SMTP_PORT
        self.smtp_username = settings.SMTP_USERNAME
        self.smtp_password = settings.SMTP_PASSWORD
        self.smtp_from = settings.SMTP_FROM or self.smtp_username
        self.smtp_use_tls = settings.SMTP_USE_TLS
        
        # Log configuration
        if self.resend_api_key:
            logger.info(f"[EMAIL SERVICE] Resend configured: from={self.resend_from}")
        else:
            logger.info(f"[EMAIL SERVICE] SMTP configured: host={self.smtp_host}, port={self.smtp_port}, user={self.smtp_username}, from={self.smtp_from}")

    def send_password_reset_email(
        self,
        to_email: str,
        reset_link: str,
        to_name: Optional[str] = None,
        expiry_minutes: int = 30
    ) -> bool:
        """
        Envoie un email de réinitialisation de mot de passe.
        Essaie Resend API d'abord, fallback sur SMTP si Resend n'est pas configuré.

        Args:
            to_email: Email du destinataire
            to_name: Nom du destinataire (optionnel)
            reset_link: Lien de réinitialisation avec token
            expiry_minutes: Durée de validité du token en minutes

        Returns:
            True si l'email a été envoyé avec succès, False sinon
        """
        logger.debug(f"[EMAIL START] Sending password reset email to {to_email}")

        # Try Resend first
        if self.resend_api_key:
            if self._send_via_resend(to_email, reset_link, to_name, expiry_minutes):
                return True
            logger.warning("Resend failed, falling back to SMTP")

        # Fallback to SMTP
        return self._send_via_smtp(to_email, reset_link, to_name, expiry_minutes)

    def _send_via_resend(
        self,
        to_email: str,
        reset_link: str,
        to_name: Optional[str] = None,
        expiry_minutes: int = 30
    ) -> bool:
        """Envoie email via Resend API"""
        try:
            url = "https://api.resend.com/emails"
            
            # Prepare email content
            html_content = self._generate_html_content(reset_link, to_name, expiry_minutes)
            text_content = self._generate_text_content(reset_link, to_name, expiry_minutes)
            
            response = requests.post(
                url,
                headers={
                    "Authorization": f"Bearer {self.resend_api_key}",
                    "Content-Type": "application/json"
                },
                json={
                    "from": self.resend_from,
                    "to": [to_email],
                    "subject": "Réinitialisation de votre mot de passe - TELNET Dashboard",
                    "text": text_content,
                    "html": html_content
                },
                timeout=30
            )
            
            if response.status_code == 200:
                logger.info(f"Password reset email sent successfully to {to_email} via Resend")
                return True
            else:
                logger.error(f"Resend API error: {response.status_code} - {response.text}")
                return False
        except Exception as e:
            logger.error(f"Failed to send email via Resend: {e}", exc_info=True)
            return False

    def _send_via_smtp(
        self,
        to_email: str,
        reset_link: str,
        to_name: Optional[str] = None,
        expiry_minutes: int = 30
    ) -> bool:
        """Envoie email via SMTP (fallback)"""
        logger.debug(f"[SMTP START] Sending password reset email to {to_email}")

        if not self.smtp_host or not self.smtp_port or not self.smtp_username or not self.smtp_password:
            logger.error("SMTP configuration incomplete. Cannot send email.")
            return False

        html_content = self._generate_html_content(reset_link, to_name, expiry_minutes)
        text_content = self._generate_text_content(reset_link, to_name, expiry_minutes)

        try:
            message = MIMEMultipart('alternative')
            message["From"] = self.smtp_from
            message["To"] = to_email
            message["Subject"] = "Réinitialisation de votre mot de passe - TELNET Dashboard"
            
            part1 = MIMEText(text_content, 'plain')
            message.attach(part1)
            
            part2 = MIMEText(html_content, 'html')
            message.attach(part2)

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

    def _generate_html_content(self, reset_link: str, to_name: Optional[str], expiry_minutes: int) -> str:
        """Génère le contenu HTML de l'email"""
        return f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Réinitialisation de votre mot de passe</title>
    <style>
        body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
        .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
        .button {{ display: inline-block; padding: 12px 24px; background-color: #007bff; color: white; text-decoration: none; border-radius: 4px; }}
        .footer {{ margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #666; font-size: 12px; }}
    </style>
</head>
<body>
    <div class="container">
        <p>Bonjour {to_name if to_name else ''},</p>
        <p>Vous avez demandé à réinitialiser le mot de passe de votre compte TELNET Dashboard.</p>
        <p>Veuillez cliquer sur le bouton ci-dessous pour réinitialiser votre mot de passe :</p>
        <p><a href="{reset_link}" class="button">Réinitialiser mon mot de passe</a></p>
        <p>Ou copiez et collez ce lien dans votre navigateur :</p>
        <p style="word-break: break-all; color: #666;">{reset_link}</p>
        <p>Ce lien expirera dans {expiry_minutes} minutes.</p>
        <p>Si vous n'avez pas demandé cette réinitialisation, veuillez ignorer cet e-mail.</p>
        <div class="footer">
            <p>Cordialement,<br>L'équipe TELNET Dashboard</p>
        </div>
    </div>
</body>
</html>"""

    def _generate_text_content(self, reset_link: str, to_name: Optional[str], expiry_minutes: int) -> str:
        """Génère le contenu texte de l'email"""
        return f"""
        Bonjour {to_name if to_name else ''},

        Vous avez demandé à réinitialiser le mot de passe de votre compte TELNET Dashboard.

        Veuillez cliquer sur le lien ci-dessous pour réinitialiser votre mot de passe :
        {reset_link}

        Ce lien expirera dans {expiry_minutes} minutes.

        Si vous n'avez pas demandé cette réinitialisation, veuillez ignorer cet e-mail.

        Cordialement,
        L'équipe TELNET Dashboard
        """

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
        """
        Envoie un email de contact depuis la landing page.
        Utilise Resend API avec fallback SMTP.
        """
        logger.debug(f"[CONTACT EMAIL] Sending contact email from {email} (name: {name})")

        # Try Resend first
        if self.resend_api_key:
            if self._send_contact_via_resend(name, email, subject, message):
                return True
            logger.warning("Resend failed for contact email, falling back to SMTP")

        # Fallback to SMTP
        return self._send_contact_via_smtp(name, email, subject, message)

    def _send_contact_via_resend(
        self,
        name: str,
        email: str,
        subject: str,
        message: str
    ) -> bool:
        """Envoie email de contact via Resend API"""
        try:
            url = "https://api.resend.com/emails"
            
            # Prepare email content
            html_content = self._generate_contact_html(name, email, subject, message)
            text_content = self._generate_contact_text(name, email, subject, message)
            
            response = requests.post(
                url,
                headers={
                    "Authorization": f"Bearer {self.resend_api_key}",
                    "Content-Type": "application/json"
                },
                json={
                    "from": self.resend_from,
                    "to": [self.resend_from],  # Envoyer à l'admin
                    "subject": f"[Contact TELNET] {subject} - de {name}",
                    "text": text_content,
                    "html": html_content
                },
                timeout=30
            )
            
            if response.status_code == 200:
                logger.info(f"Contact email sent successfully from {email} via Resend")
                return True
            else:
                logger.error(f"Resend API error for contact: {response.status_code} - {response.text}")
                return False
        except Exception as e:
            logger.error(f"Failed to send contact email via Resend: {e}", exc_info=True)
            return False

    def _send_contact_via_smtp(
        self,
        name: str,
        email: str,
        subject: str,
        message: str
    ) -> bool:
        """Envoie email de contact via SMTP (fallback)"""
        logger.debug(f"[SMTP CONTACT] Sending contact email from {email}")

        if not self.smtp_host or not self.smtp_port or not self.smtp_username or not self.smtp_password:
            logger.error("SMTP configuration incomplete. Cannot send contact email.")
            return False

        html_content = self._generate_contact_html(name, email, subject, message)
        text_content = self._generate_contact_text(name, email, subject, message)

        try:
            message = MIMEMultipart('alternative')
            message["From"] = self.smtp_from
            message["To"] = self.smtp_from  # Envoyer à l'admin
            message["Subject"] = f"[Contact TELNET] {subject} - de {name}"
            
            part1 = MIMEText(text_content, 'plain')
            message.attach(part1)
            
            part2 = MIMEText(html_content, 'html')
            message.attach(part2)

            logger.debug(f"[SMTP MESSAGE] Contact message created, from={self.smtp_from}, to={self.smtp_from}")

            with smtplib.SMTP(self.smtp_host, self.smtp_port) as server:
                if self.smtp_use_tls:
                    server.starttls()
                server.login(self.smtp_username, self.smtp_password)
                server.send_message(message)

            logger.info(f"Contact email sent successfully from {email} via SMTP")
            return True
        except Exception as e:
            logger.error(f"Failed to send contact email from {email} via SMTP: {e}", exc_info=True)
            return False

    def _generate_contact_html(self, name: str, email: str, subject: str, message: str) -> str:
        """Génère le contenu HTML de l'email de contact"""
        return f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Nouveau message de contact - TELNET Dashboard</title>
    <style>
        body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
        .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
        .header {{ background: #1A56FF; color: white; padding: 20px; border-radius: 8px 8px 0 0; }}
        .content {{ background: #f8f9fa; padding: 20px; border-radius: 0 0 8px 8px; }}
        .field {{ margin-bottom: 10px; }}
        .label {{ font-weight: bold; color: #1A56FF; }}
        .footer {{ margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #666; font-size: 12px; }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h2>Nouveau message de contact</h2>
        </div>
        <div class="content">
            <div class="field">
                <span class="label">Nom :</span> {name}
            </div>
            <div class="field">
                <span class="label">Email :</span> {email}
            </div>
            <div class="field">
                <span class="label">Sujet :</span> {subject}
            </div>
            <div class="field">
                <span class="label">Message :</span>
                <p style="white-space: pre-wrap;">{message}</p>
            </div>
        </div>
        <div class="footer">
            <p>Ce message a été envoyé depuis la landing page TELNET Dashboard.</p>
            <p>Cordialement,<br>L'équipe TELNET Dashboard</p>
        </div>
    </div>
</body>
</html>"""

    def _generate_contact_text(self, name: str, email: str, subject: str, message: str) -> str:
        """Génère le contenu texte de l'email de contact"""
        return f"""
Nouveau message de contact depuis TELNET Dashboard

Nom : {name}
Email : {email}
Sujet : {subject}

Message :
{message}

---
Ce message a été envoyé depuis la landing page TELNET Dashboard.
"""


# Instance singleton pour réutilisation
_email_service: Optional[EmailService] = None


def get_email_service() -> EmailService:
    """Retourne l'instance singleton du service email"""
    global _email_service
    if _email_service is None:
        _email_service = EmailService()
    return _email_service
