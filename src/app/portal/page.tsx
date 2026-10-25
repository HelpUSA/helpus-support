'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  LifeBuoy,
  Plus,
  Clock,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  ChevronRight,
  ShieldCheck,
  Send,
  LogOut,
  Paperclip,
  Trash2,
  RefreshCw,
  Bell,
  Search,
  FileText,
  Printer,
  Cpu,
  XCircle,
  Globe,
  X,
  Lock,
  Edit3,
  Mail,
  Loader2,
  Building2,
  MessageSquare,
} from 'lucide-react';
import { Ticket, TicketStatus, TicketCategory, TicketPriority, Attachment, Message } from '@/types/ticket';
import { AuthService, UserAccount, isAuthorizedSuperAdmin } from '@/lib/auth';
import { INITIAL_TENANTS } from '@/lib/tenants';
import { compressImage } from '@/lib/imageCompressor';
import { generateTicketPDFReport } from '@/lib/pdfGenerator';
import CookieConsent from '@/components/CookieConsent';
import PrivacyPolicyModal from '@/components/PrivacyPolicyModal';
import UserManagementModal from '@/components/UserManagementModal';
import SearchableTenantSelect from '@/components/SearchableTenantSelect';
import { Users } from 'lucide-react';

export default function ClientPortalPage() {
  const [user, setUser] = useState<UserAccount | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [tenantFilter, setTenantFilter] = useState<string>('all');
  const [targetTenantId, setTargetTenantId] = useState<string>('');
  const [lastSyncTime, setLastSyncTime] = useState<string>('');
  const [statusAlert, setStatusAlert] = useState<string | null>(null);

  // User Access Management Modal for SuperAdmin
  const [isUserMgmtOpen, setIsUserMgmtOpen] = useState(false);

  // Rejection Modal State (HelpUS Master)
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [isActionLoading, setIsActionLoading] = useState(false);

  // Approve Ticket Modal State (Master Admin)
  const [isApproveModalOpen, setIsApproveModalOpen] = useState(false);
  const [adminNotesInput, setAdminNotesInput] = useState('');

  // Edit Ticket Modal State (Client/User)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');

  // Cancel/Delete Ticket Modal State (Client/User)
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [cancellationNote, setCancellationNote] = useState('');

  // New Ticket Form State
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<TicketCategory>('support');
  const [priority, setPriority] = useState<TicketPriority>('medium');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Privacy Modal
  const [isPrivacyOpen, setIsPrivacyOpen] = useState(false);
  const [sendingEmailTicketId, setSendingEmailTicketId] = useState<string | null>(null);

  // R26-06 Customer & Agent Journey States
  const [statusFilterTab, setStatusFilterTab] = useState<'all' | 'pending' | 'in_progress' | 'resolved' | 'closed'>('all');
  const [replyContent, setReplyContent] = useState('');
  const [replyAttachments, setReplyAttachments] = useState<Attachment[]>([]);
  const [replyIsInternal, setReplyIsInternal] = useState(false);
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);
  const [closeFeedback, setCloseFeedback] = useState('');
  const [isReopenModalOpen, setIsReopenModalOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState('');

  const prevTicketsRef = useRef<Map<string, string>>(new Map());
  const prevProgressRef = useRef<Map<string, number>>(new Map());
  const selectedTicketRef = useRef<Ticket | null>(null);
  const tenantFilterRef = useRef<string>('all');
  const inFlightRef = useRef<boolean>(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const failureCountRef = useRef<number>(0);

  useEffect(() => {
    tenantFilterRef.current = tenantFilter;
  }, [tenantFilter]);

  useEffect(() => {
    selectedTicketRef.current = selectedTicket;
  }, [selectedTicket]);

  useEffect(() => {
    // Check server session cookie first
    fetch('/api/auth/session')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.authenticated && data?.user) {
          const sUser: UserAccount = {
            id: data.user.id || data.user.email,
            email: data.user.email,
            name: data.user.name || data.user.email.split('@')[0],
            role: data.user.role,
            tenantId: data.user.tenantId,
            username: data.user.username || data.user.email.split('@')[0],
            hasSupportAccess: data.user.hasSupportAccess ?? true,
            allowedTenantIds: data.user.allowedTenantIds || [data.user.tenantId],
            status: data.user.status || 'active',
          };
          setUser(sUser);
          if (typeof window !== 'undefined') {
            localStorage.setItem('helpus_auth_user_v2', JSON.stringify(sUser));
          }
        }
      })
      .catch(() => {});

    let currentUser: UserAccount | null = AuthService.getCurrentUser();

    if (currentUser && currentUser.email !== 'helpus.ecommerce@gmail.com' && currentUser.email !== 'wagner.redes@gmail.com' && currentUser.role !== 'super_admin') {
      if (currentUser.email === 'dralexgomes@gmail.com') {
        currentUser.role = 'client_user';
        currentUser.name = 'Dr. Alexander Gomes';
      }
    }

    setUser(currentUser);

    const initialTenant = (currentUser?.role === 'super_admin' || currentUser?.role === 'admin')
      ? 'all'
      : (currentUser?.tenantId || 'publicarte');

    setTenantFilter(initialTenant);
    tenantFilterRef.current = initialTenant;
    loadTickets(initialTenant, true);

    // Otimização de Polling Inteligente (P2):
    // - Redução/pausa quando a aba estiver oculta (document.visibilityState === 'hidden')
    // - Atualização imediata ao retornar para o primeiro plano (visibilitychange)
    // - Backoff exponencial controlado em falhas sucessivas
    let timerId: NodeJS.Timeout;
    let isCancelled = false;

    const scheduleNextPoll = () => {
      if (isCancelled) return;
      const isHidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
      let delay = 2500;

      if (isHidden) {
        delay = 30000; // Reduz para 30s se a aba estiver em segundo plano
      } else if (failureCountRef.current > 0) {
        // Backoff exponencial controlado em falhas sucessivas: 2.5s, 5s, 10s... até máx 30s
        delay = Math.min(30000, 2500 * Math.pow(1.5, Math.min(failureCountRef.current, 5)));
      }

      timerId = setTimeout(async () => {
        if (!isCancelled) {
          await loadTickets(tenantFilterRef.current, false);
          scheduleNextPoll();
        }
      }, delay);
    };

    scheduleNextPoll();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && !isCancelled) {
        clearTimeout(timerId);
        loadTickets(tenantFilterRef.current, false);
        scheduleNextPoll();
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    return () => {
      isCancelled = true;
      clearTimeout(timerId);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const loadTickets = async (filterTenantId: string, isInitial = false) => {
    // Prevenção de requisições simultâneas duplicadas
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    try {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      const authHeaders = AuthService.getAuthHeaders();
      const res = await fetch(`/api/tickets?tenantId=${filterTenantId}&t=${Date.now()}`, {
        headers: authHeaders,
        cache: 'no-store',
        signal: abortControllerRef.current.signal,
      });
      const data = await res.json();
      
      let fetchedTickets: Ticket[] = data.success ? data.data : [];

      if (data.success) {
        failureCountRef.current = 0; // Recuperação e reset de falhas
        fetchedTickets = data.data;
        if (typeof window !== 'undefined') {
          localStorage.setItem('helpus_client_tickets_cache_v5', JSON.stringify(fetchedTickets));
        }
      } else {
        failureCountRef.current += 1;
        if (typeof window !== 'undefined') {
          const cached = localStorage.getItem('helpus_client_tickets_cache_v5');
          if (cached) {
            try {
              fetchedTickets = JSON.parse(cached);
            } catch {}
          }
        }
      }

      if (!isInitial) {
        fetchedTickets.forEach((t) => {
          const prevStatus = prevTicketsRef.current.get(t.id);
          const prevProgress = prevProgressRef.current.get(t.id);

          if (prevStatus && prevStatus !== t.status) {
            const statusName = getStatusLabel(t.status);
            setStatusAlert(`✨ Notificação em Tempo Real: O chamado [${t.code}] foi atualizado para "${statusName}"!`);
            setTimeout(() => setStatusAlert(null), 6000);
          } else if (
            prevProgress !== undefined &&
            t.progressPercentage !== undefined &&
            prevProgress !== t.progressPercentage
          ) {
            setStatusAlert(
              `⚡ Progresso em Tempo Real Antigravity [${t.code}]: ${t.progressPercentage}% — ${t.progressStep || 'Processando em segundo plano...'}`
            );
            setTimeout(() => setStatusAlert(null), 6000);
          }

          prevTicketsRef.current.set(t.id, t.status);
          if (t.progressPercentage !== undefined) {
            prevProgressRef.current.set(t.id, t.progressPercentage);
          }
        });
      } else {
        fetchedTickets.forEach((t) => {
          prevTicketsRef.current.set(t.id, t.status);
          if (t.progressPercentage !== undefined) {
            prevProgressRef.current.set(t.id, t.progressPercentage);
          }
        });
      }

      setTickets(fetchedTickets);
      setLastSyncTime(new Date().toLocaleTimeString());

      const activeSelectedId = selectedTicketRef.current?.id;
      if (activeSelectedId) {
        const updatedSelected = fetchedTickets.find((t) => t.id === activeSelectedId);
        if (updatedSelected) {
          setSelectedTicket(updatedSelected);
          selectedTicketRef.current = updatedSelected;
        }
      } else if (isInitial && fetchedTickets.length > 0) {
        setSelectedTicket(fetchedTickets[0]);
        selectedTicketRef.current = fetchedTickets[0];
      }
    } catch (e: any) {
      if (e?.name !== 'AbortError') {
        failureCountRef.current += 1;
        console.error('Error fetching tickets:', e);
      }
    } finally {
      inFlightRef.current = false;
    }
  };

  const handleTenantFilterChange = (newTenant: string) => {
    setTenantFilter(newTenant);
    loadTickets(newTenant, false);
  };

  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          try {
            const compressed = await compressImage(file, 1920, 1080, 0.8);
            const att: Attachment = {
              id: compressed.id,
              name: compressed.name,
              url: compressed.dataUrl,
              type: compressed.type,
              size: compressed.compressedSize,
            };
            setAttachments((prev) => [...prev, att]);
          } catch (err) {
            console.error(err);
          }
        }
      }
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    for (let i = 0; i < files.length; i++) {
      try {
        const compressed = await compressImage(files[i], 1920, 1080, 0.8);
        const att: Attachment = {
          id: compressed.id,
          name: compressed.name,
          url: compressed.dataUrl,
          type: compressed.type,
          size: compressed.compressedSize,
        };
        setAttachments((prev) => [...prev, att]);
      } catch (err) {
        console.error(err);
      }
    }
  };

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !description || !user) return;

    setIsSubmitting(true);
    try {
      const selectedTenant = isMasterUser
        ? (targetTenantId || (tenantFilter !== 'all' ? tenantFilter : (user.tenantId || 'neuro.eduardomagalhaes')))
        : (user.tenantId || 'neuro.eduardomagalhaes');

      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: { ...AuthService.getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: selectedTenant,
          title,
          description,
          category,
          priority,
          createdByEmail: user.email,
          createdByName: user.name,
          contextData: {
            url: window.location.href,
            userEmail: user.email,
            userName: user.name,
            os: 'Windows 11 (Chrome 128)',
          },
          attachments,
          clientTicketCount: tickets.length,
        }),
      });

      const data = await res.json();
      if (data.success) {
        const newTicket: Ticket = data.data;

        // Immediately persist to client cache so ticket NEVER disappears
        if (typeof window !== 'undefined') {
          const cached = localStorage.getItem('helpus_client_tickets_cache_v5');
          let localList: Ticket[] = cached ? JSON.parse(cached) : [];
          localList.unshift(newTicket);
          localStorage.setItem('helpus_client_tickets_cache_v5', JSON.stringify(localList));
        }

        setTitle('');
        setDescription('');
        setAttachments([]);
        setIsCreatingNew(false);
        loadTickets(tenantFilter, false);
        setSelectedTicket(newTicket);
        setStatusAlert(`📧 Chamado [${newTicket.code}] Registrado! Alerta por E-mail enviado para helpus.ecommerce@gmail.com.`);
        setTimeout(() => setStatusAlert(null), 8000);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApproveTicket = async (ticketId: string, adminNotes?: string) => {
    setIsActionLoading(true);
    try {
      const tenantMap: Record<string, string> = {
        publicarte: 'Public Arte',
        'neuro.eduardomagalhaes': 'Dr. Eduardo Magalhães Neurologista (Neuro)',
        tatica: 'Tática Assessoria Contábil',
        'fba-suite': 'HelpUs FBA Suite',
        studionaldohair: 'Studio Naldo Hair',
        usmle: 'USMLE Prep Suite',
        aidoctor: 'AIDoctor',
      };

      const finalTenantId = isMasterUser ? (targetTenantId || selectedTicket?.tenantId || user?.tenantId || 'neuro.eduardomagalhaes') : (selectedTicket?.tenantId || user?.tenantId || 'neuro.eduardomagalhaes');
      const finalTenantName = tenantMap[finalTenantId] || selectedTicket?.tenantName || (finalTenantId === 'neuro.eduardomagalhaes' ? 'Dr. Eduardo Magalhães Neurologista (Neuro)' : 'Public Arte');

      const ticketToApprove = selectedTicket
        ? {
            ...selectedTicket,
            tenantId: finalTenantId,
            tenantName: finalTenantName,
          }
        : undefined;

      const res = await fetch(`/api/tickets/${ticketId}`, {
        method: 'PATCH',
        headers: { ...AuthService.getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'approve',
          agentName: user?.name || 'HelpUS Master',
          adminNotes: adminNotes || undefined,
          ticketData: ticketToApprove,
        }),
      });

      const data = await res.json();
      if (data.success) {
        const updatedTicket: Ticket = data.data;

        // Immediately update React state for ticket list and selected ticket
        setTickets((prev) => prev.map((t) => (t.id === updatedTicket.id ? updatedTicket : t)));
        setSelectedTicket(updatedTicket);

        if (typeof window !== 'undefined') {
          const cached = localStorage.getItem('helpus_client_tickets_cache_v5');
          let localList: Ticket[] = cached ? JSON.parse(cached) : [];
          localList = localList.map((t) => (t.id === updatedTicket.id ? updatedTicket : t));
          localStorage.setItem('helpus_client_tickets_cache_v5', JSON.stringify(localList));
        }

        setIsApproveModalOpen(false);
        setAdminNotesInput('');
        setStatusAlert(`⚡ Chamado [${updatedTicket.code}] Aprovado & ENTROU EM PRODUÇÃO! O robô autônomo está compilando o código e verificando o deploy na nuvem...`);
        setTimeout(() => setStatusAlert(null), 8000);
      } else {
        setStatusAlert(`⚠️ Erro ao aprovar chamado: ${data.error || 'Falha no servidor'}`);
      }
    } catch (e: any) {
      console.error(e);
      setStatusAlert(`⚠️ Erro de conexão ao aprovar chamado.`);
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleRejectTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || !rejectionReason.trim()) return;

    setIsActionLoading(true);
    try {
      const res = await fetch(`/api/tickets/${selectedTicket.id}`, {
        method: 'PATCH',
        headers: { ...AuthService.getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reject',
          rejectionReason: rejectionReason.trim(),
          agentName: user?.name || 'HelpUS Master',
        }),
      });

      const data = await res.json();
      if (data.success) {
        const updatedTicket: Ticket = data.data;
        setTickets((prev) => prev.map((t) => (t.id === updatedTicket.id ? updatedTicket : t)));
        setSelectedTicket(updatedTicket);

        if (typeof window !== 'undefined') {
          const cached = localStorage.getItem('helpus_client_tickets_cache_v5');
          let localList: Ticket[] = cached ? JSON.parse(cached) : [];
          localList = localList.map((t) => (t.id === updatedTicket.id ? updatedTicket : t));
          localStorage.setItem('helpus_client_tickets_cache_v5', JSON.stringify(localList));
        }

        setIsRejectModalOpen(false);
        setRejectionReason('');
        setStatusAlert(`❌ Chamado [${updatedTicket.code}] Recusado. Notificação enviada ao cliente.`);
        setTimeout(() => setStatusAlert(null), 6000);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleEditTicketSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || !editTitle || !editDescription) return;

    setIsActionLoading(true);
    try {
      const res = await fetch(`/api/tickets/${selectedTicket.id}`, {
        method: 'PATCH',
        headers: { ...AuthService.getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'edit',
          title: editTitle,
          description: editDescription,
        }),
      });

      const data = await res.json();
      if (data.success) {
        const updatedTicket: Ticket = data.data;
        setTickets((prev) => prev.map((t) => (t.id === updatedTicket.id ? updatedTicket : t)));
        setSelectedTicket(updatedTicket);

        if (typeof window !== 'undefined') {
          const cached = localStorage.getItem('helpus_client_tickets_cache_v5');
          let localList: Ticket[] = cached ? JSON.parse(cached) : [];
          localList = localList.map((t) => (t.id === updatedTicket.id ? updatedTicket : t));
          localStorage.setItem('helpus_client_tickets_cache_v5', JSON.stringify(localList));
        }

        setIsEditModalOpen(false);
        setStatusAlert(`✏️ Chamado [${updatedTicket.code}] editado e atualizado com sucesso!`);
        setTimeout(() => setStatusAlert(null), 6000);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleCancelTicketSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || !cancellationNote.trim()) return;

    setIsActionLoading(true);
    try {
      const res = await fetch(`/api/tickets/${selectedTicket.id}`, {
        method: 'PATCH',
        headers: { ...AuthService.getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'cancel',
          cancellationReason: cancellationNote.trim(),
          cancelledByName: user?.name || 'Cliente',
        }),
      });

      const data = await res.json();
      if (data.success) {
        const updatedTicket: Ticket = data.data;
        setTickets((prev) => prev.map((t) => (t.id === updatedTicket.id ? updatedTicket : t)));
        setSelectedTicket(updatedTicket);

        if (typeof window !== 'undefined') {
          const cached = localStorage.getItem('helpus_client_tickets_cache_v5');
          let localList: Ticket[] = cached ? JSON.parse(cached) : [];
          localList = localList.map((t) => (t.id === updatedTicket.id ? updatedTicket : t));
          localStorage.setItem('helpus_client_tickets_cache_v5', JSON.stringify(localList));
        }

        setIsCancelModalOpen(false);
        setCancellationNote('');
        setStatusAlert(`🗑️ Chamado [${updatedTicket.code}] cancelado/excluído com sucesso. Notificação por e-mail enviada.`);
        setTimeout(() => setStatusAlert(null), 6000);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleReplyFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const compressed = await compressImage(file, 1920, 1080, 0.8);
        setReplyAttachments((prev) => [
          ...prev,
          {
            id: compressed.id,
            name: compressed.name,
            url: compressed.dataUrl,
            type: compressed.type,
            size: compressed.compressedSize,
          },
        ]);
      } catch (err) {
        console.error('Erro na compressão do anexo de resposta', err);
      }
    }
  };

  const handleReplyPaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          try {
            const compressed = await compressImage(file, 1920, 1080, 0.8);
            setReplyAttachments((prev) => [
              ...prev,
              {
                id: compressed.id,
                name: compressed.name,
                url: compressed.dataUrl,
                type: compressed.type,
                size: compressed.compressedSize,
              },
            ]);
            setStatusAlert('📸 Print colado e anexado com sucesso!');
            setTimeout(() => setStatusAlert(null), 3000);
          } catch (err) {
            console.error('Erro ao colar imagem na resposta', err);
          }
        }
      }
    }
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || (!replyContent.trim() && replyAttachments.length === 0)) return;

    setIsSendingReply(true);
    try {
      const res = await fetch(`/api/tickets/${selectedTicket.id}`, {
        method: 'POST',
        headers: { ...AuthService.getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senderId: user?.email || 'client',
          senderName: user?.name || (user?.email ? user.email.split('@')[0] : 'Cliente'),
          senderRole: isMasterUser ? 'agent' : 'client',
          isInternalNote: isMasterUser ? replyIsInternal : false,
          content: replyContent.trim(),
          attachments: replyAttachments,
        }),
      });

      const data = await res.json();
      if (data.success) {
        const newMsg: Message = data.data;
        const updatedTicket: Ticket = {
          ...selectedTicket,
          messages: [...selectedTicket.messages, newMsg],
          updatedAt: new Date().toISOString(),
        };
        setSelectedTicket(updatedTicket);
        setTickets((prev) => prev.map((t) => (t.id === updatedTicket.id ? updatedTicket : t)));
        setReplyContent('');
        setReplyAttachments([]);
        setStatusAlert('💬 Mensagem enviada com sucesso no chamado!');
        setTimeout(() => setStatusAlert(null), 5000);
      } else {
        alert(data.error || 'Erro ao enviar mensagem');
      }
    } catch (e: any) {
      console.error(e);
      alert('Erro de conexão ao enviar mensagem');
    } finally {
      setIsSendingReply(false);
    }
  };

  const handleCloseTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket) return;

    setIsActionLoading(true);
    try {
      const res = await fetch(`/api/tickets/${selectedTicket.id}`, {
        method: 'PATCH',
        headers: { ...AuthService.getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'close',
          feedback: closeFeedback.trim(),
          userName: user?.name || user?.email,
        }),
      });

      const data = await res.json();
      if (data.success) {
        const updatedTicket: Ticket = data.data;
        setSelectedTicket(updatedTicket);
        setTickets((prev) => prev.map((t) => (t.id === updatedTicket.id ? updatedTicket : t)));
        setIsCloseModalOpen(false);
        setCloseFeedback('');
        setStatusAlert(`✅ Chamado [${updatedTicket.code}] encerrado com sucesso. Obrigado pelo feedback!`);
        setTimeout(() => setStatusAlert(null), 6000);
      } else {
        alert(data.error || 'Erro ao encerrar chamado');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleReopenTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || !reopenReason.trim()) return;

    setIsActionLoading(true);
    try {
      const res = await fetch(`/api/tickets/${selectedTicket.id}`, {
        method: 'PATCH',
        headers: { ...AuthService.getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reopen',
          reason: reopenReason.trim(),
          userName: user?.name || user?.email,
        }),
      });

      const data = await res.json();
      if (data.success) {
        const updatedTicket: Ticket = data.data;
        setSelectedTicket(updatedTicket);
        setTickets((prev) => prev.map((t) => (t.id === updatedTicket.id ? updatedTicket : t)));
        setIsReopenModalOpen(false);
        setReopenReason('');
        setStatusAlert(`🔄 Chamado [${updatedTicket.code}] reaberto. A equipe técnica foi notificada.`);
        setTimeout(() => setStatusAlert(null), 6000);
      } else {
        alert(data.error || 'Erro ao reabrir chamado');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleLogout = () => {
    AuthService.logout();
    window.location.href = '/';
  };

  const isMasterUser = Boolean(user && isAuthorizedSuperAdmin(user));
  const isSuperAdmin = Boolean(user && isAuthorizedSuperAdmin(user));

  const availableTenants = INITIAL_TENANTS.filter((t) => {
    if (!user) return false;
    if (isSuperAdmin || user.allowedTenantIds?.includes('all')) return true;
    if (user.allowedTenantIds && user.allowedTenantIds.length > 0) {
      return user.allowedTenantIds.includes(t.id);
    }
    return t.id === (user.tenantId || 'publicarte');
  });

  const filteredTickets = tickets.filter((t) => {
    const matchesSearch =
      t.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.description.toLowerCase().includes(searchTerm.toLowerCase());
    if (!matchesSearch) return false;

    if (statusFilterTab === 'pending') return t.status === 'pending_approval';
    if (statusFilterTab === 'in_progress') return t.status === 'in_production' || t.status === 'in_progress' || t.status === 'in_testing';
    if (statusFilterTab === 'resolved') return t.status === 'resolved';
    if (statusFilterTab === 'closed') return t.status === 'closed';
    return true;
  });

  const pendingCount = tickets.filter((t) => t.status === 'pending_approval').length;
  const inProgressCount = tickets.filter((t) => t.status === 'in_production' || t.status === 'in_progress' || t.status === 'in_testing').length;
  const resolvedCount = tickets.filter((t) => t.status === 'resolved' || t.status === 'closed').length;

  const handleSendTicketEmail = async (ticket: Ticket) => {
    try {
      setSendingEmailTicketId(ticket.id);
      const res = await fetch(`/api/tickets/${ticket.id}/email`, {
        method: 'POST',
        headers: { ...AuthService.getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: ticket.createdByEmail }),
      });
      const data = await res.json();
      if (data.success) {
        setStatusAlert(`📧 Laudo técnico enviado com sucesso para ${ticket.createdByEmail}!`);
        setTimeout(() => setStatusAlert(null), 6000);
      } else {
        alert(data.error || 'Erro ao enviar e-mail');
      }
    } catch (e: any) {
      alert(`Erro ao conectar com o serviço de e-mail: ${e.message}`);
    } finally {
      setSendingEmailTicketId(null);
    }
  };

  const getStatusLabel = (status: TicketStatus) => {
    switch (status) {
      case 'pending_approval':
        return 'Aguardando Aprovação';
      case 'new':
        return 'Triagem';
      case 'in_progress':
        return 'Em Atendimento';
      case 'in_production':
        return 'Entrou em Produção';
      case 'waiting_client':
        return 'Aguardando Você';
      case 'resolved':
        return 'Concluído';
      case 'rejected':
        return 'Recusado';
      case 'closed':
        return 'Cancelado pelo Cliente';
    }
  };

  const getStatusBadge = (status: TicketStatus) => {
    switch (status) {
      case 'pending_approval':
        return <span className="px-2.5 py-1 text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-full flex items-center gap-1"><Clock className="w-3.5 h-3.5 animate-pulse" /> Aguardando Aprovação</span>;
      case 'new':
        return <span className="px-2.5 py-1 text-xs font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-full flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> Triagem</span>;
      case 'in_progress':
        return <span className="px-2.5 py-1 text-xs font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-full flex items-center gap-1 animate-pulse"><Sparkles className="w-3.5 h-3.5" /> Em Atendimento</span>;
      case 'in_production':
        return <span className="px-2.5 py-1 text-xs font-bold bg-purple-500/10 text-purple-300 border border-purple-500/20 rounded-full flex items-center gap-1 animate-pulse"><Cpu className="w-3.5 h-3.5 text-purple-400" /> Entrou em Produção</span>;
      case 'waiting_client':
        return <span className="px-2.5 py-1 text-xs font-bold bg-purple-500/10 text-purple-400 border border-purple-500/20 rounded-full flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" /> Aguardando Você</span>;
      case 'resolved':
        return <span className="px-2.5 py-1 text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Concluído</span>;
      case 'rejected':
        return <span className="px-2.5 py-1 text-xs font-bold bg-red-500/10 text-red-400 border border-red-500/20 rounded-full flex items-center gap-1"><XCircle className="w-3.5 h-3.5" /> Recusado</span>;
      case 'closed':
        return <span className="px-2.5 py-1 text-xs font-bold bg-slate-800 text-slate-400 border border-slate-700 rounded-full flex items-center gap-1"><Trash2 className="w-3.5 h-3.5" /> Cancelado</span>;
    }
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500/30 selection:text-indigo-200 max-w-full overflow-x-hidden">
      {/* Top Header */}
      <header className="bg-slate-900 border-b border-slate-800 px-3 sm:px-6 py-2.5 sm:py-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 sticky top-0 z-40 max-w-full">
        <div className="flex items-center justify-between gap-3">
          <Link href="/" className="group flex items-center gap-2.5">
            <img
              src="/helpus-logo.jpg"
              alt="HelpUS Logo"
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-full object-cover border-2 border-indigo-500/50 shadow-lg shadow-indigo-500/20 group-hover:scale-105 transition-transform shrink-0"
            />
            <div>
              <h1 className="font-extrabold text-sm sm:text-base text-white flex items-center gap-2">
                {isMasterUser ? (
                  <span className="flex items-center gap-1.5 text-purple-300">
                    👑 Painel Master HelpUS
                  </span>
                ) : (
                  `Portal do Cliente — ${user.tenantName || 'Public Arte'}`
                )}
              </h1>
              <p className="text-[11px] sm:text-xs text-slate-400 flex items-center gap-2">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="truncate">{isMasterUser ? 'Gestão Geral de Aprovações & Soluções' : 'Área de acompanhamento de solicitações'}</span>
              </p>
            </div>
          </Link>
        </div>

        {/* User Info & Tenant Filter for Master */}
        <div className="flex flex-wrap items-center justify-between md:justify-end gap-2 text-xs w-full md:w-auto">
          {isSuperAdmin && (
            <button
              onClick={() => setIsUserMgmtOpen(true)}
              className="px-2.5 py-1.5 sm:py-2 bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-500 hover:to-indigo-500 text-white font-extrabold rounded-xl shadow-lg shadow-purple-600/30 text-xs flex items-center gap-1.5 transition-all cursor-pointer border border-purple-400/30 shrink-0"
            >
              <Users className="w-4 h-4 text-purple-200" />
              <span className="hidden sm:inline">Gestão de Usuários & Aplicações</span>
              <span className="sm:hidden">Usuários</span>
            </button>
          )}

          {isMasterUser && (
            <SearchableTenantSelect
              tenants={availableTenants}
              value={tenantFilter}
              onChange={(val) => handleTenantFilterChange(val)}
              includeAllOption={isSuperAdmin}
              allOptionLabel="🌐 Todas as Empresas"
              placeholder="🔍 Buscar empresa (ex: plural)..."
            />
          )}

          <div className="hidden xl:flex items-center gap-2 px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl shrink-0">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <span className="text-slate-400">Nuvem 24/7 • <strong className="text-slate-200">{lastSyncTime}</strong></span>
          </div>

          <div className="flex items-center gap-2 bg-slate-900 px-2.5 py-1 rounded-xl border border-slate-800 shrink-0">
            <img src={user.avatarUrl} alt={user.name} className="w-6 h-6 sm:w-7 sm:h-7 rounded-full border border-indigo-500/50 shrink-0" />
            <div className="text-left hidden sm:block">
              <span className="font-bold text-slate-200 block text-xs truncate max-w-[120px]">
                {user.name}
              </span>
              <span className="text-[10px] text-slate-400 block truncate max-w-[120px]">{user.email}</span>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="px-2.5 py-1.5 bg-red-950/40 hover:bg-red-900/60 text-red-300 hover:text-white rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer border border-red-500/30 shrink-0"
            title="Sair do Sistema"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sair</span>
          </button>
        </div>
      </header>

      {/* Live Status Toast Notification */}
      {statusAlert && (
        <div className="bg-indigo-600/90 border-b border-indigo-500 text-white px-4 sm:px-6 py-2.5 text-xs font-semibold flex items-center gap-2 animate-in fade-in shadow-lg">
          <Bell className="w-4 h-4 text-emerald-400 animate-bounce shrink-0" />
          <span>{statusAlert}</span>
        </div>
      )}

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 overflow-x-hidden">
        {/* Left Sidebar: Tickets List & Filters */}
        <div className="lg:col-span-4 space-y-3 flex flex-col h-auto max-h-[380px] lg:max-h-none lg:h-[calc(100vh-140px)]">
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={() => {
                setIsCreatingNew(true);
                setSelectedTicket(null);
              }}
              className="flex-1 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-lg shadow-indigo-600/20 text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" /> Nova Solicitação
            </button>

            <button
              onClick={() => loadTickets(tenantFilter, false)}
              title="Atualizar chamados"
              className="p-2.5 bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          {/* Pending Approvals Counter Badge for Master */}
          {isMasterUser && pendingCount > 0 && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center justify-between text-xs text-amber-300">
              <span className="flex items-center gap-1.5 font-bold">
                <Clock className="w-4 h-4 text-amber-400 animate-pulse" /> {pendingCount} chamado(s) aguardando aprovação
              </span>
            </div>
          )}

          <div className="flex items-center gap-2 bg-slate-900 px-3.5 py-2 rounded-xl border border-slate-800">
            <Search className="w-4 h-4 text-slate-500" />
            <input
              type="text"
              placeholder="Buscar por título ou código..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-transparent text-xs text-slate-200 placeholder-slate-500 focus:outline-none w-full"
            />
          </div>

          {/* Quick Filter Tabs */}
          <div className="grid grid-cols-4 gap-1 p-1 bg-slate-950 rounded-xl border border-slate-800 text-[11px] font-semibold">
            <button
              onClick={() => setStatusFilterTab('all')}
              className={`py-1.5 rounded-lg transition-all text-center cursor-pointer ${
                statusFilterTab === 'all'
                  ? 'bg-indigo-600 text-white font-bold shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Todos ({tickets.length})
            </button>
            <button
              onClick={() => setStatusFilterTab('pending')}
              className={`py-1.5 rounded-lg transition-all text-center cursor-pointer relative ${
                statusFilterTab === 'pending'
                  ? 'bg-amber-600 text-white font-bold shadow'
                  : 'text-slate-400 hover:text-amber-300'
              }`}
            >
              Fila {pendingCount > 0 && <span className="ml-0.5 px-1 py-0.2 text-[9px] bg-amber-400 text-slate-950 font-black rounded-full">{pendingCount}</span>}
            </button>
            <button
              onClick={() => setStatusFilterTab('in_progress')}
              className={`py-1.5 rounded-lg transition-all text-center cursor-pointer ${
                statusFilterTab === 'in_progress'
                  ? 'bg-purple-600 text-white font-bold shadow'
                  : 'text-slate-400 hover:text-purple-300'
              }`}
            >
              Atend. {inProgressCount > 0 && <span className="ml-0.5 px-1 py-0.2 text-[9px] bg-purple-400 text-slate-950 font-black rounded-full">{inProgressCount}</span>}
            </button>
            <button
              onClick={() => setStatusFilterTab('resolved')}
              className={`py-1.5 rounded-lg transition-all text-center cursor-pointer ${
                statusFilterTab === 'resolved'
                  ? 'bg-emerald-600 text-white font-bold shadow'
                  : 'text-slate-400 hover:text-emerald-300'
              }`}
            >
              Feitos {resolvedCount > 0 && <span className="ml-0.5 px-1 py-0.2 text-[9px] bg-emerald-400 text-slate-950 font-black rounded-full">{resolvedCount}</span>}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
            {filteredTickets.length === 0 ? (
              <div
                onClick={() => {
                  setIsCreatingNew(true);
                  setSelectedTicket(null);
                }}
                className="text-center py-12 text-slate-500 text-xs space-y-3 border border-dashed border-slate-800 hover:border-indigo-500/50 rounded-2xl p-4 cursor-pointer transition-all bg-slate-900/30 hover:bg-indigo-950/20 group"
              >
                <LifeBuoy className="w-10 h-10 mx-auto text-indigo-400 opacity-60 group-hover:scale-110 transition-transform" />
                <div>
                  <p className="font-bold text-slate-300 text-sm">Nenhum chamado encontrado.</p>
                  <p className="text-[11px] text-slate-400 mt-1">Clique aqui para abrir uma nova solicitação.</p>
                </div>
                <button
                  type="button"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs inline-flex items-center gap-1.5 shadow-md transition-all cursor-pointer"
                >
                  <Plus className="w-4 h-4" /> Abrir Nova Solicitação
                </button>
              </div>
            ) : (
              filteredTickets.map((t) => {
                const isSelected = selectedTicket?.id === t.id && !isCreatingNew;
                return (
                  <div
                    key={t.id}
                    onClick={() => {
                      setSelectedTicket(t);
                      setTargetTenantId(t.tenantId || 'publicarte');
                      setIsCreatingNew(false);
                    }}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer space-y-2 group ${
                      isSelected
                        ? 'bg-indigo-950/40 border-indigo-500 shadow-xl'
                        : 'bg-slate-900/80 border-slate-800 hover:border-indigo-500/50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-[10px] font-bold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
                          {t.code}
                        </span>
                        {isMasterUser && (
                          <span className="text-[9px] font-semibold text-slate-400 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">
                            {t.tenantName}
                          </span>
                        )}
                      </div>
                      {getStatusBadge(t.status)}
                    </div>
                    <h3 className="font-bold text-xs text-slate-100 group-hover:text-indigo-300 transition-colors line-clamp-1">
                      {t.title}
                    </h3>
                    <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                      {t.description}
                    </p>
                    <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1.5 border-t border-slate-900">
                      <span>{new Date(t.createdAt).toLocaleDateString('pt-BR')}</span>
                      <span className="flex items-center gap-1 text-indigo-400 font-medium">
                        Ver detalhes <ChevronRight className="w-3 h-3" />
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Workspace Main View */}
        <div className="lg:col-span-8 bg-slate-900/90 border border-slate-800 rounded-3xl p-4 sm:p-6 flex flex-col h-auto lg:h-[calc(100vh-140px)] min-h-[450px] shadow-2xl backdrop-blur-xl">
          {/* VIEW 1: Create New Ticket Form */}
          {isCreatingNew ? (
            <div className="flex flex-col h-full space-y-4">
              <div className="border-b border-slate-800 pb-3 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    <FileText className="w-5 h-5 text-indigo-400" /> Nova Solicitação
                  </h2>
                  <p className="text-xs text-slate-400">Envie a sua necessidade. O Administrador HelpUS será notificado instantaneamente por e-mail.</p>
                </div>
                <button
                  onClick={() => setIsCreatingNew(false)}
                  className="text-xs text-slate-400 hover:text-white cursor-pointer"
                >
                  Cancelar
                </button>
              </div>

              <form onSubmit={handleCreateTicket} className="flex-1 overflow-y-auto space-y-4 text-xs pr-1">
                {isMasterUser && (
                  <div className="bg-indigo-950/40 p-3.5 rounded-xl border border-indigo-500/30 space-y-1.5">
                    <label className="block text-indigo-300 font-semibold flex items-center justify-between">
                      <span className="flex items-center gap-1.5"><Building2 className="w-4 h-4 text-indigo-400" /> Empresa / Aplicação do Cliente Alvo</span>
                      <span className="text-[10px] text-slate-400 font-normal">SuperAdmin: Escolha a aplicação do cliente</span>
                    </label>
                    <SearchableTenantSelect
                      tenants={INITIAL_TENANTS}
                      value={targetTenantId}
                      onChange={(val) => setTargetTenantId(val)}
                      placeholder="🔍 Buscar empresa..."
                    />
                  </div>
                )}

                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Tipo de Solicitação</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as TicketCategory)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-200 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="support">🛠️ Suporte Técnico Geral</option>
                    <option value="bug">🐞 Correção de Erro / Bug</option>
                    <option value="feature">🚀 Pedido de Nova Funcionalidade</option>
                    <option value="question">❓ Dúvida sobre o Sistema</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Assunto / Título Resumido</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Alterar imagem da xícara no produto..."
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Prioridade</label>
                  <div className="grid grid-cols-4 gap-2">
                    {(['low', 'medium', 'high', 'urgent'] as TicketPriority[]).map((p) => (
                      <button
                        type="button"
                        key={p}
                        onClick={() => setPriority(p)}
                        className={`py-2 rounded-xl font-bold text-xs border text-center transition-all cursor-pointer ${
                          priority === p
                            ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300'
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        {p === 'low' && 'Baixa'}
                        {p === 'medium' && 'Média'}
                        {p === 'high' && 'Alta'}
                        {p === 'urgent' && 'Urgente'}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Descrição Detalhada da Necessidade</label>
                  <textarea
                    required
                    rows={5}
                    placeholder="Cole prints de telas com Ctrl+V ou descreva exatamente o que deseja..."
                    value={description}
                    onPaste={handlePaste}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                      <Paperclip className="w-4 h-4 text-indigo-400" /> Anexar ou Colar Imagens (Ctrl+V)
                    </span>
                    <label className="px-3 py-1 bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 text-xs font-bold rounded-lg hover:bg-indigo-600/30 transition-all cursor-pointer">
                      Anexar Arquivo
                      <input type="file" accept="image/*" onChange={(e) => handleFileUpload(e)} className="hidden" />
                    </label>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    📸 <strong>Compressão Automática:</strong> Imagens são automaticamente otimizadas via Canvas em até ~300KB.
                  </p>

                  {attachments.length > 0 && (
                    <div className="grid grid-cols-4 gap-2 pt-2">
                      {attachments.map((att) => (
                        <div key={att.id} className="relative group">
                          <img src={att.url} alt={att.name} className="w-full h-20 object-cover rounded-xl border border-slate-700" />
                          <button
                            type="button"
                            onClick={() => setAttachments((prev) => prev.filter((a) => a.id !== att.id))}
                            className="absolute top-1 right-1 p-1 bg-red-600 text-white rounded-md opacity-0 group-hover:opacity-100 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-lg shadow-indigo-600/20 text-xs flex items-center justify-center gap-2 cursor-pointer transition-all"
                >
                  <Send className="w-4 h-4" /> Enviar Solicitação para Análise & Aprovação
                </button>
              </form>
            </div>
          ) : selectedTicket ? (
            /* VIEW 2: Single Ticket Record View with Approval, Edit, and Delete Actions */
            <div className="flex flex-col h-full space-y-4 overflow-y-auto pr-1">
              {/* Ticket Top Bar */}
              <div className="border-b border-slate-800 pb-3 flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs text-indigo-400 font-bold bg-indigo-500/10 px-2.5 py-1 rounded-lg border border-indigo-500/20">
                    {selectedTicket.code}
                  </span>
                  <div>
                    <h2 className="text-base font-extrabold text-white">{selectedTicket.title}</h2>
                    <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-400 flex-wrap">
                      <span>Cliente: <strong className="text-slate-200">{selectedTicket.tenantName}</strong></span>
                      <span>•</span>
                      <span className="px-2 py-0.5 bg-purple-500/10 border border-purple-500/30 text-purple-300 font-bold rounded flex items-center gap-1">
                        <Building2 className="w-3.5 h-3.5 text-purple-400" /> Aplicação Alvo: {selectedTicket.tenantName} ({selectedTicket.tenantId}.helpusbr.com)
                      </span>
                      <span>•</span>
                      <span>Criado em {new Date(selectedTicket.createdAt).toLocaleString('pt-BR')}</span>
                    </div>
                  </div>
                </div>

                {/* Ticket Top Action Buttons */}
                <div className="flex items-center gap-2">
                  {selectedTicket.status === 'pending_approval' && (
                    <>
                      <button
                        onClick={() => {
                          setEditTitle(selectedTicket.title);
                          setEditDescription(selectedTicket.description);
                          setIsEditModalOpen(true);
                        }}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs rounded-xl border border-slate-700 flex items-center gap-1 transition-all cursor-pointer"
                        title="Editar Solicitação"
                      >
                        <Edit3 className="w-3.5 h-3.5 text-indigo-400" /> Editar
                      </button>

                      <button
                        onClick={() => setIsCancelModalOpen(true)}
                        className="px-3 py-1.5 bg-red-950/40 hover:bg-red-900/60 text-red-300 font-semibold text-xs rounded-xl border border-red-500/30 flex items-center gap-1 transition-all cursor-pointer"
                        title="Excluir / Cancelar Solicitação"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-red-400" /> Excluir
                      </button>
                    </>
                  )}

                  {(selectedTicket.status === 'resolved' || selectedTicket.status === 'closed') && (
                    <>
                      <button
                        onClick={() => generateTicketPDFReport(selectedTicket)}
                        className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-lg flex items-center gap-1.5 transition-all cursor-pointer"
                      >
                        <Printer className="w-4 h-4" /> Baixar PDF (Laudo Técnico)
                      </button>

                      <button
                        onClick={() => handleSendTicketEmail(selectedTicket)}
                        disabled={sendingEmailTicketId === selectedTicket.id}
                        className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-lg flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                        title={`Disparar e-mail com laudo técnico para ${selectedTicket.createdByEmail}`}
                      >
                        {sendingEmailTicketId === selectedTicket.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Mail className="w-4 h-4" />
                        )}
                        Enviar por E-mail
                      </button>
                    </>
                  )}
                  {getStatusBadge(selectedTicket.status)}
                </div>
              </div>

              {/* 5-Step Visual Timeline Stepper */}
              <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-2xl space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-300 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-indigo-400" /> Linha do Tempo do Atendimento:
                  </span>
                  <span className="text-[11px] font-mono text-indigo-300 font-semibold">
                    {getStatusLabel(selectedTicket.status)}
                  </span>
                </div>

                <div className="grid grid-cols-5 gap-1.5 text-center text-[10px] font-bold">
                  {/* Step 1: Aberto */}
                  <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                    <div className="flex items-center justify-center mb-0.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    </div>
                    <span>1. Aberto</span>
                  </div>

                  {/* Step 2: Aprovação Master */}
                  <div
                    className={`p-2 rounded-xl border ${
                      selectedTicket.status === 'rejected'
                        ? 'bg-red-500/10 border-red-500/30 text-red-400'
                        : selectedTicket.status === 'pending_approval'
                        ? 'bg-amber-500/10 border-amber-500/30 text-amber-400 animate-pulse'
                        : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                    }`}
                  >
                    <div className="flex items-center justify-center mb-0.5">
                      {selectedTicket.status === 'rejected' ? (
                        <XCircle className="w-3.5 h-3.5" />
                      ) : selectedTicket.status === 'pending_approval' ? (
                        <Clock className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      )}
                    </div>
                    <span>2. Aprovação</span>
                  </div>

                  {/* Step 3: Atendimento / IA */}
                  <div
                    className={`p-2 rounded-xl border ${
                      selectedTicket.status === 'in_production' || selectedTicket.status === 'in_progress'
                        ? 'bg-purple-500/10 border-purple-500/30 text-purple-400 animate-pulse'
                        : selectedTicket.status === 'resolved' || selectedTicket.status === 'closed'
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                        : 'bg-slate-900 border-slate-800 text-slate-500'
                    }`}
                  >
                    <div className="flex items-center justify-center mb-0.5">
                      {selectedTicket.status === 'in_production' || selectedTicket.status === 'in_progress' ? (
                        <Cpu className="w-3.5 h-3.5 animate-spin" />
                      ) : selectedTicket.status === 'resolved' || selectedTicket.status === 'closed' ? (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      ) : (
                        <Clock className="w-3.5 h-3.5" />
                      )}
                    </div>
                    <span>3. Execução</span>
                  </div>

                  {/* Step 4: Solucionado */}
                  <div
                    className={`p-2 rounded-xl border ${
                      selectedTicket.status === 'resolved'
                        ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 animate-bounce'
                        : selectedTicket.status === 'closed'
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                        : 'bg-slate-900 border-slate-800 text-slate-500'
                    }`}
                  >
                    <div className="flex items-center justify-center mb-0.5">
                      {selectedTicket.status === 'resolved' || selectedTicket.status === 'closed' ? (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      ) : (
                        <Clock className="w-3.5 h-3.5" />
                      )}
                    </div>
                    <span>4. Solução</span>
                  </div>

                  {/* Step 5: Encerrado */}
                  <div
                    className={`p-2 rounded-xl border ${
                      selectedTicket.status === 'closed'
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                        : 'bg-slate-900 border-slate-800 text-slate-500'
                    }`}
                  >
                    <div className="flex items-center justify-center mb-0.5">
                      {selectedTicket.status === 'closed' ? (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      ) : (
                        <Lock className="w-3.5 h-3.5" />
                      )}
                    </div>
                    <span>5. Encerrado</span>
                  </div>
                </div>
              </div>

              {/* Client Resolution Confirmation Banner (When Resolved) */}
              {selectedTicket.status === 'resolved' && (
                <div className="p-4 bg-gradient-to-r from-emerald-950/70 via-teal-950/60 to-slate-950 border border-emerald-500/50 rounded-2xl space-y-3 shadow-lg">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <span className="text-xs font-bold text-emerald-300 flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-emerald-400" />
                      🎉 A equipe técnica solucionou sua solicitação!
                    </span>
                    <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2.5 py-0.5 rounded-full font-bold border border-emerald-500/30">
                      Aguardando Sua Validação
                    </span>
                  </div>
                  <p className="text-xs text-slate-200 leading-relaxed">
                    Por favor, valide se o ajuste atendeu sua expectativa. Caso esteja aprovado, clique em <strong>Confirmar Solução</strong> para encerrar o chamado. Se houver algum detalhe pendente, clique em <strong>Reabrir Chamado</strong>.
                  </p>
                  <div className="flex items-center gap-2.5 pt-1 flex-wrap">
                    <button
                      onClick={() => setIsCloseModalOpen(true)}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-lg shadow-emerald-900/30 cursor-pointer transition-all"
                    >
                      <CheckCircle2 className="w-4 h-4" /> Confirmar Solução & Encerrar Chamado
                    </button>
                    <button
                      onClick={() => setIsReopenModalOpen(true)}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-amber-300 hover:text-amber-200 font-bold rounded-xl text-xs flex items-center gap-1.5 border border-amber-500/30 cursor-pointer transition-all"
                    >
                      <RefreshCw className="w-4 h-4" /> Problema Persiste / Reabrir Chamado
                    </button>
                  </div>
                </div>
              )}

              {/* Closed Banner with Reopen Option */}
              {selectedTicket.status === 'closed' && (
                <div className="p-3.5 bg-slate-900/60 border border-slate-700 rounded-2xl flex items-center justify-between text-xs flex-wrap gap-2">
                  <div className="flex items-center gap-2 text-slate-300">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Chamado validado e encerrado. Caso necessite de nova revisão, você pode reabri-lo.</span>
                  </div>
                  <button
                    onClick={() => setIsReopenModalOpen(true)}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold border border-slate-700 flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Reabrir Chamado
                  </button>
                </div>
              )}

              {/* Master Decision Control Panel (Visible for HelpUS Master / SuperAdmin) */}
              {isMasterUser && selectedTicket.status !== 'closed' && (
                <div className="p-4 bg-gradient-to-r from-purple-900/60 to-indigo-900/60 border border-purple-500/50 rounded-2xl space-y-3 shadow-xl">
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-xs text-purple-300 uppercase tracking-wider flex items-center gap-1.5">
                      👑 Painel de Aprovação & Gestão — HelpUS Master
                    </span>
                    <span className="text-[10px] text-purple-200 bg-purple-500/20 border border-purple-500/30 px-2 py-0.5 rounded font-mono font-bold">
                      Status: {getStatusLabel(selectedTicket.status)}
                    </span>
                  </div>

                  {selectedTicket.status === 'pending_approval' ? (
                    <>
                      <p className="text-xs text-slate-200 leading-relaxed">
                        Como Administrador Master, você pode <strong>Aceitar e Executar Alterações Autônomas</strong> no código (compilar e enviar para a nuvem Vercel), ou <strong>Rejeitar / Recusar</strong> este chamado a qualquer momento.
                      </p>
                      <div className="flex flex-wrap items-center gap-3 pt-1">
                        <button
                          onClick={() => setIsApproveModalOpen(true)}
                          disabled={isActionLoading}
                          className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-lg flex items-center gap-2 transition-all cursor-pointer"
                        >
                          <CheckCircle2 className="w-4 h-4" /> Aceitar & Executar Alterações (Deploy Vercel)
                        </button>

                        <button
                          onClick={() => setIsRejectModalOpen(true)}
                          disabled={isActionLoading}
                          className="px-4 py-2.5 bg-red-600/80 hover:bg-red-600 text-white font-bold text-xs rounded-xl shadow-lg flex items-center gap-2 transition-all cursor-pointer"
                        >
                          <XCircle className="w-4 h-4" /> Rejeitar / Recusar Chamado
                        </button>
                      </div>
                    </>
                  ) : selectedTicket.status === 'in_production' ? (
                    <div className="p-4 bg-purple-950/70 border border-purple-500/50 rounded-xl space-y-3 shadow-lg relative overflow-hidden">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-xs font-bold text-purple-200 flex items-center gap-2">
                          <Cpu className="w-4 h-4 text-purple-400 animate-spin" />
                          ⚡ Execução Antigravity em Andamento
                        </span>
                        <span className="text-xs font-extrabold text-indigo-300 font-mono bg-indigo-500/20 px-2.5 py-1 rounded-lg border border-indigo-500/30">
                          {selectedTicket.progressPercentage ?? 0}% CONCLUÍDO
                        </span>
                      </div>

                      {/* Percentage Progress Bar */}
                      <div className="space-y-1">
                        <div className="w-full bg-slate-950 h-3.5 rounded-full overflow-hidden p-0.5 border border-purple-500/30 shadow-inner">
                          <div
                            className="bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-400 h-full rounded-full transition-all duration-500 ease-out shadow-[0_0_12px_rgba(168,85,247,0.6)]"
                            style={{ width: `${selectedTicket.progressPercentage ?? 0}%` }}
                          ></div>
                        </div>
                        <div className="flex justify-between text-[10px] text-slate-400 font-mono pt-0.5">
                          <span>0% Inicial</span>
                          <span>25% Análise</span>
                          <span>50% Código</span>
                          <span>75% Build</span>
                          <span>100% Deploy</span>
                        </div>
                      </div>

                      {/* Current Live Step Box */}
                      <div className="p-3 bg-slate-950/80 border border-purple-500/30 rounded-xl space-y-1.5">
                        <div className="flex items-center gap-2 text-[11px] font-bold text-purple-300">
                          <Sparkles className="w-3.5 h-3.5 text-purple-400 animate-pulse" />
                          <span>Fase Atual da Inteligência Artificial:</span>
                        </div>
                        <p className="text-xs text-slate-200 font-medium leading-relaxed">
                          {selectedTicket.progressStep || '⚡ Entrada em Produção autorizada. Processando chamado no Antigravity...'}
                        </p>
                      </div>
                    </div>
                  ) : selectedTicket.status === 'resolved' ? (
                    <div className="p-3 bg-emerald-950/60 border border-emerald-500/40 rounded-xl space-y-1">
                      <span className="text-xs font-bold text-emerald-300 flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        ✨ Chamado Aprovado, Solucionado e Publicado em Produção!
                      </span>
                      <p className="text-[11px] text-slate-300">
                        Todas as alterações foram testadas e implantadas com sucesso na Vercel Cloud.
                      </p>
                    </div>
                  ) : null}
                </div>
              )}

              {/* Box 1: Solicitação Original do Cliente */}
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider block">
                    1. Solicitação do Cliente
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Enviado por: <strong>{selectedTicket.createdByName}</strong> ({selectedTicket.createdByEmail})
                  </span>
                </div>
                <p className="text-xs text-slate-200 leading-relaxed whitespace-pre-wrap">
                  {selectedTicket.description}
                </p>

                {selectedTicket.attachments && selectedTicket.attachments.length > 0 && (
                  <div className="pt-2 border-t border-slate-900 flex flex-wrap gap-2">
                    {selectedTicket.attachments.map((att) => (
                      <a key={att.id} href={att.url} target="_blank" rel="noreferrer">
                        <img src={att.url} alt={att.name} className="h-28 rounded-xl object-cover border border-slate-700 hover:border-indigo-400" />
                      </a>
                    ))}
                  </div>
                )}
              </div>

              {/* Box 2: Solução Técnica & Atendimento */}
              <div className="p-4 bg-indigo-950/40 border border-indigo-500/30 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-extrabold text-indigo-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-indigo-400" /> 2. Solução Técnica & Atendimento
                  </span>
                  <span className="text-[10px] text-emerald-400 flex items-center gap-1">
                    <Cpu className="w-3.5 h-3.5" /> Processado 100% Automático na Nuvem 24/7
                  </span>
                </div>

                {selectedTicket.status === 'pending_approval' ? (
                  <div className="p-4 bg-amber-950/30 border border-amber-500/30 rounded-xl text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 font-bold text-amber-300">
                        <Clock className="w-4 h-4 text-amber-400 animate-spin" />
                        <span>Solicitação em Fila de Aprovação</span>
                      </div>
                      <span className="text-[10px] text-indigo-300 font-mono bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
                        E-mail Disparado
                      </span>
                    </div>
                    <p className="text-slate-300 leading-relaxed">
                      Sua solicitação foi gravada com sucesso e uma notificação por e-mail foi encaminhada para <strong>helpus.ecommerce@gmail.com</strong>. O Administrador HelpUS analisará o pedido na central master para autorizar a execução das modificações.
                    </p>
                  </div>
                ) : selectedTicket.cancellationReason ? (
                  <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl text-xs space-y-2">
                    <div className="flex items-center gap-2 font-bold text-slate-400">
                      <Trash2 className="w-4 h-4 text-red-400" />
                      <span>Chamado Cancelado / Excluído pelo Cliente</span>
                    </div>
                    <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl text-slate-300 whitespace-pre-wrap leading-relaxed">
                      <strong>Observação do Cancelamento:</strong><br />
                      {selectedTicket.cancellationReason}
                    </div>
                  </div>
                ) : selectedTicket.status === 'rejected' ? (
                  <div className="p-4 bg-red-950/40 border border-red-500/40 rounded-xl text-xs space-y-2">
                    <div className="flex items-center gap-2 font-bold text-red-300">
                      <XCircle className="w-4 h-4 text-red-400" />
                      <span>Solicitação Recusada pelo Suporte HelpUS</span>
                    </div>
                    {selectedTicket.messages.filter((m) => m.senderRole === 'agent' && m.content.includes('Recusada')).map((m) => (
                      <div key={m.id} className="p-3 bg-slate-950 border border-red-900/50 rounded-xl text-slate-200 whitespace-pre-wrap leading-relaxed">
                        {m.content}
                      </div>
                    ))}
                  </div>
                ) : selectedTicket.messages.filter((m) => m.senderRole === 'agent' && !m.isInternalNote).length > 0 ? (
                  selectedTicket.messages
                    .filter((m) => m.senderRole === 'agent' && !m.isInternalNote)
                    .map((m) => (
                      <div key={m.id} className="p-3 bg-slate-950/80 rounded-xl border border-indigo-500/20 text-xs text-indigo-100 leading-relaxed space-y-1">
                        <div className="flex items-center justify-between text-[10px] text-slate-400 pb-1 border-b border-slate-800">
                          <span className="font-bold text-indigo-300">{m.senderName}</span>
                          <span>{new Date(m.createdAt).toLocaleString('pt-BR')}</span>
                        </div>
                        <p className="whitespace-pre-wrap">{m.content}</p>
                      </div>
                    ))
                ) : (
                  <div className="p-3 bg-slate-950/50 rounded-xl text-xs text-slate-400 italic">
                    ⏳ Em atendimento autônomo. A resposta será gravada aqui em instantes.
                  </div>
                )}
              </div>

              {/* Box 3: Conversação & Interação em Tempo Real */}
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                  <span className="text-[11px] font-extrabold text-indigo-300 uppercase tracking-wider flex items-center gap-1.5">
                    <MessageSquare className="w-4 h-4 text-indigo-400" /> Histórico de Mensagens & Respostas
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {selectedTicket.messages.filter((m) => isMasterUser || !m.isInternalNote).length} mensagem(ns)
                  </span>
                </div>

                {/* Messages List */}
                <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                  {selectedTicket.messages.filter((m) => isMasterUser || !m.isInternalNote).length === 0 ? (
                    <div className="p-4 bg-slate-900/40 rounded-xl text-center text-xs text-slate-500 italic">
                      Nenhuma mensagem adicional registrada ainda. Você pode enviar uma resposta abaixo.
                    </div>
                  ) : (
                    selectedTicket.messages
                      .filter((m) => isMasterUser || !m.isInternalNote)
                      .map((m) => {
                        const isFromClient = m.senderRole === 'client' || m.senderEmail === selectedTicket.createdByEmail;
                        const isSystem = m.senderRole === 'system';
                        return (
                          <div
                            key={m.id}
                            className={`p-3 rounded-xl text-xs space-y-1.5 border transition-all ${
                              m.isInternalNote
                                ? 'bg-amber-950/30 border-amber-500/40 text-amber-100'
                                : isFromClient
                                ? 'bg-slate-900/90 border-slate-800 text-slate-200'
                                : isSystem
                                ? 'bg-slate-950 border-slate-800/80 text-slate-400'
                                : 'bg-indigo-950/40 border-indigo-500/30 text-indigo-100'
                            }`}
                          >
                            <div className="flex items-center justify-between text-[11px] border-b border-slate-800/60 pb-1">
                              <div className="flex items-center gap-2">
                                <span className="font-bold flex items-center gap-1">
                                  {m.isInternalNote ? (
                                    <span className="px-2 py-0.5 bg-amber-500/20 text-amber-300 rounded font-mono text-[10px]">
                                      🔒 Nota Interna
                                    </span>
                                  ) : isFromClient ? (
                                    <span className="text-slate-300">👤 {m.senderName}</span>
                                  ) : isSystem ? (
                                    <span className="text-slate-400">⚙️ Sistema HelpUS</span>
                                  ) : (
                                    <span className="text-indigo-300">🛡️ {m.senderName} (Suporte)</span>
                                  )}
                                </span>
                                {m.senderEmail && (
                                  <span className="text-[10px] text-slate-500">({m.senderEmail})</span>
                                )}
                              </div>
                              <span className="text-[10px] text-slate-500 font-mono">
                                {new Date(m.createdAt).toLocaleString('pt-BR')}
                              </span>
                            </div>
                            <p className="whitespace-pre-wrap leading-relaxed text-slate-200">{m.content}</p>

                            {m.attachments && m.attachments.length > 0 && (
                              <div className="pt-2 flex flex-wrap gap-2 border-t border-slate-800/60">
                                {m.attachments.map((att) => (
                                  <a key={att.id} href={att.url} target="_blank" rel="noreferrer" className="group">
                                    <img
                                      src={att.url}
                                      alt={att.name}
                                      className="h-20 rounded-lg object-cover border border-slate-700 group-hover:border-indigo-400 transition-all"
                                    />
                                  </a>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })
                  )}
                </div>

                {/* Interactive Reply Form */}
                <form onSubmit={handleSendReply} className="space-y-2.5 pt-2 border-t border-slate-800">
                  {/* Quick Reply Templates for Support/Master */}
                  {isMasterUser && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] text-slate-400 font-semibold">Respostas Rápidas:</span>
                      {[
                        'Recebido e em análise técnica.',
                        'Alteração implantada. Por favor, valide em sua loja.',
                        'Aguardando seu retorno com mais detalhes.',
                      ].map((template) => (
                        <button
                          key={template}
                          type="button"
                          onClick={() => setReplyContent((prev) => (prev ? `${prev} ${template}` : template))}
                          className="px-2 py-0.5 bg-slate-900 hover:bg-indigo-950/60 border border-slate-800 hover:border-indigo-500/40 text-[10px] text-slate-300 rounded-lg transition-all cursor-pointer"
                        >
                          + {template}
                        </button>
                      ))}
                    </div>
                  )}

                  <div>
                    <textarea
                      rows={3}
                      placeholder="Escreva sua resposta (Ctrl+V para colar capturas de tela diretamente)..."
                      value={replyContent}
                      onChange={(e) => setReplyContent(e.target.value)}
                      onPaste={handleReplyPaste}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500 text-xs"
                    />
                  </div>

                  {/* Attachments Preview */}
                  {replyAttachments.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {replyAttachments.map((att) => (
                        <div key={att.id} className="relative group">
                          <img src={att.url} alt={att.name} className="h-16 w-20 object-cover rounded-lg border border-slate-700" />
                          <button
                            type="button"
                            onClick={() => setReplyAttachments((prev) => prev.filter((a) => a.id !== att.id))}
                            className="absolute top-1 right-1 p-0.5 bg-red-600 text-white rounded cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-3">
                      <label className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 text-xs font-semibold rounded-xl flex items-center gap-1.5 cursor-pointer transition-all">
                        <Paperclip className="w-3.5 h-3.5 text-indigo-400" />
                        <span>Anexar Imagem</span>
                        <input type="file" accept="image/*" onChange={handleReplyFileUpload} className="hidden" />
                      </label>

                      {isMasterUser && (
                        <label className="flex items-center gap-1.5 text-xs text-amber-300 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={replyIsInternal}
                            onChange={(e) => setReplyIsInternal(e.target.checked)}
                            className="rounded border-slate-700 text-amber-500 focus:ring-0"
                          />
                          <span>Nota Interna (oculta para cliente)</span>
                        </label>
                      )}
                    </div>

                    <button
                      type="submit"
                      disabled={isSendingReply || (!replyContent.trim() && replyAttachments.length === 0)}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-lg text-xs flex items-center gap-1.5 cursor-pointer transition-all disabled:opacity-40"
                    >
                      {isSendingReply ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                      {isSendingReply ? 'Enviando...' : 'Enviar Resposta'}
                    </button>
                  </div>
                </form>
              </div>

              {/* Status Footer Alert */}
              <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-2xl flex items-center justify-between text-xs text-slate-300">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Notificações por E-mail direcionadas para <strong>helpus.ecommerce@gmail.com</strong>. Sincronização em tempo real.</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-500 text-xs text-center space-y-3">
              <LifeBuoy className="w-12 h-12 opacity-30 text-indigo-400 animate-pulse" />
              <p>Selecione uma solicitação à esquerda ou clique em <strong>"+ Nova Solicitação"</strong> para iniciar.</p>
            </div>
          )}
        </div>
      </main>

      {/* Close Ticket Modal (Client Resolution Confirmation) */}
      {isCloseModalOpen && selectedTicket && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden text-slate-100 space-y-4 p-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-sm text-emerald-400 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" /> Confirmar e Encerrar Chamado [{selectedTicket.code}]
              </h3>
              <button onClick={() => setIsCloseModalOpen(false)} className="text-slate-400 hover:text-white cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCloseTicket} className="space-y-3 text-xs">
              <p className="text-slate-300">
                Você confirma que a solução apresentada atendeu sua solicitação? Você pode deixar um comentário ou avaliação opcional:
              </p>

              <div>
                <label className="block text-slate-400 mb-1 font-medium">Feedback / Avaliação (Opcional)</label>
                <textarea
                  rows={3}
                  placeholder="Ex: Tudo funcionando perfeitamente, obrigado pela agilidade!"
                  value={closeFeedback}
                  onChange={(e) => setCloseFeedback(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-emerald-500 text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCloseModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 hover:bg-slate-700 font-semibold rounded-xl text-xs cursor-pointer"
                >
                  Voltar
                </button>
                <button
                  type="submit"
                  disabled={isActionLoading}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-lg text-xs flex items-center gap-1.5 cursor-pointer"
                >
                  {isActionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  Confirmar Encerramento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reopen Ticket Modal (Client / Agent Reopen) */}
      {isReopenModalOpen && selectedTicket && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden text-slate-100 space-y-4 p-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-sm text-amber-400 flex items-center gap-2">
                <RefreshCw className="w-4 h-4" /> Reabrir Chamado [{selectedTicket.code}]
              </h3>
              <button onClick={() => setIsReopenModalOpen(false)} className="text-slate-400 hover:text-white cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleReopenTicket} className="space-y-3 text-xs">
              <p className="text-slate-300">
                Por favor, descreva o motivo da reabertura e o que ainda precisa de ajuste:
              </p>

              <div>
                <label className="block text-slate-400 mb-1 font-medium">Motivo da Reabertura *</label>
                <textarea
                  required
                  rows={4}
                  placeholder="Ex: O botão foi ajustado mas ainda não está salvando no mobile..."
                  value={reopenReason}
                  onChange={(e) => setReopenReason(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500 text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsReopenModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 hover:bg-slate-700 font-semibold rounded-xl text-xs cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isActionLoading || !reopenReason.trim()}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl shadow-lg text-xs flex items-center gap-1.5 cursor-pointer"
                >
                  {isActionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  Confirmar Reabertura
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Rejection Modal for HelpUS Master */}
      {isRejectModalOpen && selectedTicket && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden text-slate-100 space-y-4 p-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-sm text-red-400 flex items-center gap-2">
                <XCircle className="w-4 h-4" /> Recusar Chamado [{selectedTicket.code}]
              </h3>
              <button onClick={() => setIsRejectModalOpen(false)} className="text-slate-400 hover:text-white cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleRejectTicket} className="space-y-3 text-xs">
              <p className="text-slate-300">
                Informe abaixo o motivo da recusa deste chamado. O cliente verá este motivo imediatamente no portal dele.
              </p>

              <div>
                <label className="block text-slate-400 mb-1 font-medium">Motivo da Recusa</label>
                <textarea
                  required
                  rows={4}
                  placeholder="Ex: Solicitação fora do escopo do contrato atual, ou necessita de maiores detalhes..."
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-red-500 text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsRejectModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 hover:bg-slate-700 font-semibold rounded-xl text-xs cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isActionLoading || !rejectionReason.trim()}
                  className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl shadow-lg text-xs cursor-pointer"
                >
                  Confirmar Recusa
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Ticket Modal for Client */}
      {isEditModalOpen && selectedTicket && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden text-slate-100 space-y-4 p-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-sm text-indigo-400 flex items-center gap-2">
                <Edit3 className="w-4 h-4" /> Editar Solicitação [{selectedTicket.code}]
              </h3>
              <button onClick={() => setIsEditModalOpen(false)} className="text-slate-400 hover:text-white cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleEditTicketSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1 font-medium">Título Resumido</label>
                <input
                  type="text"
                  required
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500 text-xs"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-medium">Descrição Detalhada</label>
                <textarea
                  required
                  rows={4}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500 text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 hover:bg-slate-700 font-semibold rounded-xl text-xs cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isActionLoading}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-lg text-xs cursor-pointer"
                >
                  Salvar Alterações
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Master Approval & Admin Instructions Modal */}
      {isApproveModalOpen && selectedTicket && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in">
          <div className="bg-slate-900 border border-purple-500/40 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden text-slate-100 space-y-4 p-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-sm text-purple-300 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Aprovar & Definir Instruções de Execução [{selectedTicket.code}]
              </h3>
              <button onClick={() => setIsApproveModalOpen(false)} className="text-slate-400 hover:text-white cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleApproveTicket(selectedTicket.id, adminNotesInput);
              }}
              className="space-y-4 text-xs"
            >
              {isMasterUser && (
                <div className="bg-purple-950/40 p-3 rounded-xl border border-purple-500/30 space-y-1">
                  <label className="block text-purple-300 font-semibold flex items-center justify-between">
                    <span className="flex items-center gap-1.5"><Building2 className="w-4 h-4 text-purple-400" /> Empresa / Aplicação Alvo para Execução da IA</span>
                    <span className="text-[10px] text-slate-400 font-normal">SuperAdmin</span>
                  </label>
                  <select
                    value={targetTenantId}
                    onChange={(e) => setTargetTenantId(e.target.value)}
                    className="w-full bg-slate-950 border border-purple-500/40 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-purple-500 font-bold text-xs cursor-pointer"
                  >
                    {INITIAL_TENANTS.map((t) => (
                      <option key={t.id} value={t.id}>
                        🏢 {t.name} ({t.domain})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1">
                <span className="font-bold text-slate-300">Solicitação do Cliente:</span>
                <p className="text-slate-400 italic">"{selectedTicket.title} - {selectedTicket.description}"</p>
              </div>

              <div>
                <label className="block text-purple-300 mb-1 font-semibold flex items-center justify-between">
                  <span>Instruções Adicionais do Administrador (Opcional)</span>
                  <span className="text-[10px] text-slate-400 font-normal">Faça solicitações extras ao sistema</span>
                </label>
                <textarea
                  rows={4}
                  placeholder="Ex: Além de trocar a imagem da xícara, ajustar a cor de fundo do cabeçalho para azul escuro e incluir botão de exportar relatório..."
                  value={adminNotesInput}
                  onChange={(e) => setAdminNotesInput(e.target.value)}
                  className="w-full bg-slate-950 border border-purple-500/30 rounded-xl px-3 py-2 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-500 text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsApproveModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 hover:bg-slate-700 font-semibold rounded-xl text-xs cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => handleApproveTicket(selectedTicket.id, adminNotesInput)}
                  disabled={isActionLoading}
                  className="px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-indigo-600 hover:from-emerald-500 hover:to-indigo-500 text-white font-bold rounded-xl shadow-lg text-xs flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isActionLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  {isActionLoading ? 'Executando Alterações...' : '🚀 Confirmar e Executar Alterações'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Cancel / Delete Ticket Modal for Client */}
      {isCancelModalOpen && selectedTicket && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden text-slate-100 space-y-4 p-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-sm text-red-400 flex items-center gap-2">
                <Trash2 className="w-4 h-4" /> Cancelar / Excluir Chamado [{selectedTicket.code}]
              </h3>
              <button onClick={() => setIsCancelModalOpen(false)} className="text-slate-400 hover:text-white cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCancelTicketSubmit} className="space-y-3 text-xs">
              <p className="text-slate-300">
                Você está prestes a cancelar/excluir o chamado <strong>{selectedTicket.code}</strong>. Por favor, digite a observação/motivo do cancelamento:
              </p>

              <div>
                <label className="block text-slate-400 mb-1 font-medium">Observação / Motivo do Cancelamento</label>
                <textarea
                  required
                  rows={4}
                  placeholder="Ex: O problema foi resolvido internamente, ou a solicitação não é mais necessária..."
                  value={cancellationNote}
                  onChange={(e) => setCancellationNote(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-red-500 text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCancelModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 hover:bg-slate-700 font-semibold rounded-xl text-xs cursor-pointer"
                >
                  Manter Chamado
                </button>
                <button
                  type="submit"
                  disabled={isActionLoading || !cancellationNote.trim()}
                  className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl shadow-lg text-xs cursor-pointer"
                >
                  Confirmar Exclusão
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Footer Links with Credit Link helpusbr.com */}
      <footer className="mt-auto border-t border-slate-800/80 bg-slate-950 py-4 px-6 text-xs text-slate-500 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <img src="/helpus-logo.jpg" alt="HelpUS Logo" className="w-5 h-5 rounded-full object-cover" />
          <span>
            Desenvolvido por{' '}
            <a
              href="https://helpusbr.com"
              target="_blank"
              rel="noreferrer"
              className="text-indigo-400 hover:text-indigo-300 font-bold underline"
            >
              helpusbr.com
            </a>
          </span>
        </div>
        <div className="flex gap-4">
          <button onClick={() => setIsPrivacyOpen(true)} className="hover:text-slate-300 underline">
            Política de Privacidade (LGPD)
          </button>
        </div>
      </footer>

      {/* Cookie Consent Banner */}
      <CookieConsent lang="pt" onOpenPrivacy={() => setIsPrivacyOpen(true)} />

      {/* Privacy Policy Modal */}
      <PrivacyPolicyModal isOpen={isPrivacyOpen} onClose={() => setIsPrivacyOpen(false)} lang="pt" />

      {/* User Management Modal for SuperAdmin */}
      {user && (
        <UserManagementModal
          isOpen={isUserMgmtOpen}
          onClose={() => setIsUserMgmtOpen(false)}
          currentUser={user}
        />
      )}
    </div>
  );
}
