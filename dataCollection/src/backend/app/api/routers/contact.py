"""
api/routers/contact.py

Router pour le formulaire de contact de la landing page.
Utilise le service email existant pour envoyer les messages.
"""
import logging
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, EmailStr, Field
from typing import Optional

from app.core.email_service import get_email_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/contact", tags=["Contact"])


class ContactRequest(BaseModel):
    """Schéma pour la requête de contact"""
    name: str = Field(..., min_length=2, max_length=100, description="Nom de l'expéditeur")
    email: EmailStr = Field(..., description="Email de l'expéditeur")
    subject: str = Field(..., min_length=3, max_length=200, description="Sujet du message")
    message: str = Field(..., min_length=10, max_length=2000, description="Contenu du message")


class ContactResponse(BaseModel):
    """Schéma pour la réponse de contact"""
    message: str
    success: bool


@router.post("/", response_model=ContactResponse, status_code=200)
async def send_contact_email(request: ContactRequest):
    """
    Envoie un email de contact depuis le formulaire de la landing page.
    
    L'email est envoyé à l'adresse SMTP_FROM configurée dans .env.
    Utilise le service email existant avec la configuration SMTP.
    """
    try:
        email_service = get_email_service()
        
        # Envoyer l'email de contact
        email_sent = email_service.send_contact_email(
            name=request.name,
            email=request.email,
            subject=request.subject,
            message=request.message
        )
        
        if email_sent:
            logger.info(f"Contact email sent successfully from {request.email}")
            return ContactResponse(
                message="Votre message a été envoyé avec succès. Nous vous répondrons dans les plus brefs délais.",
                success=True
            )
        else:
            logger.error(f"Failed to send contact email from {request.email}")
            raise HTTPException(
                status_code=500,
                detail="Une erreur est survenue lors de l'envoi de votre message. Veuillez réessayer."
            )
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error in contact endpoint: {e}")
        raise HTTPException(
            status_code=500,
            detail="Une erreur inattendue est survenue. Veuillez réessayer."
        )
