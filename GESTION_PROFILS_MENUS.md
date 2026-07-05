# Gestion des Profils et Menus

## 📋 Résumé Exécutif (Pour les Responsables)

### 🎯 Pourquoi cette gestion est importante

**Problème**: Comment gérer les droits d'accès aux menus de l'application de manière flexible et personnalisée?

**Solution**: Système de profils personnalisables avec gestion fine des droits d'accès aux menus.

**Bénéfices**:
- ✅ **Profils personnalisés**: Création de profils personnalisés pour différents types d'utilisateurs
- ✅ **Gestion fine des menus**: Association précise des menus accessibles pour chaque profil
- **✅ **Fallback automatique**: Si pas de profil, mapping automatique rôle → profil par défaut
- ✅ **Super Admin**: Accès total à tous les menus par définition
- ✅ **Multi-tenant**: Profils partagés entre tenants (auth_db) avec synchronisation

### 🔍 Analogie Simple

Imaginez un système de badges d'accès:
- **Sans profils**: Tous les utilisateurs ont les mêmes droits (trop rigide)
- **Avec profils**: Chaque utilisateur a un badge personnalisé avec ses droits spécifiques
- **Fallback**: Si pas de badge, le système attribue un badge par défaut selon le rôle (ex: Site Manager → badge "Site Manager")

**Exemple**: Un site_manager peut avoir accès uniquement aux menus de gestion de site, tandis qu'un viewer peut avoir accès aux menus d'analytics.

---

## 🔄 Architecture Gestion Profils et Menus

```
┌─────────────────────────────────────────────────────────────────┐
│              AUTH_DB (Base de Données Partagée)                        │
│  - Table profile: Profils personnalisés (name, description)          │
│  - Table profile_menu_item: Associations profils ↔ menus (has_access)     │
│  - Partagé entre tous les tenants (isolation des profils)              │
└──────────────────────┬──────────────────────────────────────────────┘
                       │ Profils partagés
                       ↓
┌─────────────────────────────────────────────────────────────────┐
│              TENANT DB (Base de Données Spécifique)                      │
│  - Table profile: Métadonnées profils (name, description)          │
│  - Table profile_menu_item: Associations profils ↔ menus (has_access)     │
│  - Table menu_item: Menus de l'application (label, route, icon)       │
│  - Données métier: developers, sites, projets, KPIs, extractions      │
└──────────────────────┬──────────────────────────────────────────────┘
                       │ Menus spécifiques
                       ↓
┌─────────────────────────────────────────────────────────────────┐
│              Frontend (Sidebar)                                             │
│  - Charge les menus accessibles depuis API /menu-items/active        │
│  - Affiche uniquement les menus accessibles selon le profil de l'utilisateur│
│  - Fallback automatique si pas de profil personnalisé                     │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🎯 ÉTAPE 1: Modèle Profile

### Fichier: `src/backend/app/models/profile.py`

**Objectif**: Définir le modèle Profile pour la gestion des profils d'accès aux menus

#### 1.1 Profile (lignes 15-59)
```python
class Profile(Base):
    """
    Profil d'accès aux menus.
    
    Un profil définit un ensemble de droits d'accès aux menus de l'application.
    Les utilisateurs sont associés à un profil via AppUser.profile_id.
    """
    
    __tablename__ = "profile"
    
    id = Column(Integer, primary_key=True)
    name = Column(String(100), unique=True, nullable=False, index=True)
    description = Column(String(500), nullable=True)
    
    # Timestamps
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    
    # ── Relations ────────────────────────────────────────────────────────────
    menu_items = relationship(
        "ProfileMenuItem",
        back_populates="profile",
        cascade="all, delete-orphan",
    )
    
    users = relationship(
        "AppUser",
        back_populates="profile",
        foreign_keys="AppUser.profile_id",
    )
    
    # ── Index ────────────────────────────────────────────────────────────────
    __table_args__ = (
        Index("idx_profile_name", "name"),
    )
