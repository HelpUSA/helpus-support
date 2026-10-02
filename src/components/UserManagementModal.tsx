'use client';

import React, { useState, useEffect } from 'react';
import { X, ShieldCheck, UserCheck, Plus, Trash2, Edit3, Search, CheckCircle2, XCircle, Building2, Check, Lock, Sparkles } from 'lucide-react';
import { AuthService, UserAccount, UserRole } from '@/lib/auth';
import { INITIAL_TENANTS } from '@/lib/tenants';

interface UserManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserAccount;
}

export default function UserManagementModal({ isOpen, onClose, currentUser }: UserManagementModalProps) {
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [editingUser, setEditingUser] = useState<UserAccount | null>(null);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [tenantSearch, setTenantSearch] = useState('');

  // Form State for Editing/Adding User
  const [formData, setFormData] = useState<{
    name: string;
    email: string;
    role: UserRole;
    hasSupportAccess: boolean;
    allowedTenantIds: string[];
    status: 'active' | 'suspended';
  }>({
    name: '',
    email: '',
    role: 'client_user',
    hasSupportAccess: true,
    allowedTenantIds: ['publicarte'],
    status: 'active',
  });

  useEffect(() => {
    if (isOpen) {
      loadUsers();
    }
  }, [isOpen]);

  const loadUsers = () => {
    const list = AuthService.getUsers();
    setUsers(list);
  };

  if (!isOpen) return null;

  const handleStartAdd = () => {
    setEditingUser(null);
    setFormData({
      name: '',
      email: '',
      role: 'client_user',
      hasSupportAccess: true,
      allowedTenantIds: ['publicarte'],
      status: 'active',
    });
    setIsAddingNew(true);
  };

  const handleStartEdit = (u: UserAccount) => {
    setIsAddingNew(false);
    setEditingUser(u);
    setFormData({
      name: u.name,
      email: u.email,
      role: u.role,
      hasSupportAccess: u.hasSupportAccess ?? true,
      allowedTenantIds: u.allowedTenantIds && u.allowedTenantIds.length > 0 ? u.allowedTenantIds : ['publicarte'],
      status: u.status || 'active',
    });
  };

  const handleToggleTenant = (tenantId: string) => {
    setFormData((prev) => {
      let updated: string[];
      if (tenantId === 'all') {
        updated = prev.allowedTenantIds.includes('all') ? ['publicarte'] : ['all'];
      } else {
        const withoutAll = prev.allowedTenantIds.filter((id) => id !== 'all');
        if (withoutAll.includes(tenantId)) {
          updated = withoutAll.filter((id) => id !== tenantId);
          if (updated.length === 0) updated = ['publicarte'];
        } else {
          updated = [...withoutAll, tenantId];
        }
      }
      return { ...prev, allowedTenantIds: updated };
    });
  };

  const handleSaveForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.email || !formData.name) return;

    const emailClean = formData.email.toLowerCase().trim();

    const targetUser: UserAccount = {
      id: editingUser ? editingUser.id : `usr-${Date.now()}`,
      username: emailClean.split('@')[0],
      email: emailClean,
      googleEmail: emailClean,
      name: formData.name.trim(),
      role: formData.role,
      hasSupportAccess: formData.hasSupportAccess,
      allowedTenantIds: formData.allowedTenantIds,
      status: formData.status,
      tenantId: formData.allowedTenantIds[0] || 'publicarte',
      tenantName: INITIAL_TENANTS.find((t) => t.id === formData.allowedTenantIds[0])?.name || 'Public Arte',
      avatarUrl: editingUser?.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${emailClean}`,
    };

    const updatedList = AuthService.updateUser(targetUser);
    setUsers(updatedList);
    setEditingUser(null);
    setIsAddingNew(false);
  };

  const handleDeleteUser = (userId: string, email: string) => {
    if (email === 'helpus.ecommerce@gmail.com') return;
    if (confirm(`Tem certeza que deseja excluir o usuário ${email}?`)) {
      const updatedList = AuthService.deleteUser(userId);
      setUsers(updatedList);
      if (editingUser?.id === userId) {
        setEditingUser(null);
      }
    }
  };

  const filteredUsers = users.filter(
    (u) =>
      u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.role.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredTenants = INITIAL_TENANTS.filter(
    (t) =>
      t.name.toLowerCase().includes(tenantSearch.toLowerCase()) ||
      t.domain.toLowerCase().includes(tenantSearch.toLowerCase()) ||
      t.id.toLowerCase().includes(tenantSearch.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-4xl rounded-3xl shadow-2xl overflow-hidden text-slate-100 flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-4 bg-gradient-to-r from-purple-700 via-indigo-700 to-purple-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/10 backdrop-blur flex items-center justify-center border border-white/20">
              <ShieldCheck className="w-6 h-6 text-purple-200" />
            </div>
            <div>
              <h2 className="font-extrabold text-base leading-tight flex items-center gap-2">
                👑 Painel Master: Gestão de Usuários & Aplicações Vincular
              </h2>
              <p className="text-xs text-purple-200">
                Defina permissões de acesso ao Suporte e escolha uma ou várias aplicações vinculadas para cada e-mail Google.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* Main Content Body */}
        <div className="p-6 flex-1 overflow-y-auto space-y-6">
          {/* Top Actions & Search Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-950 p-4 rounded-2xl border border-slate-800">
            <div className="flex items-center gap-2 bg-slate-900 px-3.5 py-2 rounded-xl border border-slate-800 w-full sm:w-80">
              <Search className="w-4 h-4 text-slate-500" />
              <input
                type="text"
                placeholder="Buscar usuário por nome ou e-mail..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="bg-transparent text-xs text-slate-200 placeholder-slate-500 focus:outline-none w-full"
              />
            </div>

            <button
              onClick={handleStartAdd}
              className="w-full sm:w-auto px-4 py-2.5 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-purple-600/20 transition-all cursor-pointer shrink-0"
            >
              <Plus className="w-4 h-4" /> Cadastrar Novo Usuário Google
            </button>
          </div>

          {/* Form Section: Edit or Add User */}
          {(editingUser || isAddingNew) && (
            <form onSubmit={handleSaveForm} className="bg-slate-950 p-5 rounded-2xl border border-purple-500/40 space-y-5 animate-in fade-in">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="font-bold text-sm text-purple-300 flex items-center gap-2">
                  <Edit3 className="w-4 h-4 text-purple-400" />
                  {isAddingNew ? 'Cadastrar Novo Usuário' : `Editar Usuário: ${editingUser?.email}`}
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setEditingUser(null);
                    setIsAddingNew(false);
                  }}
                  className="text-xs text-slate-400 hover:text-white underline cursor-pointer"
                >
                  Cancelar Edit
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Nome Completo</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Tércio Public Arte"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-100 placeholder-slate-600 focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">E-mail da Conta Google (@gmail.com)</label>
                  <input
                    type="email"
                    required
                    placeholder="exemplo@gmail.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-100 placeholder-slate-600 focus:outline-none focus:border-purple-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Nível de Função (Role)</label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value as UserRole })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-100 focus:outline-none focus:border-purple-500 cursor-pointer"
                  >
                    <option value="super_admin">👑 SuperAdmin Master (Acesso Total)</option>
                    <option value="admin">🧠 Admin / Gestor</option>
                    <option value="client_admin">🏢 Cliente Admin (Dono de Aplicação)</option>
                    <option value="client_user">👤 Cliente Usuário</option>
                  </select>
                </div>

                {/* Support Access Toggle */}
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Permissão de Acesso ao Sistema de Suporte</label>
                  <div className="flex gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, hasSupportAccess: true, status: 'active' })}
                      className={`flex-1 py-2 px-3 rounded-xl font-bold text-xs border flex items-center justify-center gap-2 cursor-pointer transition-all ${
                        formData.hasSupportAccess
                          ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                          : 'bg-slate-900 border-slate-800 text-slate-400'
                      }`}
                    >
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Acesso Liberado
                    </button>

                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, hasSupportAccess: false, status: 'suspended' })}
                      className={`flex-1 py-2 px-3 rounded-xl font-bold text-xs border flex items-center justify-center gap-2 cursor-pointer transition-all ${
                        !formData.hasSupportAccess
                          ? 'bg-red-500/20 border-red-500 text-red-300'
                          : 'bg-slate-900 border-slate-800 text-slate-400'
                      }`}
                    >
                      <XCircle className="w-4 h-4 text-red-400" /> Acesso Bloqueado
                    </button>
                  </div>
                </div>
              </div>

              {/* Linked Applications Multi-Select Grid */}
              <div className="space-y-2 pt-2 border-t border-slate-800">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-indigo-300 flex items-center gap-1.5">
                    <Building2 className="w-4 h-4 text-indigo-400" />
                    <span>Aplicações Vincular (Pode selecionar UMA ou VÁRIAS):</span>
                  </label>
                  <span className="text-[11px] text-slate-400">
                    {formData.allowedTenantIds.includes('all')
                      ? '🌐 Acesso Total a Todas as Aplicações'
                      : `${formData.allowedTenantIds.length} aplicação(ões) selecionada(s)`}
                  </span>
                </div>

                {/* All Tenants Toggle Option */}
                <div className="flex items-center gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => handleToggleTenant('all')}
                    className={`px-3 py-1.5 rounded-xl font-bold text-xs border flex items-center gap-2 cursor-pointer transition-all ${
                      formData.allowedTenantIds.includes('all')
                        ? 'bg-purple-600 text-white border-purple-500 shadow-md'
                        : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                    }`}
                  >
                    <span>🌐 Acesso Global (Todas as {INITIAL_TENANTS.length} Aplicações)</span>
                  </button>
                  <input
                    type="text"
                    placeholder="Filtrar aplicações por nome..."
                    value={tenantSearch}
                    onChange={(e) => setTenantSearch(e.target.value)}
                    className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none"
                  />
                </div>

                {/* Tenants Checkbox Grid */}
                {!formData.allowedTenantIds.includes('all') && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-48 overflow-y-auto p-2 bg-slate-900/90 rounded-xl border border-slate-800">
                    {filteredTenants.map((tenant) => {
                      const isChecked = formData.allowedTenantIds.includes(tenant.id);
                      return (
                        <div
                          key={tenant.id}
                          onClick={() => handleToggleTenant(tenant.id)}
                          className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer text-xs transition-all ${
                            isChecked
                              ? 'bg-indigo-950/60 border-indigo-500 text-white shadow-inner'
                              : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                          }`}
                        >
                          <div className="flex items-center gap-2 overflow-hidden">
                            <div
                              className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${
                                isChecked ? 'bg-indigo-600 border-indigo-500 text-white' : 'border-slate-700'
                              }`}
                            >
                              {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                            </div>
                            <div className="truncate">
                              <span className="font-bold block truncate">{tenant.name}</span>
                              <span className="text-[10px] text-slate-500 font-mono block truncate">{tenant.domain}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Submit Save Button */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditingUser(null);
                    setIsAddingNew(false);
                  }}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-xs cursor-pointer"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  className="px-5 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-extrabold rounded-xl text-xs flex items-center gap-2 shadow-lg shadow-purple-600/30 cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" /> Salvar Usuário & Permissões
                </button>
              </div>
            </form>
          )}

          {/* Users List Grid */}
          <div className="space-y-3">
            <h3 className="font-bold text-xs text-slate-400 uppercase tracking-wider">
              Usuários Cadastrados no Ecossistema ({filteredUsers.length})
            </h3>

            <div className="space-y-2.5 max-h-[50vh] overflow-y-auto pr-1">
              {filteredUsers.map((u) => {
                const isSuper = u.role === 'super_admin' || u.email === 'helpus.ecommerce@gmail.com';
                const hasAccess = u.hasSupportAccess ?? true;
                const tenantCount = u.allowedTenantIds?.includes('all')
                  ? '🌐 Todas as Aplicações'
                  : `${u.allowedTenantIds?.length || 1} aplicação(ões)`;

                return (
                  <div
                    key={u.id}
                    className="p-4 bg-slate-950/80 border border-slate-800 hover:border-slate-700 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-all"
                  >
                    <div className="flex items-center gap-3">
                      <img src={u.avatarUrl} alt={u.name} className="w-10 h-10 rounded-full border border-purple-500/40 shrink-0" />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-white">{u.name}</span>
                          {isSuper && (
                            <span className="px-2 py-0.5 text-[9px] font-extrabold bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded font-mono">
                              SUPERADMIN
                            </span>
                          )}
                          {!hasAccess && (
                            <span className="px-2 py-0.5 text-[9px] font-bold bg-red-500/20 text-red-300 border border-red-500/30 rounded">
                              BLOQUEADO
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-slate-400 font-mono block">{u.email}</span>
                        <div className="flex flex-wrap items-center gap-2 mt-1">
                          <span className="text-[10px] text-indigo-300 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20 font-medium">
                            {tenantCount}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center">
                      <button
                        onClick={() => handleStartEdit(u)}
                        className="px-3 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 border border-indigo-500/30 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" /> Editar Permissões
                      </button>

                      {!isSuper && (
                        <button
                          onClick={() => handleDeleteUser(u.id, u.email)}
                          title="Excluir usuário"
                          className="p-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-xl transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
