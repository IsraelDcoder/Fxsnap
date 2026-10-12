import 'react-native-url-polyfill/auto';
import { AppState, Platform } from 'react-native';
import * as ExpoCrypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

function encodeUtf8(input: string) {
  const bytes: number[] = [];
  for (let index = 0; index < input.length; index += 1) {
    let codePoint = input.charCodeAt(index);
    if (codePoint >= 0xd800 && codePoint <= 0xdbff) {
      const next = input.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        codePoint = 0x10000 + ((codePoint - 0xd800) << 10) + (next - 0xdc00);
        index += 1;
      } else {
        codePoint = 0xfffd;
      }
    } else if (codePoint >= 0xdc00 && codePoint <= 0xdfff) {
      codePoint = 0xfffd;
    }

    if (codePoint <= 0x7f) {
      bytes.push(codePoint);
    } else if (codePoint <= 0x7ff) {
      bytes.push(0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f));
    } else if (codePoint <= 0xffff) {
      bytes.push(0xe0 | (codePoint >> 12), 0x80 | ((codePoint >> 6) & 0x3f), 0x80 | (codePoint & 0x3f));
    } else {
      bytes.push(
        0xf0 | (codePoint >> 18),
        0x80 | ((codePoint >> 12) & 0x3f),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      );
    }
  }
  return new Uint8Array(bytes);
}

function installAuthCryptoPolyfills() {
  const global = globalThis as typeof globalThis & { crypto?: Crypto };
  if (!global.crypto) {
    Object.defineProperty(global, 'crypto', { configurable: true, value: {} });
  }
  const cryptoApi = global.crypto;
  if (!cryptoApi) throw new Error('Secure cryptography is unavailable on this device.');

  if (typeof cryptoApi.getRandomValues !== 'function') {
    Object.defineProperty(cryptoApi, 'getRandomValues', {
      configurable: true,
      value: ExpoCrypto.getRandomValues,
    });
  }
  if (typeof cryptoApi.subtle?.digest !== 'function') {
    const subtle = cryptoApi.subtle || {};
    Object.defineProperty(subtle, 'digest', {
      configurable: true,
      value: (algorithm: AlgorithmIdentifier, data: BufferSource) => {
        const name = typeof algorithm === 'string' ? algorithm : algorithm.name;
        if (name.toUpperCase() !== 'SHA-256') {
          throw new Error(`Unsupported digest algorithm for Supabase PKCE: ${name}`);
        }
        return ExpoCrypto.digest(ExpoCrypto.CryptoDigestAlgorithm.SHA256, data);
      },
    });
    Object.defineProperty(cryptoApi, 'subtle', { configurable: true, value: subtle });
  }

  if (typeof globalThis.TextEncoder === 'undefined') {
    Object.defineProperty(globalThis, 'TextEncoder', {
      configurable: true,
      value: class {
        readonly encoding = 'utf-8';

        encode(input = '') {
          return encodeUtf8(input);
        }
      },
    });
  }
}

function secureStoreKey(key: string) {
  const encoded = key.split('').map((character) => (
    character.charCodeAt(0).toString(16).padStart(4, '0')
  )).join('');
  return `fxsnap${encoded}`;
}

const secureStorage = {
  getItem: (key: string) => {
    if (Platform.OS === 'web' && __DEV__) return Promise.resolve(webPreviewAuthStorage.get(key) || null);
    return SecureStore.getItemAsync(secureStoreKey(key));
  },
  setItem: (key: string, value: string) => {
    if (Platform.OS === 'web' && __DEV__) {
      webPreviewAuthStorage.set(key, value);
      return Promise.resolve();
    }
    return SecureStore.setItemAsync(secureStoreKey(key), value);
  },
  removeItem: (key: string) => {
    if (Platform.OS === 'web' && __DEV__) {
      webPreviewAuthStorage.delete(key);
      return Promise.resolve();
    }
    return SecureStore.deleteItemAsync(secureStoreKey(key));
  },
};
const webPreviewAuthStorage = new Map<string, string>();

export function getSupabaseClient() {
  if (client) return client;

  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
  const supabasePublicKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim()
    || process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!supabaseUrl || !supabasePublicKey) {
    throw new Error(
      'Supabase Auth is not configured for the app. Set EXPO_PUBLIC_SUPABASE_URL and either EXPO_PUBLIC_SUPABASE_ANON_KEY or EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY in mobile/.env.local, then restart Expo.',
    );
  }

  installAuthCryptoPolyfills();
  client = createClient(supabaseUrl, supabasePublicKey, {
    auth: {
      storage: secureStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      flowType: 'pkce',
    },
  });
  const auth = client.auth;
  AppState.addEventListener('change', (state) => {
    const refresh = state === 'active' ? auth.startAutoRefresh() : auth.stopAutoRefresh();
    void refresh.catch((error: unknown) => {
      console.error('Unable to update Supabase token refresh state.', error);
    });
  });
  if (AppState.currentState === 'active') {
    void auth.startAutoRefresh().catch((error: unknown) => {
      console.error('Unable to start Supabase token refresh.', error);
    });
  }
  return client;
}

export function hasSupabaseConfiguration() {
  return Boolean(process.env.EXPO_PUBLIC_SUPABASE_URL?.trim()
    && (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim()
      || process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim()));
}
