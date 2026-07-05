# Gestion des Utilisateurs et Architecture Multi-Tenant

## 📋 Résumé Exécutif (Pour les Responsables)

### 🎯 Pourquoi cette gestion est importante

**Problème**: Comment gérer les utilisateurs avec des rôles différents (super_admin, site_manager, team_lead, viewer) et des accès multi-sites/multi-équipes dans une architecture multi-tenant?

**Solution**: Architecture multi-tenant avec base d'authentification partagée (auth_db) et bases de données tenant spécifiques pour les assignations.

**Bénéfices**:
- ✅ **Rôles granulaires**: 6 rôles différents pour des accès précis (super_admin, site_manager, project_manager, team_lead, viewer, developer)
- ✅ **Multi-sites**: Un utilisateur peut avoir accès à plusieurs sites (UserSiteAccess M2M)
- ✅ **Multi-équipes**: Un utilisateur peut avoir accès à plusieurs équipes (UserGroupAccess M2M)
- ✅ **Multi-projets**: Assignations de projets dans chaque base tenant
- ✅ **Architecture multi-tenant**: Base auth partagée + bases tenant spécifiques pour isolation des données
- ✅ **Contrôle d'accès**: Dépendances FastAPI pour vérifier les permissions par rôle

### 🔍 Analogie Simple

Imaginez un système d'entreprise avec plusieurs bureaux:
- **Sans multi-tenant**: Tous les bureaux partagent la même base de données (risque de mélange)
- **Avec multi-tenant**: Chaque bureau a sa propre base de données (isolation), mais les utilisateurs sont gérés de manière centralisée

**Exemple**: Un site_manager de Paris peut voir uniquement les données de Paris, mais un super_admin peut voir tous les sites.

---

## 🔄 Architecture Multi-Tenant

```
┌─────────────────────────────────────────────────────────────────┐
│              AUTH_DB (Base de Données Partagée)                        │
│  - Table app_user: Identifiants utilisateurs (email, login, password)  │
│  - Table role: Rôles dynamiques (code, name, permissions)          │
│  - Table profile: Profils personnalisés (menus, permissions)          │
│  - Partagée entre tous les tenants (isolation des identifiants)        │
└──────────────────────┬──────────────────────────────────────────────┘
                       │ Identifiants utilisateurs partagés
                       ↓
┌─────────────────────────────────────────────────────────────────┐
│              TENANT DB 1 (Base de Données Spécifique)                      │
│  - Table app_user: Métadonnées utilisateurs (email, login, role)      │
│  - Table user_site_access: Assignations multi-sites (M2M)              │
│  - Table user_group_access: Assignations multi-équipes (M2M)            │
│  - Table user_project_access: Assignations multi-projets (M2M)          │
│  - Données métier: developers, sites, projets, KPIs, extractions      │
└──────────────────────┬──────────────────────────────────────────────┘
                       │ Données métier isolées
                       ↓
┌─────────────────────────────────────────────────────────────────┐
│              TENANT DB 2 (Base de Données Spécifique)                      │
│  - Table app_user: Métadonnées utilisateurs (email, login, role)      │
│  - Table user_site_access: Assignations multi-sites (M2M)              │
│  - Table user_group_access: Assignations multi-équipes (M2M)            │
│  - Table user_project_access: Assignations multi-projets (M2M)          │
│  - Données métier: developers, sites, projets, KPIs, extractions      │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🎯 ÉTAPE 1: Modèle Utilisateur (AppUser)

### Fichier: `src/backend/app/models/app_user.py`

**Objectif**: Définir le modèle utilisateur avec rôles et FKs pour les assignations

#### 1.1 UserRoleEnum (lignes 44-51)
```python
class UserRoleEnum(str, enum.Enum):
    # 6 rôles granulaires (remplace admin/user)
    super_admin     = "super_admin"    # Accès total
    site_manager    = "site_manager"   # Accès limité à son site
    project_manager = "project_manager" # Accès limité à ses projets assignés
    team_lead       = "team_lead"      # Accès limité à son groupe d'équipe
    viewer          = "viewer"         # Accès flexible (sites, équipes, projets combinés)
    developer       = "developer"      # Lecture seule de ses propres KPIs
