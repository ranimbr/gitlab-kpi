"""
core/email_service.py

Service d'envoi d'emails pour la réinitialisation de mot de passe.
Utilise SendGrid API (preferred) ou SMTP (fallback).
"""
import logging
from typing import Optional

from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail, Attachment, FileContent, FileName, FileType, Disposition

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class EmailService:
    """Service d'envoi d'emails via SendGrid API (preferred) ou SMTP (fallback)"""

    def __init__(self):
        self.sendgrid_api_key = settings.SENDGRID_API_KEY
        self.sendgrid_from = settings.SENDGRID_FROM_EMAIL or settings.SMTP_USERNAME or "noreply@telnet.com"
        
        # SMTP fallback settings
        self.smtp_host = settings.SMTP_HOST
        self.smtp_port = settings.SMTP_PORT
        self.smtp_username = settings.SMTP_USERNAME
        self.smtp_password = settings.SMTP_PASSWORD
        self.smtp_from = settings.SMTP_FROM or self.smtp_username
        self.smtp_use_tls = settings.SMTP_USE_TLS
        
        logger.info(f"[EMAIL SERVICE] SendGrid enabled: {bool(self.sendgrid_api_key)}, from={self.sendgrid_from}")

    def send_password_reset_email(
        self,
        to_email: str,
        reset_link: str,
        to_name: Optional[str] = None,
        expiry_minutes: int = 30
    ) -> bool:
        """
        Envoie un email de réinitialisation de mot de passe via SendGrid API.

        Args:
            to_email: Email du destinataire
            to_name: Nom du destinataire (optionnel)
            reset_link: Lien de réinitialisation avec token
            expiry_minutes: Durée de validité du token en minutes

        Returns:
            True si l'email a été envoyé avec succès, False sinon
        """
        try:
            logger.info(f"[SENDGRID START] Sending password reset email to {to_email}")
            
            # Préparer le contenu HTML
            html_content = f"""
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Réinitialisation de mot de passe - TELNET Dashboard</title>
    <style>
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #1a1a1a;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 40px 20px;
        }}
        .container {{
            max-width: 600px;
            margin: 0 auto;
            background: white;
            border-radius: 16px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            overflow: hidden;
        }}
        .header {{
            background: linear-gradient(135deg, #1A56FF 0%, #00D4FF 100%);
            padding: 40px 30px;
            text-align: center;
        }}
        .logo {{
            font-size: 28px;
            font-weight: 700;
            color: white;
            letter-spacing: 1px;
            text-transform: uppercase;
        }}
        .logo-icon {{
            font-size: 48px;
            margin-bottom: 10px;
        }}
        .content {{
            padding: 40px 30px;
        }}
        .greeting {{
            font-size: 18px;
            color: #333;
            margin-bottom: 20px;
            font-weight: 500;
        }}
        .message {{
            color: #555;
            margin-bottom: 30px;
            line-height: 1.8;
        }}
        .button-container {{
            text-align: center;
            margin: 30px 0;
        }}
        .button {{
            display: inline-block;
            background: linear-gradient(135deg, #1A56FF 0%, #00D4FF 100%);
            color: white;
            padding: 16px 40px;
            text-decoration: none;
            border-radius: 50px;
            font-weight: 600;
            font-size: 16px;
            box-shadow: 0 4px 15px rgba(26, 86, 255, 0.4);
            transition: all 0.3s ease;
        }}
        .button:hover {{
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(26, 86, 255, 0.6);
        }}
        .link-section {{
            background: #f8f9fa;
            padding: 20px;
            border-radius: 8px;
            margin: 20px 0;
        }}
        .link-label {{
            font-size: 14px;
            color: #666;
            margin-bottom: 10px;
            font-weight: 500;
        }}
        .link-url {{
            background: white;
            padding: 12px;
            border-radius: 6px;
            word-break: break-all;
            font-size: 12px;
            color: #1A56FF;
            font-family: 'Courier New', monospace;
            border: 1px solid #e0e0e0;
        }}
        .warning {{
            background: linear-gradient(135deg, #fff3cd 0%, #ffe69c 100%);
            border-left: 4px solid #ffc107;
            padding: 20px;
            margin: 25px 0;
            border-radius: 8px;
        }}
        .warning-icon {{
            font-size: 20px;
            margin-right: 10px;
        }}
        .warning-text {{
            color: #856404;
            font-size: 14px;
            line-height: 1.6;
        }}
        .divider {{
            height: 1px;
            background: linear-gradient(90deg, transparent, #e0e0e0, transparent);
            margin: 30px 0;
        }}
        .footer {{
            text-align: center;
            padding: 30px;
            background: #f8f9fa;
            border-top: 1px solid #e0e0e0;
        }}
        .footer-text {{
            color: #666;
            font-size: 13px;
            margin-bottom: 10px;
        }}
        .footer-copyright {{
            color: #999;
            font-size: 12px;
        }}
        .security-badge {{
            display: inline-flex;
            align-items: center;
            background: #e8f4fd;
            color: #1A56FF;
            padding: 8px 16px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 600;
            margin: 10px 0;
        }}
        .security-icon {{
            margin-right: 8px;
        }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo-icon">🔐</div>
            <div class="logo">TELNET Dashboard</div>
        </div>
        
        <div class="content">
            <h2 style="color: #1A56FF; margin-top: 0; font-size: 24px; margin-bottom: 20px;">Réinitialisation de mot de passe</h2>
            
            <p class="greeting">Bonjour {to_name or 'Utilisateur'},</p>
            
            <p class="message">
                Vous avez demandé la réinitialisation de votre mot de passe pour le <strong>TELNET Dashboard</strong>.
                Pour sécuriser votre compte, nous vous invitons à définir un nouveau mot de passe.
            </p>
            
            <div class="button-container">
                <a href="{reset_link}" class="button">Réinitialiser mon mot de passe →</a>
            </div>
            
            <div class="link-section">
                <p class="link-label">Ou copiez ce lien dans votre navigateur :</p>
                <div class="link-url">{reset_link}</div>
            </div>
            
            <div class="warning">
                <span class="warning-icon">⚠️</span>
                <span class="warning-text">
                    <strong>Important :</strong> Ce lien est valide pendant <strong>{expiry_minutes} minutes</strong> uniquement.
                    Pour des raisons de sécurité, il ne peut être utilisé qu'une seule fois.
                </span>
            </div>
            
            <div class="security-badge">
                <span class="security-icon">🛡️</span>
                Email sécurisé par TELNET
            </div>
            
            <p style="color: #666; font-size: 14px; margin-top: 25px;">
                Si vous n'avez pas demandé cette réinitialisation, ignorez cet email et votre mot de passe restera inchangé.
            </p>
        </div>
        
        <div class="divider"></div>
        
        <div class="footer">
            <p class="footer-text">Cordialement,<br><strong>L'équipe TELNET</strong></p>
            <p class="footer-copyright">© 2026 TELNET HOLDING · Tous droits réservés</p>
        </div>
    </div>
</body>
</html>
            """.strip()

            # Text content (plain text fallback)
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

            # Créer l'email SendGrid
            message = Mail(
                from_email=self.sendgrid_from,
                to_emails=to_email,
                subject="Réinitialisation de votre mot de passe - TELNET Dashboard",
                plain_text_content=text_content,
                html_content=html_content
            )
            
            logger.info(f"[SENDGRID MESSAGE] Message created, from={self.sendgrid_from}, to={to_email}")
            
            # Envoyer via SendGrid API
            if self.sendgrid_api_key:
                sg = SendGridAPIClient(self.sendgrid_api_key)
                response = sg.send(message)
                
                logger.info(f"[SENDGRID SENT] Response status: {response.status_code}")
                if response.status_code in [200, 202]:
                    logger.info(f"Password reset email sent to {to_email}")
                    return True
                else:
                    logger.error(f"SendGrid returned status {response.status_code}: {response.body}")
                    return False
            else:
                logger.warning("[SENDGRID] No API key configured, skipping email send")
                return False

        except Exception as e:
            logger.error(f"Failed to send password reset email to {to_email}: {e}")
            return False

    def send_password_changed_notification(
        self,
        to_email: str,
        to_name: Optional[str] = None
    ) -> bool:
        """Not implemented for SendGrid - unused in current flow"""
        logger.warning("send_password_changed_notification not implemented for SendGrid")
        return False

    def send_contact_email(
        self,
        name: str,
        email: str,
        subject: str,
        message: str
    ) -> bool:
        """Not implemented for SendGrid - unused in current flow"""
        logger.warning("send_contact_email not implemented for SendGrid")
        return False


# Instance singleton pour réutilisation
_email_service: Optional[EmailService] = None


def get_email_service() -> EmailService:
    """Retourne l'instance singleton du service email"""
    global _email_service
    if _email_service is None:
        _email_service = EmailService()
    return _email_service
