import { useState, useEffect, useCallback } from 'react';

/**
 * Hook universal de Autenticação com o Google (Google OAuth 2.0 + GIS SDK)
 *
 * Recusos:
 * 1. Auto-carregamento do script oficial da Google Identity Services (GSI).
 * 2. Autenticação primária via GIS Token Client (window.google.accounts.oauth2).
 * 3. Fallback automático para janela Popup OAuth direta se o GIS for bloqueado por AdBlockers/Safari.
 * 4. Captura e processamento de token no hash fragment (#access_token=) e postMessage cross-window.
 * 5. Validação de e-mails autorizados (Whitelist) e perfil do usuário (/oauth2/v3/userinfo).
 * 6. Gerenciamento de sessão no localStorage com suporte a logout.
 *
 * @param {Object} options Configurações do hook
 * @param {string} [options.clientId] ID do Cliente Google OAuth (Padrão: VITE_GOOGLE_CLIENT_ID ou NEXT_PUBLIC_GOOGLE_CLIENT_ID)
 * @param {Array<string>} [options.allowedEmails] Lista opcional de e-mails permitidos (Whitelist)
 * @param {Function} [options.onSuccess] Callback executado após login com sucesso
 * @param {Function} [options.onError] Callback executado em caso de erro no login
 * @param {string} [options.storageKey] Chave do localStorage para armazenar a sessão (Padrão: 'helpus_google_auth_user')
 * @returns {Object} { user, isAuthenticated, isLoading, error, login, logout, clearError }
 */