```

**Logique**:
- **super_admin**: Accès total à tout (gestion sites, devs, KPIs, extractions)
- **site_manager**: Accès limité à son site (filtré par site_id)
- **project_manager**: Accès limité à ses projets assignés
- **team_lead**: Accès limité à son groupe d'équipe (filtré par group_id)
- **viewer**: Accès flexible (sites, équipes, projets combinés)
- **developer**: Lecture seule de ses propres KPIs

#### 1.2 AppUser (lignes 54-105)
```python
class AppUser(Base):
    __tablename__ = "app_user"

    id              = Column(Integer, primary_key=True, autoincrement=True)
    email           = Column(String(255), unique=True, nullable=False)
    login           = Column(String(100), unique=True, nullable=True)
    name            = Column(String(255), nullable=True)
    hashed_password = Column(String(255), nullable=False)
    role            = Column(Enum(UserRoleEnum), default=UserRoleEnum.developer, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)

    # FK vers Site (pour les site_managers)
    site_id = Column(Integer, ForeignKey("site.id", ondelete="SET NULL"), nullable=True)

    # FK vers DeveloperGroup (pour les team_leads)
    group_id = Column(Integer, ForeignKey("developer_group.id", ondelete="SET NULL"), nullable=True)

    # FK vers Profile (pour la gestion des menus)
    profile_id = Column(Integer, ForeignKey("profile.id", ondelete="SET NULL"), nullable=True)

    # FK vers Role (pour la gestion dynamique des rôles)
    role_id = Column(Integer, ForeignKey("role.id", ondelete="SET_NULL"), nullable=True)
```

**Logique**:
- **site_id**: FK vers Site (pour site_manager, NULL pour les autres)
- **group_id**: FK vers DeveloperGroup (pour team_lead, NULL pour les autres)
- **profile_id**: FK vers Profile (pour la gestion des menus personnalisés)
- **role_id**: FK vers Role (pour la gestion dynamique des rôles)

#### 1.3 Relations M2M (lignes 161-171)
```python
# Relations many-to-many pour multi-sites et multi-équipes
site_accesses = relationship(
    "UserSiteAccess",
    back_populates="user",
    cascade="all, delete-orphan",
)
group_accesses = relationship(
    "UserGroupAccess",
    back_populates="user",
    cascade="all, delete-orphan",
)
```

**Logique**:
- **site_accesses**: M2M avec UserSiteAccess pour assignations multi-sites
- **group_accesses**: M2M avec UserGroupAccess pour assignations multi-équipes
- **cascade="all, delete-orphan**: Suppression automatique des assignations si utilisateur supprimé

#### 1.4 Helpers Métier (lignes 184-198)
```python
@property
def is_super_admin(self) -> bool:
    # Priorité au nouveau système dynamique
    if self.role_obj and self.role_obj.code == "super_admin":
        return True
    # Fallback vers l'ancien système enum pour compatibilité
    return self.role == UserRoleEnum.super_admin

@property
def is_site_manager(self) -> bool:
    # Priorité au nouveau système dynamique
    if self.role_obj and self.role_obj.code == "site_manager":
        return True
    # Fallback vers l'ancien système enum pour compatibilité
    return self.role == UserRoleEnum.site_manager
```

**Logique**:
- **Priorité dynamique**: Vérifie d'abord le système dynamique (role_obj.code)
- **Fallback enum**: Si pas de role_obj, utilise l'ancien système (role enum)
- **Compatibilité**: Garantit la compatibilité avec l'ancien système

---

## 🎯 ÉTAPE 2: Modèle Role (Rôles Dynamiques)

### Fichier: `src/backend/app/models/role.py`

**Objectif**: Permettre la création de rôles personnalisés dynamiques

#### 2.1 Role (lignes 15-62)
```python
class Role(Base):
    """
    Rôle utilisateur dynamique.
    
    Un rôle définit un ensemble de permissions fonctionnelles.
    Remplace l'enum UserRoleEnum pour plus de flexibilité.
    """
    __tablename__ = "role"
    
    id = Column(Integer, primary_key=True)
    code = Column(String(100), unique=True, nullable=False, index=True)  # Pour compatibilité avec l'ancien enum
    name = Column(String(255), nullable=False)
    description = Column(String(500), nullable=True)
    is_system = Column(Boolean, default=False, nullable=False)  # True pour les rôles système (Super Admin, etc.)
    is_active = Column(Boolean, default=True, nullable=False)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)
    
    # Relations
    permissions = relationship("RolePermission", back_populates="role", cascade="all, delete-orphan")
    users = relationship("AppUser", back_populates="role_obj", foreign_keys="AppUser.role_id")
```

**Logique**:
- **code**: Code unique pour compatibilité avec l'ancien enum (ex: "super_admin")
- **is_system**: True pour les rôles système (super_admin, site_manager, etc.)
- **permissions**: Relation avec RolePermission pour les permissions du rôle
- **users**: Relation avec AppUser pour les utilisateurs assignés à ce rôle

---

## 🎯 ÉTAPE 3: Tables M2M pour Multi-Sites/Multi-Équipes

### Fichier: `src/backend/app/models/user_site_access.py`

**Objectif**: Permettre aux utilisateurs d'avoir accès à plusieurs sites

#### 3.1 UserSiteAccess (lignes 14-56)
```python
class UserSiteAccess(Base):
    """
    [M2M] Liaison User ↔ Site pour le contrôle d'accès multi-sites.
    
    Permet à un utilisateur (notamment site_manager) d'avoir accès à
    plusieurs sites et de voir les dashboards de tous ces sites.
    """
    __tablename__ = "user_site_access"

    id = Column(Integer, primary_key=True, autoincrement=True)
    
    user_id = Column(Integer, ForeignKey("app_user.id", ondelete="CASCADE"), nullable=False)
    site_id = Column(Integer, ForeignKey("site.id", ondelete="CASCADE"), nullable=False)
    
    # is_primary: site principal utilisé par défaut
    is_primary = Column(Boolean, default=False, nullable=False)
    
    assigned_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Relations
    user = relationship("AppUser", back_populates="site_accesses")
    site = relationship("Site", back_populates="user_accesses")