```

**Logique**:
- **name**: Nom unique du profil (ex: "Super Admin", "Site Manager", "Viewer")
- **description**: Description du profil (ex: "Accès total", "Accès limité au site")
- **Relations**: Relations avec ProfileMenuItem (menus) et AppUser (utilisateurs)
- **Cascade**: Suppression automatique des associations si profil supprimé

---

## 🎯 ÉTAPE 2: Modèle ProfileMenuItem

### Fichier: `src/backend/app/models/profile_menu_item.py`

**Objectif**: Définir la liaison many-to-many entre Profile et MenuItem

#### 2.1 ProfileMenuItem (lignes 14-56)
```python
class ProfileMenuItem(Base):
    """
    Liaison entre Profile et MenuItem.
    
    Table d'association many-to-many avec un champ has_access pour
    définir si un profil a accès à un menu spécifique.
    """
    
    __tablename__ = "profile_menu_item"
    
    profile_id = Column(
        Integer,
        ForeignKey("profile.id", ondelete="CASCADE"),
        primary_key=True,
        nullable=False,
    )
    menu_item_id = Column(
        Integer,
        ForeignKey("menu_item.id", ondelete="CASCADE"),
        primary_key=True,
        nullable=False,
    )
    
    # Indique si le profil a accès à ce menu
    has_access = Column(Boolean, default=False, nullable=False)
    
    # ── Relations ────────────────────────────────────────────────────────────
    profile = relationship(
        "Profile",
        back_populates="menu_items",
    )
    menu_item = relationship(
        "MenuItem",
        back_populates="profile_associations",
    )
    
    # ── Index ───────────────────────────────────────────────────────────────
    __table_args__ = (
        Index("idx_profilemenu_profile", "profile_id"),
        Index("idx_profilemenu_menu", "menu_item_id"),
        Index("idx_profilemenu_access", "profile_id", "has_access"),
    )
```

**Logique**:
- **M2M**: Relation many-to-many entre Profile et MenuItem
- **has_access**: Booléen indiquant si le profil a accès à ce menu
- **CASCADE**: Suppression automatique si profil ou menu supprimé
- **Composite PK**: Clé primaire composite (profile_id, menu_item_id)

---

## 🎯 ÉTAPE 3: Repository Profile

### Fichier: `src/backend/app/repositories/profile_repository.py`

**Objectif**: Opérations CRUD sur les profils

#### 3.1 get_menu_items_with_access (lignes 35-100)
```python
def get_menu_items_with_access(self, db: Session, profile_id: int) -> List[dict]:
    """
    Récupère tous les menus avec leur statut d'accès pour un profil.
    
    Le profil "Super Admin" a TOUJOURS accès à tous les menus actifs.
    
    Args:
        db: Session SQLAlchemy
        profile_id: ID du profil
        
    Returns:
        Liste de dictionnaires {menu_item, has_access}
    """
    # Récupérer le profil pour vérifier si c'est Super Admin
    profile = db.query(Profile).filter(Profile.id == profile_id).first()
    is_super_admin = profile and profile.name == "Super Admin"
    
    # Récupérer tous les menus actifs
    all_menus = db.query(MenuItem).filter(MenuItem.is_active == True).order_by(MenuItem.order_index).all()
    
    # Pour Super Admin, tous les menus sont accessibles
    if is_super_admin:
        result = []
        for menu in all_menus:
            result.append({
                "menu_item": {
                    "id": menu.id,
                    "label": menu.label,
                    "route": menu.route,
                    "icon": menu.icon,
                    "parent_id": menu.parent_id,
                    "order_index": menu.order_index,
                    "is_active": menu.is_active,
                    "created_at": menu.created_at.isoformat() if menu.created_at else None,
                    "updated_at": menu.updated_at.isoformat() if menu.updated_at else None,
                },
                "has_access": True  # Super Admin a toujours accès
            })
        return result
    
    # Pour les autres profils, utiliser les accès stockés en base
    existing_access = db.query(ProfileMenuItem).filter(
        ProfileMenuItem.profile_id == profile_id
    ).all()
    
    # Créer un mapping menu_item_id -> has_access
    access_map = {access.menu_item_id: access.has_access for access in existing_access}
    
    # Construire la réponse avec des dictionnaires sérialisables
    result = []
    for menu in all_menus:
        result.append({
            "menu_item": {
                "id": menu.id,
                "label": menu.label,
                "route": menu.route,
                "icon": menu.icon,
                "parent_id": menu.parent_id,
                "order_index": menu.order_index,
                "is_active": menu.is_active,
                "created_at": menu.created_at.isoformat() if menu.created_at else None,
                "updated_at": menu.updated_at.isoformat() if menu.updated_at else None,
            },
            "has_access": access_map.get(menu.id, False)
        })
    
    return result
