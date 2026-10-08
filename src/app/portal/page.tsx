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
} from 'lucide-react';
import { Ticket, TicketStatus, TicketCategory, TicketPriority, Attachment } from '@/types/ticket';
import { AuthService, UserAccount } from '@/lib/auth';
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

  const prevTicketsRef = useRef<Map<string, string>>(new Map());
  const prevProgressRef = useRef<Map<string, number>>(new Map());
  const selectedTicketRef = useRef<Ticket | null>(null);
  const tenantFilterRef = useRef<string>('all');

  useEffect(() => {
    tenantFilterRef.current = tenantFilter;
  }, [tenantFilter]);

  useEffect(() => {
    selectedTicketRef.current = selectedTicket;
  }, [selectedTicket]);

  useEffect(() => {
    // Process Google OAuth redirect parameters if present
    const urlParams = new URLSearchParams(window.location.search);
    const gEmail = urlParams.get('google_email');
    const gName = urlParams.get('google_name') || undefined;
    const gPic = urlParams.get('google_picture') || undefined;

    let currentUser: UserAccount | null = null;

    if (gEmail) {
      const res = AuthService.loginWithGoogle(gEmail, gName, gPic);
      if (res.success && res.user) {
        currentUser = res.user;
      }
      // Clean up URL parameters from browser history
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    if (!currentUser) {
      currentUser = AuthService.getCurrentUser();
    }

    if (currentUser && currentUser.email !== 'helpus.ecommerce@gmail.com' && currentUser.email !== 'wagner.redes@gmail.com' && currentUser.role !== 'super_admin') {
      currentUser.role = 'client_admin';
    }

    setUser(currentUser);

    const initialTenant = (currentUser.role === 'super_admin' || currentUser.role === 'admin')
      ? 'all'
      : (currentUser.tenantId || 'publicarte');

    setTenantFilter(initialTenant);
    tenantFilterRef.current = initialTenant;
    loadTickets(initialTenant, true);

    const interval = setInterval(() => {
      loadTickets(tenantFilterRef.current, false);
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  const loadTickets = async (filterTenantId: string, isInitial = false) => {
    try {
      const res = await fetch(`/api/tickets?tenantId=${filterTenantId}&t=${Date.now()}`, {
        cache: 'no-store',
      });
      const data = await res.json();
      
      let fetchedTickets: Ticket[] = data.success ? data.data : [];

      if (data.success) {
        fetchedTickets = data.data;
        if (typeof window !== 'undefined') {
          localStorage.setItem('helpus_client_tickets_cache_v5', JSON.stringify(fetchedTickets));
        }
      } else if (typeof window !== 'undefined') {
        const cached = localStorage.getItem('helpus_client_tickets_cache_v5');
        if (cached) {
          try {
            fetchedTickets = JSON.parse(cached);
          } catch {}
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
    } catch (e) {
      console.error('Error fetching tickets:', e);
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
        headers: { 'Content-Type': 'application/json' },
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
        headers: { 'Content-Type': 'application/json' },
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
        headers: { 'Content-Type': 'application/json' },
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
        headers: { 'Content-Type': 'application/json' },
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
        headers: { 'Content-Type': 'application/json' },
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

  const handleLogout = () => {
    AuthService.logout();
    window.location.href = '/';
  };

  const isMasterUser = user?.role === 'super_admin' || user?.email === 'helpus.ecommerce@gmail.com' || user?.email === 'wagner.redes@gmail.com';
  const isSuperAdmin = user?.role === 'super_admin' || user?.email === 'helpus.ecommerce@gmail.com' || user?.email === 'wagner.redes@gmail.com';

  const availableTenants = INITIAL_TENANTS.filter((t) => {
    if (!user) return false;
    if (isSuperAdmin || user.allowedTenantIds?.includes('all')) return true;
    if (user.allowedTenantIds && user.allowedTenantIds.length > 0) {
      return user.allowedTenantIds.includes(t.id);
    }
    return t.id === (user.tenantId || 'publicarte');
  });

  const filteredTickets = tickets.filter(
    (t) =>
      t.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const pendingCount = tickets.filter((t) => t.status === 'pending_approval').length;

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
                    <button
                      onClick={() => generateTicketPDFReport(selectedTicket)}
                      className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-lg flex items-center gap-1.5 transition-all cursor-pointer"
                    >
                      <Printer className="w-4 h-4" /> Baixar PDF (Laudo Técnico)
                    </button>
                  )}
                  {getStatusBadge(selectedTicket.status)}
                </div>
              </div>

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

      {/* New Ticket Modal Overlay */}
      {isCreatingNew && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6 bg-slate-950/85 backdrop-blur-md animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden text-slate-100 flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
              <div>
                <h2 className="text-base font-extrabold text-white flex items-center gap-2">
                  <FileText className="w-5 h-5 text-indigo-400" />
                  Nova Solicitação — {isMasterUser ? 'SuperAdmin Master' : (user.tenantName || 'Public Arte')}
                </h2>
                <p className="text-xs text-slate-400">Descreva sua solicitação. O Administrador HelpUS será notificado instantaneamente.</p>
              </div>
              <button
                onClick={() => setIsCreatingNew(false)}
                className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateTicket} className="p-6 overflow-y-auto space-y-4 text-xs flex-1">
              {isMasterUser ? (
                <div className="bg-indigo-950/40 p-3.5 rounded-xl border border-indigo-500/30 space-y-1.5">
                  <label className="block text-indigo-300 font-semibold flex items-center justify-between">
                    <span className="flex items-center gap-1.5"><Building2 className="w-4 h-4 text-indigo-400" /> Empresa / Aplicação do Cliente Alvo</span>
                    <span className="text-[10px] text-slate-400 font-normal">SuperAdmin: Escolha qual empresa receberá a solicitação</span>
                  </label>
                  <select
                    value={targetTenantId}
                    onChange={(e) => setTargetTenantId(e.target.value)}
                    className="w-full bg-slate-950 border border-indigo-500/50 rounded-xl px-3.5 py-2.5 text-slate-100 focus:outline-none focus:border-indigo-400 font-bold text-xs cursor-pointer shadow-inner"
                  >
                    {INITIAL_TENANTS.map((t) => (
                      <option key={t.id} value={t.id}>
                        🏢 {t.name} ({t.domain})
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex items-center justify-between text-slate-300">
                  <span className="flex items-center gap-2 font-semibold">
                    <Building2 className="w-4 h-4 text-indigo-400" /> Empresa Solicitante:
                  </span>
                  <span className="font-bold text-indigo-300 bg-indigo-500/10 px-3 py-1 rounded-lg border border-indigo-500/20">
                    🏢 {user.tenantName || 'Public Arte'} ({user.tenantId || 'publicarte'}.helpusbr.com)
                  </span>
                </div>
              )}

              <div>
                <label className="block text-slate-300 mb-1 font-semibold">Assunto / Título Resumido *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Alterar a imagem do produto para uma xícara com visão lateral..."
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500 font-medium"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">Tipo de Solicitação</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as TicketCategory)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer"
                  >
                    <option value="support">🛠️ Suporte Técnico Geral</option>
                    <option value="bug">🐞 Correção de Erro / Bug</option>
                    <option value="feature">🚀 Pedido de Nova Funcionalidade</option>
                    <option value="question">❓ Dúvida sobre o Sistema</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">Prioridade</label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {(['low', 'medium', 'high', 'urgent'] as TicketPriority[]).map((p) => (
                      <button
                        type="button"
                        key={p}
                        onClick={() => setPriority(p)}
                        className={`py-2 rounded-xl font-bold text-[11px] border text-center transition-all cursor-pointer ${
                          priority === p
                            ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300 shadow-md'
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
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-semibold">Descrição Detalhada da Necessidade *</label>
                <textarea
                  required
                  rows={4}
                  placeholder="Cole prints com Ctrl+V ou descreva com detalhes o que precisa alterar no sistema..."
                  value={description}
                  onPaste={handlePaste}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-2xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                    <Paperclip className="w-4 h-4 text-indigo-400" /> Anexar ou Colar Imagens (Ctrl+V)
                  </span>
                  <label className="px-3 py-1 bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 text-xs font-bold rounded-lg hover:bg-indigo-600/30 transition-all cursor-pointer">
                    Anexar Arquivo
                    <input type="file" accept="image/*" onChange={(e) => handleFileUpload(e)} className="hidden" />
                  </label>
                </div>

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

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsCreatingNew(false)}
                  className="px-4 py-2.5 bg-slate-800 text-slate-300 hover:bg-slate-700 font-semibold rounded-xl text-xs cursor-pointer transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-lg shadow-indigo-600/20 text-xs flex items-center gap-2 cursor-pointer transition-all disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  {isSubmitting ? 'Enviando...' : 'Enviar Solicitação para Análise & Aprovação'}
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