```

**Logique**:
- **M2M**: Relation many-to-many entre User et Site
- **is_primary**: Site principal utilisé par défaut pour l'utilisateur
- **CASCADE**: Suppression automatique si utilisateur ou site supprimé

### Fichier: `src/backend/app/models/user_group_access.py`

**Objectif**: Permettre aux utilisateurs d'avoir accès à plusieurs équipes

#### 3.2 UserGroupAccess (lignes 14-56)
```python
class UserGroupAccess(Base):
    """
    [M2M] Liaison User ↔ DeveloperGroup pour le contrôle d'accès multi-équipes.
    
    Permet à un utilisateur (notamment team_lead) d'avoir accès à
    plusieurs équipes et de voir les dashboards des projets de toutes ces équipes.
    """
    __tablename__ "user_group_access"

    id = Column(Integer, primary_key=True, autoincrement=True)
    
    user_id = Column(Integer, ForeignKey("app_user.id", ondelete="CASCADE"), nullable=False)
    group_id = Column(Integer, ForeignKey("developer_group.id", ondelete="CASCADE"), nullable=False)
    
    # is_primary: équipe principale utilisée par défaut
    is_primary = Column(Boolean, default=False, nullable=False)
    
    assigned_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Relations
    user = relationship("AppUser", back_populates="group_accesses")
    group = relationship("DeveloperGroup", back_populates="user_accesses")
```

**Logique**:
- **M2M**: Relation many-to-many entre User et DeveloperGroup
- **is_primary**: Équipe principale utilisée par défaut pour l'utilisateur
- **CASCADE**: Suppression automatique si utilisateur ou groupe supprimé

### Fichier: `src/backend/app/models/user_project_access.py`

**Objectif**: Permettre aux utilisateurs d'avoir accès à plusieurs projets dans tenant

#### 3.3 UserProjectAccess (lignes 14-28)
```python
class UserProjectAccess(Base):
    """Table d'assignation utilisateurs-projets dans la base tenant."""
    __tablename__ = "user_project_access"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, nullable=False, index=True)  # ID utilisateur depuis auth_db
    project_id = Column(Integer, nullable=False, index=True)  # ID projet
    is_primary = Column(Boolean, default=False)  # Projet principal
    assigned_at = Column(DateTime, server_default=func.now())
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
```

**Logique**:
- **Multi-projets**: Permet à un utilisateur d'avoir accès à plusieurs projets
- **is_primary**: Projet principal utilisé par défaut
- **Tenant-specific**: Stocké dans chaque base tenant (pas dans auth_db)

---

## 🎯 ÉTAPE 4: Repository Utilisateur

### Fichier: `src/backend/app/repositories/user_repository.py`

**Objectif**: Opérations CRUD sur les utilisateurs

#### 4.1 get_all (lignes 19-24)
```python
def get_all(self, db: Session) -> List[AppUser]:
    """✅ FIX : Charger site_accesses et group_accesses pour multi-sites/multi-équipes"""
    return db.query(AppUser).options(
        selectinload(AppUser.site_accesses),
        selectinload(AppUser.group_accesses)
    ).all()
```

**Logique**:
- **selectinload**: Charge les relations site_accesses et group_accesses en une seule requête
- **Optimisation**: Évite le problème N+1 de chargement des relations

#### 4.2 get_by_role (lignes 38-47)
```python
def get_by_role(self, db: Session, role: UserRoleEnum) -> List[AppUser]:
    """Retourne tous les utilisateurs d'un rôle donné."""
    return (
        db.query(AppUser)
        .filter(
            AppUser.role == role,
            AppUser.is_active.is_(True),
        )
        .all()
    )
```

**Logique**:
- **Filtrage par rôle**: Retourne uniquement les utilisateurs du rôle spécifié
- **is_active**: Filtre uniquement les utilisateurs actifs

#### 4.3 get_by_site_id (lignes 59-74)
```python
def get_by_site_id(
    self,
    db:      Session,
    site_id: int,
) -> List[AppUser]:
    """
    ✅ AJOUT : site_managers affectés à un site donné.
    """
    return (
        db.query(AppUser)
        .filter(
            AppUser.site_id  == site_id,
            AppUser.is_active.is_(True),
        )
        .all()
    )