```

**Logique**:
- **Super Admin**: Si profil = "Super Admin", tous les menus accessibles (has_access = True)
- **Mapping**: Crée un mapping menu_item_id → has_access depuis les associations existantes
- **Fallback**: Si pas d'association, has_access = False
- **Sérialisation**: Retourne des dictionnaires sérialisables pour l'API

#### 3.2 get_accessible_menus_for_user (lignes 151-181)
```python
def get_accessible_menus_for_user(self, db: Session, profile_id: Optional[int]) -> List[MenuItem]:
    """
    Récupère les menus accessibles pour un profil donné.
    
    Args:
        db: Session SQLAlchemy
        profile_id: ID du profil (None = pas de profil personnalisé)
        
    Returns:
        Liste des MenuItem accessibles
    """
    if profile_id is None:
        # Pas de profil personnalisé : retourner tous les menus actifs
        return db.query(MenuItem).filter(MenuItem.is_active == True).order_by(MenuItem.order_index).all()
    
    # Récupérer les menus avec has_access = True pour ce profil
    accessible_ids = db.query(ProfileMenuItem.menu_item_id).filter(
        ProfileMenuItem.profile_id == profile_id,
        ProfileMenuItem.has_access == True
    ).all()
    
    accessible_ids = [id[0] for id in accessible_ids]
    
    if not accessible_ids:
        return []
    
    return db.query(MenuItem).filter(
        MenuItem.id.in_(accessible_ids),
        MenuItem.is_active == True
    ).order_by(MenuItem.order_index).all()
```

**Logique**:
- **Pas de profil**: Si profile_id=None, retourne tous les menus actifs
- **Filtrage**: Filtre les menus avec has_access = True pour le profil
- **Optimisation**: Utilise IN clause pour performance
- **Tri**: Trie par order_index pour l'affichage ordonné

---

## 🎯 ÉTAPE 4: Service Profile

### Fichier: `src/backend/app/services/admin/profile_service.py`

**Objectif**: Orchestrateur la logique métier pour les profils

#### 4.1 batch_update_menu_access (lignes 58-76)
```python
def batch_update_menu_access(self, db: Session, profile_id: int, menu_access_list: List[dict]):
    """
    Met à jour les accès d'un profil en lot.
    
    Le profil "Super Admin" ne peut pas être modifié car il a accès à tous les menus par définition.
    
    Raises:
        ValueError: Si on tente de modifier les accès du profil Super Admin
    """
    # Vérifier si c'est le profil Super Admin
    profile = self.get_by_id(db, profile_id)
    if profile and profile.name == "Super Admin":
        raise ValueError(
            "Le profil Super Admin a accès à tous les menus automatiquement. "
            "Les modifications ne sont pas autorisées."
        )
    
    self.profile_repo.batch_update_menu_access(db, profile_id, menu_access_list)
