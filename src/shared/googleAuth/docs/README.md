# 🔐 HelpUS Shared Modules — Google Auth (`@shared/googleAuth`)

Módulo mestre de autenticação com o **Google OAuth 2.0 / Google Identity Services (GIS)** reutilizável para todo o ecossistema de aplicações (HelpUS SaaS Suite, Next.js, Vite, React).

---

## 🚀 Por que este módulo foi criado?

Integrar login com o Google costuma apresentar problemas recorrentes como:
* Bloqueio de popups no Safari, Brave ou por extensões de AdBlock.
* Erros de inicialização se o desenvolvedor esquecer de colocar a tag `<script src="https://accounts.google.com/gsi/client">` no `index.html`.
* Falta de padrão no tratamento de tokens recebidos por URL hash (`#access_token=`) ou comunicação entre janelas (`postMessage`).
* Dificuldade de restringir acesso apenas a e-mails autorizados (Whitelist).

Este módulo resolve **todos esses problemas de forma automatizada e transparente**.

---

## 📁 Estrutura do Módulo

```text
d:/AntiG/shared/googleAuth/
├── index.js                 # Exportações mestre do módulo
├── useGoogleAuth.jsx        # Hook customizado de lógica e sessão
├── GoogleLoginButton.jsx    # Componente UI com botão oficial estilizado
└── docs/
    └── README.md            # Esta documentação detalhada
```

---

## ⚡ Recursos Principais

| Recurso | Descrição |
| :--- | :--- |
| **Auto-injeção de SDK** | Carrega o script `gsi/client` dinamicamente se não estiver presente na página. |
| **Mecanismo Duplo de Auth** | Tenta autenticar via **GIS SDK** (`initTokenClient`); se falhar ou for bloqueado, aciona o **Fallback de Popup OAuth Direto**. |
| **Cross-Window postMessage** | Comunicação segura entre a janela de popup e a janela principal da aplicação. |
| **Hash Fragment Handler** | Detecta e consome tokens `#access_token=` diretamente da URL sem quebrar o roteamento. |
| **Filtro de Whitelist** | Suporta restrição por lista de e-mails permitidos com mensagem de erro amigável. |
| **Persistência de Sessão** | Salva automaticamente o perfil no `localStorage` e oferece função de `logout`. |
| **UI Reutilizável** | Componente `<GoogleLoginButton />` com SVG oficial do Google e 3 variantes de tema (`dark`, `light`, `glass`). |

---

## 💻 Como Usar nas Aplicações

### 1. Exemplo Básico (Vite / React)

```jsx
import React from 'react';
import { useGoogleAuth, GoogleLoginButton } from '../../shared/googleAuth';

export function LoginPage() {
  const { user, isAuthenticated, isLoading, error, login, logout } = useGoogleAuth({
    clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID,
    onSuccess: (userData) => {
      console.log('Usuário autenticado com sucesso:', userData);
    }
  });

  if (isAuthenticated && user) {
    return (
      <div className="p-6 bg-slate-900 text-white rounded-2xl">
        <div className="flex items-center gap-4">
          {user.picture && <img src={user.picture} alt={user.name} className="w-12 h-12 rounded-full" />}
          <div>
            <h3 className="font-bold text-lg">{user.name}</h3>
            <p className="text-slate-400 text-sm">{user.email}</p>
          </div>
        </div>
        <button
          onClick={logout}
          className="mt-4 px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded-xl"
        >
          Sair da Conta
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto p-6 space-y-4">
      <GoogleLoginButton
        onClick={login}
        isLoading={isLoading}
        label="Entrar com o Google"
        variant="dark"
      />
      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-xl">
          {error}
        </div>
      )}
    </div>
  );
}
```

---

### 2. Exemplo com Restrição de Whitelist (Apenas E-mails Autorizados)

```jsx
const { login, error } = useGoogleAuth({
  clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID,
  allowedEmails: [
    'eduardojcmagalhaes@gmail.com',
    'helpus.ecommerce@gmail.com',
    'admin@suaempresa.com'
  ],
  onError: (errMsg) => {
    console.warn('Tentativa de login não autorizada:', errMsg);
  }
});
```

---

## 🛠️ Referência da API

### `useGoogleAuth(options)`

#### Opções de Entrada (`options`):
- `clientId` *(string)*: ID de Cliente Google OAuth 2.0. Se omitido, busca automaticamente de `VITE_GOOGLE_CLIENT_ID` ou `NEXT_PUBLIC_GOOGLE_CLIENT_ID`.
- `allowedEmails` *(Array<string> | null)*: Lista de e-mails autorizados. Se definido, bloqueia e-mails fora da lista.
- `onSuccess` *(Function)*: Callback `(user) => {}` executado no sucesso.
- `onError` *(Function)*: Callback `(errorMessage, rawGoogleUser) => {}` em falhas ou e-mails bloqueados.
- `storageKey` *(string)*: Chave de armazenamento no `localStorage` (Padrão: `'helpus_google_auth_user'`).

#### Retorno do Hook:
- `user` *(Object | null)*: Dados do perfil autenticado (`id`, `email`, `name`, `givenName`, `familyName`, `picture`, `locale`).
- `isAuthenticated` *(boolean)*: `true` se houver um usuário logado.
- `isLoading` *(boolean)*: `true` enquanto o login ou o fetch de perfil estiver sendo processado.
- `error` *(string)*: Mensagem de erro atual (se houver).
- `login()` *(Function)*: Dispara o fluxo de autenticação.
- `logout()` *(Function)*: Limpa a sessão local e estado do usuário.
- `clearError()` *(Function)*: Limpa o estado de erro manual.

---

### `<GoogleLoginButton />`

#### Props do Componente:
- `onClick` *(Function)*: Handler para o clique no botão (geralmente a função `login`).
- `isLoading` *(boolean)*: Exibe o spinner de carregamento e desabilita o botão.
- `disabled` *(boolean)*: Desabilita o botão.
- `label` *(string)*: Texto do botão (Padrão: `'Continuar com o Google'`).
- `variant` *(string)*: Variante visual — `'dark'`, `'light'`, ou `'glass'`.
- `className` *(string)*: Classes Tailwind extras para customização.

---

## ⚙️ Configuração no Google Cloud Console

Para que qualquer aplicação funcione sem erros de origem ou redirecionamento:

1. Acesse o [Google Cloud Console](https://console.cloud.google.com/apis/credentials).
2. Crie ou selecione suas **Credenciais de OAuth 2.0 (Aplicativo Web)**.
3. Em **Origens JavaScript autorizadas**, adicione os domínios do projeto:
   * `http://localhost:5173` (Ambiente local Vite)
   * `http://localhost:3000` (Ambiente local Next.js)
   * `https://sua-app.helpusbr.com` (Produção Vercel/Domínio)
4. Em **URIs de redirecionamento autorizados**, adicione exatamente as mesmas URLs de origem (ex: `https://sua-app.helpusbr.com`).
