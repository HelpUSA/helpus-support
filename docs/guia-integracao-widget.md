---
title: Guia de Integração do Support Widget (Public Arte & Clientes)
created: 2026-09-25
tags:
  - widget
  - integration
  - publicarte
  - react
  - embed
---

# 🔌 Guia de Integração do Support Widget

Este guia instrui a equipe sobre como plugar o **HelpUS Support Widget** no **Public Arte** e em qualquer projeto futuro da HelpUS.

---

## 1. Instalação / Inclusão no React / Vite

### No projeto Public Arte (`publicarte/src/App.jsx`):

```jsx
import HelpUsSupportWidget from './components/HelpUsSupportWidget';

export default function App() {
  return (
    <>
      {/* Rotas da aplicação */}
      <MyRoutes />

      {/* Widget de Suporte HelpUS */}
      <HelpUsSupportWidget
        tenantId="publicarte"
        clientName="Public Arte"
        userEmail="tercio@publicarte.com.br"
        userName="Tércio"
        apiUrl="https://support.helpusbr.com/api"
        primaryColor="#6366f1"
      />
    </>
  );
}
```

---

## 2. Propriedades Aceitas (Props)

| Prop | Tipo | Padrão | Descrição |
| :--- | :--- | :--- | :--- |
| `tenantId` | `string` | `"publicarte"` | Identificador do cliente no backend |
| `clientName` | `string` | `"Public Arte"` | Nome exibido no cabeçalho do widget |
| `userEmail` | `string` | `""` | E-mail do usuário logado (auto-preenchimento) |
| `userName` | `string` | `""` | Nome do usuário logado |
| `apiUrl` | `string` | `"https://support.helpusbr.com/api"` | URL base da API de tickets |
| `primaryColor` | `string` | `"#6366f1"` | Cor hexadecimal do botão flutuante e cabeçalho |
| `position` | `string` | `"bottom-right"` | Posicionamento na tela (`bottom-right` ou `bottom-left`) |

---

## 3. Captura Automática de Contexto

Quando um chamado é enviado pelo widget, o sistema captura automaticamente:
- **URL exata**: `window.location.href` da página onde o usuário estava ao relatar o problema.
- **Sistema Operacional & Navegador**: `navigator.userAgent`.
- **E-mail & Nome**: Dados repassados pelas props da sessão do usuário.

---

[[index|⬅️ Voltar ao Índice do Vault]]