```

**Logique**:
- **Filtrage par site_id**: Retourne les utilisateurs affectés à un site spécifique
- **Utilisé pour**: Vérifier qu'un site_manager a accès à son site

#### 4.4 get_by_group_id (lignes 76-91)
```python
def get_by_group_id(
    self,
    db:       Session,
    group_id: int,
) -> List[AppUser]:
    """
    ✅ AJOUT : team_leads affectés à un groupe donné.
    """
    return (
        db.query(AppUser)
        .filter(
            AppUser.group_id == group_id,
            AppUser.is_active.is_(True),
        )
        .all()
    )
```

**Logique**:
- **Filtrage par group_id**: Retourne les utilisateurs affectés à un groupe spécifique
- **Utilisé pour**: Vérifier qu'un team_lead a accès à son équipe

---

## 🎯 ÉTAPE 5: Service Utilisateur (Logique Multi-Tenant)

### Fichier: `src/backend/app/services/admin/user_service.py`

**Objectif**: Orchestrateur la création et gestion des utilisateurs avec logique multi-tenant

#### 5.1 create_user (lignes 38-176)
```python
def create_user(
    self,
    db:         Session,
    payload:    CreateUserRequest,
    created_by: Optional[int] = None,
    ip_address: Optional[str] = None,
) -> AppUser:
    """
    ✅ ARCHITECTURE MULTI-TENANT:
    - Crée l'identifiant utilisateur dans auth_db (partagé)
    - Crée les assignations multi-sites/multi-équipes dans la base tenant courante
    """
    from app.database.session import get_auth_db, get_db as get_tenant_db
    
    # 1. Vérifier doublon dans auth_db
    auth_db = next(get_auth_db())
    if self.user_repo.email_exists(auth_db, payload.email):
        auth_db.close()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Un utilisateur avec cet email existe déjà.",
        )
    if payload.login and self.user_repo.get_by_login(auth_db, payload.login):
        auth_db.close()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ce login est déjà utilisé.",
        )
    
    hashed = hash_password(payload.password)
    
    # Resolve the profile ID in auth_db using the profile name from tenant db
    auth_profile_id = None
    if payload.profile_id:
        from app.models.profile import Profile
        tenant_profile = db.query(Profile).filter(Profile.id == payload.profile_id).first()
        if tenant_profile:
            auth_profile = auth_db.query(Profile).filter(Profile.name == tenant_profile.name).first()
            if auth_profile:
                auth_profile_id = auth_profile.id

    # 2. Créer l'identifiant dans auth_db (sans site_id/group_id/project_ids)
    auth_user = self.user_repo.create_user(
        db=auth_db,
        email=payload.email,
        hashed_password=hashed,
        role=payload.role,
        login=payload.login,
        name=payload.name,
        site_id=None,  # Pas de site_id dans auth_db
        group_id=None,  # Pas de group_id dans auth_db
        profile_id=auth_profile_id,
    )
    auth_db.commit()
    auth_db.refresh(auth_user)
    logger.info(f"User created in auth_db — id={auth_user.id} email={auth_user.email}")
    auth_db.close()
    
    # 3. Créer l'utilisateur dans tenant (avec métadonnées complètes)
    tenant_user = self.user_repo.create_user(
        db=db,
        email=payload.email,
        hashed_password=hashed,
        role=payload.role,
        login=payload.login,
        name=payload.name,
        site_id=payload.site_id,  # site_id pour compatibilité
        group_id=payload.group_id,  # group_id pour compatibilité
        profile_id=payload.profile_id,
    )
    db.flush()
    
    # 4. Gérer les assignations multi-sites et multi-équipes dans tenant
    if payload.site_ids:
        primary_site_id = payload.site_id if payload.site_id else (payload.site_ids[0] if payload.site_ids else None)
        logger.info(f"Creating site assignments in tenant for user {tenant_user.id} with site_ids: {payload.site_ids}, primary_site_id: {primary_site_id}")
        self.site_access_repo.bulk_create(db, tenant_user.id, payload.site_ids, primary_site_id)
    
    if payload.group_ids:
        primary_group_id = payload.group_id if payload.group_id else (payload.group_ids[0] if payload.group_ids else None)
        self.group_access_repo.bulk_create(db, tenant_user.id, payload.group_ids, primary_group_id)
    
    # Gérer les assignations multi-projets dans tenant
    if payload.project_ids:
        primary_project_id = payload.project_ids[0] if payload.project_ids else None
        logger.info(f"Creating project assignments in tenant for user {tenant_user.id} with project_ids: {payload.project_ids}, primary_project_id={primary_project_id}")
        self.project_access_repo.sync_smart(db, tenant_user.id, payload.project_ids, is_primary=(primary_project_id is not None))
    
    # 5. Audit log dans tenant (avant commit)
    tenant_user_id = tenant_user.id
    tenant_user_name = tenant_user.name
    tenant_user_email = tenant_user.email
    self.audit_repo.log(
        db=db, user_id=created_by, action="CREATE_USER",
        entity_type="AppUser", entity_id=tenant_user_id,
        entity_name=tenant_user_name or tenant_user_email,
        new_value=payload.model_dump(exclude={"password", "new_password"}),
        ip_address=ip_address,
    )
    
    db.commit()
    
    # ARCHITECTURE MULTI-TENANT: Charger les assignations depuis tenant pour Pydantic
    # Recharger auth_user depuis auth_db pour avoir une session active
    auth_db = next(get_auth_db())
    auth_user = auth_db.query(AppUser).filter(AppUser.id == auth_user.id).first()
    
    # Charger les assignations depuis tenant (db est la session tenant)
    try:
        site_accesses = self.site_access_repo.get_by_user_id(db, auth_user.id)
        auth_user._site_accesses = site_accesses
    except Exception:
        auth_user._site_accesses = []
    
    try:
        group_accesses = self.group_access_repo.get_by_user_id(db, auth_user.id)
        auth_user._group_accesses = group_accesses
    except Exception:
        auth_user._group_accesses = []
    
    # Charger les assignations de projets depuis tenant
    try:
        project_accesses = self.project_access_repo.get_by_user_id(db, auth_user.id)
        auth_user._project_accesses = project_accesses
    except Exception:
        auth_user._project_accesses = []
    
    auth_db.close()
    db.close()
    
    return auth_user  # Retourne l'utilisateur auth_db pour le token