```

**Logique**:
- **Protection Super Admin**: Empêche la modification du profil "Super Admin"
- **Batch update**: Met à jour les accès en lot pour performance
- **Validation**: Vérifie que le profil existe avant modification

#### 4.2 get_accessible_menus_for_user (lignes 77-88)
```python
def get_accessible_menus_for_user(self, db: Session, profile_id: Optional[int]) -> List[MenuItem]:
    """
    Récupère les menus accessibles pour un utilisateur donné.
    
    Args:
        db: Session SQLAlchemy
        profile_id: ID du profil de l'utilisateur (None = pas de profil personnalisé)
        
    Returns:
        Liste des MenuItem accessibles
    """
    return self.profile_repo.get_accessible_menus_for_user(db, profile_id)
```

**Logique**:
- **Délégation**: Délègue au repository pour la logique d'accès
- **profile_id=None**: Si pas de profil, retourne tous les menus actifs
- **profile_id!=None**: Si profil personnalisé, retourne les menus accessibles

---

## 🎯 ÉTAPE 5: API Router Profiles

### Fichier: `src/backend/app/api/routers/profiles.py`

**Objectif**: Exposer les endpoints API pour la gestion des profils

#### 5.1 get_all_profiles (lignes 24-40)
```python
@router.get("/", response_model=list[ProfileResponse])
def get_all_profiles(
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """
    Récupère tous les profils.
    
    Accès : super_admin uniquement
    """
    if current_user.role != UserRoleEnum.super_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accès réservé aux super admins"
        )
    
    return profile_service.get_all(db)
```

**Logique**:
- **Accès restreint**: Seul super_admin peut voir tous les profils
- **GET /profiles**: Récupère tous les profils
- **ProfileService**: Délègue au service métier

#### 5.2 create_profile (lignes 70-87)
```python
@router.post("/", response_model=ProfileResponse, status_code=status.HTTP_201_CREATED)
def create_profile(
    profile_data: ProfileCreate,
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """
    Crée un nouveau profil.
    
    Accès : super_admin uniquement
    """
    if current_user.role != UserRoleEnum.super_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accès réservé aux super admins"
        )
    
    return profile_service.create(db, profile_data)
```

**Logique**:
- **Accès restreint**: Seul super_admin peut créer des profils
- **POST /profiles**: Crée un nouveau profil
- **ProfileService**: Délègue au service métier

#### 5.3 update_profile_menu_items (lignes 170-198)
```python
@router.put("/{profile_id}/menu-items", status_code=status.HTTP_200_OK)
def update_profile_menu_items(
    profile_id: int,
    menu_access_data: ProfileMenuItemBatchUpdate,
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """
    Met à jour les accès d'un profil aux menus en lot.
    
    Accès : super_admin uniquement
    """
    if current_user.role != UserRoleEnum.super_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accès réservé aux super admins"
        )
    
    profile = profile_service.get_by_id(db, profile_id)
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profil non trouvé"
        )
    
    menu_access_list = [item.model_dump() for item in menu_access_data.menu_items]
    profile_service.batch_update_menu_access(db, profile_id, menu_access_list)
    
    return {"message": "Accès mis à jour avec succès"}
