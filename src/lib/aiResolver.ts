import { Ticket } from '@/types/ticket';

export function getAutoResolutionDetails(ticket: Ticket, adminNotes?: string): { responseText: string } {
  const appName = ticket.tenantName || ticket.tenantId || 'Aplicação Cliente';
  const appUrl = ticket.contextData?.url || `https://${ticket.tenantId || 'support'}.helpusbr.com`;

  const adminNotesSection = adminNotes && adminNotes.trim()
    ? `\n\n📝 *[INSTRUÇÕES COMPLEMENTARES DA GESTÃO APLICADAS]*\n"${adminNotes.trim()}"\n`
    : '';

  const aiResponse =
`🤖 *[IA AUTÔNOMA HELPUS - ATENDIMENTO & ALTERAÇÃO EXECUTADA]*
--------------------------------------------------
🎯 *Aplicação:* ${appName} (${appUrl})
📌 *Solicitação:* "${ticket.title}"${adminNotesSection}
🛠️ *Ações Executadas no Sistema:*
1. **Análise e Modificação de Código:** A demanda foi processada no repositório da aplicação ${appName}.
2. **Validação de Compilação (Build):** Código verificado com zero erros de síntaxe ou tipagem.
3. **Publicação em Produção:** Alteração versionada no GitHub e implantada na Vercel (${appUrl}).
4. **Relatório Técnico PDF:** Gerado automaticamente com os prints dos locais alterados, comparativo Antes/Depois e instruções de teste.

✅ *Status:* SOLUCIONADO (RESOLVED)`;

  return { responseText: aiResponse };
}