```

**Logique**:
- **Étape 1**: Vérification des doublons dans auth_db (email/login)
- **Étape 2**: Création de l'identifiant dans auth_db (sans assignations)
- **Étape 3**: Création de l'utilisateur dans tenant (avec métadonnées)
- **Étape 4**: Gestion des assignations multi-sites/multi-équipes dans tenant
- **Étape 5**: Audit log dans tenant
- **Étape 6**: Chargement des assignations depuis tenant pour Pydantic
- **Retourne**: Utilisateur auth_db pour le token (session active)

#### 5.2 get_all_users (lignes 178-199)
```python
def get_all_users(self, db: Session) -> List[AppUser]:
    """
    ✅ ARCHITECTURE MULTI-TENANT:
    - Charge les utilisateurs depuis auth_db (partagé)
    - Charge les assignations multi-sites/multi-équipes depuis tenant et les attache manuellement
    - Si un utilisateur n'a pas d'assignations dans ce tenant, retourne des listes vides
    """
    from app.database.session import get_auth_db, get_db as get_tenant_db
    
    # 1. Charger les utilisateurs depuis auth_db
    auth_db = next(get_auth_db())
    users = self.user_repo.get_all(auth_db)
    auth_db.close()
    
    # 2. Charger les assignations depuis tenant avec une session séparée par utilisateur
    for user in users:
        tenant_db = next(get_tenant_db())
        try:
            # Trouver l'utilisateur correspondant dans tenant par email
            tenant_user = self.user_repo.get_by_email(tenant_db, user.email)
```

**Logique**:
- **Étape 1**: Charge les utilisateurs depuis auth_db (identifiants partagés)
- **Étape 2**: Charge les assignations depuis tenant (données métier spécifiques)
- **Session séparée**: Utilise une session séparée par utilisateur pour éviter les erreurs de transaction en cascade

---

## 🎯 ÉTAPE 6: Dépendances FastAPI (Contrôle d'Accès)

### Fichier: `src/backend/app/api/dependencies.py`

**Objectif**: Définir les dépendances FastAPI pour le contrôle d'accès par rôle

#### 6.1 get_current_admin (lignes 18-28)
```python
def get_current_admin(current_user: AppUser = Depends(get_current_user)) -> AppUser:
    """
    ✅ FIX : vérifie super_admin (remplace l'ancien admin/user).
    Utilisé pour les opérations d'administration complètes.
    """
    if current_user.role != UserRoleEnum.super_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Droits super_admin requis.",
        )
    return current_user
```

**Logique**:
- **Vérification**: Vérifie que l'utilisateur a le rôle super_admin
- **Utilisé pour**: Opérations d'administration complètes (CRUD sites, devs, KPIs, extractions)

#### 6.2 get_current_manager (lignes 52-65)
```python
def get_current_manager(current_user: AppUser = Depends(get_current_user)) -> AppUser:
    """
    Accès pour : super_admin, site_manager.
    Utilisé pour les opérations de consultation/modification au niveau site.
    """
    if current_user.role not in (
        UserRoleEnum.super_admin,
        UserRoleEnum.site_manager,
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Droits super_admin ou site_manager requis.",
        )
    return current_user