export function useGoogleAuth(options = {}) {
  const {
    clientId = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_GOOGLE_CLIENT_ID) ||
               (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_GOOGLE_CLIENT_ID) ||
               '812202824664-s716306ibb7c15jh7aok2v0lfnuocpkn.apps.googleusercontent.com',
    allowedEmails = null,
    onSuccess = null,
    onError = null,
    storageKey = 'helpus_google_auth_user'
  } = options;

  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // 1. Carregar sessão existente do localStorage ao inicializar
  useEffect(() => {
    try {
      const savedUser = localStorage.getItem(storageKey);
      if (savedUser) {
        const parsed = JSON.parse(savedUser);
        if (parsed && parsed.email) {
          setUser(parsed);
          setIsAuthenticated(true);
        }
      }
    } catch (e) {
      console.warn('[googleAuth] Falha ao ler sessão do localStorage:', e);
    }
  }, [storageKey]);

  // 2. Auto-injetar SDK do Google Identity Services se não estiver presente
  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (!window.google?.accounts?.oauth2 && !document.getElementById('google-gsi-script')) {
      const script = document.createElement('script');
      script.id = 'google-gsi-script';
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
  }, []);

  // 3. Processar dados recebidos do perfil do Google
  const processGoogleUserInfo = useCallback((googleUser, pendingTab = null) => {
    if (!googleUser || !googleUser.email) {
      if (pendingTab && !pendingTab.closed) pendingTab.close();
      setIsLoading(false);
      const errMsg = 'Não foi possível obter os dados do usuário do Google.';
      setError(errMsg);
      if (onError) onError(errMsg);
      return false;
    }

    const cleanEmail = googleUser.email.toLowerCase().trim();

    // Validação de Whitelist (se configurada)
    if (allowedEmails && Array.isArray(allowedEmails) && allowedEmails.length > 0) {
      const isAllowed = allowedEmails.some(e => e.toLowerCase().trim() === cleanEmail);
      if (!isAllowed) {
        if (pendingTab && !pendingTab.closed) pendingTab.close();
        setIsLoading(false);
        setIsAuthenticated(false);
        const errMsg = `⛔ Acesso Negado: O e-mail (${cleanEmail}) não possui permissão de acesso.`;
        setError(errMsg);
        localStorage.removeItem(storageKey);
        if (onError) onError(errMsg, googleUser);
        return false;
      }
    }

    const userObj = {
      id: googleUser.sub || googleUser.id,
      email: cleanEmail,
      name: googleUser.name || cleanEmail.split('@')[0],
      givenName: googleUser.given_name || '',
      familyName: googleUser.family_name || '',
      picture: googleUser.picture || '',
      locale: googleUser.locale || 'pt-BR',
      loginTime: Date.now()
    };

    try {
      localStorage.setItem(storageKey, JSON.stringify(userObj));
    } catch (e) {
      console.warn('[googleAuth] Não foi possível salvar sessão no localStorage:', e);
    }

    setUser(userObj);
    setIsAuthenticated(true);
    setIsLoading(false);
    setError('');

    if (pendingTab && !pendingTab.closed) {
      pendingTab.close();
    }

    if (onSuccess) {
      onSuccess(userObj);
    }

    return true;
  }, [allowedEmails, onError, onSuccess, storageKey]);

  // 4. Capturar token de hash URL (#access_token=) ou mensagens cross-window (postMessage)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // A. Hash Token Handler (#access_token=)
    if (window.location.hash.includes('access_token=')) {
      const hashParams = new URLSearchParams(window.location.hash.replace('#', '?'));
      const token = hashParams.get('access_token');
      if (token) {
        setIsLoading(true);
        fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${token}` }
        })
          .then(res => res.json())
          .then(googleUser => {
            if (window.opener && !window.opener.closed) {
              window.opener.postMessage({ type: 'GOOGLE_AUTH_SUCCESS', user: googleUser }, window.location.origin);
              window.close();
            } else {
              processGoogleUserInfo(googleUser);
              window.history.replaceState(null, '', window.location.pathname + window.location.search);
            }
          })
          .catch(err => {
            console.error('[googleAuth] Erro ao consultar perfil Google via Hash Token:', err);
            setIsLoading(false);
          });
      }
    }

    // B. Window postMessage Listener (janela mãe recebe da janela popup)
    const handleMessage = (event) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === 'GOOGLE_AUTH_SUCCESS' && event.data?.user) {
        processGoogleUserInfo(event.data.user);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [processGoogleUserInfo]);

  // 5. Função de Login principal
  const login = useCallback(() => {
    setError('');
    setIsLoading(true);

    // A. Método Primário: Official Google Identity Services SDK Client
    if (window.google?.accounts?.oauth2) {
      try {
        const client = window.google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: 'email profile openid',
          prompt: 'select_account',
          callback: async (tokenResponse) => {
            if (tokenResponse && tokenResponse.access_token) {
              try {
                const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                  headers: { Authorization: `Bearer ${tokenResponse.access_token}` }
                });
                const googleUser = await res.json();
                processGoogleUserInfo(googleUser);
              } catch (fetchErr) {
                console.error('[googleAuth] Erro ao consultar UserInfo do Google:', fetchErr);
                setIsLoading(false);
                setError('Erro de comunicação com o servidor do Google.');
              }
            } else {
              setIsLoading(false);
            }
          },
          error_callback: (err) => {
            console.warn('[googleAuth] Popup do Google fechado ou cancelado:', err);
            setIsLoading(false);
          }
        });

        client.requestAccessToken({ prompt: 'select_account' });
        return;
      } catch (e) {
        console.warn('[googleAuth] Falha no GIS SDK. Acionando fallback direto...', e);
      }
    }

    // B. Método Secundário: Fallback para Popup OAuth Direto
    const redirectUri = encodeURIComponent(window.location.origin);
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=token&scope=email%20profile%20openid&prompt=select_account`;

    const width = 500;
    const height = 650;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    const popup = window.open(
      authUrl,
      'GoogleSignInPopup',
      `width=${width},height=${height},top=${top},left=${left},scrollbars=yes,status=yes`
    );

    if (popup) {
      popup.focus();
    } else {
      setIsLoading(false);
      setError('O navegador bloqueou a abertura da janela de login. Por favor, permita popups.');
    }
  }, [clientId, processGoogleUserInfo]);

  // 6. Função de Logout
  const logout = useCallback(() => {
    setUser(null);
    setIsAuthenticated(false);
    setError('');
    setIsLoading(false);
    try {
      localStorage.removeItem(storageKey);
    } catch (e) {
      console.warn('[googleAuth] Erro ao remover sessão do localStorage:', e);
    }
  }, [storageKey]);

  // 7. Limpar erros manuais
  const clearError = useCallback(() => setError(''), []);

  return {
    user,
    isAuthenticated,
    isLoading,
    error,
    login,
    logout,
    clearError
  };
}
