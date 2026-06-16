"""
core/email_service.py

Service d'envoi d'emails pour la réinitialisation de mot de passe.
Utilise la configuration SMTP existante dans config.py.
"""
import logging
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.utils import formataddr
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
        self.smtp_from = settings.SMTP_FROM
        self.smtp_use_tls = settings.SMTP_USE_TLS

    def send_password_reset_email(
        self,
        to_email: str,
        reset_link: str,
        to_name: Optional[str] = None,
        expiry_minutes: int = 30
    ) -> bool:
        """
        Envoie un email de réinitialisation de mot de passe.

        Args:
            to_email: Email du destinataire
            to_name: Nom du destinataire (optionnel)
            reset_link: Lien de réinitialisation avec token
            expiry_minutes: Durée de validité du token en minutes

        Returns:
            True si l'email a été envoyé avec succès, False sinon
        """
        try:
            # Création du message multipart
            msg = MIMEMultipart("alternative")
            msg["Subject"] = "Réinitialisation de votre mot de passe - TELNET Dashboard"
            msg["From"] = formataddr(("TELNET Dashboard", self.smtp_from))
            msg["To"] = formataddr((to_name or "", to_email))

            # Version texte brut
            text_content = f"""
Bonjour {to_name or 'Utilisateur'},

Vous avez demandé la réinitialisation de votre mot de passe pour le TELNET Dashboard.

Cliquez sur le lien ci-dessous pour définir un nouveau mot de passe:
{reset_link}

Ce lien est valide pendant {expiry_minutes} minutes.

Si vous n'avez pas demandé cette réinitialisation, ignorez cet email.

Cordialement,
L'équipe TELNET
            """.strip()

            # Version HTML
            html_content = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }}
        .container {{ background: #f8f9fa; border-radius: 8px; padding: 30px; }}
        .header {{ text-align: center; margin-bottom: 30px; }}
        .logo {{ font-size: 24px; font-weight: bold; color: #1A56FF; }}
        .content {{ background: white; padding: 25px; border-radius: 8px; margin-bottom: 20px; }}
        .button {{ display: inline-block; background: linear-gradient(135deg, #1A56FF 0%, #00D4FF 100%); color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 20px 0; }}
        .footer {{ text-align: center; font-size: 12px; color: #666; }}
        .warning {{ background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 4px; }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">TELNET Dashboard</div>
        </div>
        
        <div class="content">
            <h2 style="color: #1A56FF; margin-top: 0;">Réinitialisation de mot de passe</h2>
            
            <p>Bonjour {to_name or 'Utilisateur'},</p>
            
            <p>Vous avez demandé la réinitialisation de votre mot de passe pour le TELNET Dashboard.</p>
            
            <p style="text-align: center;">
                <a href="{reset_link}" class="button">Réinitialiser mon mot de passe</a>
            </p>
            
            <p>Ou copiez ce lien dans votre navigateur:</p>
            <p style="background: #f0f0f0; padding: 10px; border-radius: 4px; word-break: break-all; font-size: 12px;">
                {reset_link}
            </p>
            
            <div class="warning">
                <strong>⚠️ Important:</strong> Ce lien est valide pendant {expiry_minutes} minutes.
            </div>
            
            <p>Si vous n'avez pas demandé cette réinitialisation, ignorez cet email et votre mot de passe restera inchangé.</p>
        </div>
        
        <div class="footer">
            <p>Cordialement,<br>L'équipe TELNET</p>
            <p>© 2026 TELNET HOLDING · Tous droits réservés</p>
        </div>
    </div>
</body>
</html>
            """.strip()

            # Attacher les deux versions
            part1 = MIMEText(text_content, "plain")
            part2 = MIMEText(html_content, "html")
            msg.attach(part1)
            msg.attach(part2)

            # Connexion SMTP et envoi
            with smtplib.SMTP(self.smtp_host, self.smtp_port) as server:
                if self.smtp_use_tls:
                    server.starttls()
                
                if self.smtp_username and self.smtp_password:
                    server.login(self.smtp_username, self.smtp_password)
                
                server.send_message(msg)
            
            logger.info(f"Password reset email sent to {to_email}")
            return True

        except Exception as e:
            logger.error(f"Failed to send password reset email to {to_email}: {e}")
            return False

    def send_password_changed_notification(
        self,
        to_email: str,
        to_name: Optional[str] = None
    ) -> bool:
        """
        Envoie une notification de confirmation de changement de mot de passe.

        Args:
            to_email: Email du destinataire
            to_name: Nom du destinataire (optionnel)

        Returns:
            True si l'email a été envoyé avec succès, False sinon
        """
        try:
            msg = MIMEMultipart("alternative")
            msg["Subject"] = "Votre mot de passe a été modifié - TELNET Dashboard"
            msg["From"] = formataddr(("TELNET Dashboard", self.smtp_from))
            msg["To"] = formataddr((to_name or "", to_email))

            # Version texte brut
            text_content = f"""
Bonjour {to_name or 'Utilisateur'},

Votre mot de passe pour le TELNET Dashboard a été modifié avec succès.

Si vous n'avez pas effectué ce changement, contactez immédiatement l'administrateur.

Cordialement,
L'équipe TELNET
            """.strip()

            # Version HTML
            html_content = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }}
        .container {{ background: #f8f9fa; border-radius: 8px; padding: 30px; }}
        .header {{ text-align: center; margin-bottom: 30px; }}
        .logo {{ font-size: 24px; font-weight: bold; color: #1A56FF; }}
        .content {{ background: white; padding: 25px; border-radius: 8px; margin-bottom: 20px; }}
        .success {{ background: #d4edda; border-left: 4px solid #28a745; padding: 15px; margin: 20px 0; border-radius: 4px; }}
        .warning {{ background: #f8d7da; border-left: 4px solid #dc3545; padding: 15px; margin: 20px 0; border-radius: 4px; }}
        .footer {{ text-align: center; font-size: 12px; color: #666; }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">TELNET Dashboard</div>
        </div>
        
        <div class="content">
            <h2 style="color: #10B981; margin-top: 0;">✓ Mot de passe modifié</h2>
            
            <p>Bonjour {to_name or 'Utilisateur'},</p>
            
            <p>Votre mot de passe pour le TELNET Dashboard a été modifié avec succès.</p>
            
            <div class="success">
                <strong>Opération réussie</strong>
            </div>
            
            <div class="warning">
                <strong>⚠️ Sécurité:</strong> Si vous n'avez pas effectué ce changement, contactez immédiatement l'administrateur.
            </div>
        </div>
        
        <div class="footer">
            <p>Cordialement,<br>L'équipe TELNET</p>
            <p>© 2026 TELNET HOLDING · Tous droits réservés</p>
        </div>
    </div>
</body>
</html>
            """.strip()

            part1 = MIMEText(text_content, "plain")
            part2 = MIMEText(html_content, "html")
            msg.attach(part1)
            msg.attach(part2)

            with smtplib.SMTP(self.smtp_host, self.smtp_port) as server:
                if self.smtp_use_tls:
                    server.starttls()
                
                if self.smtp_username and self.smtp_password:
                    server.login(self.smtp_username, self.smtp_password)
                
                server.send_message(msg)
            
            logger.info(f"Password changed notification sent to {to_email}")
            return True

        except Exception as e:
            logger.error(f"Failed to send password changed notification to {to_email}: {e}")
            return False


# Instance singleton pour réutilisation
_email_service: Optional[EmailService] = None


def get_email_service() -> EmailService:
    """Retourne l'instance singleton du service email"""
    global _email_service
    if _email_service is None:
        _email_service = EmailService()
    return _email_service