```

**Logique**:
- **Vérification**: Vérifie que l'utilisateur a le rôle super_admin ou site_manager
- **Utilisé pour**: Opérations au niveau site (consultation, modification)

#### 6.3 get_current_viewer_or_above (lignes 109-126)
```python
def get_current_viewer_or_above(current_user: AppUser = Depends(get_current_user)) -> AppUser:
    """
    Accès pour : super_admin, site_manager, team_lead, project_manager, viewer.
    Utilisé pour les endpoints d'intelligence et analytics avec assignations flexibles.
    Viewer peut avoir des assignations combinées (sites, équipes, projets).
    """
    if current_user.role not in (
        UserRoleEnum.super_admin,
        UserRoleEnum.site_manager,
        UserRoleEnum.team_lead,
        UserRoleEnum.project_manager,
        UserRoleEnum.viewer,
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Droits viewer ou supérieur requis.",
        )
    return current_user
```

**Logique**:
- **Vérification**: Vérifie que l'utilisateur a un rôle viewer ou supérieur
- **Utilisé pour**: Endpoints d'intelligence et analytics avec assignations flexibles
- **Viewer**: Peut avoir des assignations combinées (sites, équipes, projets)

#### 6.4 require_site_access (lignes 148-170)
```python
def require_site_access(
    site_id:      int     = Path(...),
    current_user: AppUser = Depends(get_current_user),
) -> None:
    """
     AJOUT : vérifie qu'un site_manager a accès au site demandé.
    super_admin → accès à tous les sites.
    site_manager → accès uniquement à son site (site_id FK dans AppUser).
    """
    if current_user.role == UserRoleEnum.super_admin:
        return
    if current_user.role == UserRoleEnum.site_manager:
        if current_user.site_id != site_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Accès au site {site_id} refusé. Vous gérez le site {current_user.site_id}.",
            )
        return
    # team_lead et developer n'ont pas accès aux opérations site
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Droits site_manager ou supérieur requis.",
    )
```

**Logique**:
- **super_admin**: Accès à tous les sites (pas de vérification)
- **site_manager**: Accès uniquement à son site (vérification site_id)
- **Autres**: Pas d'accès aux opérations site

---

## 🎯 ÉTAPE 7: Sécurité (Authentification et Authorization)

### Fichier: `src/backend/app/core/security.py`

**Objectif**: Gérer l'authentification (login, token) et l'autorisation (permissions)

#### 7.1 hash_password (lignes 56-58)
```python
def hash_password(password: str) -> str:
    """Hash un mot de passe utilisateur via bcrypt."""
    return pwd_context.hash(password)
```

**Logique**:
- **Bcrypt**: Algorithme de hachage sécurisé pour les mots de passe
- **Utilisé pour**: Hachage des mots de passe lors de la création d'utilisateur

#### 7.2 verify_password (lignes 61-63)
```python
def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Vérifie un mot de passe utilisateur contre son hash bcrypt."""
    return pwd_context.verify(plain_password, hashed_password)
```

**Logique**:
- **Vérification**: Vérifie un mot de passe en clair contre son hash
- **Utilisé pour**: Vérification lors du login

#### 7.3 create_access_token (lignes 68-77)
```python
def create_access_token(
    data:          Dict[str, Any],
    expires_delta: Optional[timedelta] = None,
) -> str:
    """Crée un JWT access token signé avec SECRET_KEY."""
    to_encode        = data.copy()
    to_encode["exp"] = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
```

**Logique**:
- **JWT**: Crée un token JWT signé avec SECRET_KEY
- **Expiration**: Ajoute une date d'expiration (par défaut: ACCESS_TOKEN_EXPIRE_MINUTES)
- **Utilisé pour**: Génération du token après login

#### 7.4 decode_access_token (lignes 80-90)
```python
def decode_access_token(token: str) -> Optional[Dict[str, Any]]:
    """
    Décode un JWT.
    Retourne le payload ou None si invalide / expiré.
    """
    try:
        return jwt.decode(
            token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
        )
    except JWTError:
        return None
```

**Logique**:
- **Décodage**: Décode un token JWT pour récupérer le payload
- **Validation**: Retourne None si le token est invalide ou expiré
- **Utilisé pour**: Validation du token à chaque requête API

#### 7.5 get_auth_db (lignes 34-41)
```python
def get_auth_db():
    """Retourne une session vers la base d'authentification partagée (auth_db)"""
    from app.database.session import get_auth_session
    db = get_auth_session()
    try:
        yield db
    finally:
        db.close()
```

**Logique**:
- **auth_db**: Base de données partagée pour l'authentification
- **Session**: Retourne une session auth_db pour les opérations d'authentification
- **Fermeture**: Ferme automatiquement la session après utilisation

---

## 🎯 ÉTAPE 8: Router Auth (Login/Register)

### Fichier: `src/backend/app/api/routers/auth.py`

**Objectif**: Exposer les endpoints d'authentification (login, register)

#### 8.1 register (lignes 70-91)
```python
@router.post("/register", response_model=UserResponse, status_code=201)
def register(request: RegisterRequest, db: Session = Depends(get_auth_db)):
    if repo.email_exists(db,request.email):
        raise _http_error(400, "AUTH_EMAIL_ALREADY_REGISTERED", "Email already registered")

    if request.login and repo.get_by_login(db, request.login):
        raise _http_error(400, "AUTH_LOGIN_ALREADY_TAKEN", "Login already taken")

    # Hash dans le router — pas de mot de passe en clair dans le repo
    hashed = hash_password(request.password)

    user = repo.create_user(
        db              = db,
        email           = request.email,
        hashed_password = hashed,
        login           = request.login,
        name            = request.name,
    )
    db.commit()
    db.refresh(user)
    logger.info(f"User registered — id={user.id} email={user.email}")
    return user