```

**Logique**:
- **Accès restreint**: Seul super_admin peut modifier les accès
- **PUT /profiles/{profile_id}/menu-items**: Met à jour les accès en lot
- **Batch update**: Utilise batch_update_menu_access pour performance

---

## 🎯 ÉTAPE 6: API Router Menu Items

### Fichier: `src/backend/app/api/routers/menu_items.py`

**Objectif**: Exposer les endpoints API pour la gestion des menus

#### 6.1 get_active (lignes 55-129)
```python
@router.get("/active", response_model=list[MenuItemResponse])
def get_active_menu_items(
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """
    Récupère les menus actifs accessibles à l'utilisateur selon son profil.
    
    Priorité :
      1. super_admin → tous les menus
      2. profile_id explicite → menus du profil
      3. profile_id=NULL → cherche le profil par défaut selon le nom du rôle
      4. Sinon → liste vide (aucune restriction implicite)
    
    Accès : Tous les rôles (pour affichage sidebar)
    """
    from app.repositories.profile_menu_item_repository import ProfileMenuItemRepository
    from app.repositories.menu_item_repository import MenuItemRepository
    from app.models.profile import Profile

    menu_item_repo = MenuItemRepository()
    profile_menu_repo = ProfileMenuItemRepository()

    # 1. super_admin → accès total
    if current_user.role == UserRoleEnum.super_admin:
        return menu_item_service.get_active_only(db)

    # Déterminer le profile_id effectif dans la base du tenant
    effective_profile_id = None
    profile_name = None

    # 2. Résoudre le nom du profil dans la base globale d'authentification (auth_db)
    if current_user.profile_id:
        from app.database.session import get_auth_session
        from app.models.profile import Profile as AuthProfile
        auth_db = get_auth_session()
        try:
            auth_prof = auth_db.query(AuthProfile).filter(AuthProfile.id == current_user.profile_id).first()
            if auth_prof:
                profile_name = auth_prof.name
        finally:
            auth_db.close()

    # 3. Chercher le profil du même nom dans la base de données courante (db)
    if profile_name:
        tenant_profile = db.query(Profile).filter(Profile.name == profile_name).first()
        if tenant_profile:
            effective_profile_id = tenant_profile.id

    # 4. Fallback par défaut selon le rôle de l'utilisateur
    if not effective_profile_id:
        # Mapping rôle technique → nom du profil par défaut
        ROLE_TO_PROFILE_NAME = {
            UserRoleEnum.site_manager:    "Site Manager",
            UserRoleEnum.team_lead:       "Team Lead",
            UserRoleEnum.project_manager: "Project Manager",
            UserRoleEnum.developer:       "Developer",
            UserRoleEnum.viewer:          "Viewer",
        }
        default_profile_name = ROLE_TO_PROFILE_NAME.get(current_user.role)
        if default_profile_name:
            default_profile = db.query(Profile).filter(
                Profile.name == default_profile_name
            ).first()
            if default_profile:
                effective_profile_id = default_profile.id

    # 5. Filtrer par profil effectif
    if effective_profile_id:
        accessible_menu_ids = profile_menu_repo.get_accessible_menu_ids(db, effective_profile_id)
        all_active_menus = menu_item_repo.get_active_only(db)
        return [menu for menu in all_active_menus if menu.id in accessible_menu_ids]

    # 6. Aucun profil trouvé → retourner liste vide (sécurité par défaut)
    return []
```

**Logique**:
- **super_admin**: Accès total à tous les menus actifs
- **profile_id explicite**: Utilise le profil personnalisé de l'utilisateur
- **Fallback auth_db**: Cherche le profil par nom dans auth_db (partagé)
- **Fallback tenant**: Cherche le profil par nom dans tenant
- **Fallback rôle**: Mapping rôle → profil par défaut (ex: site_manager → "Site Manager")
- **Filtrage**: Filtre les menus accessibles selon le profil effectif

---

## 🎯 ÉTAPE 7: Association Profil ↔ Utilisateur

### Fichier: `src/backend/app/models/app_user.py`

**Objectif**: Définir l'association entre AppUser et Profile

#### 7.1 AppUser (lignes 89-96)
```python
    # ✅ AJOUT : FK vers Profile (pour la gestion des menus)
    # NULL signifie qu'aucun profil personnalisé n'est assigné
    # Dans ce cas, les droits sont déterminés par le rôle technique uniquement
    profile_id = Column(
        Integer,
        ForeignKey("profile.id", ondelete="SET NULL"),
        nullable=True,
    )
```

**Logique**:
- **profile_id**: FK vers Profile (nullable)
- **NULL**: Pas de profil personnalisé, droits déterminés par rôle technique
- **SET NULL**: Si profil supprimé, profile_id devient NULL (fallback vers rôle)

#### 7.2 Relation (lignes 147-152)
```python
    # ✅ AJOUT : Relation vers Profile (gestion des menus)
    profile = relationship(
        "Profile",
        back_populates="users",
        foreign_keys=[profile_id],
    )
```

**Logique**:
- **Relation**: Relation avec app_user.profile_id
- **back_populates**: back_populates="users" dans Profile

---

## 🎯 ÉTAPE 8: Association Profil ↔ Menu

### Fichier: `src/backend/app/models/profile_menu_item.py`

**Objectif**: Définir la liaison many-to-many entre Profile et MenuItem

#### 8.1 ProfileMenuItem (lignes 24-35)
```python
    profile_id = Column(
        Integer,
        ForeignKey("profile.id", ondelete="CASCADE"),
        primary_key=True,
        nullable=False,
    )
    menu_item_id = Column(
        Integer,
        ForeignKey("menu_item.id", ondelete="CASCADE"),
        primary_key=True,
        nullable=False,
    )
    
    # Indique si le profil a accès à ce menu
    has_access = Column(Boolean, default=False, nullable=False)
```

**Logique**:
- **Composite PK**: Clé primaire composite (profile_id, menu_item_id)
- **CASCADE**: Suppression automatique si profil ou menu supprimé
- **has_access**: Booléen indiquant si le profil a accès à ce menu

---

## 🎯 ÉTAPE 9: Scénario Concret - Création Profil "Viewer"

### Contexte
- Création d'un profil "Viewer" avec accès limité aux menus d'analytics

**Processus**:

#### 1. Création du profil
```python
POST /profiles
{
    "name": "Viewer",
    "description": "Accès limité aux menus d'analytics"
}
```

#### 2. Traitement backend
```python
# Backend: profiles.py
profile_service.create(db, profile_data)
# Crée le profil dans tenant
```

#### 3. Association menus au profil
```python
PUT /profiles/{profile_id}/menu-items
{
    "menu_items": [
        {"menu_item_id": 1, "has_access": true},
        {"menu_item_id": 2, "has_access": true},
        {"menu_item_id": 3, "has_access": false}
    ]
}
```

#### 4. Traitement backend
```python
# Backend: profiles.py
profile_service.batch_update_menu_access(db, profile_id, menu_access_list)
# Met à jour les accès en lot
```

#### 5. Association profil à utilisateur
```python
PUT /users/{user_id}
{
    "profile_id": 1
}
```

#### 6. Résultat
```python
{
    "id": 1,
    "name": "Viewer",
    "description": "Accès limité aux menus d'analytics",
    "menu_items": [
        {"menu_item_id": 1, "has_access": true},
        {"menu_item_id": 2, "has_access": true},
        {"menu_item_id": 3, "has_access": false}
    ]
}
```

---

## 🎯 ÉTAPE 10: Scénario Concret - Fallback Rôle → Profil

### Contexte
- Utilisateur avec rôle "viewer" mais pas de profil personnalisé
- Fallback automatique vers profil "Viewer" par défaut

**Processus**:

#### 1. Utilisateur sans profil
```python
# AppUser
{
    "id": 1,
    "email": "jean.dupont@example.com",
    "role": "viewer",
    "profile_id": null  # Pas de profil personnalisé
}
```

#### 2. Chargement menus actifs
```python
GET /menu-items/active
# Backend: menu_items.py
# current_user.role = "viewer"
# current_user.profile_id = null

# Fallback selon le rôle
ROLE_TO_PROFILE_NAME = {
    UserRoleEnum.viewer: "Viewer",
}
default_profile_name = "Viewer"
default_profile = db.query(Profile).filter(Profile.name == "Viewer").first()
effective_profile_id = default_profile.id

# Filtrage par profil effectif
accessible_menu_ids = profile_menu_repo.get_accessible_menu_ids(db, effective_profile_id)
all_active_menus = menu_item_repo.get_active_only(db)
return [menu for menu in all_active_menus if menu.id in accessible_menu_ids]
```

#### 3. Résultat
```python
{
    "id": 1,
    "label": "Analytics",
    "route": "/analytics",
    "icon": "ri-bar-chart-line",
    "parent_id": null,
    "order_index": 1,
    "is_active": true
}
```

---

## 🎯 ÉTAPE 11: Scénario Concret - Super Admin

### Contexte
- Utilisateur avec rôle "super_admin"
- Accès total à tous les menus

**Processus**:

#### 1. Utilisateur super_admin
```python
# AppUser
{
    "id": 1,
    "email": "admin@example.com",
    "role": "super_admin",
    "profile_id": null
}
```

#### 2. Chargement menus actifs
```python
GET /menu-items/active
# Backend: menu_items.py
# current_user.role = "super_admin"
# current_user.profile_id = null

# 1. super_admin → accès total
if current_user.role == UserRoleEnum.super_admin:
    return menu_item_service.get_active_only(db)
```

#### 3. Résultat
```python
[
    {
        "id": 1,
        "label": "Dashboard",
        "route": "/dashboard",
        "icon": "ri-dashboard-line",
        "parent_id": null,
        "order_index": 1,
        "is_active": true
    },
    {
        "id": 2,
        "label": "Analytics",
        "route": "/analytics",
        "icon": "ri-bar-chart-line",
        "parent_id": null,
        "order_index": 2,
        "is_active": true
    },
    {
        "id": 3,
        "label": "Admin",
        "route": "/admin",
        "icon": "ri-settings-3-line",
        "parent_id": null,
        "order_index": 3,
        "is_active": true
    }
]
```

---

## 🎓 Points Clés pour la Soutenance

### 1. Architecture Multi-Tenant
- **auth_db**: Base de données partagée pour les profils (partagé entre tenants)
- **tenant_db**: Base de données spécifique par tenant pour les menus (spécifiques)
- **Synchronisation**: Les profils sont partagés mais les menus sont spécifiques par tenant

### 2. Profils Personnalisés
- **Profile**: Définit les droits d'accès aux menus
- **ProfileMenuItem**: Association M2M entre Profile et MenuItem
- **has_access**: Booléen indiquant si le profil a accès à un menu
- **Cascade**: Suppression automatique des associations si profil ou menu supprimé

### 3. Fallback Automatique
- **Mapping rôle → profil**: Mapping automatique rôle technique → nom de profil par défaut
- **Fallback auth_db**: Cherche le profil par nom dans auth_db (partagé)
- **Fallback tenant**: Cherche le profil par nom dans tenant
- **Fallback rôle**: Si aucun profil trouvé, retourne tous les menus actifs (sécurité)

### 4. Protection Super Admin
- **Accès total**: Super Admin a accès à tous les menus par définition
- **Protection**: Empêche la modification du profil "Super Admin"
- **Validation**: Vérifie que le profil existe avant modification

### 5. API Restreintes
- **GET /profiles**: Accès super_admin uniquement
- **POST /profiles**: Accès super_admin uniquement
- **PUT /profiles/{profile_id}/menu-items**: Accès super_admin uniquement
- **GET /menu-items/active**: Accès tous les rôles (pour affichage sidebar)

---

## 🚀 Conclusion

Le système de gestion des profils et menus est basé sur:

1. **Architecture multi-tenant**: Base auth_db partagée pour profils, bases tenant spécifiques pour menus
2. **Profils personnalisés**: Création de profils personnalisés avec gestion fine des droits d'accès
3 **Fallback automatique**: Mapping automatique rôle → profil par défaut si pas de profil personnalisé
4. **Protection Super Admin**: Empêche la modification du profil "Super Admin" (accès total par définition)
5. **API restreintes**: Accès super_admin uniquement pour la gestion, accès tous les rôles pour l'affichage

Chaque utilisateur est associé à un profil (profile_id dans AppUser), ce profil définit quels menus sont accessibles. Si pas de profil personnalisé, le système utilise un fallback automatique selon le rôle technique (ex: viewer → "Viewer"). Le Super Admin a accès à tous les menus par définition, sans besoin de profil personnalisé.
