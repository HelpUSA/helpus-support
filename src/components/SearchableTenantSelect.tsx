'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Search, Globe, Building2, Check, ChevronDown, X } from 'lucide-react';
import { Tenant } from '@/types/ticket';

interface SearchableTenantSelectProps {
  tenants: Tenant[];
  value: string;
  onChange: (tenantId: string) => void;
  includeAllOption?: boolean;
  allOptionLabel?: string;
  placeholder?: string;
  className?: string;
}

export default function SearchableTenantSelect({
  tenants,
  value,
  onChange,
  includeAllOption = false,
  allOptionLabel = '🌐 Todas as Empresas',
  placeholder = 'Buscar empresa (ex: plural, kaline)...',
  className = '',
}: SearchableTenantSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedTenant = tenants.find((t) => t.id === value || t.slug === value);

  const filteredTenants = tenants.filter((t) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase().trim();
    return (
      t.name.toLowerCase().includes(term) ||
      t.slug.toLowerCase().includes(term) ||
      t.id.toLowerCase().includes(term) ||
      t.domain.toLowerCase().includes(term)
    );
  });

  return (
    <div ref={containerRef} className={`relative inline-block text-left ${className}`}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between gap-2 bg-slate-950 hover:bg-slate-900 border border-purple-500/40 px-3 py-2 rounded-xl text-xs text-purple-200 font-bold focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all cursor-pointer shadow-md"
      >
        <span className="flex items-center gap-1.5 truncate">
          {value === 'all' ? (
            <Globe className="w-4 h-4 text-purple-400 shrink-0" />
          ) : (
            <Building2 className="w-4 h-4 text-purple-400 shrink-0" />
          )}
          <span className="truncate max-w-[180px] sm:max-w-[240px]">
            {value === 'all'
              ? `${allOptionLabel} (${tenants.length})`
              : selectedTenant
              ? selectedTenant.name
              : 'Selecionar Empresa'}
          </span>
        </span>
        <ChevronDown className={`w-4 h-4 text-purple-400 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Floating Searchable Dropdown */}
      {isOpen && (
        <div className="absolute right-0 sm:left-0 mt-2 w-72 sm:w-80 rounded-2xl bg-slate-900 border border-purple-500/40 shadow-2xl z-50 overflow-hidden backdrop-blur-md animate-in fade-in slide-in-from-top-2">
          {/* Search Box Header */}
          <div className="p-2.5 border-b border-slate-800 bg-slate-950/80 flex items-center gap-2">
            <Search className="w-4 h-4 text-purple-400 shrink-0" />
            <input
              type="text"
              autoFocus
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={placeholder}
              className="w-full bg-transparent text-xs text-slate-100 placeholder-slate-500 focus:outline-none font-medium"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="text-slate-500 hover:text-white cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Tenants List */}
          <div className="max-h-64 overflow-y-auto divide-y divide-slate-800/60 p-1">
            {includeAllOption && !searchTerm.trim() && (
              <button
                type="button"
                onClick={() => {
                  onChange('all');
                  setIsOpen(false);
                  setSearchTerm('');
                }}
                className={`w-full text-left px-3 py-2.5 rounded-xl text-xs font-bold flex items-center justify-between transition-colors cursor-pointer ${
                  value === 'all'
                    ? 'bg-purple-600/30 text-purple-200 border border-purple-500/40'
                    : 'text-slate-300 hover:bg-slate-800/60'
                }`}
              >
                <span className="flex items-center gap-2">
                  <Globe className="w-4 h-4 text-purple-400" />
                  <span>{allOptionLabel} ({tenants.length})</span>
                </span>
                {value === 'all' && <Check className="w-4 h-4 text-purple-400" />}
              </button>
            )}

            {filteredTenants.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-400 italic">
                Nenhuma empresa encontrada para &quot;{searchTerm}&quot;
              </div>
            ) : (
              filteredTenants.map((t) => {
                const isSelected = value === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      onChange(t.id);
                      setIsOpen(false);
                      setSearchTerm('');
                    }}
                    className={`w-full text-left px-3 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-between transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-purple-600/30 text-purple-200 border border-purple-500/40'
                        : 'text-slate-200 hover:bg-slate-800/60'
                    }`}
                  >
                    <div className="flex flex-col truncate pr-2">
                      <span className="font-bold truncate text-slate-100 flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                        {t.name}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono pl-5 truncate">
                        {t.domain}
                      </span>
                    </div>
                    {isSelected && <Check className="w-4 h-4 text-purple-400 shrink-0" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