```

**Logique**:
- **Vérification**: Vérifie que l'email et le login sont uniques
- **Hash**: Hache le mot de passe avant de le stocker
- **Création**: Crée l'utilisateur dans auth_db
- **Retourne**: Retourne l'utilisateur créé

#### 8.2 login (lignes 94-100)
```python
@router.post("/login", response_model=TokenResponse)
def login(request: LoginRequest, raw_request: Request, db: Session = Depends(get_auth_db)):
    user = None
    max_attempts = max(1, settings.LOGIN_MAX_ATTEMPTS)
    lock_seconds = max(1, settings.LOGIN_LOCK_SECONDS)
    login_hint = request.username or request.email or "unknown"
    bucket_key = _login_bucket_key(raw_request, login_hint)
```

**Logique**:
- **Rate limiting**: Limite les tentatives de login pour éviter les attaques brute force
- **Login hint**: Utilise username ou email pour identifier l'utilisateur
- **Bucket key**: Clé unique pour le rate limiting (IP + login_hint)

---

## 🎯 ÉTAPE 9: Scénario Concret - Création Utilisateur Multi-Site

### Contexte
- Création d'un site_manager avec accès à 2 sites (Paris et Lyon)
- Utilisation de l'architecture multi-tenant (auth_db + tenant_db)

**Processus**:

#### 1. Requête API
```python
POST /auth/register
{
    "email": "jean.dupont@example.com",
    "login": "jdupont",
    "password": "Password123!",
    "name": "Jean Dupont",
    "role": "site_manager",
    "site_id": 5,  # Site principal (Paris)
    "site_ids": [5, 6],  # Sites accessibles (Paris, Lyon)
    "group_id": null,
    "group_ids": null,
    "project_ids": null
}
```

#### 2. Traitement dans UserService.create_user
```python
# Étape 1: Vérification auth_db
auth_db = next(get_auth_db())
repo.email_exists(auth_db, "jean.dupont@example.com")  # False
repo.get_by_login(auth_db, "jdupont")  # False

# Étape 2: Création auth_db
auth_user = repo.create_user(
    db=auth_db,
    email="jean.dupont@example.com",
    hashed_password="hashed_password",
    role="site_manager",
    login="jdupont",
    name="Jean Dupont",
    site_id=None,  # Pas de site_id dans auth_db
    group_id=None,
    profile_id=None,
)
# Résultat: auth_db.app_user.id = 1

# Étape 3: Création tenant_db
tenant_user = repo.create_user(
    db=db,
    email="jean.dupont@example.com",
    hashed_password="hashed_password",
    role="site_manager",
    login="jdupont",
    name="Jean Dupont",
    site_id=5,  # Site principal (Paris)
    group_id=None,
    profile_id=None,
)
# Résultat: tenant_db.app_user.id = 1

# Étape 4: Assignations multi-sites
site_access_repo.bulk_create(db, tenant_user.id, [5, 6], primary_site_id=5)
# Résultat:
# tenant_db.user_site_access:
#   | id | user_id | site_id | is_primary |
#   |----|---------|---------|-------------|
#   | 1  | 1       | 5       | true         |
#   | 2  | 1       | 6       | false        |

# Étape 5: Audit log
audit_repo.log(
    db=db, user_id=1, action="CREATE_USER",
    entity_type="AppUser", entity_id=1,
    entity_name="Jean Dupont",
    new_value={...},
    ip_address="192.168.1.100"
)

# Étape 6: Chargement assignations
auth_user._site_accesses = [
    UserSiteAccess(id=1, user_id=1, site_id=5, is_primary=True),
    UserSiteAccess(id=2, user_id=1, site_id=6, is_primary=False)
]
```

#### 3. Résultat Final
```python
{
    "id": 1,
    "email": "jean.dupont@example.com",
    "login": "jdupont",
    "name": "Jean Dupont",
    "role": "site_manager",
    "site_id": 5,
    "group_id": null,
    "profile_id": null,
    "site_accesses": [
        {"id": 1, "user_id": 1, "site_id": 5, "is_primary": true},
        {"id": 2, "user_id": 1, "site_id": 6, "is_primary": false}
    ],
    "group_accesses": [],
    "project_accesses": []
}
```

---

## 🎯 ÉTAPE 10: Scénario Concret - Contrôle d'Accès

### Contexte
- Utilisateur: Jean Dupont (site_manager, site_id=5)
- Tentative d'accès aux données du site Lyon (site_id=6)

**Processus**:

#### 1. Requête API
```python
GET /analytics/project/1?site_id=6
Authorization: Bearer <token_jwt>
```

#### 2. Vérification dans require_site_access
```python
def require_site_access(site_id=6, current_user=AppUser):
    if current_user.role == UserRoleEnum.super_admin:
        return  # super_admin → accès à tous les sites
    if current_user.role == UserRoleEnum.site_manager:
        if current_user.site_id != site_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Accès au site 6 refusé. Vous gérez le site 5."
            )
        return  # site_id=6 → autorisé
    return  # site_manager → autorisé
