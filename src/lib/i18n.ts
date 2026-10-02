export type Language = 'pt' | 'en' | 'es';

export interface Translations {
  nav: {
    features: string;
    integration: string;
    docs: string;
    clientArea: string;
    adminPanel: string;
  };
  hero: {
    badge: string;
    title: string;
    subtitle: string;
    clientAreaBtn: string;
    testWidgetBtn: string;
    statClients: string;
    statSla: string;
    statSatisfaction: string;
  };
  features: {
    title: string;
    subtitle: string;
    multiTenantTitle: string;
    multiTenantDesc: string;
    widgetTitle: string;
    widgetDesc: string;
    kanbanTitle: string;
    kanbanDesc: string;
    notesTitle: string;
    notesDesc: string;
  };
  auth: {
    loginTitle: string;
    loginSubtitle: string;
    usernameLabel: string;
    passwordLabel: string;
    loginBtn: string;
    quickAccessTitle: string;
    loginSuccess: string;
    invalidCredentials: string;
  };
  whatsapp: {
    tooltip: string;
    title: string;
    desc: string;
    button: string;
  };
}

export const DICTIONARY: Record<Language, Translations> = {
  pt: {
    nav: {
      features: 'Recursos',
      integration: 'Integração',
      docs: 'Documentação',
      clientArea: 'Área do Cliente',
      adminPanel: 'Painel Admin',
    },
    hero: {
      badge: 'HelpUS SaaS Suite • Support Hub',
      title: 'Central de Atendimento & Tickets Inteligente Multi-Tenant',
      subtitle: 'Gerencie todas as solicitações de clientes, erros, dúvidas e melhorias com um único widget plugável em 2 linhas de código.',
      clientAreaBtn: 'Área do Cliente (Entrar)',
      testWidgetBtn: 'Testar Widget (Public Arte)',
      statClients: 'Multi-Tenant Ativo',
      statSla: 'Atendimento com SLA',
      statSatisfaction: 'Satisfação Garantida',
    },
    features: {
      title: 'Solução Completa de Atendimento ao Cliente',
      subtitle: 'Desenvolvido sob medida para integrar seus sistemas em minutos.',
      multiTenantTitle: 'Isolamento Multi-Tenant',
      multiTenantDesc: 'Cada cliente (ex: Public Arte, Tática) possui sua visão de chamados e configurações personalizadas.',
      widgetTitle: 'Widget Flutuante Embeddable',
      widgetDesc: 'Um componente leve de atendimento que pode ser embutido em qualquer site ou web app.',
      kanbanTitle: 'Quadro Kanban & SLA',
      kanbanDesc: 'Acompanhe o ciclo de vida das solicitações em colunas: Triagem, Em Atendimento, Testes e Concluído.',
      notesTitle: 'Notas Internas & Respostas',
      notesDesc: 'Comunicação interna privada para os desenvolvedores e suporte, separada das mensagens públicas do cliente.',
    },
    auth: {
      loginTitle: 'Acesso à Área do Cliente / Admin',
      loginSubtitle: 'Entre com suas credenciais para visualizar e gerenciar chamados',
      usernameLabel: 'Usuário ou E-mail',
      passwordLabel: 'Senha',
      loginBtn: 'Entrar na Plataforma',
      quickAccessTitle: 'Acesso Rápido para Teste Inicial:',
      loginSuccess: 'Login realizado com sucesso!',
      invalidCredentials: 'Usuário ou senha incorretos.',
    },
    whatsapp: {
      tooltip: 'Falar com Atendimento no WhatsApp',
      title: 'Precisa de Ajuda Imediata?',
      desc: 'Nossa equipe de suporte técnico da HelpUS está pronta para te atender via WhatsApp.',
      button: 'Iniciar Conversa no WhatsApp',
    },
  },
  en: {
    nav: {
      features: 'Features',
      integration: 'Integration',
      docs: 'Documentation',
      clientArea: 'Client Area',
      adminPanel: 'Admin Panel',
    },
    hero: {
      badge: 'HelpUS SaaS Suite • Support Hub',
      title: 'Smart Multi-Tenant Customer Ticket & Support Hub',
      subtitle: 'Manage all customer requests, bugs, questions, and feature requests with a single widget embeddable in 2 lines of code.',
      clientAreaBtn: 'Client Area (Login)',
      testWidgetBtn: 'Test Widget (Public Arte)',
      statClients: 'Multi-Tenant Active',
      statSla: 'SLA-backed Support',
      statSatisfaction: 'Guaranteed Satisfaction',
    },
    features: {
      title: 'Complete Customer Support Solution',
      subtitle: 'Built from the ground up to integrate with your web apps in minutes.',
      multiTenantTitle: 'Multi-Tenant Isolation',
      multiTenantDesc: 'Each client (e.g. Public Arte, Tática) gets dedicated ticket visibility and custom settings.',
      widgetTitle: 'Embeddable Floating Widget',
      widgetDesc: 'Lightweight support chat widget embeddable into any website or React app.',
      kanbanTitle: 'Kanban Board & SLA',
      kanbanDesc: 'Track ticket lifecycles across status columns: New, In Progress, Testing, and Resolved.',
      notesTitle: 'Internal Notes & Public Replies',
      notesDesc: 'Private internal notes for developers and support staff, separate from public client replies.',
    },
    auth: {
      loginTitle: 'Client & Admin Portal Access',
      loginSubtitle: 'Enter your credentials to manage tickets and support requests',
      usernameLabel: 'Username or Email',
      passwordLabel: 'Password',
      loginBtn: 'Sign In to Hub',
      quickAccessTitle: 'Quick Demo Accounts:',
      loginSuccess: 'Login successful!',
      invalidCredentials: 'Invalid username or password.',
    },
    whatsapp: {
      tooltip: 'Chat with Support on WhatsApp',
      title: 'Need Immediate Help?',
      desc: 'Our HelpUS technical support team is available on WhatsApp right now.',
      button: 'Start WhatsApp Chat',
    },
  },
  es: {
    nav: {
      features: 'Características',
      integration: 'Integración',
      docs: 'Documentación',
      clientArea: 'Área del Cliente',
      adminPanel: 'Panel Admin',
    },
    hero: {
      badge: 'HelpUS SaaS Suite • Support Hub',
      title: 'Central de Atención y Tickets Inteligente Multi-Tenant',
      subtitle: 'Gestione todas las solicitudes de clientes, fallos y consultas con un único widget integrable en 2 líneas de código.',
      clientAreaBtn: 'Área del Cliente (Ingresar)',
      testWidgetBtn: 'Probar Widget (Public Arte)',
      statClients: 'Multi-Tenant Activo',
      statSla: 'Soporte con SLA',
      statSatisfaction: 'Satisfacción Garantizada',
    },
    features: {
      title: 'Solución Completa de Atención al Cliente',
      subtitle: 'Diseñado para integrarse en sus aplicaciones web en minutos.',
      multiTenantTitle: 'Aislamiento Multi-Tenant',
      multiTenantDesc: 'Cada cliente (ej. Public Arte, Tática) tiene su propia visibilidad de tickets y configuraciones.',
      widgetTitle: 'Widget Flotante Embebible',
      widgetDesc: 'Componente ligero de soporte integrable en cualquier sitio web o app.',
      kanbanTitle: 'Tablero Kanban y SLA',
      kanbanDesc: 'Siga el ciclo de vida de los tickets por columnas: Nuevo, En Atención, Pruebas y Resuelto.',
      notesTitle: 'Notas Internas y Respuestas Públicas',
      notesDesc: 'Comunicación interna privada para desarrolladores, separada de las respuestas al cliente.',
    },
    auth: {
      loginTitle: 'Acceso a la Área del Cliente / Admin',
      loginSubtitle: 'Ingrese sus credenciales para gestionar tickets y solicitudes',
      usernameLabel: 'Usuario o Correo',
      passwordLabel: 'Contraseña',
      loginBtn: 'Ingresar a la Plataforma',
      quickAccessTitle: 'Acceso Rápido para Prueba Inicial:',
      loginSuccess: '¡Inicio de sesión exitoso!',
      invalidCredentials: 'Usuario o contraseña incorrectos.',
    },
    whatsapp: {
      tooltip: 'Hablar con Soporte en WhatsApp',
      title: '¿Necesita Ayuda Inmediata?',
      desc: 'Nuestro equipo de soporte técnico de HelpUS está listo para atenderle por WhatsApp.',
      button: 'Iniciar Chat en WhatsApp',
    },
  },
};
