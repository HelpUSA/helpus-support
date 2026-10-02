---
title: Manual de Autenticação e Cadastro de Usuários (Eduardo & Tércio)
created: 2026-09-25
tags:
  - auth
  - users
  - eduardo
  - tercio
  - security
---

# 👤 Manual de Autenticação & Usuários

Este documento especifica a estrutura de contas de usuários iniciais e privilégios de acesso na plataforma **HelpUS Support Hub**.

---

## 🔑 Usuários Iniciais Cadastrados

| Usuário / Login | Nome Exibido | Função (Role) | Escopo de Acesso | Senha Inicial |
| :--- | :--- | :--- | :--- | :--- |
| **`eduardo`** | Eduardo Magalhães | `admin` | **Acesso Total** ao Painel Kanban de todos os clientes (`/admin`) | `admin123` |
| **`tercio`** | Tércio (Public Arte) | `client_admin` | **Portal do Cliente Public Arte** (`/portal`) | `admin123` |

---

## 🛡️ Permissões por Função (Roles)

### 1. Função `admin` (Eduardo)
- Visualização e filtragem do quadro Kanban para **todos os clientes** (`publicarte`, `tatica`, `fba-suite`).
- Alteração de status dos chamados (Triagem ➔ Em Atendimento ➔ Concluído).
- Atribuição de responsáveis e controle de SLA.
- Criação de **Notas Internas Privadas** (invisíveis para os clientes) e envio de respostas públicas.

### 2. Função `client_admin` / `client_user` (Tércio)
- Visualização exclusiva dos chamados pertencentes à sua empresa (`publicarte`).
- Abertura de novas solicitações com anexos e prioridade.
- Acompanhamento do histórico de mensagens e envio de respostas ao atendimento.

---

## 🔒 Instruções de Acesso

1. Acesse o portal em **[support.helpusbr.com](https://support.helpusbr.com)**.
2. Clique no botão **"Área do Cliente"** no cabeçalho superior.
3. Insira o nome de usuário (`eduardo` ou `tercio`) e a senha `admin123` (ou utilize os botões de login rápido).

---

[[index|⬅️ Voltar ao Índice do Vault]]
