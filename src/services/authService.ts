import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { CurrentUser } from '../types';

const TOKEN_KEY = 'auth_token';
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8080/api';

function decodePayload(token: string): Record<string, any> | null {
  try {
    const base64 = token.split('.')[1]
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    return JSON.parse(atob(base64));
  } catch {
    return null;
  }
}

export const authService = {
  async login(email: string, password: string): Promise<void> {
    const response = await axios.post(`${API_URL}/auth/login`, { email, password }, {
      headers: { 'ngrok-skip-browser-warning': 'true' },
    });
    const token: string = response.data.token;
    await AsyncStorage.setItem(TOKEN_KEY, token);
  },

  async logout(): Promise<void> {
    await AsyncStorage.removeItem(TOKEN_KEY);
  },

  async getToken(): Promise<string | null> {
    return AsyncStorage.getItem(TOKEN_KEY);
  },

  async getCurrentUser(): Promise<CurrentUser | null> {
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    if (!token) return null;
    const payload = decodePayload(token);
    if (!payload) return null;
    return {
      userId: Number(payload.userId),
      farmId: Number(payload.farmId),
      farmName: String(payload.farmName),
      userName: String(payload.userName),
      role: String(payload.role ?? 'USER'),
    };
  },

  async isAuthenticated(): Promise<boolean> {
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    if (!token) return false;
    const payload = decodePayload(token);
    if (!payload?.exp) return false;
    return payload.exp > Math.floor(Date.now() / 1000);
  },
};
