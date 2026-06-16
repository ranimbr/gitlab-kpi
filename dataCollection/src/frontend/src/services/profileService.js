/**
 * services/profileService.js
 * 
 * Service pour la gestion des profils et menus d'accès.
 */

import api from "./api";

export const profileService = {
  // ── Profiles ─────────────────────────────────────────────────────────────
  getAllProfiles: async () => {
    const response = await api.get("/profiles/");
    return response.data;
  },

  getProfileById: async (profileId) => {
    const response = await api.get(`/profiles/${profileId}`);
    return response.data;
  },

  createProfile: async (profileData) => {
    const response = await api.post("/profiles/", profileData);
    return response.data;
  },

  updateProfile: async (profileId, profileData) => {
    const response = await api.put(`/profiles/${profileId}`, profileData);
    return response.data;
  },

  deleteProfile: async (profileId) => {
    await api.delete(`/profiles/${profileId}`);
  },

  // ── Menu Items ────────────────────────────────────────────────────────────
  getAllMenuItems: async () => {
    const response = await api.get("/menu-items/");
    return response.data;
  },

  getMenuTree: async () => {
    const response = await api.get("/menu-items/tree");
    return response.data;
  },

  getActiveMenuItems: async () => {
    const response = await api.get("/menu-items/active");
    return response.data;
  },

  // ── Profile Menu Access ─────────────────────────────────────────────────
  getProfileMenuItems: async (profileId) => {
    const response = await api.get(`/profiles/${profileId}/menu-items`);
    return response.data;
  },

  updateProfileMenuItems: async (profileId, menuAccessData) => {
    const response = await api.put(`/profiles/${profileId}/menu-items`, menuAccessData);
    return response.data;
  },

  // ── User Profile Association ─────────────────────────────────────────────
  updateUserProfile: async (userId, profileId) => {
    const response = await api.put(`/users/${userId}/profile`, { profile_id: profileId });
    return response.data;
  },
};

export default profileService;