```

#### 3. Résultat
```python
# current_user.site_id = 5
# site_id demandé = 6
# current_user.role = "site_manager"
# 5 != 6 → HTTPException 403
```

**Résultat**: Accès refusé car le site_manager ne gère que le site 5.

#### 4. Alternative: Utilisateur avec multi-sites
```python
# Si Jean Dupont a site_ids=[5, 6]
GET /analytics/project/1?site_ids=5,6

# Dans intelligence.py:
effective_site_ids = [5, 6]
# Filtre les données pour les sites 5 et 6
```

**Résultat**: Accès autorisé car l'utilisateur a accès aux sites 5 et 6.

---

## 🎯 ÉTAPE 11: Scénario Concret - Viewer avec Assignations Flexibles

### Contexte
- Utilisateur: Marie Martin (viewer)
- Assignations: site_ids=[5, 6], group_ids=[1, 2], project_ids=[1, 2]

**Processus**:

#### 1. Requête API
```python
GET /intelligence/admin/1?site_ids=5,6
Authorization: Bearer <token_jwt>
```

#### 2. Vérification dans intelligence.py (lignes 73-85)
```python
# Dans intelligence.py
if effective_site_ids is None and current_admin.role == 'site_manager':
    site_access_repo = UserSiteAccessRepository()
    tenant_user_id = _get_tenant_user_id(db, current_admin)
    accessible_site_ids = [access.site_id for access in site_access_repo.get_by_user_id(db, tenant_user_id)]
    effective_site_ids = accessible_site_ids if accessible_site_ids else None
```

**Logique**:
- **site_manager**: Charge les assignations de sites depuis tenant
- **viewer**: Peut avoir plusieurs sites accessibles
- **Filtrage**: Filtre les données pour les sites accessibles

#### 3. Résultat
```python
# effective_site_ids = [5, 6]
# Filtre les données pour les sites 5 et 6
snapshots = [s for s in snapshots if s.site_id in effective_site_ids]
```

**Résultat**: Accès autorisé car l'utilisateur a accès aux sites 5 et 6.

---

## 🎓 Points Clés pour la Soutenance

### 1. Architecture Multi-Tenant
- **auth_db**: Base de données partagée pour les identifiants utilisateurs (email, login, password, rôle)
- **tenant_db**: Base de données spécifique pour chaque tenant (données métier + assignations)
- **Isolation**: Les données métier sont isolées par tenant

### 2. Rôles Granulaires
- **6 rôles**: super_admin, site_manager, project_manager, team_lead, viewer, developer
- **Contrôle d'accès**: Dépendances FastAPI pour vérifier les permissions par rôle
- **Assignations**: Multi-sites (UserSiteAccess), multi-équipes (UserGroupAccess), multi-projets (UserProjectAccess)

### 3. Assignations Multi-Sites/Multi-Équipes
- **M2M**: Relations many-to-many pour les assignations
- **is_primary**: Site/équipe principal utilisé par défaut
- **bulk_create**: Création en masse des assignations
- **sync_smart**: Synchronisation intelligente des assignations

### 4. Contrôle d'Accès
- **Dépendances FastAPI**: get_current_admin, get_current_manager, get_current_viewer_or_above
- **Vérification site_id**: require_site_access vérifie qu'un site_manager a accès à son site
- **Vérification role**: Chaque dépendance vérifie le rôle de l'utilisateur

### 5. Sécurité
- **Hash bcrypt**: Hachage sécurisé des mots de passe
- **JWT Token**: Token JWT signé pour l'authentification
- **Rate Limiting**: Limite les tentatives de login pour éviter les attaques brute force

---

## 🚀 Conclusion

Le système de gestion des utilisateurs et multi-tenant est basé sur:

1. **Architecture multi-tenant**: Base auth_db partagée + bases tenant spécifiques
2. **Rôles granulaires**: 6 rôles différents pour des accès précis
3. **Assignations multi-sites/multi-équipes**: M2M pour flexibilité des accès
4. **Contrôle d'accès**: Dépendances FastAPI pour vérifier les permissions par rôle
5. **Sécurité**: Hash bcrypt, JWT token, rate limiting

Chaque opération de gestion utilisateur (création, modification, suppression) est orchestrée par UserService qui gère la logique multi-tenant de manière transparente.
