# Flux Backend → Frontend - Section Contact

## Table des matières
1. [Vue d'ensemble du flux](#vue-densemble-du-flux)
2. [Frontend : Soumission du formulaire](#frontend-soumission-du-formulaire)
3. [Backend : Réception et validation](#backend-réception-et-validation)
4. [Backend : Envoi de l'email](#backend-envoi-de-lemail)
5. [Frontend : Gestion de la réponse](#frontend-gestion-de-la-réponse)
6. [Diagramme de séquence](#diagramme-de-séquence)
7. [Configuration requise](#configuration-requise)
8. [Dépannage](#dépannage)

---

## Vue d'ensemble du flux

```
┌─────────────────────────────────────────────────────────────────┐
│                     FLUX COMPLET CONTACT                         │
└─────────────────────────────────────────────────────────────────┘

1. FRONTEND (React)
   ├─ Utilisateur remplit le formulaire
   ├─ Validation HTML5 (required, type email)
   └─ Soumission via fetch()

2. RESEAU (HTTP)
   ├─ POST http://localhost:8000/api/v1/contact/
   ├─ Content-Type: application/json
   └─ Body: { name, email, subject, message }

3. BACKEND (FastAPI)
   ├─ Routeur contact.py reçoit la requête
   ├─ Validation Pydantic (ContactRequest)
   ├─ Appel du service email
   └─ Envoi SMTP

4. SMTP SERVER
   ├─ Connexion sécurisée (TLS)
   ├─ Authentification
   └─ Envoi de l'email

5. BACKEND → FRONTEND
   ├─ Réponse JSON (success/error)
   └─ Code HTTP (200/500)

6. FRONTEND
   ├─ Affichage du feedback utilisateur
   └─ Reset du formulaire si succès
```

---

## Frontend : Soumission du formulaire

### Localisation du code
**Fichier** : `dataCollection/src/frontend/src/pages/LandingPage.jsx` (lignes 335-360)

### Fonction `handleSubmit`

```javascript
const handleSubmit = async (e) => {
  e.preventDefault();
  setIsSubmitting(true);
  setSubmitStatus(null);

  try {
    const response = await fetch('http://localhost:8000/api/v1/contact/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData)
    });

    const data = await response.json();

    if (response.ok) {
      setSubmitStatus('success');
      setFormData({ name: '', email: '', subject: '', message: '' });
    } else {
      setSubmitStatus('error');
    }
  } catch (error) {
    setSubmitStatus('error');
  } finally {
    setIsSubmitting(false);
  }
};
```

### Étapes détaillées

1. **Prévention du comportement par défaut**
   ```javascript
   e.preventDefault();
   ```
   Empêche le rechargement de la page

2. **Initialisation de l'état de soumission**
   ```javascript
   setIsSubmitting(true);
   setSubmitStatus(null);
   ```
   - `isSubmitting = true` : Désactive le bouton, affiche "Envoi en cours..."
   - `submitStatus = null` : Efface les messages précédents

3. **Envoi de la requête HTTP**
   ```javascript
   const response = await fetch('http://localhost:8000/api/v1/contact/', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify(formData)
   });
   ```
   - **Méthode** : POST
   - **Endpoint** : `http://localhost:8000/api/v1/contact/`
   - **Headers** : Content-Type: application/json
   - **Body** : JSON.stringify(formData)

4. **Traitement de la réponse**
   ```javascript
   const data = await response.json();

   if (response.ok) {
     setSubmitStatus('success');
     setFormData({ name: '', email: '', subject: '', message: '' });
   } else {
     setSubmitStatus('error');
   }
   ```
   - **Succès (200-299)** : Affiche message succès, reset formulaire
   - **Erreur (400-599)** : Affiche message d'erreur

5. **Gestion des erreurs réseau**
   ```javascript
   catch (error) {
     setSubmitStatus('error');
   }
   ```
   Capture les erreurs de connexion, timeout, etc.

6. **Finalisation**
   ```javascript
   finally {
     setIsSubmitting(false);
   }
   ```
   Réactive le bouton quelle que soit l'issue

### Données envoyées

```json
{
  "name": "Jean Dupont",
  "email": "jean.dupont@example.com",
  "subject": "Question sur les KPIs",
  "message": "Bonjour, je souhaiterais savoir..."
}
```

---

## Backend : Réception et validation

### Localisation du code
**Fichier** : `dataCollection/src/backend/app/api/routers/contact.py`

### Définition du routeur

```python
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, EmailStr, Field
from typing import Optional

from app.core.email_service import get_email_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/contact", tags=["Contact"])
```

### Schéma de validation Pydantic

```python
class ContactRequest(BaseModel):
    """Schéma pour la requête de contact"""
    name: str = Field(..., min_length=2, max_length=100, description="Nom de l'expéditeur")
    email: EmailStr = Field(..., description="Email de l'expéditeur")
    subject: str = Field(..., min_length=3, max_length=200, description="Sujet du message")
    message: str = Field(..., min_length=10, max_length=2000, description="Contenu du message")
```

**Validations automatiques** :
- `name` : 2-100 caractères
- `email` : Format email valide (via EmailStr)
- `subject` : 3-200 caractères
- `message` : 10-2000 caractères

### Endpoint POST

```python
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
```

### Schéma de réponse

```python
class ContactResponse(BaseModel):
    """Schéma pour la réponse de contact"""
    message: str
    success: bool
```

### Flux de validation

```
Requête HTTP reçue
        ↓
Parsing JSON automatique (FastAPI)
        ↓
Validation Pydantic (ContactRequest)
        ↓
  ├─ Validations de type (str, EmailStr)
  ├─ Validations de longueur (min_length, max_length)
  └─ Validations de format (email)
        ↓
Si validation échoue → HTTP 422 (Validation Error)
        ↓
Si validation réussie → Exécution du handler
        ↓
Appel du service email
        ↓
Retour réponse JSON (ContactResponse)
```

### Réponses possibles

| Code HTTP | Scénario | Body JSON |
|-----------|----------|-----------|
| 200 | Succès | `{"message": "...", "success": true}` |
| 422 | Validation échouée | `{"detail": [...]}` |
| 500 | Erreur SMTP | `{"detail": "Une erreur est survenue..."}` |

---

## Backend : Envoi de l'email

### Localisation du code
**Fichier** : `dataCollection/src/backend/app/core/email_service.py` (lignes 403-610)

### Méthode `send_contact_email`

```python
def send_contact_email(
    self,
    name: str,
    email: str,
    subject: str,
    message: str
) -> bool:
    """
    Envoie un email de contact depuis le formulaire de la landing page.

    Args:
        name: Nom de l'expéditeur
        email: Email de l'expéditeur
        subject: Sujet du message
        message: Contenu du message

    Returns:
        True si l'email a été envoyé avec succès, False sinon
    """
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = f"Contact TELNET Dashboard: {subject}"
        msg["From"] = formataddr((name, email))
        msg["To"] = formataddr(("TELNET Dashboard", "stagepfegitlab1@gmail.com"))

        # Version texte brut
        text_content = f"""
Nouveau message de contact depuis TELNET Dashboard

Nom: {name}
Email: {email}
Sujet: {subject}

Message:
{message}

---
Envoyé depuis le formulaire de contact de la landing page TELNET Dashboard
        """.strip()

        # Version HTML
        html_content = f"""
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Contact TELNET Dashboard</title>
    <style>
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{
            font-family: -apple-system, BlinkSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
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
        /* ... styles CSS ... */
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo-icon">📧</div>
            <div class="logo">TELNET Dashboard</div>
        </div>
        
        <div class="content">
            <h2 style="color: #1A56FF; margin-top: 0; font-size: 24px; margin-bottom: 25px;">Nouveau message de contact</h2>
            
            <div class="section-title">Informations de contact</div>
            
            <div class="info-row">
                <span class="info-label">Nom:</span>
                <span class="info-value">{name}</span>
            </div>
            
            <div class="info-row">
                <span class="info-label">Email:</span>
                <span class="info-value">{email}</span>
            </div>
            
            <div class="info-row">
                <span class="info-label">Sujet:</span>
                <span class="info-value">{subject}</span>
            </div>
            
            <div class="section-title" style="margin-top: 25px;">Message</div>
            
            <div class="message-box">
                <div class="message-content">{message}</div>
            </div>
        </div>
        
        <div class="divider"></div>
        
        <div class="footer">
            <p class="footer-text">Envoyé depuis le formulaire de contact de la landing page</p>
            <p class="footer-copyright">© 2026 TELNET HOLDING · Tous droits réservés</p>
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
        
        logger.info(f"Contact email sent from {email} ({name})")
        return True

    except Exception as e:
        logger.error(f"Failed to send contact email from {email}: {e}")
        return False
```

### Étapes d'envoi SMTP

1. **Création du message multipart**
   ```python
   msg = MIMEMultipart("alternative")
   ```
   Permet d'envoyer à la fois texte brut et HTML

2. **Configuration des en-têtes**
   ```python
   msg["Subject"] = f"Contact TELNET Dashboard: {subject}"
   msg["From"] = formataddr((name, email))
   msg["To"] = formataddr(("TELNET Dashboard", "stagepfegitlab1@gmail.com"))
   ```
   - **Subject** : Préfixe + sujet utilisateur
   - **From** : Nom et email de l'expéditeur
   - **To** : Adresse de destination (hardcoded)

3. **Génération du contenu**
   - Version texte brut (fallback)
   - Version HTML (mise en forme)

4. **Attachement des parties**
   ```python
   part1 = MIMEText(text_content, "plain")
   part2 = MIMEText(html_content, "html")
   msg.attach(part1)
   msg.attach(part2)
   ```

5. **Connexion SMTP**
   ```python
   with smtplib.SMTP(self.smtp_host, self.smtp_port) as server:
       if self.smtp_use_tls:
           server.starttls()
       
       if self.smtp_username and self.smtp_password:
           server.login(self.smtp_username, self.smtp_password)
       
       server.send_message(msg)
   ```
   - Connexion au serveur SMTP
   - Activation TLS si configuré
   - Authentification si credentials fournis
   - Envoi du message

### Configuration SMTP

**Variables d'environnement** (dans `app/core/config.py`) :
```python
SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USERNAME = os.getenv("SMTP_USERNAME", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_FROM = os.getenv("SMTP_FROM", "noreply@telnet.com")
SMTP_USE_TLS = os.getenv("SMTP_USE_TLS", "true").lower() == "true"
```

### Email reçu

**Format** : Email HTML stylisé avec :
- Header gradient bleu-cyan
- Informations de contact structurées
- Message dans une box colorée
- Footer avec copyright

---

## Frontend : Réception de la réponse

### Traitement de la réponse HTTP

```javascript
const data = await response.json();

if (response.ok) {
  setSubmitStatus('success');
  setFormData({ name: '', email: '', subject: '', message: '' });
} else {
  setSubmitStatus('error');
}
```

### Cas de succès (HTTP 200)

```json
{
  "message": "Votre message a été envoyé avec succès. Nous vous répondrons dans les plus brefs délais.",
  "success": true
}
```

**Actions** :
1. `setSubmitStatus('success')` → Affiche message vert
2. `setFormData({...})` → Reset du formulaire
3. `setIsSubmitting(false)` → Réactive le bouton

### Cas d'erreur (HTTP 400-599)

```json
{
  "detail": "Une erreur est survenue lors de l'envoi de votre message. Veuillez réessayer."
}
```

**Actions** :
1. `setSubmitStatus('error')` → Affiche message rouge
2. `setIsSubmitting(false)` → Réactive le bouton
3. Formulaire **non** reset (utilisateur peut réessayer)

### Affichage du feedback

```jsx
{submitStatus === 'success' && (
  <div className="contact-message contact-success">
    ✓ Votre message a été envoyé avec succès. Notre équipe vous contactera dans les plus brefs délais.
  </div>
)}
{submitStatus === 'error' && (
  <div className="contact-message contact-error">
    ✗ Erreur lors de l'envoi. Veuillez réessayer.
  </div>
)}
```

### Styles de feedback

**Success** :
```css
.contact-success {
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.2), rgba(16, 185, 129, 0.1));
  border: 1px solid rgba(16, 185, 129, 0.4);
  color: #10B981;
  box-shadow: 0 4px 20px rgba(16, 185, 129, 0.2);
}
```

**Error** :
```css
.contact-error {
  background: linear-gradient(135deg, rgba(239, 68, 68, 0.2), rgba(239, 68, 68, 0.1));
  border: 1px solid rgba(239, 68, 68, 0.4);
  color: #EF4444;
  box-shadow: 0 4px 20px rgba(239, 68, 68, 0.2);
}
```

---

## Diagramme de séquence

```
┌─────────────┐         ┌──────────────┐         ┌─────────────┐         ┌──────────┐
│   Frontend  │         │   Backend    │         │ Email Service│        │   SMTP   │
│   (React)   │         │   (FastAPI)  │         │  (Python)   │        │  Server  │
└──────┬──────┘         └──────┬───────┘         └──────┬──────┘         └────┬─────┘
       │                       │                       │                    │
       │ 1. User fills form    │                       │                    │
       │──────────────────────→│                       │                    │
       │                       │                       │                    │
       │ 2. Submit form        │                       │                    │
       │──────────────────────→│                       │                    │
       │                       │                       │                    │
       │    POST /api/v1/contact/                      │                    │
       │    {name, email, subject, message}           │                    │
       │──────────────────────→│                       │                    │
       │                       │                       │                    │
       │                       │ 3. Validate request   │                    │
       │                       │──────────────────────→│                    │
       │                       │                       │                    │
       │                       │ 4. Validation OK      │                    │
       │                       │←──────────────────────│                    │
       │                       │                       │                    │
       │                       │ 5. Call send_contact_email()              │
       │                       │──────────────────────────────────────────→│
       │                       │                       │                    │
       │                       │                       │ 6. Connect SMTP    │
       │                       │                       │──────────────────→│
       │                       │                       │                    │
       │                       │                       │ 7. Login           │
       │                       │                       │──────────────────→│
       │                       │                       │                    │
       │                       │                       │ 8. Send email      │
       │                       │                       │──────────────────→│
       │                       │                       │                    │
       │                       │                       │ 9. Email sent      │
       │                       │                       │←──────────────────│
       │                       │                       │                    │
       │                       │ 10. Return success    │                    │
       │                       │←──────────────────────│                    │
       │                       │                       │                    │
       │ 11. Response 200      │                       │                    │
       │    {success: true}    │                       │                    │
       │←──────────────────────│                       │                    │
       │                       │                       │                    │
       │ 12. Show success msg  │                       │                    │
       │    Reset form         │                       │                    │
       │                       │                       │                    │
```

---

## Configuration requise

### Backend (.env)

```bash
# Configuration SMTP
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=votre-email@gmail.com
SMTP_PASSWORD=votre-app-password
SMTP_FROM=noreply@telnet.com
SMTP_USE_TLS=true
```

### Frontend (.env)

```bash
# URL de l'API backend
VITE_API_URL=http://localhost:8000
```

**Note** : Actuellement l'URL est hardcoded dans le frontend. Recommandation d'utiliser la variable d'environnement :

```javascript
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const response = await fetch(`${API_URL}/api/v1/contact/`, {
```

### CORS Configuration

**Backend** (`app/core/config.py`) :
```python
CORS_ORIGINS = [
    "http://localhost:5173",
    "http://localhost:3000",
    "https://votre-domaine.com"
]
```

---

## Dépannage

### Problème : Email non envoyé

**Symptôme** : Frontend affiche "Erreur lors de l'envoi"

**Diagnostic** :
1. Vérifier les logs backend : `logger.error(f"Failed to send contact email...")`
2. Vérifier la configuration SMTP
3. Tester la connexion SMTP manuellement

**Solution** :
```python
# Test SMTP manuel
import smtplib
try:
    with smtplib.SMTP("smtp.gmail.com", 587) as server:
        server.starttls()
        server.login("email@gmail.com", "password")
        print("SMTP OK")
except Exception as e:
    print(f"SMTP Error: {e}")
```

### Problème : Validation échoue

**Symptôme** : HTTP 422 Validation Error

**Causes possibles** :
- Nom < 2 caractères
- Email invalide
- Sujet < 3 caractères
- Message < 10 caractères

**Solution** : Ajouter validation frontend avant soumission

```javascript
const validateForm = (data) => {
  if (data.name.length < 2) return false;
  if (!data.email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) return false;
  if (data.subject.length < 3) return false;
  if (data.message.length < 10) return false;
  return true;
};
```

### Problème : CORS Error

**Symptôme** : Console affiche "CORS policy: No 'Access-Control-Allow-Origin' header"

**Solution** : Vérifier la configuration CORS dans le backend

```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### Problème : Timeout

**Symptôme** : Requête bloque sans réponse

**Causes possibles** :
- Serveur SMTP lent
- Network timeout
- Backend non démarré

**Solution** : Ajouter timeout dans le fetch

```javascript
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s

try {
  const response = await fetch(url, {
    signal: controller.signal,
    // ...
  });
  clearTimeout(timeoutId);
} catch (error) {
  if (error.name === 'AbortError') {
    setSubmitStatus('error');
  }
}
```

---

## Résumé technique

| Composant | Technologie | Rôle |
|-----------|-------------|------|
| **Frontend** | React 18 | Interface utilisateur, soumission formulaire |
| **HTTP Client** | Fetch API | Communication avec le backend |
| **Backend** | FastAPI | API REST, validation, orchestration |
| **Validation** | Pydantic | Schémas de données, validation automatique |
| **Email Service** | Python smtplib | Envoi d'emails via SMTP |
| **SMTP Server** | Gmail/Custom | Transmission des emails |
| **Format Email** | MIME multipart | Texte + HTML |

---

## Points d'attention

### ✅ Forces
- Validation robuste (frontend + backend)
- Email HTML stylisé professionnel
- Gestion d'erreurs complète
- Logs détaillés pour debugging
- Design cohérent avec la landing page

### ⚠️ Points à améliorer
- Endpoint URL hardcoded (utiliser .env)
- Pas de rate limiting
- Email destination hardcoded
- Pas de notification de réception à l'expéditeur
- Validation frontend minimale

### 🚨 Sécurité
- **SMTP credentials** : Stocker dans .env, jamais dans le code
- **Input sanitization** : Pydantic protège contre les injections
- **Rate limiting** : À implémenter pour éviter le spam
- **CAPTCHA** : Recommandé pour la production

---

**Document version** : 1.0  
**Dernière mise à jour** : 26 juin 2026  
**Auteur** : Documentation technique TELNET
