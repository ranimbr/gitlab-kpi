# Documentation Section Contact - Landing Page

## Table des matières
1. [Vue d'ensemble](#vue-densemble)
2. [Architecture du composant](#architecture-du-composant)
3. [Structure du formulaire](#structure-du-formulaire)
4. [Intégration API](#intégration-api)
5. [Styles et design system](#styles-et-design-system)
6. [Animations et interactions](#animations-et-interactions)
7. [Accessibilité](#accessibilité)
8. [Maintenance et évolution](#maintenance-et-évolution)

---

## Vue d'ensemble

La section **Contact** de la landing page TELNET permet aux utilisateurs de contacter l'équipe pour toute question concernant les solutions KPI GitLab. Elle combine :

- **Informations de contact** : Email, site web, siège social
- **Formulaire interactif** : Collecte des messages utilisateurs
- **Design premium** : Style cinématique cohérent avec le reste de la page
- **Intégration API** : Communication avec le backend FastAPI

**Fichier source** : `dataCollection/src/frontend/src/pages/LandingPage.jsx` (lignes 318-470)

---

## Architecture du composant

### Définition du composant

```jsx
function ContactSection() {
  const [formData, setFormData] = useState({ 
    name: '', 
    email: '', 
    subject: '', 
    message: '' 
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState(null);
  const containerRef = useRef(null);
  const triggered = useTimelineReveal(containerRef);
  const titleRef = useRef(null);
  // ...
}
```

### États du composant

| État | Type | Description |
|------|------|-------------|
| `formData` | Object | Stocke les valeurs des champs du formulaire |
| `isSubmitting` | Boolean | Indique si une soumission est en cours |
| `submitStatus` | String\|null | État de la soumission : `'success'`, `'error'` ou `null` |
| `triggered` | Boolean | Déclencheur d'animation via IntersectionObserver |

### Hooks personnalisés

#### `useTimelineReveal(containerRef)`
- **But** : Détecte quand la section entre dans le viewport
- **Seuil** : 8% de visibilité
- **Effet** : Déclenche les animations d'entrée en cascade

#### `useRef`
- `containerRef` : Référence au conteneur de la section
- `titleRef` : Référence au titre pour animation GSAP

---

## Structure du formulaire

### Layout global

```
┌─────────────────────────────────────────────────────────┐
│                    Section Contact                        │
│  ┌─────────────────────┬──────────────────────────────┐  │
│  │   Contact Info      │      Contact Form             │  │
│  │                     │                              │  │
│  │  📧 Email           │  ┌────────────────────────┐  │  │
│  │  🌐 Site Web        │  │ Nom: [__________]      │  │  │
│  │  📍 Siège Social    │  │ Email: [__________]   │  │  │
│  │                     │  │ Sujet: [__________]   │  │  │
│  │                     │  │ Message: [__________] │  │  │
│  │                     │  │ [Envoyer le message →]│  │  │
│  │                     │  └────────────────────────┘  │  │
│  └─────────────────────┴──────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### Grille CSS

```css
.contact-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;  /* 2 colonnes égales */
  gap: 40px;
  margin-top: 48px;
}
```

### Informations de contact

#### Structure JSX

```jsx
<div className="contact-info">
  <div className="contact-info-item">
    <div className="contact-icon">
      <Envelope size={24} weight="thin" />
    </div>
    <div>
      <div className="contact-label">Email</div>
      <div className="contact-value">contact@telnet.com</div>
    </div>
  </div>
  {/* ... autres items ... */}
</div>
```

#### Items disponibles

| Icône | Label | Valeur | Library |
|-------|-------|--------|---------|
| Envelope | Email | contact@telnet.com | @phosphor-icons/react |
| Globe | Site Web | www.telnet.com | @phosphor-icons/react |
| MapPin | Siège Social | Tunisie | @phosphor-icons/react |

### Champs du formulaire

| Champ | Type | Requis | Placeholder | Validation |
|-------|------|--------|-------------|------------|
| name | text | Oui | "Votre nom" | HTML5 required |
| email | email | Oui | "Votre email" | HTML5 required + type email |
| subject | text | Oui | "Sujet" | HTML5 required |
| message | textarea | Oui | "Votre message" | HTML5 required, 5 lignes |

#### Exemple d'implémentation

```jsx
<div className="form-group">
  <input
    type="email"
    name="email"
    placeholder="Votre email"
    value={formData.email}
    onChange={(e) => setFormData({...formData, email: e.target.value})}
    required
    className="form-input"
  />
</div>
```

---

## Intégration API

### Endpoint backend

```
POST http://localhost:8000/api/v1/contact/
```

### En-têtes HTTP

```javascript
headers: { 
  'Content-Type': 'application/json' 
}
```

### Corps de la requête

```json
{
  "name": "Jean Dupont",
  "email": "jean.dupont@example.com",
  "subject": "Question sur les KPIs",
  "message": "Bonjour, je souhaiterais..."
}
```

### Fonction de soumission

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

### Gestion des réponses

| Statut HTTP | Action | Message utilisateur |
|-------------|--------|---------------------|
| 200-299 | Succès | "✓ Votre message a été envoyé avec succès..." |
| 400-599 | Erreur | "✗ Erreur lors de l'envoi. Veuillez réessayer." |
| Network error | Erreur | "✗ Erreur lors de l'envoi. Veuillez réessayer." |

### Backend correspondant

**Fichier** : `dataCollection/src/backend/app/api/routers/contact.py`

Ce fichier FastAPI définit le routeur `/api/v1/contact/` qui traite les soumissions du formulaire.

---

## Styles et design system

### Variables CSS utilisées

```css
:root {
  --bl: #1A56FF;      /* Bleu principal */
  --cy: #00D4FF;      /* Cyan accent */
  --gn: #10B981;      /* Vert succès */
  --bg: #030810;      /* Background sombre */
  --br: rgba(255, 255, 255, 0.06);  /* Bordure subtile */
  --tx: #E2E8F0;      /* Texte principal */
  --mt: rgba(255, 255, 255, 0.38);  /* Texte muted */
  --fb: 'Plus Jakarta Sans', sans-serif;  /* Font body */
  --fm: 'DM Mono', monospace;           /* Font mono */
  --ease: cubic-bezier(0.16, 1, 0.3, 1);  /* Easing */
}
```

### Section `.lp-contact`

```css
.lp-contact {
  position: relative;
  z-index: 10;
  padding: 110px 0 120px;
  background:
    radial-gradient(ellipse 80% 60% at 80% 20%, rgba(0,212,255,0.04) 0%, transparent 60%),
    radial-gradient(ellipse 60% 50% at 20% 80%, rgba(26,86,255,0.06) 0%, transparent 60%),
    linear-gradient(180deg, rgba(2,6,18,0.0) 0%, rgba(4,10,28,1) 15%, rgba(4,10,28,1) 85%, rgba(2,6,18,0.0) 100%);
  border-top: 1px solid rgba(0,212,255,0.12);
}
```

**Caractéristiques** :
- Background avec dégradés radiaux cyan/bleu
- Grille de lignes overlay (60px)
- Bordure supérieure cyan
- Masque radial pour effet de vignette

### Items d'information `.contact-info-item`

```css
.contact-info-item {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px;
  background: rgba(4, 10, 28, 0.8);
  border: 1px solid rgba(0,212,255,0.18);
  border-radius: 16px;
  transition: all 0.3s var(--ease);
}

.contact-info-item:hover {
  border-color: rgba(0,212,255,0.4);
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0,212,255,0.15);
}
```

**Interactions** :
- Translation vers le haut (-2px)
- Glow cyan intensifié
- Transition fluide (0.3s)

### Icône `.contact-icon`

```css
.contact-icon {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, rgba(0,212,255,0.15), rgba(26,86,255,0.1));
  border-radius: 12px;
  color: var(--cy);
}
```

### Formulaire `.contact-form`

```css
.contact-form {
  background: rgba(4, 10, 28, 0.9);
  border: 1px solid rgba(0,212,255,0.18);
  border-radius: 16px;
  padding: 32px;
  box-shadow: 0 0 40px rgba(0,212,255,0.08);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}
```

**Effets** :
- Glass morphism avec backdrop blur
- Glow cyan subtil
- Coins arrondis (16px)

### Inputs `.form-input` / `.form-textarea`

```css
.form-input,
.form-textarea {
  width: 100%;
  background: rgba(3, 8, 16, 0.8);
  border: 1px solid rgba(0,212,255,0.2);
  border-radius: 10px;
  padding: 14px 18px;
  color: #fff;
  font-family: var(--fb);
  font-size: 14px;
  transition: all 0.3s var(--ease);
  outline: none;
}

.form-input:focus,
.form-textarea:focus {
  border-color: var(--cy);
  box-shadow: 0 0 0 3px rgba(0, 212, 255, 0.1);
  background: rgba(3, 8, 16, 0.95);
}
```

**États** :
- **Default** : Bordure cyan subtile
- **Focus** : Bordure cyan + glow + background assombri

### Bouton `.contact-submit`

```css
.contact-submit {
  width: 100%;
  background: linear-gradient(135deg, #1A56FF 0%, #00D4FF 100%);
  color: #fff;
  font-family: var(--fb);
  font-size: 15px;
  font-weight: 600;
  padding: 16px 32px;
  border-radius: 10px;
  border: none;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 0 6px 28px rgba(0, 212, 255, 0.3), 0 0 0 1px rgba(0, 212, 255, 0.15);
  letter-spacing: 0.01em;
}

.contact-submit:hover:not(:disabled) {
  background: linear-gradient(135deg, #1446D4 0%, #00B4D8 100%);
  transform: translateY(-2px);
  box-shadow: 0 8px 32px rgba(0, 212, 255, 0.45), 0 0 0 1px rgba(0, 212, 255, 0.2);
}

.contact-submit:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
```

**États** :
- **Default** : Gradient bleu-cyan
- **Hover** : Translation + glow intensifié
- **Disabled** : Opacité réduite

### Messages de feedback

#### Success

```css
.contact-success {
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.2), rgba(16, 185, 129, 0.1));
  border: 1px solid rgba(16, 185, 129, 0.4);
  color: #10B981;
  box-shadow: 0 4px 20px rgba(16, 185, 129, 0.2);
}
```

#### Error

```css
.contact-error {
  background: linear-gradient(135deg, rgba(239, 68, 68, 0.2), rgba(239, 68, 68, 0.1));
  border: 1px solid rgba(239, 68, 68, 0.4);
  color: #EF4444;
  box-shadow: 0 4px 20px rgba(239, 68, 68, 0.2);
}
```

---

## Animations et interactions

### Animation d'entrée du titre

```javascript
useEffect(() => {
  if (triggered && titleRef.current) {
    gsap.fromTo(titleRef.current, 
      { opacity: 0, y: 30 },
      { opacity: 1, y: 0, duration: 0.8, ease: "power3.out", delay: 0.2 }
    );
  }
}, [triggered]);
```

**Effet** : Translation verticale + fade-in avec easing cubique

### Animation des éléments en cascade

```jsx
<TimelineItem as="div" animNum={1} triggered={triggered} className="lp-sh">
  {/* Titre */}
</TimelineItem>
<TimelineItem as="div" animNum={2} triggered={triggered} className="contact-grid">
  {/* Grille contact */}
</TimelineItem>
```

**Délai** : Chaque élément apparaît avec un délai de 0.25s × (numéro d'animation - 1)

### Animation des messages de feedback

```css
@keyframes message-in {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

**Durée** : 0.5s avec easing cubique

---

## Accessibilité

### Attributs HTML

- **required** : Sur tous les champs obligatoires
- **type="email"** : Validation native pour l'email
- **placeholder** : Indicateurs visuels pour chaque champ
- **aria-label** : Non implémenté (à ajouter pour amélioration)

### Navigation clavier

- **Tab** : Navigation entre les champs
- **Enter** : Soumission du formulaire
- **Focus visible** : Bordure cyan + glow sur les inputs

### Contraste

Les couleurs respectent les standards WCAG AA :
- Texte sur fond sombre : Contraste > 4.5:1
- Bordures et accents : Visibles sans être trop lumineux

### Améliorations recommandées

1. **Ajouter des labels explicites** :
```jsx
<label htmlFor="email" className="sr-only">Votre email</label>
<input id="email" type="email" ... />
```

2. **Messages d'erreur ARIA** :
```jsx
{submitStatus === 'error' && (
  <div role="alert" aria-live="polite" className="contact-message contact-error">
    ✗ Erreur lors de l'envoi...
  </div>
)}
```

3. **Indicateur de chargement ARIA** :
```jsx
<button 
  type="submit" 
  className="contact-submit"
  disabled={isSubmitting}
  aria-busy={isSubmitting}
>
  {isSubmitting ? 'Envoi en cours...' : 'Envoyer le message →'}
</button>
```

---

## Maintenance et évolution

### Configuration de l'endpoint

**Actuellement hardcoded** :
```javascript
const response = await fetch('http://localhost:8000/api/v1/contact/', {
```

**Recommandation** : Utiliser une variable d'environnement
```javascript
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const response = await fetch(`${API_URL}/api/v1/contact/`, {
```

### Validation côté client

**Actuellement** : Validation HTML5 native

**Recommandation** : Ajouter validation personnalisée
```javascript
const validateForm = (data) => {
  const errors = {};
  
  if (!data.name.trim()) errors.name = 'Le nom est requis';
  if (!data.email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
    errors.email = 'Email invalide';
  }
  if (!data.subject.trim()) errors.subject = 'Le sujet est requis';
  if (!data.message.trim()) errors.message = 'Le message est requis';
  
  return errors;
};
```

### Rate limiting

**Recommandation** : Ajouter une limite de soumission
```javascript
const [lastSubmitTime, setLastSubmitTime] = useState(null);

const handleSubmit = async (e) => {
  e.preventDefault();
  
  // Vérifier rate limit (1 soumission par 30 secondes)
  if (lastSubmitTime && Date.now() - lastSubmitTime < 30000) {
    setSubmitStatus('error');
    return;
  }
  
  setLastSubmitTime(Date.now());
  // ... reste de la logique
};
```

### Internationalisation

**Actuellement** : Textes en français uniquement

**Recommandation** : Utiliser i18n
```javascript
import { useTranslation } from 'react-i18next';

function ContactSection() {
  const { t } = useTranslation();
  
  return (
    <input
      placeholder={t('contact.form.name.placeholder')}
      // ...
    />
  );
}
```

### Tests recommandés

1. **Test unitaire** : Validation du formulaire
2. **Test d'intégration** : Communication API
3. **Test E2E** : Flux complet de soumission
4. **Test accessibilité** : Navigation clavier et lecteur d'écran

---

## Résumé technique

| Aspect | Détails |
|--------|---------|
| **Framework** | React 18 |
| **Styling** | CSS-in-JS (template string) |
| **Animations** | GSAP + CSS transitions |
| **Icons** | @phosphor-icons/react |
| **API** | Fetch native |
| **Backend** | FastAPI (contact.py) |
| **Responsive** | Grid layout (mobile-first) |
| **Accessibilité** | HTML5 + améliorations recommandées |

---

## Points d'attention

### ✅ Forces
- Design cohérent avec le reste de la landing page
- Feedback utilisateur clair (success/error)
- Animations fluides et professionnelles
- Code bien structuré et lisible

### ⚠️ Points à améliorer
- Endpoint URL hardcoded (utiliser .env)
- Validation côté client minimale
- Pas de rate limiting
- Accessibilité basique (améliorations possibles)
- Pas de gestion des erreurs réseau détaillée

### 🚀 Évolutions possibles
1. Ajouter un CAPTCHA pour éviter le spam
2. Implémenter l'upload de fichiers
3. Ajouter un sélecteur de type de demande
4. Intégrer un système de tickets (Zendesk, Freshdesk)
5. Ajouter des analytics sur les soumissions

---

**Document version** : 1.0  
**Dernière mise à jour** : 26 juin 2026  
**Auteur** : Documentation technique TELNET
