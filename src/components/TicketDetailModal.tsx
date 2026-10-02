'use client';

import React, { useState } from 'react';
import {
  X,
  Send,
  Lock,
  MessageSquare,
  User,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Globe,
  Tag,
  Shield,
  FileText,
  UserCheck,
  Paperclip,
  Bell,
} from 'lucide-react';
import { Ticket, TicketStatus, Attachment } from '@/types/ticket';
import { compressImage, formatBytes } from '@/lib/imageCompressor';

interface TicketDetailModalProps {
  ticket: Ticket | null;
  onClose: () => void;
  onUpdateStatus: (ticketId: string, status: TicketStatus, assignedTo?: string) => void;
  onAddMessage: (
    ticketId: string,
    message: { senderId: string; senderName: string; senderRole: 'agent'; isInternalNote: boolean; content: string; attachments?: Attachment[] }
  ) => void;
}

export default function TicketDetailModal({
  ticket,
  onClose,
  onUpdateStatus,
  onAddMessage,
}: TicketDetailModalProps) {
  const [content, setContent] = useState('');
  const [isInternalNote, setIsInternalNote] = useState(false);
  const [assignee, setAssignee] = useState(ticket?.assignedTo || 'Gabriel (HelpUS)');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [notificationToast, setNotificationToast] = useState<string | null>(null);

  if (!ticket) return null;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const compressed = await compressImage(file, 1920, 1080, 0.8);
        setAttachments((prev) => [
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
        console.error(err);
      }
    }
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() && attachments.length === 0) return;

    onAddMessage(ticket.id, {
      senderId: 'dev@helpusbr.com',
      senderName: assignee || 'Gabriel (HelpUS)',
      senderRole: 'agent',
      isInternalNote,
      content,
      attachments,
    });

    if (!isInternalNote) {
      setNotificationToast(`📲 Alertas de resposta enviados para WhatsApp (83 99872-1848) e E-mail (helpus.ecommerce@gmail.com)`);
      setTimeout(() => setNotificationToast(null), 5000);
    }

    setContent('');
    setAttachments([]);
  };

  const statusOptions: { value: TicketStatus; label: string }[] = [
    { value: 'new', label: '🟡 Triagem / Novo' },
    { value: 'in_progress', label: '🔵 Em Atendimento' },
    { value: 'waiting_client', label: '🟣 Aguardando Cliente' },
    { value: 'in_testing', label: '🟠 Em Validação / Testes' },
    { value: 'resolved', label: '🟢 Concluído' },
    { value: 'closed', label: '⚪ Encerrado' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-4xl h-[85vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-100">
        {/* Modal Header */}
        <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="px-2.5 py-1 text-xs font-mono font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-lg">
              {ticket.code}
            </span>
            <div>
              <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                {ticket.title}
              </h2>
              <p className="text-xs text-slate-400 flex items-center gap-2">
                <span>Cliente: <strong className="text-indigo-300">{ticket.tenantName}</strong></span>
                <span>•</span>
                <span>Solicitante: <strong className="text-slate-200">{ticket.createdByName}</strong> ({ticket.createdByEmail})</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <select
              value={ticket.status}
              onChange={(e) => {
                const newStatus = e.target.value as TicketStatus;
                onUpdateStatus(ticket.id, newStatus, assignee);
                setNotificationToast(`📲 Alerta de atualização (${newStatus.toUpperCase()}) enviado via WhatsApp (83 99872-1848) e E-mail`);
                setTimeout(() => setNotificationToast(null), 5000);
              }}
              className="bg-slate-900 border border-slate-700 text-xs text-slate-200 font-medium px-3 py-1.5 rounded-xl focus:outline-none focus:border-indigo-500 cursor-pointer"
            >
              {statusOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {notificationToast && (
          <div className="bg-emerald-500/20 border-b border-emerald-500/30 px-4 py-2 text-xs text-emerald-300 font-medium flex items-center gap-2 animate-in fade-in">
            <Bell className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{notificationToast}</span>
          </div>
        )}

        {/* Modal Body */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 overflow-hidden">
          {/* Main Chat & Interactions Timeline */}
          <div className="lg:col-span-2 flex flex-col border-r border-slate-800 bg-slate-900/50">
            {/* Description Card */}
            <div className="p-4 bg-slate-950/40 border-b border-slate-800/80 space-y-2">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                Descrição Inicial
              </span>
              <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">
                {ticket.description}
              </p>

              {ticket.attachments && ticket.attachments.length > 0 && (
                <div className="pt-2 border-t border-slate-800 flex flex-wrap gap-2">
                  {ticket.attachments.map((att) => (
                    <a key={att.id} href={att.url} target="_blank" rel="noreferrer" className="block group">
                      <img src={att.url} alt={att.name} className="h-20 rounded-lg object-cover border border-slate-700 group-hover:border-indigo-500 transition-colors" />
                    </a>
                  ))}
                </div>
              )}
            </div>

            {/* Conversation Timeline */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {ticket.messages.map((m) => (
                <div
                  key={m.id}
                  className={`p-3 rounded-xl text-xs space-y-2 border ${
                    m.isInternalNote
                      ? 'bg-amber-950/20 border-amber-500/30 text-amber-200'
                      : m.senderRole === 'agent'
                      ? 'bg-indigo-950/30 border-indigo-500/30 text-indigo-100 ml-4'
                      : 'bg-slate-950 border-slate-800 text-slate-200 mr-4'
                  }`}
                >
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-semibold flex items-center gap-1.5">
                      {m.isInternalNote && <Lock className="w-3 h-3 text-amber-400" />}
                      {m.senderName} ({m.senderRole === 'agent' ? 'Atendente HelpUS' : 'Cliente'})
                    </span>
                    <span className="text-slate-500">
                      {new Date(m.createdAt).toLocaleString('pt-BR')}
                    </span>
                  </div>
                  <p className="leading-relaxed whitespace-pre-wrap">{m.content}</p>

                  {m.attachments && m.attachments.length > 0 && (
                    <div className="pt-2 flex flex-wrap gap-2">
                      {m.attachments.map((att) => (
                        <a key={att.id} href={att.url} target="_blank" rel="noreferrer">
                          <img src={att.url} alt={att.name} className="h-28 rounded-lg object-cover border border-slate-700 hover:border-indigo-400" />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Response Form */}
            <form onSubmit={handleSendMessage} className="p-3 bg-slate-950 border-t border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-1.5 cursor-pointer text-slate-300">
                    <input
                      type="radio"
                      name="noteType"
                      checked={!isInternalNote}
                      onChange={() => setIsInternalNote(false)}
                      className="accent-indigo-500"
                    />
                    <span>Resposta Pública (Cliente vê)</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer text-amber-400">
                    <input
                      type="radio"
                      name="noteType"
                      checked={isInternalNote}
                      onChange={() => setIsInternalNote(true)}
                      className="accent-amber-500"
                    />
                    <span className="flex items-center gap-1"><Lock className="w-3 h-3" /> Nota Interna (Apenas Equipe)</span>
                  </label>
                </div>

                <label className="text-indigo-400 hover:text-indigo-300 cursor-pointer flex items-center gap-1">
                  <Paperclip className="w-3.5 h-3.5" /> Anexar
                  <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
                </label>
              </div>

              {attachments.length > 0 && (
                <div className="flex items-center gap-2">
                  {attachments.map((att) => (
                    <img key={att.id} src={att.url} alt={att.name} className="h-10 w-10 rounded object-cover border border-slate-700" />
                  ))}
                </div>
              )}

              <div className="flex items-center gap-2">
                <textarea
                  rows={2}
                  placeholder={
                    isInternalNote
                      ? 'Adicionar nota técnica interna privada...'
                      : 'Escrever resposta (dispara alerta no WhatsApp 83 99872-1848 e E-mail)...'
                  }
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className={`flex-1 text-xs rounded-xl p-2.5 border focus:outline-none ${
                    isInternalNote
                      ? 'bg-amber-950/20 border-amber-500/40 text-amber-100 placeholder-amber-600/60'
                      : 'bg-slate-900 border-slate-800 text-slate-200 placeholder-slate-600 focus:border-indigo-500'
                  }`}
                />
                <button
                  type="submit"
                  className={`h-full px-4 rounded-xl font-medium text-xs text-white flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    isInternalNote
                      ? 'bg-amber-600 hover:bg-amber-500'
                      : 'bg-indigo-600 hover:bg-indigo-500'
                  }`}
                >
                  <Send className="w-3.5 h-3.5" />
                  Enviar
                </button>
              </div>
            </form>
          </div>

          {/* Right Sidebar with Notification Destinies */}
          <div className="p-4 bg-slate-950/80 space-y-4 text-xs overflow-y-auto">
            <div>
              <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                Atribuição & SLA
              </h4>
              <div className="space-y-2">
                <div>
                  <label className="block text-slate-500 text-[11px] mb-1">Responsável</label>
                  <input
                    type="text"
                    value={assignee}
                    onChange={(e) => setAssignee(e.target.value)}
                    onBlur={() => onUpdateStatus(ticket.id, ticket.status, assignee)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200"
                  />
                </div>
              </div>
            </div>

            <div className="border-t border-slate-800 pt-3 space-y-2">
              <h4 className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1">
                <Bell className="w-3.5 h-3.5" /> Canais de Notificação Ativos
              </h4>
              <div className="bg-slate-900 p-2.5 rounded-xl border border-slate-800 space-y-1.5 text-[11px]">
                <div className="text-slate-300 font-medium">📱 WhatsApp Alerta:</div>
                <div className="font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                  +55 83 99872-1848
                </div>
                <div className="text-slate-300 font-medium pt-1">📧 E-mail Alerta:</div>
                <div className="font-mono text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
                  helpus.ecommerce@gmail.com
                </div>
              </div>
            </div>

            <div className="border-t border-slate-800 pt-3">
              <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                Informações de Contexto
              </h4>
              <div className="space-y-1.5 text-slate-300">
                <div className="bg-slate-900 p-2 rounded-lg border border-slate-800 space-y-1">
                  <div className="text-[10px] text-slate-500 font-mono">PÁGINA DA SOLICITAÇÃO</div>
                  <div className="text-indigo-400 font-mono text-[11px] truncate">
                    {ticket.contextData?.url || 'https://publicarte.vercel.app'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
